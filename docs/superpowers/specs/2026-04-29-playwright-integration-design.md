# Playwright integration — design

> **Purpose of this document.** A scoped design spec for restructuring crew's Playwright support so that headless authored e2e tests actually run inside a sandboxed `crew run` agent. Today the `[visual_testing]` config block models both MCP-driven visual smoke and authored Playwright tests, but the run-time infrastructure only delivers the smoke half — the authored half (`authored.test_command`) is a contract the agent cannot honour because Chromium binary + system libs are missing inside the sandbox. This spec replaces `[visual_testing]` with a `[playwright]` block carrying nested `smoke` and `authored` sub-modes, and introduces a per-run browser-install step that makes the authored half real.
>
> Read [`docs/plans/architecture.md`](../../plans/architecture.md) for system context.
>
> The originating signal: [KAN-35](https://safturento.atlassian.net/browse/KAN-35) shipped with a manual-verification footnote — `npm run docker:up && npx playwright install chromium && npm run test:e2e — blocked in the implementation sandbox (no Docker socket access + Chromium system libs missing). Manual verification needed before merge.` This spec eliminates that footnote class.

## 1. Background

### 1.1 What `[visual_testing]` does today

`packages/shared/src/config/schema.ts` defines:

```ts
const visualTestingSchema = z.object({
  enabled: z.literal(true),
  app_url: z.string().min(1),
  start_command: z.string().min(1).optional(),
  authored: z.object({
    tests_dir: z.string().min(1),
    test_command: z.string().min(1),
  }).optional(),
});
```

When `visual_testing.enabled` is true, `crew run`:

- Writes a per-worktree `.mcp.json` declaring the Playwright MCP server (`@playwright/mcp@latest --headless`) so the agent can drive a headless browser via `mcp__playwright__*` tools.
- Keeps the docker stack running through the agent's lifetime (`agentNeedsAppRunning` returns true).
- Includes `ticket-visual-smoke.md` in the prompt — the agent must take a screenshot of the change.
- If `authored` is set, additionally includes `ticket-visual-authored.md` — the agent must add Playwright tests to `tests_dir` and ensure `test_command` exits 0 before "Verify" completes.

### 1.2 Why the authored half doesn't work

`crew run` launches `claude --dangerously-skip-permissions` in the worktree. Claude Code's built-in sandbox (driven by the project's `.claude/settings.json`) restricts:

- **Filesystem writes** to a fixed allowlist (`~/.npm`, `~/.cache/node`, `~/.cache/claude*`, `/tmp`).
- **Network** to a domain allowlist mirroring the TOML's `[sandbox] allowed_domains`.

Running `npm run test:e2e` headlessly requires:

| Requirement | Conflict with sandbox |
|---|---|
| Chromium binary at `~/.cache/ms-playwright/` | Path not in `allowWrite` → install fails |
| `playwright.azureedge.net` reachable | Not in `allowed_domains` → install fails |
| Apt-installed system libs (`libnss3`, `libnspr4`, `libatk*`, …) | Sandbox doesn't restrict reads, but the libs aren't installed system-wide on a fresh machine |
| Docker socket | Not exposed (and unnecessary — see §1.3) |
| Loopback network to running stack | Assumed allowed; verified in Phase 0 (§7) |

The agent in KAN-35 hit several of these and reported "no Docker socket access + Chromium system libs missing". The docker-socket complaint was a symptom of the agent trying `npm run docker:up` itself rather than reusing the running stack; the chromium-libs complaint was the real gap.

### 1.3 Why the docker stack isn't a problem

`crew run` already brings the docker stack up *before* launching the agent and leaves it running for the agent's lifetime when `agentNeedsAppRunning` is true. The agent doesn't need to touch docker — it just needs to point Playwright at `https://localhost:<port>`. Today's prompt fragment doesn't say this loudly enough.

### 1.4 What's wrong with the schema

`[visual_testing]` is a misleading name once the block also gates authored Playwright tests. The two modes (interactive MCP smoke vs. headless authored runs) are different infrastructure problems with different agent contracts, but they share the same Chromium dependency. The current shape — one boolean parent with a single optional `authored` nested block — pretends only one is the "real" feature and the other is a bolt-on. The reality is symmetric: either or both can be on, both depend on the same browser provisioning.

