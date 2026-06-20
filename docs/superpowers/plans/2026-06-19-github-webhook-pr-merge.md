# GitHub Webhook for PR-Merge Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect PR merges via a pushed GitHub `pull_request` webhook (bridged to the tailnet-only daemon by Tailscale Funnel) instead of polling, cutting merge-to-dashboard latency from up to 5 min to seconds while keeping a slow poll as a correctness backstop.

**Architecture:** A new `POST /api/webhooks/github` route receives deliveries through a path-scoped Funnel. A `GithubWebhookService` verifies each delivery (event filter → project resolve → HMAC per-project secret → hook-ID pin), then resolves the agent by PR URL and calls a shared `PrTransitionService.markMerged`, which is extracted from the existing `PrPoller` so webhook, poller, and the drawer's manual refresh all share one idempotent `pr_open → pr_merged` transition. `pr_merged` stays a daemon-side terminal path — it is **not** routed through the concrete-state-events reducer (which deliberately excludes it). Config is multi-repo from the start: a non-secret `webhook_hook_id` per project TOML plus a separate daemon-loaded secrets file mapping `repo → secret`.

**Tech Stack:** Fastify + `fastify-type-provider-zod`, Kysely + `kysely-better-sqlite3`, `@fastify/awilix` DI, `node:crypto` (HMAC), `smol-toml`, Zod, Vitest, Bruno, Tailscale Funnel.

## Global Constraints

- **Daemon package rules:** routes are thin (parse/validate → call service → return); business logic lives in services; one service per domain. `packages/daemon/AGENTS.md`.
- **`crew-shared` is the dependency leaf:** no imports from `cli/`, `daemon/`, or `dashboard/`. Types-only files are `src/<concern>/types.ts`. `packages/shared/AGENTS.md`.
- **No new migration:** the feature reuses the existing `state_transitions` table and `agents.pr_url` column. Never edit a shipped migration.
- **`pr_merged` is terminal and out of the event vocabulary:** do not add a merge kind to `STATE_EVENT_KINDS` or route the merge through `reduceState`. It moves only via its dedicated daemon-side path (`PrPoller` / this webhook).
- **Idempotency is the `latest === 'pr_open'` precondition**, not a dedup ledger. Double-delivery and webhook-vs-poll races must collapse to one transition.
- **Secrets never enter the transcript or logs.** Log `repository.full_name` and the failing check name on rejection — never the secret or signature.
- **Tests must not shell out to `gh` or hit the network.** The daemon disables `PrPoller` under `VITEST=true`; webhook tests use `app.inject` with locally-signed payloads.
- **HMAC compare is constant-time** (`crypto.timingSafeEqual`), never `===`.
- **Branch naming:** `CREW-<n>` per ticket (see workflow doc); this plan's doc PR is already on `docs/github-webhook-pr-merge`.

---

## File Structure

**New files**
- `packages/daemon/src/services/PrTransitionService.ts` — the shared idempotent `pr_open → pr_merged` transition + PR-URL→agent resolver + URL normalizer.
- `packages/daemon/src/services/PrTransitionService.test.ts`
- `packages/daemon/src/services/GithubWebhookService.ts` — delivery verification pipeline; delegates state change to `PrTransitionService`.
- `packages/daemon/src/services/GithubWebhookService.test.ts`
- `packages/daemon/src/services/github/webhook-fixtures.ts` — real `pull_request` + `ping` payload fixtures + a `signPayload` test helper.
- `packages/daemon/src/routes/webhooks.ts` — encapsulated route with raw-body content-type parser.
- `packages/daemon/src/routes/webhooks.test.ts`
- `packages/shared/src/config/github-webhook-secrets.ts` — secrets-file schema + tolerant loader → `Map<repo, secret>`.
- `packages/shared/src/config/github-webhook-secrets.test.ts`
- `bruno/endpoints/webhooks/post-github.bru`
- `docs/runbooks/github-webhook-funnel.md` — operator setup (Funnel ACL, path-scoped serve, webhook creation, hook-ID capture).
- `scripts/setup-github-webhook.sh` — helper that creates the webhook and prints the `hook_id`.

**Modified files**
- `packages/shared/src/config/schema.ts:55-57` — add optional `webhook_hook_id` to the `github` object.
- `packages/shared/src/index.ts` — export the new secrets module + types.
- `packages/daemon/src/config.ts:50-93` — add `CREW_GITHUB_WEBHOOK_SECRETS_FILE` + `githubWebhookSecretsFile` on `DaemonConfig`.
- `packages/daemon/src/services/ProjectsService.ts` — add `findByRepo(repoFullName): ProjectConfig | null`.
- `packages/daemon/src/services/PrPoller.ts:108-121` — delegate the transition to `PrTransitionService.markMerged`; change `DEFAULT_INTERVAL_MS` to 30 min.
- `packages/daemon/src/container.ts` — register `prTransitionService`, `githubWebhookSecrets`, `githubWebhookService`; inject `prTransitionService` into `prPoller`.
- `packages/daemon/src/app.ts:218-225` — register the webhook route.
- `docker-compose.yml` — mount the secrets file read-only into the daemon.
- `.agents/architecture.md`, `.agents/security.md`, `.agents/local-dev.md` — route list, webhook auth model, the new mount + Funnel.

---

## Task 1: Extract `PrTransitionService` (shared merge transition)

**Files:**
- Create: `packages/daemon/src/services/PrTransitionService.ts`
- Test: `packages/daemon/src/services/PrTransitionService.test.ts`

**Interfaces:**
- Consumes: `Kysely<DaemonDatabase>` (`db`), `EventBus` (`eventBus`), `Logger`.
- Produces:
  - `normalizePrUrl(url: string): string` — lowercases scheme+host, strips a trailing slash, trims.
  - `class PrTransitionService` with:
    - `markMerged(agentKey: string): Promise<{ changed: boolean }>`
    - `resolveOpenPrAgentByUrl(prUrl: string): Promise<string | null>`

- [ ] **Step 1: Write the failing test for `normalizePrUrl`**

```ts
// packages/daemon/src/services/PrTransitionService.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { sql } from 'kysely';
import { normalizePrUrl, PrTransitionService } from './PrTransitionService.js';
import { EventBus, type SseEvent } from './EventBus.js';
import { makeTestDb } from '../test/makeTestDb.js'; // existing helper used by other *.test.ts
import pino from 'pino';

describe('normalizePrUrl', () => {
  it('canonicalizes host casing and trailing slash', () => {
    expect(normalizePrUrl('HTTPS://GitHub.com/Owner/Repo/pull/12/')).toBe(
      'https://github.com/Owner/Repo/pull/12',
    );
  });
});
```

> **Note:** confirm the existing DB-test helper's real name/path before running — other daemon `*.test.ts` files import it (grep `makeTestDb` / `createTestDb`). Use whatever they use; the snippet assumes `../test/makeTestDb.js`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run -w crew-daemon test -- PrTransitionService`
Expected: FAIL — `normalizePrUrl` is not exported / module missing.

- [ ] **Step 3: Implement `normalizePrUrl` + the service**

