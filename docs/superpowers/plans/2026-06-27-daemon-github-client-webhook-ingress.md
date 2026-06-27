# Daemon GitHub Client + Inbound Webhook Ingress — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the daemon a typed Octokit GitHub client authenticated by one explicit `CREW_GITHUB_TOKEN` (dropping the `gh` binary and `~/.config/gh` mount), and deliver the PR-merge webhook inbound via a crew-owned Caddy front door behind a dedicated Tailscale Funnel port.

**Architecture:** Thread B replaces `PrPoller`'s in-container `gh pr view` with an injectable `GithubClient` (wraps `@octokit/rest`) wired through the daemon's Awilix container. Thread C adds a crew-owned Caddy reverse proxy whose Caddyfile is the entire public exposure boundary (allow-lists one path, 404s the rest), fronted by a dedicated Funnel port. The shipped CREW-270 receiver is unchanged.

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), Node 22, Vitest, Fastify + `@fastify/awilix` DI, Kysely, `@octokit/rest`, Caddy 2, Tailscale Funnel.

**Spec:** `docs/superpowers/specs/2026-06-26-daemon-github-client-webhook-ingress-design.md`

## Global Constraints

- **ESM import specifiers** end in `.js` even for `.ts` sources.
- **TDD**: failing test first, watch it fail, implement minimally, watch it pass, commit. One logical change per commit, referencing the ticket key.
- **`GH_TOKEN` materialization is settled here** (the spec left it open): the daemon reads **`CREW_GITHUB_TOKEN`** from env, injected via `docker-compose.yml` `environment:` interpolation (mirroring `CREW_JIRA_*`), seeded by the operator from `gh auth token`. No new secret-file loader — it's a plain env var.
- **Secret-safe**: never echo the token; tests use a dummy string, never a real token.
- **No pre-commit hooks** — run verification manually: `npm run lint`, `npm run typecheck`, `npm run test:run`, targeted `npx vitest run <file>`.
- **`PrState` is `'OPEN' | 'MERGED' | 'CLOSED'`** verbatim — the existing `PrPoller` contract; do not change it.
- **The webhook receiver is out of scope** — do not touch `GithubWebhookService`, `PrTransitionService`, or the secret config.
- **Branch per Epic-child ticket**; never commit on `main`.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `packages/daemon/src/config.ts` (modify) | `CREW_GITHUB_TOKEN` → `config.githubToken` | B1 |
| `packages/daemon/src/services/github/github-client.ts` (new) | `GithubClient` (Octokit wrapper): `parsePrUrl` + `fetchPrState` | B2 |
| `packages/daemon/src/services/github/fetch-pr-state.ts` (delete) | replaced by `GithubClient` | B2 |
| `packages/daemon/src/container.ts` (modify) | register `githubClient`; inject into `prPoller` | B3 |
| `packages/daemon/src/services/PrPoller.ts` (modify) | call `this.github.fetchPrState` instead of the imported `gh` fn | B3 |
| `packages/daemon/package.json` (modify) | add `@octokit/rest` | B2 |
| `packages/daemon/Dockerfile` (modify) | remove the `gh` install | B4 |
| `docker-compose.yml` (modify) | drop the `~/.config/gh` mount; add `CREW_GITHUB_TOKEN` env; add `webhook-proxy` service | B4, C1 |
| `packages/daemon/webhook-proxy/Caddyfile` (new) | the public exposure boundary | C1 |
| `docs/runbooks/github-webhook-funnel.md` (rewrite) | the interactive Funnel + webhook setup | C2 |

**Epic-child grouping:** **B** = B1–B4 (autonomous), **C-code** = C1 (autonomous), **C-infra** = C2 (interactive). B ∥ C-code; C-infra after C-code.

---

### Task B1: `CREW_GITHUB_TOKEN` config field

**Files:**
- Modify: `packages/daemon/src/config.ts`
- Test: `packages/daemon/src/config.test.ts`

**Interfaces:**
- Produces: `DaemonConfig.githubToken: string` (empty string when unset).

- [ ] **Step 1: Write the failing test**

Add to `config.test.ts`:
```ts
it('parses CREW_GITHUB_TOKEN into githubToken (default empty)', () => {
  expect(parseDaemonConfig({}).githubToken).toBe('');
  expect(parseDaemonConfig({ CREW_GITHUB_TOKEN: 'ghp_x' }).githubToken).toBe('ghp_x');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run packages/daemon/src/config.test.ts`