## 2. Stack & rationale

The work is primarily TypeScript edits inside the existing crew packages. No new runtime dependencies. The only "stack" decision is *who installs Chromium and when*:

- **Crew (one-time, machine-level):** apt deps (`libnss3` etc.) added to `crew/scripts/install.sh` next to `bwrap`/`socat`. Idempotent, run when crew itself is installed.
- **Crew (per-run, project-level):** `npx playwright install chromium` invoked from the worktree's cwd before the agent spawns. Resolves the project's pinned `@playwright/test` version automatically. Idempotent — fast on cache hit (≈1s, hash check), downloads on miss.
- **Project:** owns `@playwright/test` npm dep, `playwright.config.ts`, `npm run test:e2e` script, and the `[playwright]` block in its crew TOML.

This is the cleanest split because it tracks responsibility along its natural seam: machine-wide concerns are crew's, version-pinned concerns are the project's, and crew automates the version-pinned bit by running it from the project's directory.

| Concern | Owner | When |
|---|---|---|
| System libs (`libnss3`, etc.) | Crew via `scripts/install.sh` | Once, when crew itself is installed |
| Browser binary | Crew via `crew run` / `crew fix-pr` preflight | Every run, from the worktree |
| `@playwright/test`, `playwright.config.ts`, `test:e2e` script | Project | Project's own concern |

There is no project-side `setup-e2e.sh`. There is no template for one to ship. The project's surface for opting into Playwright collapses to: declare `[playwright]` in the crew TOML and ensure `npm install` brings in `@playwright/test`. Everything else is automatic.

## 3. Scope

**In scope:**

- Replace `[visual_testing]` (and its Zod schema) with `[playwright]` carrying nested `[playwright.smoke]` and `[playwright.authored]` sub-blocks.
- Validation: parent block is optional; if present, at least one sub-mode must be enabled.
- Rename `packages/cli/src/lib/visual-testing/` to `packages/cli/src/lib/playwright/`. Add `install-browsers.ts` (the `npx playwright install` runner) and `mode-flags.ts` (accessor helpers).
- Insert a "ensure Chromium installed" step in `crew run` and `crew fix-pr`, gated on `playwrightEnabled(config)`, between docker bringup and agent spawn.
- Inject `CREW_APP_URL` into the spawned claude's process env (today it's only in the MCP server's env block).
- Rename and tighten prompt fragments: `ticket-visual-smoke.md` → `ticket-playwright-smoke.md`, `ticket-visual-authored.md` → `ticket-playwright-authored.md`. Add two assertions to the authored fragment: "do not run `npm run docker:up`" and "do not run `npx playwright install`".
- Extend `crew/scripts/install.sh` with the apt-level Chromium system-lib package list.
- Update `docs/plans/architecture.md`'s example TOML.
- Phase 0 empirical validation pass (§7) before any code lands.

**Out of scope** (filed as follow-ups in §10):