```ts
// packages/daemon/src/services/PrTransitionService.ts
import type { Kysely } from 'kysely';
import type { Logger } from 'pino';
import type { DaemonDatabase } from '../db.js';
import type { EventBus } from './EventBus.js';

/**
 * Canonicalize a GitHub PR URL for cross-source comparison. The webhook's
 * `pull_request.html_url` and the stored `agents.pr_url` (written by the
 * pr_created hook, CREW-261) should already be identical canonical forms;
 * this defends against trivial scheme/host-casing or trailing-slash drift.
 * The path (owner/repo/pull/n) is preserved verbatim — repo names are
 * case-sensitive on GitHub, so we only lowercase scheme + host.
 */
export function normalizePrUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '');
  const m = /^([a-zA-Z]+):\/\/([^/]+)(\/.*)?$/.exec(trimmed);
  if (!m) return trimmed;
  const [, scheme, host, path = ''] = m;
  return `${scheme.toLowerCase()}://${host.toLowerCase()}${path}`;
}

export interface PrTransitionDeps {
  db: Kysely<DaemonDatabase>;
  eventBus: EventBus;
  logger: Logger;
}

/**
 * Owns the single, idempotent `pr_open → pr_merged` transition. Shared by
 * PrPoller (poll backstop), the webhook (fast path), and the drawer's manual
 * refresh. `pr_merged` is terminal and intentionally outside the concrete
 * state-events reducer — this is its dedicated daemon-side path.
 */
export class PrTransitionService {
  private readonly db: Kysely<DaemonDatabase>;
  private readonly eventBus: EventBus;
  private readonly logger: Logger;

  constructor(deps: PrTransitionDeps) {
    this.db = deps.db;
    this.eventBus = deps.eventBus;
    this.logger = deps.logger;
  }

  /**
   * Transition the agent to pr_merged iff its latest state_transitions row is
   * pr_open. The precondition makes double-delivery and webhook-vs-poll races
   * collapse to one transition. Returns `{ changed }`.
   */
  async markMerged(agentKey: string): Promise<{ changed: boolean }> {
    const current = await this.latestState(agentKey);
    if (current !== 'pr_open') return { changed: false };
    const ts = Date.now();
    await this.db
      .insertInto('state_transitions')
      .values({ agent_key: agentKey, from_state: 'pr_open', to_state: 'pr_merged', ts })
      .execute();
    this.eventBus.publish({
      type: 'agent.state_changed',
      data: { key: agentKey, from: 'pr_open', to: 'pr_merged', ts },
    });
    return { changed: true };
  }

  /**
   * Find the agent key whose stored pr_url matches `prUrl` (normalized) and
   * whose latest state is pr_open. Returns null when nothing matches —
   * including an already-merged / unknown PR (a valid delivery with nothing
   * to do). Normalizes in JS because pr_url is stored verbatim.
   */
  async resolveOpenPrAgentByUrl(prUrl: string): Promise<string | null> {
    const target = normalizePrUrl(prUrl);
    const rows = await this.db
      .selectFrom('agents')
      .select(['key', 'pr_url'])
      .where('pr_url', 'is not', null)
      .execute();
    for (const row of rows) {
      if (row.pr_url && normalizePrUrl(row.pr_url) === target) {
        if ((await this.latestState(row.key)) === 'pr_open') return row.key;
      }
    }
    return null;
  }

  private async latestState(agentKey: string): Promise<string | null> {
    const row = await this.db
      .selectFrom('state_transitions')
      .select('to_state')
      .where('agent_key', '=', agentKey)
      .orderBy('ts', 'desc')
      .orderBy('id', 'desc')
      .executeTakeFirst();
    return row?.to_state ?? null;
  }
}
```

- [ ] **Step 4: Add behavior tests (markMerged + resolver)**

```ts
describe('PrTransitionService', () => {
  let db: Kysely<DaemonDatabase>;
  let bus: EventBus;
  let events: SseEvent[];
  let svc: PrTransitionService;

  beforeEach(async () => {
    db = await makeTestDb();
    bus = new EventBus();
    events = [];
    bus.subscribe({ onEvent: (e) => events.push(e) });
    svc = new PrTransitionService({ db, eventBus: bus, logger: pino({ level: 'silent' }) });
    await db.insertInto('agents').values({ key: 'CREW-1', pr_url: 'https://github.com/o/r/pull/1' }).execute();
  });

  const setState = (key: string, to: string) =>
    db.insertInto('state_transitions').values({ agent_key: key, from_state: null, to_state: to, ts: Date.now() }).execute();

  it('transitions and emits when latest is pr_open', async () => {
    await setState('CREW-1', 'pr_open');
    const r = await svc.markMerged('CREW-1');
    expect(r.changed).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: 'agent.state_changed', data: { to: 'pr_merged' } });
  });

  it('no-ops when latest is not pr_open (idempotent / wrong state)', async () => {
    await setState('CREW-1', 'pr_open');
    await svc.markMerged('CREW-1');           // first → pr_merged
    events.length = 0;
    const r = await svc.markMerged('CREW-1'); // second → no-op
    expect(r.changed).toBe(false);
    expect(events).toHaveLength(0);
  });

  it('resolves a pr_open agent by URL ignoring host casing / trailing slash', async () => {
    await setState('CREW-1', 'pr_open');
    expect(await svc.resolveOpenPrAgentByUrl('https://GITHUB.com/o/r/pull/1/')).toBe('CREW-1');
  });

  it('returns null when the matching agent is not pr_open', async () => {
    await setState('CREW-1', 'running');
    expect(await svc.resolveOpenPrAgentByUrl('https://github.com/o/r/pull/1')).toBeNull();
  });
});
```

- [ ] **Step 5: Run the tests and verify they pass**

Run: `npm run -w crew-daemon test -- PrTransitionService`
Expected: PASS (all cases).

- [ ] **Step 6: Commit**

```bash
git add packages/daemon/src/services/PrTransitionService.ts packages/daemon/src/services/PrTransitionService.test.ts
git commit -m "feat(daemon): extract shared PrTransitionService (markMerged + pr_url resolver)"
```

---

## Task 2: Register `PrTransitionService` and route `PrPoller` through it

**Files:**
- Modify: `packages/daemon/src/container.ts:31-47` (cradle) and `:117-119` (prPoller registration)
- Modify: `packages/daemon/src/services/PrPoller.ts:14-22,49-54,94-121,140-166`
- Modify: `packages/daemon/src/services/PrPoller.test.ts`

**Interfaces:**
- Consumes: `PrTransitionService.markMerged` (Task 1).
- Produces: `DaemonCradle.prTransitionService: PrTransitionService`; `PrPoller` now constructed with `{ db, eventBus, logger, prTransitions, intervalMs? }`.

- [ ] **Step 1: Add `prTransitionService` to the cradle + container**

In `container.ts`, import and register (singleton — it holds no state but matches the merge-path services it serves; scoped is also acceptable, choose singleton for parity with `prPoller`):

```ts
import { PrTransitionService } from './services/PrTransitionService.js';
// in DaemonCradle:
prTransitionService: PrTransitionService;
// in register({ ... }):
prTransitionService: asFunction(
  ({ db, eventBus, logger }: DaemonCradle) => new PrTransitionService({ db, eventBus, logger }),
).singleton(),
```

Update the `prPoller` registration to inject it:

```ts
prPoller: asFunction(
  ({ db, eventBus, logger, prTransitionService }: DaemonCradle) =>
    new PrPoller({ db, eventBus, logger, prTransitions: prTransitionService }),
).singleton(),
```

- [ ] **Step 2: Update `PrPoller` to delegate the transition + lengthen the interval**

In `PrPoller.ts`: add `prTransitions: PrTransitionService` to `PrPollerDeps`, store it, change the default interval, and replace the inline insert+publish (current lines 111-119) with a delegated call:

```ts
const DEFAULT_INTERVAL_MS = 30 * 60_000; // CREW: webhook is the fast path; poll is the backstop