Expected: FAIL — `githubToken` is `undefined`.

- [ ] **Step 3: Add the schema field + mapping**

In `config.ts`, add to `daemonConfigSchema` (next to the Jira keys):
```ts
  // GitHub token for the daemon's Octokit client (PrPoller PR-state checks).
  // Replaces the ~/.config/gh creds mount; interpolated from host env at
  // `docker compose up`. Empty → Octokit calls fail and PrPoller logs+no-ops.
  CREW_GITHUB_TOKEN: z.string().default(''),
```
Add to the `DaemonConfig` interface:
```ts
  /** GitHub token for the daemon's Octokit client (PrPoller). Empty → degraded. */
  githubToken: string;
```
Add to the `parseDaemonConfig` return object:
```ts
    githubToken: parsed.CREW_GITHUB_TOKEN,
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run packages/daemon/src/config.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/config.ts packages/daemon/src/config.test.ts
git commit -m "feat(daemon): CREW_GITHUB_TOKEN config field (CREW-XXX)"
```

---

### Task B2: `GithubClient` (Octokit wrapper)

**Files:**
- Create: `packages/daemon/src/services/github/github-client.ts`
- Test: `packages/daemon/src/services/github/github-client.test.ts`
- Delete: `packages/daemon/src/services/github/fetch-pr-state.ts` + `fetch-pr-state.test.ts`
- Modify: `packages/daemon/package.json`

**Interfaces:**
- Produces:
  - `type PrState = 'OPEN' | 'MERGED' | 'CLOSED'`
  - `parsePrUrl(url: string): { owner: string; repo: string; number: number }` (throws on unparseable)
  - `class GithubClient { constructor(octokit: Octokit); fetchPrState(prUrl: string): Promise<PrState> }`

- [ ] **Step 1: Add the dependency**

Run: `npm install @octokit/rest --workspace crew-daemon`
Expected: `@octokit/rest` added to `packages/daemon/package.json` dependencies.

- [ ] **Step 2: Write the failing test**

```ts
// packages/daemon/src/services/github/github-client.test.ts
import { describe, expect, it } from 'vitest';
import type { Octokit } from '@octokit/rest';
import { GithubClient, parsePrUrl } from './github-client.js';

function fakeOctokit(data: { state: string; merged: boolean }): Octokit {
  return { pulls: { get: async () => ({ data }) } } as unknown as Octokit;
}

describe('parsePrUrl', () => {
  it('extracts owner/repo/number', () => {
    expect(parsePrUrl('https://github.com/Safturento/crew/pull/427')).toEqual({
      owner: 'Safturento',
      repo: 'crew',
      number: 427,
    });
  });
  it('throws on an unparseable URL', () => {
    expect(() => parsePrUrl('https://example.com/x')).toThrow(/unparseable/i);
  });
});

describe('GithubClient.fetchPrState', () => {
  const url = 'https://github.com/Safturento/crew/pull/1';
  it('merged → MERGED', async () => {
    expect(await new GithubClient(fakeOctokit({ state: 'closed', merged: true })).fetchPrState(url)).toBe('MERGED');
  });
  it('closed unmerged → CLOSED', async () => {
    expect(await new GithubClient(fakeOctokit({ state: 'closed', merged: false })).fetchPrState(url)).toBe('CLOSED');
  });
  it('open → OPEN', async () => {
    expect(await new GithubClient(fakeOctokit({ state: 'open', merged: false })).fetchPrState(url)).toBe('OPEN');
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run packages/daemon/src/services/github/github-client.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Write the implementation**

```ts
// packages/daemon/src/services/github/github-client.ts
import type { Octokit } from '@octokit/rest';

export type PrState = 'OPEN' | 'MERGED' | 'CLOSED';

/** Parse `https://github.com/<owner>/<repo>/pull/<n>` → its parts. */
export function parsePrUrl(url: string): { owner: string; repo: string; number: number } {
  const m = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (!m) throw new Error(`unparseable PR URL: ${url}`);
  return { owner: m[1], repo: m[2], number: Number(m[3]) };
}

/**
 * Typed GitHub client for the daemon. Wraps Octokit so PrPoller no longer
 * shells out to `gh pr view` (CREW-XXX). Replaces fetch-pr-state.ts; returns
 * the identical PrState the poller consumed before.
 */