- Project config rationalization (top-level `[app]` shared URL with per-block overrides; sandbox/docker block consolidation).
- `crew init` / `crew doctor` unified onboarding wizard (new + existing project setup, scaffolding, machine-wide health checks).
- Per-config-block reference docs.
- Crew owning `.claude/settings.json` (today it's project-committed, hand-maintained alongside the TOML — drift risk).
- Empirical confirmation that `bwrap`/`socat` are load-bearing for Claude Code's sandbox.

## 4. Architecture

### 4.1 End-to-end flow

```
Setup (one-time, when crew is installed on a machine)
    └── bash crew/scripts/install.sh
        ├── apt-installs bwrap, socat (existing)
        └── apt-installs Chromium system libs (NEW)

Per-ticket (every `crew run <KEY>`)
    1. Load project config; check [playwright] block
    2. Preflight (existing): claude, gh, jq, bwrap on PATH; gh-token; worktree available
    3. Create worktree, copy gh-token, write docker .env (existing)
    4. If smoke enabled: write .mcp.json (renamed gating)
    5. Bring up docker stack (existing); leave running if agentNeedsAppRunning
    6. NEW: if playwrightEnabled, run `npx playwright install chromium` in worktree
         ├── log to /tmp/crew-playwright-<key>.log
         └── on non-zero exit: print log path, fail before launching claude
    7. Spawn claude with:
         ├── CREW_APP_URL=<resolved app_url> (NEW: was only in MCP env)
         ├── prompt assembled from ticket.md + (smoke fragment if smoke enabled) +
         │   (authored fragment if authored enabled) + bruno fragment if applicable

Per-PR-fix (every `crew fix-pr <KEY>`)
    Same browser-install step, same env injection, same prompt assembly.
```

### 4.2 Key invariants

- **Chromium installs run on the host, not inside the sandbox.** Crew invokes `npx playwright install chromium` in the worktree's cwd as part of `crew run` — outside any Claude Code sandbox. By the time the agent spawns, browsers are already cached.
- **The agent never apt-installs, never installs browsers, never touches the docker socket.** It runs `npm run test:e2e` against the already-running stack. If the test command fails because deps are missing, that's a host-setup failure that crew's preflight catches before launch.
- **Loopback network is assumed allowed by the sandbox.** `localhost`/`127.0.0.1` aren't gated on DNS allowlists. Phase 0 verifies this empirically.
- **Browser cache writes happen at install time, not at launch time.** Playwright reads from the cache to launch the browser; it doesn't write back. Phase 0 verifies this — if it turns out to write, the fix is a one-line `allowWrite` addition in the project's `.claude/settings.json` (project-side, not crew-side).

## 5. Schema

### 5.1 TOML shape

```toml
[playwright]
app_url       = "https://localhost:{httpsPort}"
start_command = "npm run dev"          # optional; required only when no [docker] block

[playwright.smoke]
enabled = true                         # MCP-driven exploratory smoke

[playwright.authored]
enabled      = true                    # headless authored tests, must exit 0 before Verify
tests_dir    = "tests/e2e"
test_command = "npm run test:e2e"
```

Both sub-blocks are optional. Either or both can be set. The parent block as a whole is optional — projects without Playwright don't declare it.

### 5.2 Validation rules (Zod)

```ts
const playwrightSmokeSchema = z.object({
  enabled: z.literal(true),
});

const playwrightAuthoredSchema = z.object({
  enabled: z.literal(true),
  tests_dir: z.string().min(1),
  test_command: z.string().min(1),
});

const playwrightSchema = z.object({
  app_url: z.string().min(1),
  start_command: z.string().min(1).optional(),
  smoke: playwrightSmokeSchema.optional(),
  authored: playwrightAuthoredSchema.optional(),
});
```

In the project-config `superRefine`:

- If `[playwright]` is present and neither `smoke.enabled` nor `authored.enabled` is true → reject with "at least one of [playwright.smoke] or [playwright.authored] must be enabled".
- If `app_url` uses a port placeholder (`{httpPort}`, `{httpsPort}`, `{postgresPort}`) and no `[docker]` block → reject (existing rule, migrated from `visual_testing`).
- If no `[docker]` block and no `start_command` → reject (existing rule, migrated from `visual_testing`).

Sub-modes use `enabled: z.literal(true)` to match the existing pattern in `bruno_smoke.enabled`. Setting `enabled = false` or omitting the sub-block has the same effect: the mode is off.

### 5.3 TypeScript surface

```ts
export interface PlaywrightConfig {
  app_url: string;
  start_command?: string;
  smoke?: { enabled: true };
  authored?: { enabled: true; tests_dir: string; test_command: string };
}

export interface ProjectConfig {
  // … existing fields, with `visual_testing` removed
  playwright?: PlaywrightConfig;
}
```

### 5.4 Mode-flag accessors

A small helper module replaces every ad-hoc `config.visual_testing?.enabled` read across the codebase:

```ts
// packages/cli/src/lib/playwright/mode-flags.ts
export function playwrightEnabled(c: ProjectConfig): boolean {
  return Boolean(c.playwright?.smoke?.enabled || c.playwright?.authored?.enabled);
}
export function smokeEnabled(c: ProjectConfig): boolean {
  return Boolean(c.playwright?.smoke?.enabled);
}
export function authoredEnabled(c: ProjectConfig): boolean {
  return Boolean(c.playwright?.authored?.enabled);
}
```

## 6. Run-time changes

### 6.1 `crew/scripts/install.sh` — apt deps

Extend the existing apt block alongside `bwrap` and `socat`:

```
libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2
libdbus-1-3 libxcb1 libxkbcommon0 libxcomposite1 libxdamage1
libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2
libatspi2.0-0
```

Source: Playwright's `--with-deps` linux package list (per their docs and source). Hardcoded because the script can't `npx` itself before crew is installed; bumped manually when Playwright bumps theirs.

### 6.2 `packages/cli/src/lib/playwright/` — lib reshape

Rename `lib/visual-testing/` to `lib/playwright/`. Existing modules unchanged in shape:

- `resolve-app-url.ts`
- `build-mcp-config.ts`
- `write-mcp-file.ts`
- `start-command-hint.ts`

Two new modules:

**`mode-flags.ts`** — accessor helpers (§5.4).

**`install-browsers.ts`** — runs `npx playwright install chromium` in a given cwd:

```ts
export interface InstallBrowsersOptions {
  worktree: string;
  key: string;
  env: NodeJS.ProcessEnv;
}

export interface InstallBrowsersResult {
  rc: number;
  logPath: string;
}

export function installPlaywrightBrowsers(
  opts: InstallBrowsersOptions,
): Promise<InstallBrowsersResult>;
```

Spawns via execa, pipes stdout/stderr to `playwrightLogPathFor(key)` (a new helper in `run/paths.ts` matching the existing `dockerLogPathFor`), returns `{ rc, logPath }`. Caller decides whether to fail on non-zero rc.

### 6.3 `crew run` (`packages/cli/src/commands/run.ts`)

Insert a new step between docker bringup (existing) and claude spawn (existing):

```ts
if (playwrightEnabled(config)) {
  console.log(pc.dim('→ ensuring Chromium is installed for Playwright…'));
  const result = await installPlaywrightBrowsers({ worktree, key, env: childEnv });
  if (result.rc !== 0) {
    fail(`playwright install failed (rc=${result.rc}). Log: ${result.logPath}`);
  }
}
```

This runs sequentially before agent spawn. The agent does not start until browsers are ready.

Other changes in `run.ts`:

- `.mcp.json` writer (lines ~150–158 today): gate on `smokeEnabled(config)` instead of `visual_testing.enabled`.
- Prompt builder call (lines ~187–215): consume the new `playwright` shape; pass `smokeEnabled` / `authoredEnabled` flags into the builder.
- Spawned claude env (lines ~235–238): add `CREW_APP_URL: resolvedAppUrl` so `playwright.config.ts` can reference `process.env.CREW_APP_URL` for `baseURL`.

### 6.4 `crew fix-pr` (`packages/cli/src/commands/fix-pr.ts`)

Same browser-install step before resuming the agent. Same `.mcp.json` gating, same `CREW_APP_URL` env injection, same prompt builder consumption.

### 6.5 `agentNeedsAppRunning` (`packages/cli/src/lib/run/app-lifecycle.ts`)

```ts
export function agentNeedsAppRunning(config: ProjectConfig): boolean {
  return playwrightEnabled(config) || Boolean(config.bruno_smoke?.enabled);
}
```

### 6.6 Prompt fragments

**Rename:**
- `templates/ticket-visual-smoke.md` → `templates/ticket-playwright-smoke.md`
- `templates/ticket-visual-authored.md` → `templates/ticket-playwright-authored.md`

**Update content of `ticket-playwright-authored.md`** to add two assertions:

- "Do not run `npm run docker:up` — crew has the stack running for you at {{appUrl}}."
- "Do not run `npx playwright install` — crew has installed the Chromium browser for you. If `{{testCommand}}` reports missing browsers, surface it in the PR description and stop; that's a crew-setup gap, not your fault."

The "test command must exit 0 before Verify" rule stays.

### 6.7 Prompt builder

`buildTicketPrompt` (in `packages/cli/src/lib/prompts/ticket.ts`) consumes the new `playwright` config shape. Both fragments included if both modes enabled. Builder signature changes from a single `visualTesting?: { … }` parameter to a `playwright?: { appUrl, startCommand?, smoke?: true, authored?: { testsDir, testCommand } }` parameter.

### 6.8 Architecture-doc update

`docs/plans/architecture.md`'s example TOML at the §"Project config" section: replace `[visual_testing]` block with the new `[playwright]` shape from §5.1.

## 7. Phase 0 — empirical validation

Three load-bearing assumptions are unverified. Phase 0 is a pre-implementation discovery pass — each item produces a yes/no answer that either confirms the design or reshapes a specific later phase.

### 7.1 P0.1 — Does `mcp__playwright__*` actually work in the sandbox today?

Hypothesis: it doesn't, or it works only by accident (e.g. the MCP server caches to `/tmp`, which is in the sandbox's `allowWrite` list). The fix may be the same `npx playwright install chromium` step we're adding for authored tests — or there may be additional sandbox needs for the MCP server's runtime.