// in PrPollerDeps:
prTransitions: PrTransitionService;

// constructor: this.prTransitions = deps.prTransitions;

// in checkOneInternal, replacing the manual insert + eventBus.publish:
const prState = await fetchPrStateViaGh(agent.pr_url);
if (prState === 'OPEN') return { stateChanged: false };
const { changed } = await this.prTransitions.markMerged(agentKey);
return changed ? { stateChanged: true, newState: 'pr_merged' } : { stateChanged: false };
```

Keep `PrPoller`'s own precondition read (`getCurrentTransitionState`) — it gates the `gh pr view` call so the poller doesn't shell out for non-`pr_open` agents. `markMerged` re-checks the precondition authoritatively.

- [ ] **Step 3: Update `PrPoller.test.ts`**

Construct the poller with a real `PrTransitionService` (over the test DB + bus) so existing assertions about the emitted `agent.state_changed` event and the inserted transition still hold. Update the cadence assertion if any test pins `DEFAULT_INTERVAL_MS` to 5 min. Add no new behavior — this is a delegation refactor.

- [ ] **Step 4: Run daemon tests**

Run: `npm run -w crew-daemon test -- PrPoller`
Expected: PASS (poller behavior unchanged; transition now flows through the shared service).

- [ ] **Step 5: Typecheck the workspace**

Run: `npm run -w crew-daemon typecheck`
Expected: clean (cradle augmentation resolves `prTransitionService`).

- [ ] **Step 6: Commit**

```bash
git add packages/daemon/src/container.ts packages/daemon/src/services/PrPoller.ts packages/daemon/src/services/PrPoller.test.ts
git commit -m "refactor(daemon): route PrPoller through PrTransitionService; lengthen poll to 30m backstop"
```

---

## Task 3: Add `webhook_hook_id` to the project config schema

**Files:**
- Modify: `packages/shared/src/config/schema.ts:55-57`
- Modify: `packages/shared/src/config/loader.test.ts` (or the schema test file alongside)

**Interfaces:**
- Produces: `ProjectConfig['github']['webhook_hook_id']?: string`.

- [ ] **Step 1: Write the failing test**

```ts
// in the existing project-config schema/loader test file
it('parses an optional github.webhook_hook_id', () => {
  const cfg = parseProjectConfig(`
name = "crew"
repo_path = "/x"
[jira]
project_key = "CREW"
site = "https://example.atlassian.net"
[github]
repo = "Owner/repo"
webhook_hook_id = "123456789"
`);
  expect(cfg.github.webhook_hook_id).toBe('123456789');
});

