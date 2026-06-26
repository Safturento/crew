# Daemon GitHub client (Octokit) + inbound webhook ingress via crew-owned Caddy

**Date:** 2026-06-26
**Status:** Design (brainstormed 2026-06-26) — Epic to be created
**Threads B + C of the GitHub-integration reshaping.** Thread A (dispatch auth via MCP) shipped (Epic CREW-296). This spec covers **B** (give the daemon a real GitHub client instead of shelling `gh`) and **C** (finally land the PR-merge webhook by completing the ingress that CREW-271 was blocked on).
**Builds on:** [CREW-270](https://safturento.atlassian.net/browse/CREW-270) — the webhook *receiver* (HMAC + hook-ID pin + `PrTransitionService`) that already shipped and is **unchanged** by this design.
**Completes / unblocks:** [CREW-271](https://safturento.atlassian.net/browse/CREW-271) — the interactive Funnel/webhook setup, blocked on the discovery that Tailscale Funnel can't path-scope. Resolved here via a crew-owned Caddy front door.

## Problem

Two related gaps in the daemon's GitHub integration:

1. **The daemon shells out to `gh`.** `PrPoller`'s state check (`packages/daemon/src/services/github/fetch-pr-state.ts`) runs `gh pr view <url> --json state` *inside the daemon container*. That forces two couplings: the `gh` binary is baked into the daemon image, and the host's `~/.config/gh` credentials are bind-mounted read-only into the container (`docker-compose.yml:43`). It's untyped (shell + JSON parsing), and a host-credential mount into a long-running container is an avoidable surface.

2. **The PR-merge webhook can't reach the daemon.** The receiver shipped (CREW-270), but GitHub's deliveries originate on the public internet and the daemon is tailnet-only. The planned bridge — a path-scoped Tailscale Funnel exposing only `/api/webhooks/github` — turned out infeasible: **Funnel is port-level, not path-level**, and `svc:crew` already serves the dashboard on `tcp:443`. Funnelling that exposes the dashboard; funnelling the daemon's `:7773` exposes its *unauthenticated* routes (`/api/agents`, etc.). So the merge signal still arrives only via the 5-minute poll.

## Goal

Give the daemon a typed GitHub client (Octokit) authenticated by one explicit token — dropping the `gh` binary and the `~/.config/gh` mount from the daemon image — **and** deliver the `pull_request` webhook to the daemon over an inbound path whose public exposure is **exactly the set of routes a crew-owned Caddy allow-lists** (today: one). Keep the shipped receiver and the poll backstop unchanged.

## Non-goals

- **Changing the webhook receiver.** `GithubWebhookService` (HMAC + hook-ID pin), `PrTransitionService`, the per-repo secret config, and `scripts/setup-github-webhook.sh` were all built for an inbound *static* webhook. A static webhook has a stable `hook_id`, so the hook-ID pin works as designed — nothing in the receiver changes.
- **The outbound `gh webhook forward` relay.** Considered and rejected: GitHub scopes it to dev-only, it relies on an undocumented relay, the ephemeral hook breaks the hook-ID pin, and it leaks orphan hooks. The robustness + "reuse the shipped receiver" win went to the inbound path.
- **Native Funnel `--set-path` path-scoping.** Considered as a way to avoid Caddy, but it's HTTP-mode-only (the service is TCP-mode), unverified against the `svc:` model, and rigid. A crew-owned Caddy is the extensible front door the user wants.
- **Daemon-wide API auth.** The daemon's other `:7773` routes stay tailnet-only and unauthenticated; Caddy simply never proxies them to the public port. Authenticating the rest of the API is a separate concern.
- **The CLI's host-side `gh` calls.** `packages/cli/src/lib/github/client.ts` (fix-pr reviews/comments, host process, host gh auth) is out of scope — a follow-up. This effort is daemon-scoped.
- **Multi-repo webhooks.** The receiver's config model is already multi-repo; wiring a second repo's webhook is a follow-up (one Caddy path is already general; it's just more GitHub webhooks).

## Design

> **Project-specific:** daemon code lives in `packages/daemon/src/` (services in `services/`, the Octokit client wraps `services/github/`); config schema/loader in `packages/shared/src/config/`; container topology in `docker-compose.yml` + `packages/daemon/Dockerfile`; new proxy config under `packages/daemon/webhook-proxy/`. The canonical (host-wide) daemon stack carries the webhook, not the per-worktree stacks.

### B — daemon Octokit client

**Token model.** Introduce one explicit daemon GitHub token, replacing the `~/.config/gh` mount. Sourced from a crew secret (`~/.config/crew/github-token`, a single-line file mirroring the existing `github-webhook-secrets.toml` mount pattern), seedable from `gh auth token`. Delivered to the daemon as `GH_TOKEN` (env injected at `docker compose up`, materialized from the secret — exact mechanism settled in the plan: host-env interpolation vs. a small bring-up wrapper vs. mount-and-load). Octokit reads it: `new Octokit({ auth: process.env.GH_TOKEN })`. Required scope: `repo` (read PR state).

**Client.** Add `@octokit/rest` to `packages/daemon`. Rewrite `fetch-pr-state.ts`:

```
fetchPrState(prUrl):
  { owner, repo, number } = parsePrUrl(prUrl)         // https://github.com/<owner>/<repo>/pull/<n>
  pr = await octokit.pulls.get({ owner, repo, pull_number: number })
  return pr.merged ? 'MERGED' : pr.state === 'closed' ? 'CLOSED' : 'OPEN'
```

Same `PrState` output (`OPEN | CLOSED | MERGED`) the current `gh pr view --json state` returns, so `PrPoller` is unchanged. The Octokit instance is a singleton wired through the daemon's Awilix container so it's injectable + mockable in tests.

**Image slimming.** Remove the `gh` install from `packages/daemon/Dockerfile` and the `${HOME}/.config/gh:/root/.config/gh:ro` mount from `docker-compose.yml`. The daemon becomes `gh`-free; its only GitHub credential is `GH_TOKEN`.

### C-code — crew-owned Caddy reverse proxy

A new canonical-stack service whose Caddyfile is the **entire public exposure boundary**. Opt-in via a compose profile (the webhook is an optional accelerator over the poller).

```yaml
# docker-compose.yml (canonical)
  webhook-proxy:
    profiles: [webhook]
    image: caddy:2-alpine
    volumes:
      - ./packages/daemon/webhook-proxy/Caddyfile:/etc/caddy/Caddyfile:ro
    ports:
      - '${CREW_WEBHOOK_PROXY_PORT:-8081}:8081'   # Funnel(8443) → Win 127.0.0.1:8081 → here
    depends_on:
      daemon: { condition: service_healthy }
    restart: unless-stopped
    mem_limit: 128m
    cpus: 0.25
```

```caddyfile
# packages/daemon/webhook-proxy/Caddyfile
:8081 {
    @webhook { method POST; path /api/webhooks/github }
    handle @webhook { reverse_proxy daemon:7773 }
    # future allow-listed paths get added here as more @matchers + handles
    handle { respond 404 }   # everything not explicitly allow-listed is invisible
}
```

Caddy proxies only `POST /api/webhooks/github` to `daemon:7773` (the compose network name; the dashboard already reaches the daemon at `http://daemon:7773`) and `404`s everything else. Adding a future public route = one `@matcher` + `handle` block. The daemon's `:7773` is **not** itself funnelled — it's reachable from the public port only through this allow-list.

### C-infra — Funnel + GitHub webhook (interactive)

Operator-driven live setup (the `interactive` tail that completes CREW-271). Captured as a rewritten runbook replacing the warning-stamped `docs/runbooks/github-webhook-funnel.md`:

1. **Funnel a dedicated port.** Tailscale runs on Windows; the daemon/Caddy in WSL2. Funnel public `8443` → Windows `127.0.0.1:8081` → (WSL2 localhost forward, the same crossing `svc:crew → localhost:5173` already proves) → the Caddy container. Requires the tailnet ACL `funnel` `nodeAttr` (admin console, out-of-band) and a `tailscale funnel --bg --https=8443 http://127.0.0.1:8081`-style mapping. Node-level funnel vs. a new `svc:` is settled live (open question).
2. **Create the GitHub webhook** via the existing `scripts/setup-github-webhook.sh`: payload URL `https://<node>.<tailnet>.ts.net:8443/api/webhooks/github`, content-type JSON, the per-repo secret, events = `pull_request`. Verify GitHub delivers to a non-443 port (expected, but confirmed live).
3. **Capture `hook_id`** into `crew.toml`'s `[github] webhook_hook_id` so the receiver's hook-ID pin engages.
4. **Verify** GitHub's `ping` returns `200`, then a real PR merge flips the dashboard near-instantly.

### Data flow

```
GitHub (PR closed) ──POST https://<node>.<tailnet>.ts.net:8443/api/webhooks/github──▶
  Tailscale Funnel (8443, public) ──▶ crew Caddy (allow-list) ──▶ daemon:7773 /api/webhooks/github
    └▶ GithubWebhookService (HMAC + hook-ID pin, UNCHANGED) ──▶ PrTransitionService.markMerged
PrPoller (now Octokit) reconciles any dropped delivery on its interval — the backstop, unchanged.
```

## Error handling

- **`GH_TOKEN` missing/invalid** → Octokit calls in `PrPoller` fail; the existing per-agent try/catch logs a warn and no-ops that agent (preserved behavior). Daemon boot can additionally warn if `GH_TOKEN` is unset.
- **Caddy down / not started** (profile not enabled) → no webhook deliveries; the poll backstop carries state. Exactly today's behavior.
- **Funnel down** → deliveries lost; poll reconciles. Designed-for, not exceptional.
- **A non-allow-listed path hits the public port** → Caddy `404`, never reaches the daemon. The daemon's unauthenticated routes stay invisible.
- **Webhook verification failures** (HMAC / hook-ID / repo / event) → handled by the unchanged receiver exactly as CREW-270 specified.

## Testing

- **`fetch-pr-state` (Octokit)** — unit with a mocked Octokit: `merged:true` → `MERGED`; `state:'closed', merged:false` → `CLOSED`; `state:'open'` → `OPEN`; `parsePrUrl` against canonical + edge URLs; API error → throws (so `PrPoller`'s wrapper logs + no-ops). `PrPoller` tests updated only for the injected client (behavior identical).
- **Caddy allow-list** — a route test (curl against the running proxy, or a Bruno endpoint per the bruno skill): `POST /api/webhooks/github` proxies through; `GET /api/agents` and any other path → `404`. Guards the exposure boundary against drift.
- **Config/secret loader** — `github-token` secret parses; missing → clear boot warning.
- **Receiver** — no new tests; CREW-270's suite stands.
- **C-infra** — manual verification per the runbook (`ping` 200 + a live merge), since it's live infra.

## Scope (one Epic, three children)

| Child | Mode | Covers |
|---|---|---|
| **B — daemon Octokit client** | autonomous | `GH_TOKEN` secret + config/loader + compose env; `@octokit/rest`; rewrite `fetch-pr-state.ts`; remove `gh` from the daemon Dockerfile + drop the `~/.config/gh` mount; tests. |
| **C-code — crew Caddy proxy** | autonomous | `webhook-proxy` compose service (canonical, `profiles:[webhook]`); `Caddyfile`; route test / Bruno; `.agents` + README touches. |
| **C-infra — Funnel + webhook setup** | **interactive** | Funnel-on-8443 + ACL nodeAttr; run `setup-github-webhook.sh`; capture `hook_id`; `ping` + live-merge verify; rewrite `docs/runbooks/github-webhook-funnel.md`; resolve CREW-271 + the path-restricting-proxy followup in `docs/followups.md`. Driven live in-session, **not** `crew run`. |

**Dependencies:** B and C-code are independent and parallel-safe (disjoint files). C-infra depends on C-code (Caddy must exist) and the already-shipped receiver; it does **not** depend on B. So: **B ∥ C-code** (autonomous), then **C-infra** (interactive) once C-code merges.

**Follow-ups (not this Epic):** the CLI `client.ts` Octokit migration; registering additional repos' webhooks.

## Open questions

- **Funnel topology** — node-level funnel (`<node>.ts.net:8443`) vs. a new `svc:crew-webhook` Service. Settled live in C-infra; doesn't affect B or C-code.
- **GitHub non-443 delivery** — confirm GitHub posts to `:8443` payload URLs (expected). Verified in C-infra.
- **`GH_TOKEN` materialization** — env-interpolation-at-`compose up` vs. a crew bring-up wrapper vs. mount-and-load in the daemon. Settled in the B plan; the design commitment is "explicit token, not the gh mount."
- **Caddy port crossing** — confirm the Windows-Funnel → WSL2 `127.0.0.1:8081` hop behaves like the proven `svc:crew → :5173` crossing. Verified in C-infra.