export class GithubClient {
  constructor(private readonly octokit: Octokit) {}

  async fetchPrState(prUrl: string): Promise<PrState> {
    const { owner, repo, number } = parsePrUrl(prUrl);
    const { data } = await this.octokit.pulls.get({ owner, repo, pull_number: number });
    if (data.merged) return 'MERGED';
    return data.state === 'closed' ? 'CLOSED' : 'OPEN';
  }
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npx vitest run packages/daemon/src/services/github/github-client.test.ts`
Expected: PASS.

- [ ] **Step 6: Delete the obsolete `gh`-based module**

```bash
git rm packages/daemon/src/services/github/fetch-pr-state.ts packages/daemon/src/services/github/fetch-pr-state.test.ts
```
(Its only consumer is `PrPoller`, repointed in B3.)

- [ ] **Step 7: Commit**

```bash
git add packages/daemon/src/services/github/github-client.ts packages/daemon/src/services/github/github-client.test.ts packages/daemon/package.json package-lock.json
git commit -m "feat(daemon): GithubClient Octokit wrapper, replace gh pr view (CREW-XXX)"
```

---

### Task B3: Wire `githubClient` into the container + `PrPoller`

**Files:**
- Modify: `packages/daemon/src/container.ts`
- Modify: `packages/daemon/src/services/PrPoller.ts`
- Test: `packages/daemon/src/services/PrPoller.test.ts`

**Interfaces:**
- Consumes: `GithubClient`, `config.githubToken` (B1, B2).
- Produces: `PrPollerDeps.github: GithubClient`.

- [ ] **Step 1: Update the PrPoller test to inject a fake client**

In `PrPoller.test.ts`, replace any module-mock of `fetch-pr-state` with a `github` stub passed to the constructor. Example helper + a representative case:
```ts
import type { GithubClient } from './github/github-client.js';
const githubStub = (state: 'OPEN' | 'MERGED' | 'CLOSED'): GithubClient =>
  ({ fetchPrState: async () => state }) as unknown as GithubClient;

// every `new PrPoller({ db, logger, prTransitions })` becomes:
new PrPoller({ db, logger, prTransitions, github: githubStub('MERGED') });
```
Keep each existing assertion; only the construction + the per-test PR state (via the stub) changes.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run packages/daemon/src/services/PrPoller.test.ts`
Expected: FAIL — `PrPollerDeps` has no `github`, and `fetchPrStateViaGh` is gone.

- [ ] **Step 3: Repoint PrPoller at the injected client**

In `PrPoller.ts`:
- Remove `import { fetchPrStateViaGh } from './github/fetch-pr-state.js';`
- Add `import type { GithubClient } from './github/github-client.js';`
- Add to `PrPollerDeps`: `github: GithubClient;`
- Add the field + constructor assignment: `private readonly github: GithubClient;` … `this.github = deps.github;`
- Replace the call (line ~113): `const prState = await this.github.fetchPrState(agent.pr_url);`

- [ ] **Step 4: Register `githubClient` in the container**

In `container.ts`:
- Import: `import { Octokit } from '@octokit/rest';` and `import { GithubClient } from './services/github/github-client.js';`
- Add to `DaemonCradle`: `githubClient: GithubClient;`
- Register (singleton — one Octokit per process):
```ts
    githubClient: asFunction(
      ({ config }: DaemonCradle) => new GithubClient(new Octokit({ auth: config.githubToken })),
    ).singleton(),
```
- Inject into the `prPoller` registration:
```ts
    prPoller: asFunction(
      ({ db, logger, prTransitionService, githubClient }: DaemonCradle) =>
        new PrPoller({ db, logger, prTransitions: prTransitionService, github: githubClient }),
    ).singleton(),
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npm run typecheck && npx vitest run packages/daemon/src/services/PrPoller.test.ts packages/daemon/src/container.test.ts`
Expected: PASS (no dangling `fetch-pr-state` reference; container resolves `githubClient`).

- [ ] **Step 6: Commit**

```bash
git add packages/daemon/src/container.ts packages/daemon/src/services/PrPoller.ts packages/daemon/src/services/PrPoller.test.ts
git commit -m "feat(daemon): inject GithubClient into PrPoller via the container (CREW-XXX)"
```

---

### Task B4: Drop `gh` from the image + the creds mount; add the token env

**Files:**
- Modify: `packages/daemon/Dockerfile`
- Modify: `docker-compose.yml`

**Interfaces:** none (infra).

- [ ] **Step 1: Remove the `gh` install from the Dockerfile**

Replace the `RUN apt-get …` block (lines ~4-16) with just the healthcheck dependency:
```dockerfile
# curl for the compose healthcheck command.
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
```
(Drops `gnupg`, the gh apt repo, and the `gh` install — nothing in the daemon shells out to `gh` after B3.)

- [ ] **Step 2: Drop the creds mount + add the token env in compose**

In `docker-compose.yml`, in the `daemon` service:
- **Remove** the mount (the `${HOME}/.config/gh:/root/.config/gh:ro` line and its comment).
- **Add** under `environment:`:
```yaml
      # Daemon GitHub token for the Octokit client (PrPoller). Replaces the
      # ~/.config/gh mount; interpolated from host env at `docker compose up`.
      # Seed it with: export CREW_GITHUB_TOKEN=$(gh auth token)
      - CREW_GITHUB_TOKEN=${CREW_GITHUB_TOKEN:-}
```

- [ ] **Step 3: Verify the daemon image builds + boots without `gh`**

Run: `docker compose build daemon && docker compose up -d daemon && sleep 8 && curl -4 --noproxy "" -fsS http://localhost:7773/health`
Expected: `build` succeeds without the gh apt steps; `/health` returns OK. (Set `CREW_GITHUB_TOKEN` first so PrPoller can authenticate; an unset token still boots — PrPoller just logs+no-ops.)

- [ ] **Step 4: Commit**

```bash
git add packages/daemon/Dockerfile docker-compose.yml
git commit -m "feat(daemon): drop gh binary + creds mount, use CREW_GITHUB_TOKEN (CREW-XXX)"
```

---

### Task C1: crew-owned Caddy reverse proxy

**Files:**
- Create: `packages/daemon/webhook-proxy/Caddyfile`
- Modify: `docker-compose.yml` (add the `webhook-proxy` service)

**Interfaces:** none (infra). The Caddyfile is the public exposure boundary.

- [ ] **Step 1: Write the Caddyfile**

```caddyfile
# packages/daemon/webhook-proxy/Caddyfile
# The crew public exposure boundary. Only the paths allow-listed here are
# reachable through the funnelled port; everything else 404s and the daemon's
# unauthenticated routes stay invisible. Add future public paths as more
# @matchers + handle blocks.
:8081 {
	@webhook {
		method POST
		path /api/webhooks/github
	}
	handle @webhook {
		reverse_proxy daemon:7773
	}
	handle {
		respond 404
	}
}
```

- [ ] **Step 2: Add the compose service**

In `docker-compose.yml`, add a sibling service:
```yaml
  webhook-proxy:
    profiles: [webhook]
    image: caddy:2-alpine
    volumes:
      - ./packages/daemon/webhook-proxy/Caddyfile:/etc/caddy/Caddyfile:ro
    ports:
      - '${CREW_WEBHOOK_PROXY_PORT:-8081}:8081'
    depends_on:
      daemon:
        condition: service_healthy
    restart: unless-stopped
    mem_limit: 128m
    cpus: 0.25
```

- [ ] **Step 3: Verify the allow-list boundary**

Run:
```bash
docker compose --profile webhook up -d daemon webhook-proxy && sleep 6
curl -4 --noproxy "" -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:8081/api/webhooks/github   # expect a daemon response code (e.g. 401/404 from the receiver, NOT Caddy's 404 — it was proxied)
curl -4 --noproxy "" -s -o /dev/null -w '%{http_code}\n' http://localhost:8081/api/agents                     # expect 404 (Caddy refused — never proxied)
curl -4 --noproxy "" -s -o /dev/null -w '%{http_code}\n' http://localhost:8081/api/webhooks/github            # GET (not POST) → expect 404 (method not allow-listed)
```
Expected: the POST to the webhook path reaches the daemon (a receiver status, e.g. `401` for a bad signature); `/api/agents` and the GET both return Caddy's `404`. This proves only the one method+path is exposed.

- [ ] **Step 4: Commit**

```bash
git add packages/daemon/webhook-proxy/Caddyfile docker-compose.yml
git commit -m "feat(daemon): crew-owned Caddy webhook front door (allow-list only) (CREW-XXX)"
```

---

### Task C2: Interactive Funnel + GitHub webhook setup (operator)

> **Interactive ticket — driven live in-session with the user, NOT `crew run`.** This task's code deliverable is the rewritten runbook; the live steps (Funnel ACL, webhook creation) are operator actions executed together. Mark the Jira child `interactive`.

**Files:**
- Rewrite: `docs/runbooks/github-webhook-funnel.md`
- Modify: `docs/followups.md` (resolve the path-restricting-proxy entry)

- [ ] **Step 1: Rewrite the runbook around the crew-Caddy + dedicated-funnel-port topology**

Remove the "⚠️ DO NOT FOLLOW AS-IS" banner. New content, step by step:
1. **Enable Funnel** in the tailnet ACL (`nodeAttrs` → `funnel` for the host node) — admin console, out-of-band.
2. **Bring up the proxy:** `export CREW_GITHUB_TOKEN=$(gh auth token); docker compose --profile webhook up -d daemon webhook-proxy` (Caddy publishes `:8081` on WSL2 localhost).
3. **Funnel a dedicated port → Caddy** (Windows side, where Tailscale runs): `tailscale funnel --bg --https=8443 http://127.0.0.1:8081`. This is the same WSL2→Windows localhost crossing that `svc:crew → :5173` already proves.
4. **Create the GitHub webhook:** `CREW_GITHUB_WEBHOOK_SECRETS_FILE=… scripts/setup-github-webhook.sh` with payload URL `https://<node>.<tailnet>.ts.net:8443/api/webhooks/github`, events `pull_request`. Confirm GitHub accepts the non-443 port.
5. **Capture `hook_id`** (`gh api repos/<owner>/<repo>/hooks`) into `crew.toml` `[github] webhook_hook_id` so the receiver's hook-ID pin engages.
6. **Verify:** GitHub's `ping` delivery returns `200`; then merge a throwaway PR and confirm the dashboard flips `pr_open → pr_merged` near-instantly (vs. waiting for the 30-min poll).

- [ ] **Step 2: Resolve the followup + CREW-271**

In `docs/followups.md`, move the `2026-06-25 — GitHub webhook ingress needs a path-restricting proxy` entry to **Resolved** (the crew-Caddy front door IS that proxy), update both ToC links, and append `**Resolved 2026-06-27:** crew-owned Caddy front door behind a dedicated Funnel port (Epic CREW-XXX, child C).` Transition CREW-271 → Done.

- [ ] **Step 3: Live execution + doc-parity**

Execute steps 1-6 live with the user. Then invoke the `agents-doc-parity-check` skill (a change under `docker-compose.yml` + `docs/runbooks/` touches paths `.agents/local-dev.md` / `.agents/security.md` claim) and update any flagged doc.

- [ ] **Step 4: Commit**

```bash
git add docs/runbooks/github-webhook-funnel.md docs/followups.md
git commit -m "docs(daemon): rewrite webhook-funnel runbook for crew-Caddy ingress; resolve CREW-271 (CREW-XXX)"
```

---

## Self-Review

**Spec coverage:**
- B: token model (`CREW_GITHUB_TOKEN`) → B1/B4; Octokit client + `fetch-pr-state` rewrite → B2; container/PrPoller wiring → B3; image slimming + drop mount → B4. ✓
- C-code: Caddy service + Caddyfile (exposure boundary) → C1. ✓
- C-infra: Funnel + webhook setup + runbook rewrite + CREW-271 resolution → C2. ✓
- Receiver unchanged → enforced by the Global Constraint + no task touches it. ✓
- `GH_TOKEN` materialization open question → **settled** in Global Constraints (env var, not a file). ✓
- Non-goals (outbound relay, `--set-path`, daemon-wide auth, CLI `client.ts`, multi-repo) → no task touches them. ✓

**Placeholder scan:** no TBD/TODO; every code step carries real code; `CREW-XXX` is the ticket-key placeholder resolved at ticketing.

**Type consistency:** `PrState`, `parsePrUrl`, `GithubClient.fetchPrState`, and `PrPollerDeps.github` signatures match across B2/B3. The container's `githubClient` registration name matches the cradle key and the `prPoller` injection. `config.githubToken` (B1) is the exact field the container reads (B3).

## Open follow-ups (not this Epic)

- CLI `client.ts` Octokit migration (fix-pr reviews/comments).
- Registering additional repos' webhooks (one Caddy path already general; just more GitHub webhooks).