it('leaves webhook_hook_id undefined when absent', () => {
  const cfg = parseProjectConfig(`
name = "crew"
repo_path = "/x"
[jira]
project_key = "CREW"
site = "https://example.atlassian.net"
[github]
repo = "Owner/repo"
`);
  expect(cfg.github.webhook_hook_id).toBeUndefined();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run -w crew-shared test -- config`
Expected: FAIL — `webhook_hook_id` stripped (not in schema).

- [ ] **Step 3: Extend the schema**

In `schema.ts`, change the `github` object. Accept a string or number in TOML and coerce to string so the daemon compares against the `X-GitHub-Hook-ID` header (a string) without ambiguity:

```ts
github: z.object({
  repo: z.string(),
  // CREW: numeric GitHub webhook id, pinned per-repo. TOML may write it bare
  // (number) or quoted (string); coerce to string for header comparison.
  webhook_hook_id: z.coerce.string().optional(),
}),
```

- [ ] **Step 4: Run to verify pass**

Run: `npm run -w crew-shared test -- config`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/config/schema.ts packages/shared/src/config/*.test.ts
git commit -m "feat(shared): add optional github.webhook_hook_id to project config schema"
```

---

## Task 4: Webhook-secrets file schema + tolerant loader

**Files:**
- Create: `packages/shared/src/config/github-webhook-secrets.ts`
- Create: `packages/shared/src/config/github-webhook-secrets.test.ts`
- Modify: `packages/shared/src/index.ts` (export the module)

**Interfaces:**
- Produces:
  - `parseGithubWebhookSecrets(raw: string): Map<string, string>` — normalized-lowercase repo key → secret.
  - `loadGithubWebhookSecrets(path: string): Map<string, string>` — returns an empty map when the file is absent; throws on malformed TOML/schema.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/shared/src/config/github-webhook-secrets.test.ts
import { describe, it, expect } from 'vitest';
import { parseGithubWebhookSecrets, loadGithubWebhookSecrets } from './github-webhook-secrets.js';

describe('parseGithubWebhookSecrets', () => {
  it('maps repo (lowercased) → secret', () => {
    const m = parseGithubWebhookSecrets(`
["Owner/Repo"]
secret = "s3cr3t"
`);
    expect(m.get('owner/repo')).toBe('s3cr3t');
  });

  it('rejects an entry missing secret', () => {
    expect(() => parseGithubWebhookSecrets(`["o/r"]\n`)).toThrow();
  });
});

describe('loadGithubWebhookSecrets', () => {
  it('returns an empty map when the file is absent', () => {
    expect(loadGithubWebhookSecrets('/nonexistent/github-webhook-secrets.toml').size).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm run -w crew-shared test -- github-webhook-secrets`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement schema + loader**

```ts
// packages/shared/src/config/github-webhook-secrets.ts
import { readFileSync, existsSync } from 'node:fs';
import { parse as parseToml } from 'smol-toml';
import { z } from 'zod';

/**
 * `~/.config/crew/github-webhook-secrets.toml` — per-repo HMAC secrets, kept
 * out of the project TOMLs. Shape:
 *
 *   ["Owner/repo"]
 *   secret = "<unique-per-repo-random>"
 *
 * Keys are repo full names; we lowercase them so lookup matches the webhook's
 * `repository.full_name` case-insensitively (GitHub treats it that way).
 */
const entrySchema = z.object({ secret: z.string().min(1) });
const fileSchema = z.record(z.string(), entrySchema);

export function parseGithubWebhookSecrets(raw: string): Map<string, string> {
  const parsed = fileSchema.parse(parseToml(raw));
  const map = new Map<string, string>();
  for (const [repo, { secret }] of Object.entries(parsed)) {
    map.set(repo.toLowerCase(), secret);
  }
  return map;
}

/**
 * Load secrets from disk. A *missing* file is not an error — the daemon boots
 * with zero configured webhooks (every delivery then 404s at repo-resolve).
 * A present-but-malformed file throws, surfacing the misconfiguration loudly.
 */
export function loadGithubWebhookSecrets(path: string): Map<string, string> {
  if (!existsSync(path)) return new Map();
  return parseGithubWebhookSecrets(readFileSync(path, 'utf8'));
}
```

Add to `packages/shared/src/index.ts`:

```ts
export * from './config/github-webhook-secrets.js';
```

- [ ] **Step 4: Run to verify pass**

Run: `npm run -w crew-shared test -- github-webhook-secrets`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/config/github-webhook-secrets.ts packages/shared/src/config/github-webhook-secrets.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): github-webhook-secrets file schema + tolerant loader"
```

---

## Task 5: Daemon config — secrets-file path + read-only mount

**Files:**
- Modify: `packages/daemon/src/config.ts:9-53` (schema) and `:55-93` (interface + return)
- Modify: `packages/daemon/src/config.test.ts`
- Modify: `docker-compose.yml` (daemon `volumes` + `environment`)

**Interfaces:**
- Produces: `DaemonConfig.githubWebhookSecretsFile: string`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/daemon/src/config.test.ts
it('defaults githubWebhookSecretsFile under ~/.config/crew', () => {
  const cfg = parseDaemonConfig({});
  expect(cfg.githubWebhookSecretsFile).toMatch(/\.config\/crew\/github-webhook-secrets\.toml$/);
});

it('honors CREW_GITHUB_WEBHOOK_SECRETS_FILE', () => {
  const cfg = parseDaemonConfig({ CREW_GITHUB_WEBHOOK_SECRETS_FILE: '/tmp/s.toml' });
  expect(cfg.githubWebhookSecretsFile).toBe('/tmp/s.toml');
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm run -w crew-daemon test -- config`
Expected: FAIL — property undefined.

- [ ] **Step 3: Add the env key + config field**

In the `daemonConfigSchema` object add:

```ts
CREW_GITHUB_WEBHOOK_SECRETS_FILE: z
  .string()
  .default(() => join(defaultCrewHome(), 'github-webhook-secrets.toml')),
```

Add `githubWebhookSecretsFile: string;` to the `DaemonConfig` interface and `githubWebhookSecretsFile: parsed.CREW_GITHUB_WEBHOOK_SECRETS_FILE,` to the returned object.

- [ ] **Step 4: Mount the secrets file into the daemon container**

In `docker-compose.yml`, under the daemon `volumes:` (read-only, mirroring the `gh` creds mount), add:

```yaml
      # Read-only: per-repo GitHub webhook HMAC secrets (CREW). The daemon
      # loads these at boot to verify pull_request webhook deliveries. Host
      # path mirrors the other ~/.config/crew mounts; os.homedir() == /root
      # in the container resolves to the same logical location.
      - ${HOME}/.config/crew/github-webhook-secrets.toml:/root/.config/crew/github-webhook-secrets.toml:ro
```

> **Note:** a bind mount of a *missing* host file makes Docker create a directory. Document in the runbook (Task 10) that the operator creates the file before `docker compose up`; the loader's missing-file tolerance (Task 4) covers the daemon-side absence, but the mount itself needs the file to exist as a file.

- [ ] **Step 5: Run to verify pass + typecheck**

Run: `npm run -w crew-daemon test -- config && npm run -w crew-daemon typecheck`
Expected: PASS, clean.

- [ ] **Step 6: Commit**

```bash
git add packages/daemon/src/config.ts packages/daemon/src/config.test.ts docker-compose.yml
git commit -m "feat(daemon): CREW_GITHUB_WEBHOOK_SECRETS_FILE config + read-only mount"
```

---

## Task 6: `ProjectsService.findByRepo`

**Files:**
- Modify: `packages/daemon/src/services/ProjectsService.ts`
- Modify: `packages/daemon/src/services/ProjectsService.test.ts`

**Interfaces:**
- Produces: `ProjectsService.findByRepo(repoFullName: string): ProjectConfig | null` — case-insensitive match on `config.github.repo`.

- [ ] **Step 1: Write the failing test**

```ts
it('findByRepo matches github.repo case-insensitively', () => {
  // arrange a projectsDir with a crew.toml whose [github] repo = "Owner/crew"
  const svc = makeProjectsService(dirWith({ 'crew.toml': crewTomlFixture }));
  expect(svc.findByRepo('owner/CREW')?.name).toBe('crew');
  expect(svc.findByRepo('nobody/nope')).toBeNull();
});
```

> Reuse whatever temp-dir + fixture helpers `ProjectsService.test.ts` already uses to stand up a `projectsDir`.

- [ ] **Step 2: Run to verify fail**

Run: `npm run -w crew-daemon test -- ProjectsService`
Expected: FAIL — `findByRepo` not a function.

- [ ] **Step 3: Implement `findByRepo`**

```ts
/**
 * Find the project whose [github] repo equals `repoFullName` (case-insensitive
 * — GitHub treats owner/repo case-insensitively). Returns null when none
 * match. Used by the webhook to resolve a delivery's repository.full_name to
 * its config (carrying the webhook_hook_id pin).
 */
findByRepo(repoFullName: string): ProjectConfig | null {
  const target = repoFullName.toLowerCase();
  for (const { config } of this.scanValidProjectFiles()) {
    if (config.github.repo.toLowerCase() === target) return config;
  }
  return null;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm run -w crew-daemon test -- ProjectsService`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/services/ProjectsService.ts packages/daemon/src/services/ProjectsService.test.ts
git commit -m "feat(daemon): ProjectsService.findByRepo for webhook repo resolution"
```

---

## Task 7: Webhook fixtures + signing helper

**Files:**
- Create: `packages/daemon/src/services/github/webhook-fixtures.ts`

**Interfaces:**
- Produces:
  - `pullRequestClosedPayload(opts?: { repo?: string; htmlUrl?: string; action?: string }): object`
  - `pingPayload(opts?: { repo?: string }): object`
  - `signPayload(rawBody: string | Buffer, secret: string): string` — returns `sha256=<hex>`.

- [ ] **Step 1: Implement the fixtures + signer (no separate test; exercised by Tasks 8–9)**

```ts
// packages/daemon/src/services/github/webhook-fixtures.ts
import { createHmac } from 'node:crypto';

/** Minimal but realistic GitHub `pull_request` delivery (closed/merged). */
export function pullRequestClosedPayload(opts: {
  repo?: string;
  htmlUrl?: string;
  action?: string;
} = {}): Record<string, unknown> {
  const repo = opts.repo ?? 'Owner/repo';
  return {
    action: opts.action ?? 'closed',
    pull_request: {
      html_url: opts.htmlUrl ?? `https://github.com/${repo}/pull/1`,
      merged: true,
      state: 'closed',
    },
    repository: { full_name: repo },
  };
}

export function pingPayload(opts: { repo?: string } = {}): Record<string, unknown> {
  const repo = opts.repo ?? 'Owner/repo';
  return { zen: 'Keep it logically awesome.', hook_id: 1, repository: { full_name: repo } };
}

/** GitHub's X-Hub-Signature-256 over the exact bytes, with the given secret. */
export function signPayload(rawBody: string | Buffer, secret: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/daemon/src/services/github/webhook-fixtures.ts
git commit -m "test(daemon): GitHub webhook payload fixtures + signing helper"
```

---

## Task 8: `GithubWebhookService` verification pipeline

**Files:**
- Create: `packages/daemon/src/services/GithubWebhookService.ts`
- Create: `packages/daemon/src/services/GithubWebhookService.test.ts`

**Interfaces:**
- Consumes: `ProjectsService.findByRepo` (Task 6), `Map<string,string>` secrets (Task 4), `PrTransitionService` (Task 1), `Logger`. Fixtures from Task 7.
- Produces:
  - `interface WebhookResult { status: number; body?: unknown }`
  - `class GithubWebhookService` with `handle(req: { headers: Record<string, string | string[] | undefined>; rawBody: Buffer }): Promise<WebhookResult>`.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/daemon/src/services/GithubWebhookService.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import pino from 'pino';
import { GithubWebhookService } from './GithubWebhookService.js';
import { pullRequestClosedPayload, pingPayload, signPayload } from './github/webhook-fixtures.js';

const SECRET = 'top-secret';
const HOOK_ID = '999';
const REPO = 'Owner/repo';

function makeService(over: Partial<{ markMerged: any; resolve: any; hookId?: string; secret?: string }> = {}) {
  const markMerged = over.markMerged ?? vi.fn().mockResolvedValue({ changed: true });
  const resolveOpenPrAgentByUrl = over.resolve ?? vi.fn().mockResolvedValue('CREW-1');
  const projectsService = {
    findByRepo: vi.fn().mockReturnValue(
      over.hookId === null ? { github: { repo: REPO } } : { github: { repo: REPO, webhook_hook_id: over.hookId ?? HOOK_ID } },
    ),
  };
  const secrets = new Map<string, string>([[REPO.toLowerCase(), over.secret ?? SECRET]]);
  const svc = new GithubWebhookService({
    projectsService: projectsService as any,
    secrets,
    prTransitions: { markMerged, resolveOpenPrAgentByUrl } as any,
    logger: pino({ level: 'silent' }),
  });
  return { svc, markMerged, resolveOpenPrAgentByUrl, projectsService };
}

function req(payload: object, headers: Record<string, string>) {
  const rawBody = Buffer.from(JSON.stringify(payload));
  return { headers, rawBody };
}
const hdr = (event: string, sig: string, hookId = HOOK_ID) => ({
  'x-github-event': event,
  'x-github-hook-id': hookId,
  'x-hub-signature-256': sig,
  'content-type': 'application/json',
});

describe('GithubWebhookService.handle', () => {
  it('204s a non-pull_request, non-ping event', async () => {
    const { svc } = makeService();
    const r = await svc.handle(req({}, { 'x-github-event': 'push' }));
    expect(r.status).toBe(204);
  });

  it('404s an unknown repo', async () => {
    const { svc, projectsService } = makeService();
    projectsService.findByRepo.mockReturnValue(null);
    const body = pullRequestClosedPayload({ repo: 'who/what' });
    const raw = Buffer.from(JSON.stringify(body));
    const r = await svc.handle({ headers: hdr('pull_request', signPayload(raw, SECRET)), rawBody: raw });
    expect(r.status).toBe(404);
  });

  it('401s on a bad signature', async () => {
    const { svc, markMerged } = makeService();
    const body = pullRequestClosedPayload({ repo: REPO });
    const raw = Buffer.from(JSON.stringify(body));
    const r = await svc.handle({ headers: hdr('pull_request', 'sha256=deadbeef'), rawBody: raw });
    expect(r.status).toBe(401);
    expect(markMerged).not.toHaveBeenCalled();
  });

  it('401s on a hook-id mismatch even with a valid signature', async () => {
    const { svc } = makeService();
    const body = pullRequestClosedPayload({ repo: REPO });
    const raw = Buffer.from(JSON.stringify(body));
    const r = await svc.handle({ headers: hdr('pull_request', signPayload(raw, SECRET), 'WRONG'), rawBody: raw });
    expect(r.status).toBe(401);
  });

  it('200s a verified ping without changing state', async () => {
    const { svc, markMerged } = makeService();
    const raw = Buffer.from(JSON.stringify(pingPayload({ repo: REPO })));
    const r = await svc.handle({ headers: hdr('ping', signPayload(raw, SECRET)), rawBody: raw });
    expect(r.status).toBe(200);
    expect(markMerged).not.toHaveBeenCalled();
  });

  it('200s + no-ops a verified pull_request whose action is not closed', async () => {
    const { svc, markMerged } = makeService();
    const body = pullRequestClosedPayload({ repo: REPO, action: 'synchronize' });
    const raw = Buffer.from(JSON.stringify(body));
    const r = await svc.handle({ headers: hdr('pull_request', signPayload(raw, SECRET)), rawBody: raw });
    expect(r.status).toBe(200);
    expect(markMerged).not.toHaveBeenCalled();
  });

  it('200s + no-ops a verified closed PR with no matching pr_open agent', async () => {
    const { svc, markMerged } = makeService({ resolve: vi.fn().mockResolvedValue(null) });
    const body = pullRequestClosedPayload({ repo: REPO });
    const raw = Buffer.from(JSON.stringify(body));
    const r = await svc.handle({ headers: hdr('pull_request', signPayload(raw, SECRET)), rawBody: raw });
    expect(r.status).toBe(200);
    expect(markMerged).not.toHaveBeenCalled();
  });

  it('calls markMerged for a verified closed PR matching a pr_open agent', async () => {
    const { svc, markMerged, resolveOpenPrAgentByUrl } = makeService();
    const body = pullRequestClosedPayload({ repo: REPO, htmlUrl: `https://github.com/${REPO}/pull/7` });
    const raw = Buffer.from(JSON.stringify(body));
    const r = await svc.handle({ headers: hdr('pull_request', signPayload(raw, SECRET)), rawBody: raw });
    expect(r.status).toBe(200);
    expect(resolveOpenPrAgentByUrl).toHaveBeenCalledWith(`https://github.com/${REPO}/pull/7`);
    expect(markMerged).toHaveBeenCalledWith('CREW-1');
  });

  it('401s when the repo has no configured secret', async () => {
    const { svc } = makeService();
    const svc2 = new GithubWebhookService({
      projectsService: { findByRepo: () => ({ github: { repo: REPO, webhook_hook_id: HOOK_ID } }) } as any,
      secrets: new Map(), // no secret for this repo
      prTransitions: { markMerged: vi.fn(), resolveOpenPrAgentByUrl: vi.fn() } as any,
      logger: pino({ level: 'silent' }),
    });
    const raw = Buffer.from(JSON.stringify(pullRequestClosedPayload({ repo: REPO })));
    const r = await svc2.handle({ headers: hdr('pull_request', signPayload(raw, SECRET)), rawBody: raw });
    expect(r.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm run -w crew-daemon test -- GithubWebhookService`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the service**

```ts
// packages/daemon/src/services/GithubWebhookService.ts
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Logger } from 'pino';
import type { ProjectsService } from './ProjectsService.js';
import type { PrTransitionService } from './PrTransitionService.js';

export interface WebhookResult {
  status: number;
  body?: unknown;
}

export interface GithubWebhookDeps {
  projectsService: ProjectsService;
  secrets: Map<string, string>;
  prTransitions: PrTransitionService;
  logger: Logger;
}

interface WebhookRequest {
  headers: Record<string, string | string[] | undefined>;
  rawBody: Buffer;
}

function header(headers: WebhookRequest['headers'], name: string): string | undefined {
  const v = headers[name];
  return Array.isArray(v) ? v[0] : v;
}

/** Constant-time compare of the X-Hub-Signature-256 header against the body. */
function signatureValid(rawBody: Buffer, secret: string, sig: string | undefined): boolean {
  if (!sig) return false;
  const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Verifies + dispatches a GitHub webhook delivery for PR-merge detection.
 * Verification order (cheapest/most-decisive first): event filter → repo
 * resolve → HMAC (per-repo secret) → hook-id pin → event handling. HMAC +
 * hook-id are the identity boundary; they reject any other GitHub webhook on
 * the internet pointed at the Funnel URL. A valid delivery with nothing to do
 * (ping, non-closed action, no matching pr_open agent) returns 200 so GitHub
 * does not retry.
 */
export class GithubWebhookService {
  private readonly projects: ProjectsService;
  private readonly secrets: Map<string, string>;
  private readonly prTransitions: PrTransitionService;
  private readonly logger: Logger;

  constructor(deps: GithubWebhookDeps) {
    this.projects = deps.projectsService;
    this.secrets = deps.secrets;
    this.prTransitions = deps.prTransitions;
    this.logger = deps.logger;
  }

  async handle(req: WebhookRequest): Promise<WebhookResult> {
    const event = header(req.headers, 'x-github-event');
    if (event !== 'pull_request' && event !== 'ping') return { status: 204 };

    let payload: {
      action?: string;
      pull_request?: { html_url?: string };
      repository?: { full_name?: string };
    };
    try {
      payload = JSON.parse(req.rawBody.toString('utf8'));
    } catch {
      return { status: 400, body: { error: 'invalid_json' } };
    }

    const repo = payload.repository?.full_name;
    if (!repo) return { status: 400, body: { error: 'missing_repository' } };

    const project = this.projects.findByRepo(repo);
    if (!project) {
      this.logger.warn({ repo }, 'webhook: unknown repo');
      return { status: 404, body: { error: 'unknown_repo' } };
    }

    const secret = this.secrets.get(repo.toLowerCase());
    if (!secret) {
      this.logger.warn({ repo }, 'webhook: no configured secret for repo');
      return { status: 401, body: { error: 'unauthorized' } };
    }
    if (!signatureValid(req.rawBody, secret, header(req.headers, 'x-hub-signature-256'))) {
      this.logger.warn({ repo, check: 'hmac' }, 'webhook: signature verification failed');
      return { status: 401, body: { error: 'unauthorized' } };
    }

    const expectedHookId = project.github.webhook_hook_id;
    const gotHookId = header(req.headers, 'x-github-hook-id');
    if (!expectedHookId || gotHookId !== expectedHookId) {
      this.logger.warn({ repo, check: 'hook_id' }, 'webhook: hook-id pin mismatch');
      return { status: 401, body: { error: 'unauthorized' } };
    }

    if (event === 'ping') return { status: 200, body: { ok: true } };

    if (payload.action !== 'closed') return { status: 200, body: { ignored: payload.action } };

    const prUrl = payload.pull_request?.html_url;
    if (!prUrl) return { status: 200, body: { ignored: 'no_html_url' } };

    const agentKey = await this.prTransitions.resolveOpenPrAgentByUrl(prUrl);
    if (!agentKey) {
      this.logger.info({ repo, prUrl }, 'webhook: no pr_open agent for delivery (no-op)');
      return { status: 200, body: { matched: false } };
    }
    const { changed } = await this.prTransitions.markMerged(agentKey);
    return { status: 200, body: { matched: true, changed } };
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm run -w crew-daemon test -- GithubWebhookService`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/services/GithubWebhookService.ts packages/daemon/src/services/GithubWebhookService.test.ts
git commit -m "feat(daemon): GithubWebhookService verification pipeline (HMAC + hook-id pin)"
```

---

## Task 9: Webhook route (raw body) + DI wiring + registration

**Files:**
- Create: `packages/daemon/src/routes/webhooks.ts`
- Create: `packages/daemon/src/routes/webhooks.test.ts`
- Modify: `packages/daemon/src/container.ts` (register `githubWebhookSecrets`, `githubWebhookService`)
- Modify: `packages/daemon/src/app.ts:218-225` (register route)

**Interfaces:**
- Consumes: `GithubWebhookService` (Task 8), `loadGithubWebhookSecrets` (Task 4), `DaemonConfig.githubWebhookSecretsFile` (Task 5).
- Produces: `registerWebhookRoutes(app: DaemonApp): Promise<void>`; cradle gains `githubWebhookSecrets: Map<string,string>` and `githubWebhookService: GithubWebhookService`.

- [ ] **Step 1: Register the secrets map + service in the container**

In `container.ts`:

```ts
import { loadGithubWebhookSecrets } from 'crew-shared';
import { GithubWebhookService } from './services/GithubWebhookService.js';

// DaemonCradle:
githubWebhookSecrets: Map<string, string>;
githubWebhookService: GithubWebhookService;

// register({ ... }):
// Loaded once at container build — the secrets file is a read-only mount;
// a change requires a daemon restart (same lifecycle as project TOMLs).
githubWebhookSecrets: asFunction(({ config }: DaemonCradle) =>
  loadGithubWebhookSecrets(config.githubWebhookSecretsFile),
).singleton(),
githubWebhookService: asFunction(
  ({ projectsService, githubWebhookSecrets, prTransitionService, logger }: DaemonCradle) =>
    new GithubWebhookService({
      projectsService,
      secrets: githubWebhookSecrets,
      prTransitions: prTransitionService,
      logger,
    }),
).scoped(),
```

- [ ] **Step 2: Write the route with an encapsulated raw-body parser**

```ts
// packages/daemon/src/routes/webhooks.ts
import type { DaemonApp } from '../app.js';

/**
 * GitHub webhook receiver (CREW). Registered in its own encapsulated plugin so
 * the raw-buffer content-type parser is scoped to THIS route only — the rest
 * of the API keeps the normal JSON parser. The raw bytes are required because
 * the HMAC in X-Hub-Signature-256 covers exactly what GitHub sent; re-parsing
 * + re-serializing would break the signature.
 *
 * Only this single path is published to the public internet via a path-scoped
 * Tailscale Funnel mapping; the rest of :7773 stays tailnet-only.
 */
export async function registerWebhookRoutes(app: DaemonApp): Promise<void> {
  await app.register(async (scope) => {
    scope.addContentTypeParser(
      'application/json',
      { parseAs: 'buffer' },
      (_req, body, done) => done(null, body),
    );
    scope.post('/api/webhooks/github', async (req, reply) => {
      const service = req.diScope.resolve('githubWebhookService');
      const result = await service.handle({
        headers: req.headers,
        rawBody: req.body as Buffer,
      });
      return reply.code(result.status).send(result.body ?? undefined);
    });
  });
}
```

Register in `app.ts` alongside the other routes (after `registerActionsRoutes(app)`):

```ts
import { registerWebhookRoutes } from './routes/webhooks.js';
// ...
await registerWebhookRoutes(app);
```

- [ ] **Step 3: Write the route test (raw-body HMAC end to end)**

```ts
// packages/daemon/src/routes/webhooks.test.ts
import { describe, it, expect } from 'vitest';
import { buildTestApp } from '../test/buildTestApp.js'; // existing app-inject helper
import { signPayload, pullRequestClosedPayload, pingPayload } from '../services/github/webhook-fixtures.js';

// Stand up an app whose projects dir registers REPO with webhook_hook_id=HOOK_ID
// and whose secrets file maps REPO→SECRET, with one agent in pr_open whose
// pr_url matches the payload html_url. Reuse the existing app-test harness;
// set CREW_GITHUB_WEBHOOK_SECRETS_FILE to a temp file written in the test.

describe('POST /api/webhooks/github', () => {
  it('verifies the signature over the raw body and transitions the agent', async () => {
    const { app /*, seed helpers */ } = await buildTestApp(/* config with temp secrets + projects */);
    const payload = pullRequestClosedPayload({ repo: 'Owner/repo', htmlUrl: 'https://github.com/Owner/repo/pull/1' });
    const raw = JSON.stringify(payload);
    const res = await app.inject({
      method: 'POST',
      url: '/api/webhooks/github',
      headers: {
        'content-type': 'application/json',
        'x-github-event': 'pull_request',
        'x-github-hook-id': '999',
        'x-hub-signature-256': signPayload(raw, 'top-secret'),
      },
      payload: raw,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ matched: true, changed: true });
    await app.close();
  });

  it('401s when the body is tampered after signing', async () => {
    const { app } = await buildTestApp(/* ... */);
    const signed = JSON.stringify(pullRequestClosedPayload({ repo: 'Owner/repo' }));
    const sig = signPayload(signed, 'top-secret');
    const tampered = signed.replace('pull/1', 'pull/2');
    const res = await app.inject({
      method: 'POST',
      url: '/api/webhooks/github',
      headers: {
        'content-type': 'application/json',
        'x-github-event': 'pull_request',
        'x-github-hook-id': '999',
        'x-hub-signature-256': sig,
      },
      payload: tampered,
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});
```

> **Note:** match the real app-test harness name/signature used by `routes/actions.test.ts` / `agents.test.ts` (grep for `buildApp(`/`inject(`). The key behavior under test is that the **raw bytes survive to the HMAC** — the encapsulated `parseAs: 'buffer'` parser, not the global JSON parser, handles this route.

- [ ] **Step 4: Run the route + full daemon suite**

Run: `npm run -w crew-daemon test -- webhooks && npm run -w crew-daemon test`
Expected: PASS; no regressions.

- [ ] **Step 5: Typecheck**

Run: `npm run -w crew-daemon typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add packages/daemon/src/routes/webhooks.ts packages/daemon/src/routes/webhooks.test.ts packages/daemon/src/container.ts packages/daemon/src/app.ts
git commit -m "feat(daemon): POST /api/webhooks/github route with raw-body HMAC + DI wiring"
```

---

## Task 10: Empirical IP-allowlist decision (behind-Funnel client IP)

**Files:**
- Modify (conditionally): `packages/daemon/src/services/GithubWebhookService.ts`, `packages/daemon/src/routes/webhooks.ts`
- Modify: the spec's "IP allowlist" open question — record the finding.

This task is an **investigation with a binary outcome**, not a TDD cycle. The spec flagged that behind Funnel the daemon may see the Funnel ingress / loopback rather than GitHub's egress IP, which would make a GitHub-meta-range allowlist silently dead.

- [ ] **Step 1: Stand up the Funnel path (depends on Task 12 runbook) and capture what the daemon sees**

Send a real (or `curl`-simulated public) request through the Funnel URL and log, in the route, `req.ip`, `req.ips`, `x-forwarded-for`, and any `tailscale-*` headers. Inspect the daemon log.

- [ ] **Step 2: Decide**

- **If** a usable originating client IP is present (a real public IP via `x-forwarded-for` or equivalent): add a best-effort allowlist check as the **outermost** step of `GithubWebhookService.handle` — fetch GitHub's `hooks[]` CIDRs from `api.github.com/meta` at boot (cache; refresh daily), and reject non-matching IPs with `403`. Gate it behind a config flag (default **on** only once confirmed). Add a unit test with an in/out-of-range IP.
- **If not** (loopback / tailnet ingress only): **omit** the allowlist. Add a one-line code comment in `webhooks.ts` recording that Funnel does not surface the client IP, so HMAC + hook-id carry the full weight (as designed).

- [ ] **Step 3: Record the outcome in the spec + commit**

Edit `docs/superpowers/specs/2026-06-19-github-webhook-pr-merge-design.md` "Open questions" to state the resolved finding.

```bash
git add -A
git commit -m "feat(daemon): resolve IP-allowlist feasibility behind Funnel (<kept|omitted>)"
```

---

## Task 11: Bruno endpoint for the webhook route

**Files:**
- Create: `bruno/endpoints/webhooks/post-github.bru`

**Interfaces:** consumes the live route (Task 9). Per `bruno-collection-maintenance`, a route change requires the matching `.bru` in the same change set.

- [ ] **Step 1: Author the `.bru`**

A verified-delivery example. Because the signature depends on the exact body bytes + the local secret, document that the signature header is environment-specific (computed from the smoke secret), and assert the no-op-but-valid path (a delivery for an unknown PR → `200 { matched: false }`) so the smoke run is deterministic without seeding an agent.

```
meta {
  name: POST /api/webhooks/github
  type: http
  seq: 1
}

post {
  url: {{baseUrl}}/api/webhooks/github
  body: json
}

headers {
  x-github-event: pull_request
  x-github-hook-id: {{githubWebhookHookId}}
  x-hub-signature-256: {{githubWebhookSignature}}
}

body:json {
  {
    "action": "closed",
    "pull_request": { "html_url": "https://github.com/Owner/repo/pull/999999", "merged": true, "state": "closed" },
    "repository": { "full_name": "Owner/repo" }
  }
}

assert {
  res.status: eq 200
}

docs {
  GitHub pull_request webhook receiver. Verified by HMAC (per-repo secret) +
  X-GitHub-Hook-ID pin. This example targets a non-existent PR so the verified
  delivery is a deterministic no-op (200, { matched: false }) without seeding
  an agent. `githubWebhookSignature` must be precomputed for this exact body
  with the smoke secret; an unknown repo 404s, a bad signature/hook-id 401s.
}
```

- [ ] **Step 2: Run the Bruno smoke (if the local env is configured)**

Run: `npm run bruno:smoke` (or the project's documented Bruno command)
Expected: the new request passes, or is skipped only if the smoke env lacks webhook vars (document that).

- [ ] **Step 3: Commit**

```bash
git add bruno/endpoints/webhooks/post-github.bru
git commit -m "test(bruno): cover POST /api/webhooks/github"
```

---

## Task 12: Funnel + GitHub setup runbook and helper script (INTERACTIVE)

> **This task is operator/infra work driven live in session — it is the `interactive`-labelled ticket, not autonomous `crew run`.** It enables Funnel in the tailnet ACL, creates the GitHub webhook, and captures the `hook_id`. The code lands as a doc + a script; the live steps are executed with the user.

**Files:**
- Create: `docs/runbooks/github-webhook-funnel.md`
- Create: `scripts/setup-github-webhook.sh`

- [ ] **Step 1: Write the runbook**

`docs/runbooks/github-webhook-funnel.md` covering, in order:

1. **Tailnet ACL** — add the `funnel` node attribute for the host node serving crew (`crew.tail82463c.ts.net`). Funnel serves only on ports 443 / 8443 / 10000.
2. **Path-scoped serve** — on the host: `tailscale serve --set-path /api/webhooks/github http://localhost:7773/api/webhooks/github` then `tailscale funnel 443 on` (verify with `tailscale serve status` that ONLY that path is exposed). Note the rest of `:7773` must remain unpublished.
3. **Create the secret + secrets file** — generate a unique random secret (`openssl rand -hex 32`), write `~/.config/crew/github-webhook-secrets.toml` with the `["Owner/repo"] secret = "…"` entry. The file must exist as a *file* before `docker compose up` (the read-only mount would otherwise create a directory).
4. **Create the webhook** — `scripts/setup-github-webhook.sh Safturento/crew` (Step 2), which creates the `pull_request`-only webhook pointed at `https://crew.tail82463c.ts.net/api/webhooks/github` and prints the new `hook_id`.
5. **Record the hook id** — put it in `crew.toml` `[github] webhook_hook_id = "<id>"`, restart the daemon (`docker compose up -d --build daemon`) so it reloads config + secrets.
6. **Verify** — GitHub's `ping` (sent on creation) and the webhook's "Recent Deliveries" panel show `200`. Merge a throwaway PR and confirm the dashboard flips to `pr_merged` within seconds.

- [ ] **Step 2: Write the helper script**

```bash
#!/usr/bin/env bash
# scripts/setup-github-webhook.sh <owner/repo>
# Creates a pull_request-only webhook pointed at the crew Funnel URL and prints
# its hook id. Reads the per-repo secret from ~/.config/crew/github-webhook-secrets.toml.
# Requires: gh (authed), the secret already present for <owner/repo>.
set -euo pipefail
REPO="${1:?usage: setup-github-webhook.sh <owner/repo>}"
URL="https://crew.tail82463c.ts.net/api/webhooks/github"
SECRET="$(gh api -X GET /dev/null >/dev/null 2>&1; python3 - "$REPO" <<'PY'
import sys, tomllib, pathlib
repo=sys.argv[1].lower()
p=pathlib.Path.home()/'.config'/'crew'/'github-webhook-secrets.toml'
data=tomllib.loads(p.read_text())
for k,v in data.items():
    if k.lower()==repo: print(v['secret']); break
PY
)"
[ -n "$SECRET" ] || { echo "no secret for $REPO in github-webhook-secrets.toml" >&2; exit 1; }
gh api -X POST "repos/$REPO/hooks" \
  -f "name=web" -F "active=true" -f "events[]=pull_request" \
  -f "config[url]=$URL" -f "config[content_type]=json" -f "config[secret]=$SECRET" \
  --jq '.id' | sed 's/^/hook_id=/'
```

- [ ] **Step 3: Execute the live steps with the user, capture the `hook_id`, verify the `ping`**

(Driven in session — not a `crew run`.)

- [ ] **Step 4: Commit**

```bash
git add docs/runbooks/github-webhook-funnel.md scripts/setup-github-webhook.sh
git commit -m "docs(runbook): Tailscale Funnel + GitHub webhook setup; add setup-github-webhook.sh"
```

---

## Task 13: Update `.agents/` docs (parity) + verification sweep

**Files:**
- Modify: `.agents/architecture.md` (route inventory + service list), `.agents/security.md` (webhook auth model + secrets file), `.agents/local-dev.md` (new mount + Funnel).

- [ ] **Step 1: Run the parity check**

Use the `agents-doc-parity-check` skill against the full diff. Update every doc whose `covers:` globs match the touched paths (`packages/daemon/src/routes/**`, `services/**`, `config.ts`, `docker-compose.yml`, `packages/shared/src/config/**`).

- [ ] **Step 2: Document the webhook in `.agents/security.md`**

State the identity model (HMAC per-repo secret + hook-id pin are the boundary; Funnel is path-scoped; the IP allowlist's resolved status from Task 10), and that the secrets file is a read-only mount never logged.

- [ ] **Step 3: Run full verification**

Run: `npm run -w crew-daemon lint && npm run -w crew-daemon typecheck && npm run -w crew-daemon test && npm run -w crew-shared test`
Expected: all green.

- [ ] **Step 4: Run `superpowers:verification-before-completion`**

Confirm every claim against real command output before opening PRs.

- [ ] **Step 5: Commit**

```bash
git add .agents/
git commit -m "docs(agents): document webhook route, auth model, secrets mount + Funnel"
```

---

## Self-Review

**Spec coverage:**

| Spec element | Task |
|---|---|
| `PrTransitionService` extraction (shared idempotent transition) | 1, 2 |
| Webhook is a peer of PrPoller, not a producer event | 1 (terminal-path comment), 2 |
| `byPrUrl` resolver + URL normalization concern | 1 |
| Multi-repo config: non-secret `webhook_hook_id` in TOML | 3 |
| Multi-repo config: per-project secret outside the TOML | 4, 5 |
| Repo resolution by `repository.full_name` | 6 |
| Verification pipeline (event → repo → HMAC → hook-id → ping/closed) | 8 |
| Raw-body HMAC plumbing (Fastify pre-parse trap) | 9 |
| Path-scoped Funnel (only one route) | 9 (encapsulated route), 12 |
| Poller demoted to ~30-min backstop, not removed | 2 |
| IP-allowlist degrades gracefully (empirical) | 10 |
| Closed-but-not-merged mirrors current behavior | 8 (`action === 'closed'`, ignores `merged`) |
| Bruno endpoint | 11 |
| Funnel + GitHub setup (crew-first, interactive) | 12 |
| Follow-up: register additional repos (no code) | out of plan — separate ticket per spec |
| `.agents/` parity + verification | 13 |

No spec requirement is unaddressed.

**Placeholder scan:** No "TBD"/"add error handling"/"write tests for the above" — every code step shows real code; every test step shows real assertions. The two `> Note:` callouts (test-harness helper names) point at existing patterns to grep, not unwritten logic.

**Type consistency:** `markMerged(agentKey): Promise<{ changed: boolean }>`, `resolveOpenPrAgentByUrl(prUrl): Promise<string | null>`, `normalizePrUrl(url): string`, `findByRepo(repoFullName): ProjectConfig | null`, `GithubWebhookService.handle(req): Promise<WebhookResult>` with `WebhookResult = { status; body? }`, secrets as `Map<string,string>` keyed lowercase — all used identically across Tasks 1, 2, 6, 8, 9.

**Cross-task dependency order:** 1 → 2 (poller delegation); 3,4,5,6 independent of each other (config + resolver); 7 (fixtures) before 8,9; 8 before 9; 9 before 10,11; 12 before 10-step-1 (needs the live Funnel); 13 last. See parallelism plan in the Epic.
