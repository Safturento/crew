# GitHub Webhook for PR-Merge Detection — push the merge signal instead of polling for it

**Date:** 2026-06-19
**Status:** Design (brainstormed 2026-06-19) — Epic to be created
**Complements:** [CREW-202](https://safturento.atlassian.net/browse/CREW-202) (the `PrPoller` this design demotes to a backstop).
**Reconciled against:** [CREW-256](https://safturento.atlassian.net/browse/CREW-256) / [CREW-257](https://safturento.atlassian.net/browse/CREW-257) / [CREW-261](https://safturento.atlassian.net/browse/CREW-261) — the concrete-state-events refactor (`docs/superpowers/specs/2026-06-18-concrete-state-triggers-design.md`). See "Fit with the concrete-state-events model" below.

## Problem

An agent's badge advances `pr_open → pr_merged` only when the daemon *notices* the PR is no longer OPEN. Today that noticing is done by **polling**: `PrPoller` (`packages/daemon/src/services/PrPoller.ts`) walks every agent in `pr_open` with a `pr_url` every 5 minutes and runs `gh pr view <url> --json state` against each.

Two costs follow:

1. **Latency.** A PR merged 10 seconds after a poll round waits up to ~5 minutes before the dashboard reflects it. The state is authoritative on GitHub the instant the merge button is clicked; the daemon just doesn't hear about it.
2. **Wasted API calls.** Every round spends one `gh` (GitHub API) call *per* `pr_open` agent, every 5 minutes, forever — whether or not anything changed. The vast majority return `OPEN` and accomplish nothing.

GitHub already knows the merge happened and can *push* that fact to us. The poll exists only because we never gave GitHub a place to push it to.

### Why we can't just point a webhook at the daemon

GitHub webhook deliveries originate from GitHub's cloud servers over the **public internet**. The daemon listens on `:7773` inside Docker on a host that is reachable only on the tailnet (`crew.tail82463c.ts.net`). GitHub's servers are not on the tailnet, so a plain webhook URL has nowhere to land. The bridge is **Tailscale Funnel**, which exposes a single tailnet service to the public internet via Tailscale's relays with a valid `*.ts.net` TLS cert — no port-forwarding, no exposed home IP.

## Goal

Deliver the `pr_open → pr_merged` transition **near-instantly** via a GitHub `pull_request` webhook, while keeping a slow poll as a correctness backstop. Cut steady-state GitHub API calls to roughly zero in the common case. Build the configuration model so it covers **any repo that uses crew**, not just `crew` itself.

## Non-goals

- **Removing `PrPoller`.** Webhook delivery is at-least-once and *droppable* (Funnel down, daemon restarting mid-delivery). The poller stays as a reconciliation backstop at a longer interval — see Design. A single missed delivery must never strand an agent in `pr_open`.
- **Differentiating closed-but-not-merged.** The current poller maps *any* non-`OPEN` PR (merged **or** closed-unmerged) to `pr_merged`. This design mirrors that exactly to avoid a semantic split between the two paths. Splitting closed-unmerged into its own state is a followup.
- **Registering every repo on day one.** The *config model* is multi-repo from the start; only the `crew` repo is wired up in the first Epic. Registering Recipes / other projects is a follow-up ticket (see Scope).
- **Authenticating the rest of the daemon API.** Funnel is path-scoped to the one webhook route; the rest of `:7773` stays tailnet-only and unauthenticated, exactly as today. Daemon-wide auth is out of scope.
- **Replacing the drawer's manual "Refresh PR status" button.** It keeps working, now routed through the shared transition service.

## Design

### Component overview

> **Project-specific:** new code lands in `packages/daemon/src/` (route in `routes/`, services in `services/`) and `packages/shared/src/config/` (schema + loader). Services register in `packages/daemon/src/container.ts` (Awilix DI). Routes register in `packages/daemon/src/app.ts`.

```
GitHub (PR merged)
  │  POST https://crew.tail82463c.ts.net/api/webhooks/github
  ▼
Tailscale Funnel  ── path-scoped: ONLY /api/webhooks/github reaches the daemon
  ▼
POST /api/webhooks/github   (thin Fastify route; raw body preserved for HMAC)
  ▼
GithubWebhookService.handle(headers, rawBody)
  ▼
PrTransitionService.markMerged(agentKey)   ◄── extracted from PrPoller; shared
```

Three pieces of new/changed code plus one infra step:

1. **`PrTransitionService`** (new, extracted) — owns the single idempotent `pr_open → pr_merged` transition. Today this logic is inlined in `PrPoller.checkOneInternal`. Extract it so the **webhook**, the **poller**, and the **manual drawer refresh** all funnel through one method.
2. **`GithubWebhookService`** (new) — verification + resolution for an incoming delivery. No DB writes of its own; delegates the state change to `PrTransitionService`.
3. **Config: per-project webhook secret + hook ID** (new schema + loader) — see Config model.
4. **Tailscale Funnel + GitHub webhook setup** (infra/docs) — operator action, captured as runbook + helper script.

### `PrTransitionService` (the shared transition)

Extracted verbatim-in-behavior from `PrPoller.checkOneInternal`:

```
markMerged(agentKey):
  latest = latest state_transitions.to_state for agentKey
  if latest !== 'pr_open': return { changed: false }     // idempotent guard
  insert state_transitions(agentKey, 'pr_open' → 'pr_merged', ts=now)
  eventBus.publish('agent.state_changed', { key, from:'pr_open', to:'pr_merged', ts })
  return { changed: true }
```

The `latest === 'pr_open'` precondition is what makes the whole feature safe under **double delivery** and **webhook-vs-poll races**: whichever path fires first performs the transition; every later path sees a non-`pr_open` state and no-ops. The webhook path supplies `agentKey`; it never calls `gh pr view` (the payload already proves the PR closed). The poller keeps calling `gh pr view`, then calls `markMerged` on a hit. The drawer button keeps its existing precondition behavior via the same method.

> A `byPrUrl(prUrl)` resolver (PR `html_url` → `agents.key` where state is `pr_open`) is the webhook's entry into this service. Lives in `AgentsService` or `PrTransitionService` — to be settled in the plan; it's a single indexed lookup either way.
>
> **New concern vs `PrPoller`:** the poller never string-compares URLs — it *passes* the stored `pr_url` to `gh pr view`. The webhook instead matches GitHub's `pull_request.html_url` against the stored `agents.pr_url` (written by the `pr_created` hook, CREW-261). These should be byte-identical canonical forms (`https://github.com/<owner>/<repo>/pull/<n>`), but the resolver must **normalize defensively** (trailing slash, host/owner casing) and the match must be verified against a real stored value during implementation — a silent mismatch would make every webhook a valid-but-unmatched `200` no-op, masking total failure behind the poll backstop.

### Fit with the concrete-state-events model (CREW-256/257/261)

The recent refactor replaced *inferred* state transitions with **concrete lifecycle events** that producers append to `~/.crew/state-events/<key>.jsonl`; the daemon (`IngestService`) dedups them via the `state_events_applied` ledger and reduces each via `reduceState` into a `state_transitions` row. This design **does not** route the merge through that pipeline, and that is deliberate, not an oversight:

- **`pr_merged` is intentionally outside the event vocabulary.** `STATE_EVENT_KINDS` (`packages/shared/src/state-events/types.ts`) has no merge event, and `reduceState` (`packages/daemon/src/services/state-reduce.ts`) documents `pr_merged` as **terminal — reachable only via its dedicated path (`PrPoller`)**. A merge happens *on GitHub*, outside any crew process, so it is correctly modeled as a daemon-side authoritative observation, not a producer-emitted process lifecycle fact. Adding a merge event to `STATE_EVENT_KINDS` was considered and rejected: it would misclassify a GitHub-side fact as a crew-process fact and expand the reducer's contract for no benefit.
- **The webhook is therefore a *peer of `PrPoller`* on that dedicated path**, not a producer. Both observe GitHub's authoritative state and call the same `PrTransitionService.markMerged`. `PrPoller` is untouched by the refactor (its transition write predates it); this design simply extracts the write both now share.
- **No `state_events_applied` dedup for the webhook.** That ledger gives the *event* pipeline exactly-once across file replays. The webhook has no replay log; its idempotency comes entirely from `markMerged`'s `latest === 'pr_open'` precondition — which is also consistent with `reduceState` treating `pr_merged` as terminal. GitHub redeliveries and webhook-vs-poll races collapse to a single transition.
- **Durability differs from the event path by design.** Producer events survive a daemon restart via the on-disk JSONL the daemon re-tails. The webhook is *not* durable-logged — a delivery lost while the daemon is down is gone. Durability for the merge path comes from the **poll backstop** instead, exactly as it does for `PrPoller` today. This is why removing the poller is a non-goal.
- **Join keys still hold under the new pipeline.** `agents.pr_url` is now stamped by `IngestService` when it reduces the `pr_created` hook event (`IngestService.ts`), and that same reduction writes the `pr_open` row into `state_transitions`. So the webhook's two anchors — resolve agent by `pr_url`, gate on latest `state_transitions` being `pr_open` — read exactly the rows the new pipeline produces.

> **fix-pr window:** an agent mid-`fix-pr` is transiently `running` (`pr_open → fixpr_started → running`). A merge delivered in that window finds `latest !== 'pr_open'` and no-ops — then `fixpr_exited` returns it to `pr_open` and the backstop poll reconciles. This is **identical to existing `PrPoller` behavior** (its `pollOnce` already selects only agents whose latest transition is `pr_open`), so it's a preserved property, not a new gap.

### `GithubWebhookService.handle()` — verification pipeline

Ordered cheapest / most-decisive rejection first:

| # | Check | On failure |
|---|---|---|
| 1 | **Event filter** — `X-GitHub-Event` ∈ {`pull_request`, `ping`} | `204` ignore (not an error) |
| 2 | **Project resolve** — `repository.full_name` → project whose `[github].repo` matches (case-insensitive) | `404` unknown repo |
| 3 | **HMAC verify** — `X-Hub-Signature-256` == HMAC-SHA256(rawBody, project's secret), constant-time compare | `401` |
| 4 | **Hook-ID pin** — `X-GitHub-Hook-ID` == that project's `[github].webhook_hook_id` | `401` |
| 5 | **`ping` handshake** — respond `200` so GitHub marks the webhook healthy; no state change | `200` |
| 6 | **`pull_request` + `action === "closed"`** — resolve agent by `pull_request.html_url`; call `markMerged` | `200` (also when no agent matches / already merged — delivery was valid) |

Steps 3 + 4 are the real identity boundary: HMAC proves the delivery was signed with *this project's* secret (which only we hold), and the hook-ID pin nails it to the *exact* webhook configuration we registered. Together they reject any other GitHub webhook on the internet — including a valid one from a stranger — pointed at the Funnel URL.

A delivery that passes all checks but matches no `pr_open` agent (already merged, unknown PR, an agent that never opened a PR) is **not an error** — it's a valid delivery with nothing to do. Return `200` so GitHub doesn't retry.

> **Raw-body requirement:** the HMAC covers the exact bytes GitHub sent. Fastify's default JSON parser would consume and re-serialize the body, breaking the signature. The route must register a content-type parser (or route-scoped config) that preserves the raw buffer for `/api/webhooks/github` while leaving the rest of the API on the normal JSON parser.

### The IP allowlist — honest open question

Earlier discussion included a GitHub-meta IP-range allowlist as an outer noise filter. **Behind Funnel this may be dead on arrival:** Tailscale terminates the public connection and proxies to the daemon, so the source IP the daemon observes is the Funnel ingress / loopback — **not** GitHub's egress IP. Whether the *real* client IP is recoverable (via an `X-Forwarded-For`-style header Funnel might set) must be **verified empirically during implementation**, not assumed.

- **If** Funnel surfaces the originating client IP → keep the GitHub-meta-range allowlist as a best-effort outer filter (refreshed from `api.github.com/meta` → `hooks[]` at startup).
- **If not** → omit it. HMAC + hook-ID + repo + event filters carry the full security weight — which is the gate already approved. The feature is **not** blocked on a layer that was always the weakest discriminator.

This is called out so the IP check is never shipped silently-dead, asserting protection it doesn't provide.

### Config model (multi-repo from the start)

> **Project-specific:** crew project config is per-project TOML under `~/.config/crew/projects/<name>.toml`, mounted read-only into the daemon container. Schema is `packages/shared/src/config/schema.ts`; the `[github]` section today is `github: z.object({ repo: z.string() })`.

Two stores, split by sensitivity:

1. **Non-secret — in each project TOML `[github]`:** add `webhook_hook_id` (string/number) alongside the existing `repo`. This is the per-repo pin and is safe to keep in config.

   ```toml
   [github]
   repo = "Safturento/crew"
   webhook_hook_id = "123456789"   # read once via `gh api repos/:owner/:repo/hooks`
   ```

2. **Secret — outside the TOML, per-project unique:** a daemon-loaded secrets file mapping repo → secret, mounted read-only into the container like the existing `~/.config/gh` creds.

   ```toml
   # ~/.config/crew/github-webhook-secrets.toml
   ["Safturento/crew"]
   secret = "<unique-per-repo-random>"
   ```

   Per-project unique secrets (chosen over a shared daemon secret) contain blast radius: if one repo's secret leaks, the others remain isolated. New schema + loader in `packages/shared/src/config/`. The daemon resolves an incoming delivery's `repository.full_name` to the secret + hook-ID for that repo; unknown repos are rejected at step 2/4.

Resolution **by `repository.full_name`** means the daemon handles any number of repos with no per-repo code. Shipping crew-first simply means crew is the only entry in both files at first; adding a repo later = one TOML line + one secrets line + one GitHub webhook.

### Poller demotion

`PrPoller` stays, with its `DEFAULT_INTERVAL_MS` lengthened from 5 min to **~20–30 min** (exact value in the plan). It becomes the reconciliation backstop: the webhook is the fast path; the slow poll catches any dropped delivery so an agent can never be stranded in `pr_open`. Its transition logic now calls `PrTransitionService.markMerged` rather than the inlined insert. The immediate-poll-on-start behavior is kept (a daemon restart still reconciles promptly).

### Tailscale Funnel + GitHub setup (infra)

Operator action, captured as a runbook + a `scripts/` helper (not daemon code):

1. **Enable Funnel** in the tailnet ACL policy (`nodeAttrs` → `funnel` attribute for the host node). Funnel serves only on `443` / `8443` / `10000`.
2. **Path-scoped mapping** on the host: `tailscale serve` / `tailscale funnel` mapping public path `/api/webhooks/github` → `http://localhost:7773/api/webhooks/github`. Only that path is published; the rest of `:7773` stays off the public internet.
3. **Create the GitHub webhook** on `Safturento/crew`: payload URL = `https://crew.tail82463c.ts.net/api/webhooks/github`, content-type `application/json`, the per-repo secret, events = `pull_request` only.
4. **Read the `hook_id`** via `gh api repos/Safturento/crew/hooks` and write it into `crew.toml`'s `[github] webhook_hook_id`.
5. **Verify** GitHub's `ping` delivery returns `200` (the dashboard / webhook "Recent Deliveries" panel confirms the handshake).

## Error handling

- **Verification failures** (steps 1–4) return the documented status and log at `warn` with the failing check + `repository.full_name` (never the secret). No state change.
- **Unmatched-but-valid deliveries** (step 6, no `pr_open` agent) return `200` and log at `info`. Not an error.
- **`markMerged` throw** → `500`; GitHub will retry, and the idempotent precondition makes the retry safe.
- **Missing config** (repo has no secret / hook-ID entry) is treated as "unknown repo" — reject, don't crash.
- **Funnel down / daemon restarting** → delivery is lost; the poller backstop reconciles within one interval. This is the designed-for failure mode, not an exception path.

## Testing

- **`PrTransitionService`** — unit: precondition met → transition + event; precondition not met (`init`/`running`/already `pr_merged`) → no-op; double-call idempotency.
- **`GithubWebhookService`** — unit against real GitHub `pull_request` + `ping` JSON fixtures: valid signature passes; tampered body / wrong secret → `401`; wrong `X-GitHub-Hook-ID` → `401`; unknown repo → `404`; non-`pull_request` event → `204`; `ping` → `200` no-op; `action !== "closed"` → `200` no-op; valid `closed` with no matching `pr_open` agent → `200` no-op; valid `closed` with a matching agent → `markMerged` called.
- **Route test** — raw-body HMAC plumbing: a real signed payload verifies end-to-end through the registered content-type parser (guards the Fastify-pre-parse regression).
- **Config loader** — secrets file + `webhook_hook_id` parse; missing/partial config handled.
- **`byPrUrl` resolver** — matches the canonical `html_url` form; normalization cases (trailing slash, host/owner casing); unmatched URL → no resolution.
- **`PrPoller`** — existing tests updated for the lengthened interval and the delegation to `PrTransitionService` (behavior unchanged otherwise — it predates and is untouched by the concrete-state-events refactor).
- **Bruno** — endpoint for `POST /api/webhooks/github` per the `bruno-collection-maintenance` skill.

## Scope (one Epic)

| Logical grouping | Covers |
|---|---|
| **A. Shared transition** | Extract `PrTransitionService` from `PrPoller`; repoint poller + drawer refresh; tests. |
| **B. Config model** | `webhook_hook_id` in `[github]` schema; `github-webhook-secrets.toml` schema + loader; container mount; tests. |
| **C. Webhook route + service** | `GithubWebhookService`, raw-body route, full verification pipeline, agent-by-`pr_url` resolver (with the `html_url`↔`pr_url` normalization + real-value check), Bruno endpoint, tests. (Includes the empirical IP-allowlist check.) |
| **D. Poller demotion** | Lengthen interval; confirm backstop behavior; tests. |
| **E. Setup (crew repo)** | Funnel ACL + path-scoped mapping runbook, `scripts/` helper, GitHub webhook creation, `hook_id` capture, `ping` verification. |

**Follow-up (separate ticket, post-Epic):** register additional crew-using repos (Recipes / others) — one TOML line + one secrets line + one GitHub webhook each. No code.

## Open questions

- **IP allowlist feasibility behind Funnel** (does Funnel surface the client IP?) — resolved empirically in grouping C; design degrades gracefully either way.
- **`html_url` ↔ stored `pr_url` exact match** — must be confirmed against a real `agents.pr_url` written by the `pr_created` hook (CREW-261), with defensive normalization, in grouping C. A silent mismatch fails open into the poll backstop, masking the webhook doing nothing.
- **Exact backstop interval** (20 vs 30 min) — settled in the plan; not load-bearing.
- **Where the `byPrUrl` resolver lives** (`AgentsService` vs `PrTransitionService`) — settled in the plan.