**Validation:** enable `[playwright.smoke]` on a Recipes worktree, dispatch a `crew run` against a UI-touching ticket, observe whether MCP playwright invocations succeed. Record the failure mode if any.

**Outcomes:**
- *Works today:* design unchanged.
- *Doesn't work, fixed by browser install:* design unchanged (the new `npx playwright install chromium` step covers it because it runs before the agent boots).
- *Doesn't work, needs more:* fold the additional fix into the implementation plan as added bullets in §6.

### 7.2 P0.2 — Does Playwright write to `~/.cache/ms-playwright` at launch-time?

If yes, the agent's run-time launch of Chromium fails under the current `allowWrite` list. The fix is a one-line project-side addition to `.claude/settings.json` — outside crew's scope, but must be documented.

**Validation:** with sandbox enabled, install Chromium to `~/.cache/ms-playwright` *outside* the sandbox, then run `npx playwright test` *inside* the sandbox. Watch for write-permission errors.

**Outcomes:**
- *No writes at launch:* nothing more to do.
- *Yes writes at launch:* document the required `allowWrite` addition in the architecture doc; flag for the future "crew owns settings.json" follow-up (§10).

### 7.3 P0.3 — Does Claude Code's sandbox allow loopback network without `allowedDomains` entries?

Assumption: yes (`127.0.0.1`/`localhost` aren't gated on DNS allowlists). If wrong, the agent can't hit `https://localhost:<port>` and the entire e2e flow falls over regardless of browsers.

**Validation:** with sandbox enabled, attempt a Bash-tool curl from inside the agent against `https://localhost:<port>` (using Recipes' running stack). Distinguish connection-refused (loopback works, port wrong) from sandbox-blocked.

**Outcomes:**
- *Loopback allowed:* design unchanged.
- *Loopback blocked:* widen `[sandbox] allowed_domains` in TOML to include `localhost`, `127.0.0.1`. Small TOML doc addition.

### 7.4 Validation by design

The spec **does not** depend on Phase 0's outcomes. Each later section is shaped so that worst-case outcomes only add small amendments to the implementation plan — they don't reshape the architecture.

## 8. Migration

**Existing usage:** zero. Neither `recipes.toml` nor `crew.toml` declares `[visual_testing]` today (verified at spec-write time).

**Approach:** hard rename, no deprecation cycle, no compatibility shim.

**Behavior of leftover `[visual_testing]` blocks:** Zod's default `strip` behavior silently drops unknown keys. So if a stale TOML somewhere still has the old block, it parses without error and the block is ignored. Acceptable because nobody has one. No friendly "did you mean `[playwright]`?" error — over-engineered for a non-problem.

**Documentation:** the rename is announced in the architecture doc's example TOML (§6.8) and in this spec. That's it.

## 9. Testing strategy

The work fits the existing crew testing pattern: vitest unit tests, no integration harness for `crew run` itself (the claude binary isn't available in CI), manual verification on a real Recipes ticket as the final gate.

### 9.1 Unit tests

**Schema** (extend `packages/shared/src/config/schema.test.ts`):

- `[playwright]` parses with smoke only, authored only, and both.
- `[playwright]` with neither sub-mode rejects with the "at least one mode required" message.
- Port placeholder in `app_url` + no `[docker]` rejects.
- Missing `start_command` + no `[docker]` rejects.
- Leftover `[visual_testing]` block: silent strip (asserted via parsed output, not error).

**Mode-flag accessors** (`packages/cli/src/lib/playwright/mode-flags.test.ts`, new):

- Every combination of present/absent and enabled/not-enabled returns the right boolean from each accessor.
- All three return `false` when `[playwright]` is absent.

**Browser installer** (`packages/cli/src/lib/playwright/install-browsers.test.ts`, new, execa mocked):

- Spawns `npx playwright install chromium` in the given cwd.
- Captures stdout/stderr to the log path returned in the result.
- Returns `{ rc: 0 }` on success, `{ rc: nonzero, logPath }` on failure.

**Prompt builder** (extend `packages/cli/src/lib/prompts/builders.test.ts`, snapshots updated):

- Smoke fragment included when `smokeEnabled`.
- Authored fragment included when `authoredEnabled`.
- Both included when both enabled.
- Neither when `[playwright]` absent.
- Snapshots updated to reflect the two new "do not run" assertions.

**MCP writer gating** (consumer-side test in `run.ts` or extracted helper):

- `.mcp.json` written when `smokeEnabled`.
- `.mcp.json` not written when only authored is enabled.
- `.mcp.json` not written when `[playwright]` absent.

**`agentNeedsAppRunning`** (extend `packages/cli/src/lib/run/app-lifecycle.test.ts`):

- Returns true when `playwright.smoke.enabled`, `playwright.authored.enabled`, or `bruno_smoke.enabled`.
- Returns false otherwise.

### 9.2 Manual gate before claiming done

Dispatch a `crew run` on a Recipes ticket that touches the UI, with `[playwright]` configured for both `smoke` and `authored`, against a freshly-set-up worktree. Observe:

1. `crew run` invokes `npx playwright install chromium` (logs to `/tmp/crew-playwright-<key>.log`).
2. The agent boots, runs the full ticket flow including `npm run test:e2e`.
3. The agent exits 0; the PR is opened without a "manual verification needed" caveat.

This is the same shape as the original KAN-35 PR's manual step — but now run by the agent itself.

### 9.3 Phase 0 verifications

The three Phase 0 checks (§7.1 / §7.2 / §7.3) are themselves test-shaped — each is a runnable verification with a clear yes/no outcome. They run before implementation, not after.

## 10. Out of scope (follow-ups)

These came up during brainstorming and deserve to live as real artifacts. None block this work.

### 10.1 Project config rationalization

The `[sandbox]` / `[docker]` / `[playwright]` / `[bruno_smoke]` / `[db_clone]` blocks have grown organically. A future spec should consolidate where it makes sense — likely a top-level `[app] url = ...` shared across modes, **with per-block URLs (`bruno_smoke.base_url`, `playwright.app_url`) preserved as overrides** for projects whose frontend and backend live at different URLs (e.g. not routed through a single Caddy instance).

### 10.2 Unified onboarding helper (`crew init` / `crew doctor`)

A single subcommand for project setup — both new and existing. Capabilities:

- New project: walk through writing the TOML, run `npm install -D @playwright/test` if Playwright is opted in, scaffold `playwright.config.ts` + `tests/e2e/` skeleton, scaffold Bruno collection skeleton if opted in.
- Existing project: modify the TOML in place (toggle blocks, change URLs), run machine-wide health checks (apt deps present, Chromium installed for every configured project, docker socket reachable).

The two halves can ship as one subcommand (single pane of glass) rather than splitting into `crew init` + `crew doctor`.

### 10.3 Per-config-block reference docs

Every TOML option documented with its purpose, defaults, validation rules, and required project-side setup. Lives in `docs/config-reference.md` or similar. Pairs with the unified onboarding helper as the static counterpart.

### 10.4 Crew owns `.claude/settings.json`

Today the project's `.claude/settings.json` and the crew TOML's `[sandbox]` block are two hand-maintained sources of the same truth — easy to drift. A follow-up spec should decide: does crew write a generated `.claude/settings.json` per worktree (with the "tag header + refuse to clobber" pattern from `docker-env.sh`)? What happens when the project's committed `settings.json` differs from what crew would generate?

If Phase 0's P0.2 turns out to find launch-time writes to `~/.cache/ms-playwright`, that's an additional motivation to take this on.

### 10.5 Validate `bwrap`/`socat` are load-bearing

Crew preflights both, but neither is invoked from crew's TS source. Hypothesis: Claude Code's built-in sandbox uses them transitively. Worth a one-shot empirical test — uninstall `bwrap` on a test machine, run a sandboxed agent, observe. If it silently runs un-sandboxed, that's a finding that affects every other sandbox-related decision and warrants its own ticket.
