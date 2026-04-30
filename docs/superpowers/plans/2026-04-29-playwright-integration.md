# Playwright integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `[visual_testing]` with a `[playwright]` config block carrying nested `smoke` and `authored` sub-modes, and introduce a per-run `npx playwright install chromium` step so headless authored e2e tests succeed inside the sandboxed agent (eliminating the manual-verification footnote class hit by KAN-35).

**Architecture:** Project TOML opts in via `[playwright]` (parent + nested `smoke` and/or `authored` sub-blocks). Crew's `scripts/install.sh` machine-installs the Chromium apt deps once. `crew run` and `crew fix-pr` invoke `npx playwright install chromium` from the worktree directory before agent spawn (resolves the project's pinned `@playwright/test` version automatically; idempotent and fast on cache hit). Crew injects `CREW_APP_URL` into the spawned agent's env so `playwright.config.ts` can reference it. Renamed prompt fragments instruct the agent **not** to run `docker:up` or `playwright install` — both are crew's job. Project-side requirements collapse to: declare `[playwright]`, ensure `npm install` brings in `@playwright/test`, write `playwright.config.ts` + a `test:e2e` script.

**Tech Stack:** TypeScript, Zod schemas, Vitest, smol-toml, npm workspaces, execa, picocolors. Existing crew CLI + per-project TOML at `~/.config/crew/projects/<name>.toml`.

**Source spec:** [`docs/superpowers/specs/2026-04-29-playwright-integration-design.md`](../specs/2026-04-29-playwright-integration-design.md). Read it before starting.

**Ticket carve-up** (one Epic + 4 child tickets in CREW + 1 prereq in Recipes):

| Ticket                          | Tasks       | Blocks / parallelism                                                       |
| ------------------------------- | ----------- | -------------------------------------------------------------------------- |
| **CREW-pw-α** (Phase 0)         | Tasks 1–4   | Blocks β (findings may amend later phases)                                 |
| **CREW-pw-β** (Foundation)      | Tasks 5–11  | After α; blocks γ + δ                                                      |
| **CREW-pw-γ** (`crew run`)      | Tasks 12–13 | After β; **parallel** with δ                                               |
| **CREW-pw-δ** (`crew fix-pr`)   | Tasks 14–15 | After β; **parallel** with γ                                               |
| (KAN-prereq)                    | Recipes-side: declare `[playwright]` in `recipes.toml`, update `playwright.config.ts` to read `process.env.CREW_APP_URL`. | Required before Task 16's manual gate produces value |
| **CREW-pw-final**               | Task 16     | After γ + δ + KAN-prereq merge                                             |

**Renaming convention.** Throughout: `visual_testing` (TOML key, schema field) → `playwright`. `visualTesting` (TS type, function param, prompt builder option) → `playwright`. `ticket-visual-smoke.md` / `ticket-visual-authored.md` (template files) → `ticket-playwright-smoke.md` / `ticket-playwright-authored.md`. `lib/visual-testing/` (directory) → `lib/playwright/`. `visualTestingBlock` (render placeholder) → `playwrightBlock`.

**Migration note.** Zero projects use `[visual_testing]` today (verified at spec-write time on `recipes.toml` and `crew.toml`). Hard rename, no compatibility shim. Zod's default `strip` behavior silently drops unknown keys, so a stale TOML with `[visual_testing]` parses without error and the block is ignored — acceptable.

---

## CREW-pw-α — Phase 0 empirical validation

The three checks here are **pre-implementation discovery**. Each produces a yes/no answer that may amend later phases (foundation or wiring). They run on the existing `main` branch state — no code changes — except Task 4, which writes a findings doc.

### Task 1: P0.1 — Does `mcp__playwright__*` work in the sandbox today?

**Goal:** confirm or refute that the existing visual smoke MCP server works inside Claude Code's sandbox. If it doesn't, the foundation phase needs amendments to make MCP smoke run after the new browser-install step.

**Files:**

- Create / modify: `~/.config/crew/projects/recipes.toml` (temporarily, to add a `[visual_testing]` block — reverted at end of task).
- Test scenario: a low-stakes UI-touching ticket in Recipes (any ticket whose acceptance criteria includes a visible UI change).

- [ ] **Step 1: Temporarily add `[visual_testing]` to `recipes.toml`**

Edit `~/.config/crew/projects/recipes.toml` and add:

```toml
[visual_testing]
enabled = true
app_url = "https://localhost:{httpsPort}"
```

(Using the *old* schema deliberately — Phase 0 runs on `main` before the rename.)

- [ ] **Step 2: Pick or create a low-stakes Recipes ticket**

Either an existing open ticket whose AC includes a visible change, or a placeholder like "verify the home page renders the recipe list correctly" (no actual code change required from the agent — the AC is a screenshot).

- [ ] **Step 3: Dispatch `crew run <KEY>`**

```bash
crew run KAN-<n>
```

- [ ] **Step 4: Observe MCP playwright tool calls**

Watch the tool-call stream and the run log at `/tmp/crew-run-<KEY>.log`. Look for:

- `mcp__playwright__navigate` / `mcp__playwright__take_screenshot` invocations
- Any error mentioning "browser not installed", "chromium", "missing system libs", or sandbox-related write failures

Possible outcomes:

- **Works:** MCP calls succeed, screenshot is taken, no errors. Record in findings doc.
- **Fails — browser-install:** the MCP server reports a missing browser. Foundation's browser-install step covers this.
- **Fails — system libs:** the browser launches but Chromium can't start (libnss/libatk errors). Foundation's apt deps in `install.sh` cover this.
- **Fails — sandbox writes:** errors mention `EACCES` on `~/.cache/ms-playwright` or similar. Folds into P0.2's outcomes (see Task 2).
- **Fails — other:** capture the exact error verbatim. May reshape foundation; record everything.

- [ ] **Step 5: Capture transcript path + relevant log excerpts**

Note the run log path and the agent's transcript path. Copy any failure output (the actual stderr / tool-call error text). These go into the findings doc in Task 4.

- [ ] **Step 6: Revert `recipes.toml`**

Remove the temporary `[visual_testing]` block. Phase 0 must not leave config drift.

- [ ] **Step 7: Clean up the worktree**

```bash
crew finish KAN-<n>   # if the agent merged, otherwise: git worktree remove + branch delete by hand
```

No commit at this step — Task 4 commits all three findings together.

---

### Task 2: P0.2 — Does Playwright write to `~/.cache/ms-playwright` at launch time?

**Goal:** determine whether running an already-installed Chromium under Playwright requires write access to the cache directory at launch (not just at install). If yes, the project's `.claude/settings.json` needs `~/.cache/ms-playwright` added to `allowWrite` — a project-side, one-line edit captured in §10.4 follow-up of the spec.

**Files:**

- Test scenario: a Recipes worktree with sandbox enabled, Chromium pre-installed *outside* the sandbox.

- [ ] **Step 1: Pre-install Chromium outside the sandbox**

In a regular shell (not inside a `crew run`'d agent):

```bash
cd ~/Repos/Recipes
npx playwright install chromium
```

Verify the binary landed:

```bash
ls ~/.cache/ms-playwright/
# expect: chromium-<rev>/  ms-playwright-cli-<ver>/  ...
```

- [ ] **Step 2: Set up a worktree with sandbox enabled**

Use an existing or fresh worktree: `~/Repos/Recipes-PW-VALIDATION` (any name that won't collide). It must have the project's committed `.claude/settings.json` (which already has `sandbox.enabled: true` and the current `allowWrite` list — no `~/.cache/ms-playwright`).

- [ ] **Step 3: Bring the docker stack up so there's an app to test against**

```bash
cd ~/Repos/Recipes-PW-VALIDATION
npm run docker:up
```

- [ ] **Step 4: Run a Playwright test inside a sandboxed agent**

Dispatch a sandboxed agent against the worktree (use any low-stakes ticket key, or a hand-launched `claude --dangerously-skip-permissions` in the worktree if you want to skip the ticket plumbing). Have it run:

```bash
npm run test:e2e
```

(Recipes already has `tests/e2e/*` and a `test:e2e` script.)

- [ ] **Step 5: Observe the test outcome**

Possible outcomes:

- **Tests pass:** Playwright doesn't need launch-time cache writes. Design unchanged.
- **Tests fail with `EACCES` on `~/.cache/ms-playwright/...`:** Playwright DOES write at launch. Document the required `allowWrite` addition in the architecture doc; flag for the §10.4 follow-up.
- **Tests fail with a different error:** capture verbatim — may indicate a different sandbox issue.

- [ ] **Step 6: Capture findings**

Note pass/fail, exact error if any, and whether `allowWrite` would resolve it (you can confirm by adding `~/.cache/ms-playwright` to the worktree's `.claude/settings.json` and re-running). Goes into the findings doc in Task 4.

- [ ] **Step 7: Tear down**

```bash
cd ~/Repos/Recipes-PW-VALIDATION
npm run docker:down
git worktree remove ~/Repos/Recipes-PW-VALIDATION   # if you used a real worktree
```

No commit at this step.

---

### Task 3: P0.3 — Does the sandbox allow loopback network without `allowedDomains`?

**Goal:** confirm that `localhost` / `127.0.0.1` traffic is not blocked by Claude Code's sandbox (i.e., loopback is exempt from the `allowedDomains` allowlist). If it isn't, every project's TOML needs `localhost` and `127.0.0.1` added to `[sandbox] allowed_domains` — a small TOML doc addition.

**Files:**

- Test scenario: a sandboxed agent in a Recipes worktree, plus the running docker stack.

- [ ] **Step 1: Bring the docker stack up in the canonical Recipes worktree**

```bash
cd ~/Repos/Recipes
npm run docker:up
```

Note the stack's HTTPS port (likely `8443` — see `.env`).

- [ ] **Step 2: Dispatch a sandboxed agent in any worktree**

Pick any low-stakes existing worktree or `crew run` a placeholder ticket. Once the agent is up, have it execute (via Bash tool):

```bash
curl -sk -o /dev/null -w "%{http_code}\n" https://localhost:8443/
```

(Adjust the port to the actual stack's port. The `-k` flag accepts the self-signed cert.)

- [ ] **Step 3: Observe the response**

Possible outcomes:

- **HTTP 2xx / 3xx:** loopback works. Design unchanged.
- **`Connection refused`:** the stack isn't running where curl looked — port mismatch, **not** a sandbox block. Re-check port and re-run.
- **Sandbox-specific error / hang:** the sandbox is blocking loopback. Document the required `allowed_domains` addition (`localhost`, `127.0.0.1`).

The sandbox-block error usually mentions network policy or the request hangs. Connection-refused is fast and explicit.

- [ ] **Step 4: Capture findings**

Note the exact response, including HTTP code or error text. Goes into the findings doc in Task 4.

- [ ] **Step 5: Tear down**

If you brought up a worktree just for this test, `crew finish` it. Otherwise no cleanup needed.

No commit at this step.

---

### Task 4: Phase 0 findings doc + commit

**Files:**

- Create: `docs/superpowers/specs/2026-04-29-playwright-integration-phase-0-findings.md`

- [ ] **Step 1: Write the findings doc**

Create the file with this structure:

```markdown
# Playwright integration — Phase 0 findings

> Empirical validation of the three load-bearing assumptions in the [Playwright integration spec](./2026-04-29-playwright-integration-design.md). Run on `<DATE>` against `<commit-sha>`.

## P0.1 — Does `mcp__playwright__*` work in the sandbox today?

**Outcome:** [works | fails — browser-install | fails — system libs | fails — sandbox writes | fails — other]

**Evidence:** [run log path + transcript path + verbatim error if any]

**Spec impact:** [none | foundation phase amends X | needs separate ticket]

## P0.2 — Does Playwright write to `~/.cache/ms-playwright` at launch?

**Outcome:** [no writes at launch | yes writes at launch — `allowWrite` addition required | other]

**Evidence:** [test outcome + verbatim error if any]

**Spec impact:** [none | architecture-doc note + project-side `allowWrite` addition documented | something else]

## P0.3 — Does the sandbox allow loopback network?

**Outcome:** [allowed | blocked — `allowed_domains` addition required]

**Evidence:** [curl response code or error]

**Spec impact:** [none | TOML-doc addition for `localhost`, `127.0.0.1` | something else]

## Summary

[1-2 sentences: do these findings change anything material in the implementation plan? Which tasks need amendments, if any?]
```

Fill in the actual outcomes from Tasks 1–3.

- [ ] **Step 2: Apply any required spec amendments**

If P0.1 found extra MCP fixes needed, add a sub-bullet under §6 of the spec — *do not* re-litigate the architecture; just enumerate the additional code change. If P0.2 found launch-time writes, add a paragraph to the spec's §6.8 about the project-side `allowWrite` addition. If P0.3 found loopback blocked, note the TOML addition.

If no amendments are needed, skip this step.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-04-29-playwright-integration-phase-0-findings.md
# only if amendments were made:
git add docs/superpowers/specs/2026-04-29-playwright-integration-design.md

git commit -m "docs(CREW-pw-α): Phase 0 empirical validation findings"
```

---

## CREW-pw-β — Foundation (schema, lib, helpers, fragments, install.sh)

This is the bulk of the work. After this ticket lands, `crew run` and `crew fix-pr` consumers can be wired in (γ + δ) in parallel.

### Task 5: Schema — replace `visualTestingSchema` with `playwrightSchema`

**Files:**

- Modify: `packages/shared/src/config/schema.ts`
- Modify: `packages/shared/src/config/loader.test.ts`

- [ ] **Step 1: Write failing tests for the new schema**

Replace the existing `describe('parseProjectConfig — visual_testing', ...)` block in `packages/shared/src/config/loader.test.ts` (around line 111) with:

```ts
describe('parseProjectConfig — playwright', () => {
  const baseToml = `
name = "minimal"
repo_path = "/x"

[jira]
project_key = "MIN"
site = "https://x.atlassian.net"

[github]
repo = "owner/repo"
`;

  it('parses with no [playwright] section (backwards compatible)', () => {
    const config = parseProjectConfig(baseToml);
    expect(config.playwright).toBeUndefined();
  });

  it('parses [playwright] with smoke only', () => {
    const raw = `${baseToml}
[playwright]
app_url = "http://localhost:5173"
start_command = "npm run dev"

[playwright.smoke]
enabled = true
`;
    const config = parseProjectConfig(raw);
    expect(config.playwright?.smoke?.enabled).toBe(true);
    expect(config.playwright?.authored).toBeUndefined();
    expect(config.playwright?.app_url).toBe('http://localhost:5173');
    expect(config.playwright?.start_command).toBe('npm run dev');
  });

  it('parses [playwright] with authored only', () => {
    const raw = `${baseToml}
[playwright]
app_url = "http://localhost:5173"
start_command = "npm run dev"

[playwright.authored]
enabled = true
tests_dir = "tests/e2e"
test_command = "npm run test:e2e"
`;
    const config = parseProjectConfig(raw);
    expect(config.playwright?.smoke).toBeUndefined();
    expect(config.playwright?.authored?.enabled).toBe(true);
    expect(config.playwright?.authored?.tests_dir).toBe('tests/e2e');
    expect(config.playwright?.authored?.test_command).toBe('npm run test:e2e');
  });

  it('parses [playwright] with both modes enabled', () => {
    const raw = `${baseToml}
[playwright]
app_url = "http://localhost:5173"
start_command = "npm run dev"

[playwright.smoke]
enabled = true

[playwright.authored]
enabled = true
tests_dir = "tests/e2e"
test_command = "npm run test:e2e"
`;
    const config = parseProjectConfig(raw);
    expect(config.playwright?.smoke?.enabled).toBe(true);
    expect(config.playwright?.authored?.enabled).toBe(true);
  });

  it('rejects [playwright] with neither sub-mode enabled', () => {
    const raw = `${baseToml}
[playwright]
app_url = "http://localhost:5173"
start_command = "npm run dev"
`;
    expect(() => parseProjectConfig(raw)).toThrow(
      /at least one of \[playwright\.smoke\] or \[playwright\.authored\]/,
    );
  });

  it('rejects port placeholder in app_url without [docker]', () => {
    const raw = `${baseToml}
[playwright]
app_url = "https://localhost:{httpsPort}"
start_command = "npm run dev"

[playwright.smoke]
enabled = true
`;
    expect(() => parseProjectConfig(raw)).toThrow(/port placeholder.*\[docker\]/);
  });

  it('rejects missing start_command without [docker]', () => {
    const raw = `${baseToml}
[playwright]
app_url = "http://localhost:5173"

[playwright.smoke]
enabled = true
`;
    expect(() => parseProjectConfig(raw)).toThrow(/start_command is required/);
  });

  it('parses [playwright] with port placeholder + [docker]', () => {
    const raw = `${baseToml}
[docker]
canonical_worktree = "x"

[playwright]
app_url = "https://localhost:{httpsPort}"

[playwright.smoke]
enabled = true
`;
    const config = parseProjectConfig(raw);
    expect(config.playwright?.app_url).toBe('https://localhost:{httpsPort}');
  });

  it('silently strips a leftover [visual_testing] block (migration)', () => {
    const raw = `${baseToml}
[visual_testing]
enabled = true
app_url = "http://x"
`;
    const config = parseProjectConfig(raw);
    // `visual_testing` is no longer in the schema; it's stripped
    expect((config as Record<string, unknown>).visual_testing).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=crew-shared -- --run loader`
Expected: FAIL — references to `config.playwright` and the new validation messages don't exist yet.

- [ ] **Step 3: Replace `visualTestingSchema` with `playwrightSchema`**

In `packages/shared/src/config/schema.ts`:

Replace the existing `visualTestingSchema` block (around lines 5–15) with:

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

In the same file's `projectConfigSchema`, replace the `visual_testing: visualTestingSchema.optional(),` line (around line 64) with:

```ts
    playwright: playwrightSchema.optional(),
```

In the `superRefine`, replace the existing `vt`-prefixed block (validates port placeholders + `start_command`) with:

```ts
    const pw = cfg.playwright;
    if (pw) {
      const smokeOn = Boolean(pw.smoke?.enabled);
      const authoredOn = Boolean(pw.authored?.enabled);
      if (!smokeOn && !authoredOn) {
        ctx.addIssue({
          code: 'custom',
          path: ['playwright'],
          message:
            'at least one of [playwright.smoke] or [playwright.authored] must be enabled when [playwright] is configured',
        });
      }

      const usesPortPlaceholder = PORT_PLACEHOLDERS.some((p) => pw.app_url.includes(p));
      if (usesPortPlaceholder && !cfg.docker) {
        ctx.addIssue({
          code: 'custom',
          path: ['playwright', 'app_url'],
          message: `app_url uses a port placeholder (${PORT_PLACEHOLDERS.join(', ')}) but no [docker] section is configured`,
        });
      }

      if (!pw.start_command && !cfg.docker) {
        ctx.addIssue({
          code: 'custom',
          path: ['playwright', 'start_command'],
          message:
            'start_command is required when [docker] is not configured (the agent needs a command to bring the app up)',
        });
      }
    }
```

Remove the old `const vt = cfg.visual_testing; if (vt) { … }` block entirely.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace=crew-shared -- --run loader`
Expected: PASS for all `parseProjectConfig — playwright` cases.

- [ ] **Step 5: Run typecheck across the monorepo**

Run: `npm run typecheck`
Expected: FAIL in `crew-cli` — many consumers still reference `config.visual_testing`. That's expected; later tasks fix them. Note the failing files for cross-reference.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/config/schema.ts packages/shared/src/config/loader.test.ts
git commit -m "feat(CREW-pw-β): replace [visual_testing] with [playwright] schema

Adds nested [playwright.smoke] and [playwright.authored] sub-blocks; at
least one must be enabled when the parent block is present. Existing
port-placeholder + start_command validation rules migrate from the old
visualTestingSchema. Leftover [visual_testing] blocks silently strip.

Typecheck still failing in crew-cli — consumers updated in later tasks
of CREW-pw-β."
```

---

### Task 6: Lib rename — `lib/visual-testing/` → `lib/playwright/` (file renames + import updates only)

**Goal:** rename the directory and update every import path. **No new code or content changes** in this task — keep the diff minimal so the rename is auditable.

**Files:**

- Rename: `packages/cli/src/lib/visual-testing/` → `packages/cli/src/lib/playwright/`
  - All five files (`build-mcp-config.ts`, `resolve-app-url.ts`, `start-command-hint.ts`, `write-mcp-file.ts`, `index.ts`) and their `*.test.ts` counterparts and the `__snapshots__` dir.
- Modify (import path updates):
  - `packages/cli/src/commands/run.ts:26`
  - `packages/cli/src/commands/fix-pr.ts:27`
  - `packages/cli/src/lib/prompts/ticket.ts:1`
  - `packages/cli/src/lib/bruno-smoke/*.ts` (any file importing `resolveAppUrl` from `../visual-testing/`)

- [ ] **Step 1: Rename the directory using `git mv`**

```bash
cd /home/safturento/Repos/crew
git mv packages/cli/src/lib/visual-testing packages/cli/src/lib/playwright
```

`git mv` preserves rename detection so blame survives.

- [ ] **Step 2: Update all importers**

Run a project-wide find:

```bash
grep -rln "lib/visual-testing\|from '\.\./visual-testing\|from '\.\.\/\.\.\/visual-testing" packages/ --include="*.ts"
```

For each match, replace `visual-testing` with `playwright` in the import path. Expected files:

- `packages/cli/src/commands/run.ts` — change `../lib/visual-testing/index.js` → `../lib/playwright/index.js`
- `packages/cli/src/commands/fix-pr.ts` — same change
- `packages/cli/src/lib/prompts/ticket.ts` — change `../visual-testing/index.js` → `../playwright/index.js`
- `packages/cli/src/lib/bruno-smoke/build-env-file.ts` and any other bruno-smoke file importing `resolveAppUrl` — change `../visual-testing/index.js` → `../playwright/index.js`

- [ ] **Step 3: Run tests to confirm nothing broke from the rename**

Run: `npm run test --workspace=crew-cli -- --run`
Expected: existing playwright lib tests (`resolve-app-url.test.ts`, `build-mcp-config.test.ts`, `write-mcp-file.test.ts`, `start-command-hint.test.ts`) PASS unchanged. Other failures in `app-lifecycle.test.ts` / `builders.test.ts` are still expected from Task 5; rename didn't introduce them.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/lib/playwright/ packages/cli/src/lib/visual-testing/
git add packages/cli/src/commands/run.ts packages/cli/src/commands/fix-pr.ts
git add packages/cli/src/lib/prompts/ticket.ts packages/cli/src/lib/bruno-smoke/
git commit -m "refactor(CREW-pw-β): rename lib/visual-testing → lib/playwright

Pure file-and-import rename. No content changes. Module shape and
exported names (resolveAppUrl, buildMcpConfig, etc.) unchanged in this
commit; expanded in subsequent commits within CREW-pw-β."
```

---

### Task 7: Mode-flag accessor helpers — `playwrightEnabled`, `smokeEnabled`, `authoredEnabled`

**Files:**

- Create: `packages/cli/src/lib/playwright/mode-flags.ts`
- Create: `packages/cli/src/lib/playwright/mode-flags.test.ts`
- Modify: `packages/cli/src/lib/playwright/index.ts` (re-export)

- [ ] **Step 1: Write failing tests**

Create `packages/cli/src/lib/playwright/mode-flags.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { authoredEnabled, playwrightEnabled, smokeEnabled } from './mode-flags.js';
import type { ProjectConfig } from 'crew-shared';

function baseConfig(): ProjectConfig {
  return {
    name: 'test',
    repo_path: '/repo',
    default_branch: 'main',
    jira: { project_key: 'X', site: 'https://x.atlassian.net' },
    github: { repo: 'a/b' },
    db_clone: {
      postgres_service: 'postgres',
      postgres_user: 'postgres',
      postgres_database: 'postgres',
      required_tables: [],
      exclude_tables: ['kysely_migration*'],
    },
  } as ProjectConfig;
}

describe('mode-flags accessors', () => {
  it('all return false when [playwright] is absent', () => {
    const cfg = baseConfig();
    expect(playwrightEnabled(cfg)).toBe(false);
    expect(smokeEnabled(cfg)).toBe(false);
    expect(authoredEnabled(cfg)).toBe(false);
  });

  it('returns smoke=true, authored=false when only smoke is enabled', () => {
    const cfg = baseConfig();
    cfg.playwright = { app_url: 'http://x', smoke: { enabled: true } };
    expect(playwrightEnabled(cfg)).toBe(true);
    expect(smokeEnabled(cfg)).toBe(true);
    expect(authoredEnabled(cfg)).toBe(false);
  });

  it('returns smoke=false, authored=true when only authored is enabled', () => {
    const cfg = baseConfig();
    cfg.playwright = {
      app_url: 'http://x',
      authored: { enabled: true, tests_dir: 'tests/e2e', test_command: 'npm run test:e2e' },
    };
    expect(playwrightEnabled(cfg)).toBe(true);
    expect(smokeEnabled(cfg)).toBe(false);
    expect(authoredEnabled(cfg)).toBe(true);
  });

  it('returns true for all when both are enabled', () => {
    const cfg = baseConfig();
    cfg.playwright = {
      app_url: 'http://x',
      smoke: { enabled: true },
      authored: { enabled: true, tests_dir: 'tests/e2e', test_command: 'npm run test:e2e' },
    };
    expect(playwrightEnabled(cfg)).toBe(true);
    expect(smokeEnabled(cfg)).toBe(true);
    expect(authoredEnabled(cfg)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=crew-cli -- --run mode-flags`
Expected: FAIL — `mode-flags.ts` doesn't exist yet.

- [ ] **Step 3: Implement `mode-flags.ts`**

Create `packages/cli/src/lib/playwright/mode-flags.ts`:

```ts
import type { ProjectConfig } from 'crew-shared';

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

- [ ] **Step 4: Re-export from the lib index**

In `packages/cli/src/lib/playwright/index.ts`, append:

```ts
export { playwrightEnabled, smokeEnabled, authoredEnabled } from './mode-flags.js';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test --workspace=crew-cli -- --run mode-flags`
Expected: PASS for all four cases.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/lib/playwright/mode-flags.ts \
        packages/cli/src/lib/playwright/mode-flags.test.ts \
        packages/cli/src/lib/playwright/index.ts
git commit -m "feat(CREW-pw-β): mode-flag accessors for [playwright] sub-modes

playwrightEnabled / smokeEnabled / authoredEnabled — pure functions over
ProjectConfig that replace ad-hoc config.visual_testing?.enabled reads
across the codebase."
```

---

### Task 8: `installPlaywrightBrowsers` helper + `playwrightLogPathFor`

**Files:**

- Modify: `packages/cli/src/lib/run/paths.ts`
- Modify: `packages/cli/src/lib/run/paths.test.ts`
- Create: `packages/cli/src/lib/playwright/install-browsers.ts`
- Create: `packages/cli/src/lib/playwright/install-browsers.test.ts`
- Modify: `packages/cli/src/lib/playwright/index.ts` (re-export)

- [ ] **Step 1: Write failing test for `playwrightLogPathFor`**

Append to `packages/cli/src/lib/run/paths.test.ts`:

```ts
import { playwrightLogPathFor } from './paths.js';

describe('playwrightLogPathFor', () => {
  it('returns /tmp/crew-playwright-<key>.log', () => {
    expect(playwrightLogPathFor('KAN-99')).toBe('/tmp/crew-playwright-KAN-99.log');
  });
});
```

(Add the import to existing imports at the top if not already present.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=crew-cli -- --run paths`
Expected: FAIL — `playwrightLogPathFor` not exported.

- [ ] **Step 3: Add `playwrightLogPathFor` to `paths.ts`**

In `packages/cli/src/lib/run/paths.ts`, append after `dockerLogPathFor`:

```ts
export function playwrightLogPathFor(key: string): string {
  return `/tmp/crew-playwright-${key}.log`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=crew-cli -- --run paths`
Expected: PASS.

- [ ] **Step 5: Write failing tests for `installPlaywrightBrowsers`**

Create `packages/cli/src/lib/playwright/install-browsers.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { installPlaywrightBrowsers } from './install-browsers.js';

vi.mock('execa', () => {
  return {
    execa: vi.fn(),
  };
});

import { execa } from 'execa';
const execaMock = vi.mocked(execa);

describe('installPlaywrightBrowsers', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = join(tmpdir(), `crew-pw-test-${process.pid}-${Date.now()}`);
    mkdirSync(tmp, { recursive: true });
    execaMock.mockReset();
  });

  afterEach(() => {
    if (existsSync(tmp)) rmSync(tmp, { recursive: true, force: true });
  });

  function fakeProcess(rc: number, stdout = '', stderr = '') {
    const proc = {
      stdout: { pipe: vi.fn() },
      stderr: { pipe: vi.fn() },
      then: (onFulfilled: (v: unknown) => unknown) => Promise.resolve(onFulfilled({ exitCode: rc })),
    };
    // Force the right shape for execa's return.
    return Object.assign(Promise.resolve({ exitCode: rc, stdout, stderr }), proc);
  }

  it('spawns `npx playwright install chromium` with the given cwd and env', async () => {
    execaMock.mockReturnValue(fakeProcess(0) as ReturnType<typeof execa>);

    await installPlaywrightBrowsers({
      worktree: tmp,
      key: 'KAN-99',
      env: { PATH: '/usr/bin', FOO: 'bar' },
    });

    expect(execaMock).toHaveBeenCalledTimes(1);
    const [cmd, args, options] = execaMock.mock.calls[0]!;
    expect(cmd).toBe('npx');
    expect(args).toEqual(['playwright', 'install', 'chromium']);
    expect((options as { cwd: string }).cwd).toBe(tmp);
    expect((options as { env: Record<string, string> }).env.FOO).toBe('bar');
  });

  it('returns rc 0 and a log path on success', async () => {
    execaMock.mockReturnValue(fakeProcess(0) as ReturnType<typeof execa>);
    const result = await installPlaywrightBrowsers({
      worktree: tmp,
      key: 'KAN-99',
      env: process.env,
    });
    expect(result.rc).toBe(0);
    expect(result.logPath).toBe('/tmp/crew-playwright-KAN-99.log');
  });

  it('returns non-zero rc on failure (does not throw)', async () => {
    execaMock.mockReturnValue(fakeProcess(1, '', 'error') as ReturnType<typeof execa>);
    const result = await installPlaywrightBrowsers({
      worktree: tmp,
      key: 'KAN-99',
      env: process.env,
    });
    expect(result.rc).toBe(1);
    expect(result.logPath).toBe('/tmp/crew-playwright-KAN-99.log');
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npm run test --workspace=crew-cli -- --run install-browsers`
Expected: FAIL — `install-browsers.ts` doesn't exist.

- [ ] **Step 7: Implement `install-browsers.ts`**

Create `packages/cli/src/lib/playwright/install-browsers.ts`:

```ts
import { createWriteStream } from 'node:fs';
import { execa } from 'execa';
import { playwrightLogPathFor } from '../run/paths.js';

export interface InstallBrowsersOptions {
  worktree: string;
  key: string;
  env: NodeJS.ProcessEnv;
}

export interface InstallBrowsersResult {
  rc: number;
  logPath: string;
}

/**
 * Run `npx playwright install chromium` inside `worktree` and capture its
 * output to `/tmp/crew-playwright-<key>.log`. Idempotent: Playwright's own
 * installer is fast on cache hit (≈1s, hash check) and downloads the
 * browser binary on cache miss. Resolves the project's pinned
 * @playwright/test by running from the worktree's cwd.
 *
 * Does not throw on non-zero rc — returns the result so the caller can
 * decide whether to fail the run.
 */
export async function installPlaywrightBrowsers(
  opts: InstallBrowsersOptions,
): Promise<InstallBrowsersResult> {
  const logPath = playwrightLogPathFor(opts.key);
  const stream = createWriteStream(logPath, { flags: 'w' });

  const proc = execa('npx', ['playwright', 'install', 'chromium'], {
    cwd: opts.worktree,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    env: opts.env,
    reject: false,
  });

  proc.stdout?.pipe(stream);
  proc.stderr?.pipe(stream);

  const result = await proc;
  stream.end();

  return {
    rc: typeof result.exitCode === 'number' ? result.exitCode : 1,
    logPath,
  };
}
```

- [ ] **Step 8: Re-export from the lib index**

In `packages/cli/src/lib/playwright/index.ts`, append:

```ts
export {
  installPlaywrightBrowsers,
  type InstallBrowsersOptions,
  type InstallBrowsersResult,
} from './install-browsers.js';
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `npm run test --workspace=crew-cli -- --run install-browsers paths`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add packages/cli/src/lib/run/paths.ts packages/cli/src/lib/run/paths.test.ts \
        packages/cli/src/lib/playwright/install-browsers.ts \
        packages/cli/src/lib/playwright/install-browsers.test.ts \
        packages/cli/src/lib/playwright/index.ts
git commit -m "feat(CREW-pw-β): installPlaywrightBrowsers helper + log-path

Spawns 'npx playwright install chromium' from a worktree's cwd, captures
output to /tmp/crew-playwright-<key>.log, returns { rc, logPath } without
throwing on non-zero. Caller (crew run / crew fix-pr) decides whether to
fail the run on rc != 0."
```

---

### Task 9: Prompt fragment renames + content updates + `buildTicketPrompt` refactor

**Files:**

- Rename: `packages/cli/src/lib/prompts/templates/ticket-visual-smoke.md` → `ticket-playwright-smoke.md`
- Rename: `packages/cli/src/lib/prompts/templates/ticket-visual-authored.md` → `ticket-playwright-authored.md`
- Modify: `packages/cli/src/lib/prompts/templates/ticket-playwright-authored.md` (content additions)
- Modify: `packages/cli/src/lib/prompts/ticket.ts`
- Modify: `packages/cli/src/lib/prompts/render.ts` (placeholder rename)
- Modify: `packages/cli/src/lib/prompts/builders.test.ts` (rename `visualTesting` → `playwright`, update fixtures)
- Modify: `packages/cli/src/lib/prompts/render.test.ts` (rename `visualTestingBlock` → `playwrightBlock`)
- Modify: `packages/cli/src/lib/prompts/templates/ticket.md` (rename `{{visualTestingBlock}}` → `{{playwrightBlock}}`)
- Update: `packages/cli/src/lib/prompts/__snapshots__/builders.test.ts.snap`

- [ ] **Step 1: Rename the two template files via `git mv`**

```bash
cd /home/safturento/Repos/crew
git mv packages/cli/src/lib/prompts/templates/ticket-visual-smoke.md \
       packages/cli/src/lib/prompts/templates/ticket-playwright-smoke.md
git mv packages/cli/src/lib/prompts/templates/ticket-visual-authored.md \
       packages/cli/src/lib/prompts/templates/ticket-playwright-authored.md
```

- [ ] **Step 2: Update content of `ticket-playwright-authored.md`**

Open `packages/cli/src/lib/prompts/templates/ticket-playwright-authored.md` and replace its full content with:

```markdown

## Authored Playwright test

If the change has regression value (a user-facing flow that broke before or could break again), add a Playwright test:

- Tests live in **{{testsDir}}/**. Mirror existing files there for style.
- Run them with `{{testCommand}}`. If you authored a test, this command must exit 0 before "Verify".
- One test per behaviour, not per assertion. Names describe user intent.
- Don't add a test just because you can. Skip when the change is cosmetic, throwaway, or fully covered by existing unit tests.

**Two crew-managed concerns — do not duplicate:**

- **Do not run `npm run docker:up`.** Crew has the application stack running for you at {{appUrl}}. Running it again will conflict with the live containers.
- **Do not run `npx playwright install`.** Crew has installed Chromium for you before this run. If `{{testCommand}}` reports missing browsers or system libraries, surface the failure in the PR description and stop — that's a crew-setup gap, not your fault.

If `{{testsDir}}/` doesn't exist or `{{testCommand}}` fails for any other reason, also surface the problem in the PR description and do **not** silently skip.
```

(Note the new `{{appUrl}}` placeholder in the "do not run docker:up" line — it's resolved by the prompt builder.)

- [ ] **Step 3: Rename `visualTestingBlock` → `playwrightBlock` in templates and render**

In `packages/cli/src/lib/prompts/templates/ticket.md`, find the `{{visualTestingBlock}}` placeholder and rename it to `{{playwrightBlock}}`.

In `packages/cli/src/lib/prompts/render.ts`, find any references to `visualTestingBlock` (in the placeholder list / type) and rename to `playwrightBlock`.

- [ ] **Step 4: Update `render.test.ts`**

In `packages/cli/src/lib/prompts/render.test.ts`, replace every `visualTestingBlock` reference with `playwrightBlock`. There are likely three occurrences (lines ~10, ~25, ~42 per the spec's grep output).

- [ ] **Step 5: Refactor `buildTicketPrompt` in `ticket.ts`**

Rewrite `packages/cli/src/lib/prompts/ticket.ts` (the file is small — full replacement):

```ts
import { startCommandHint } from '../playwright/index.js';
import { render } from './render.js';

export interface PlaywrightPromptOptions {
  appUrl: string;
  startCommand?: string;
  smoke?: boolean;
  authored?: {
    testsDir: string;
    testCommand: string;
  };
}

export interface BrunoSmokePromptOptions {
  baseUrl: string;
  envName: string;
  collectionDir: string;
  hasSmokeUser: boolean;
}

export interface BuildTicketPromptOptions {
  key: string;
  githubRepo: string;
  jiraSite: string;
  playwright?: PlaywrightPromptOptions;
  brunoSmoke?: BrunoSmokePromptOptions;
  discoveredSkillsBlock?: string;
}

export function buildTicketPrompt(opts: BuildTicketPromptOptions): string {
  return render('ticket', {
    key: opts.key,
    githubRepo: opts.githubRepo,
    jiraSite: opts.jiraSite,
    playwrightBlock: buildPlaywrightBlock(opts.playwright),
    brunoSmokeBlock: buildBrunoSmokeBlock(opts.brunoSmoke),
    discoveredSkillsBlock: opts.discoveredSkillsBlock ?? '',
  });
}

function buildPlaywrightBlock(pw: PlaywrightPromptOptions | undefined): string {
  if (!pw) return '';
  let out = '';
  if (pw.smoke) {
    out += render('ticket-playwright-smoke', {
      appUrl: pw.appUrl,
      startCommandHint: startCommandHint({
        appUrl: pw.appUrl,
        startCommand: pw.startCommand,
      }),
    });
  }
  if (pw.authored) {
    out += render('ticket-playwright-authored', {
      appUrl: pw.appUrl,
      testsDir: pw.authored.testsDir,
      testCommand: pw.authored.testCommand,
    });
  }
  return out;
}

function buildBrunoSmokeBlock(bs: BrunoSmokePromptOptions | undefined): string {
  if (!bs) return '';
  return render('ticket-bruno-smoke', {
    baseUrl: bs.baseUrl,
    envName: bs.envName,
    collectionDir: bs.collectionDir,
    testUserClause: bs.hasSmokeUser ? ' and a test user' : '',
  });
}
```

Key changes from the previous shape:
- `visualTesting` parameter → `playwright`. Type renamed accordingly.
- New `smoke?: boolean` flag in the options shape (replaces "always-on smoke when visualTesting is set").
- Smoke fragment is included only when `smoke === true`. Authored fragment is included only when `authored` is set. Either, both, or neither — the parameter shape now matches the schema.
- Authored fragment receives `appUrl` (for the new "do not run docker:up" line).
- Imports `startCommandHint` from `../playwright/index.js` (was `../visual-testing/...`).

- [ ] **Step 6: Update `builders.test.ts`**

Open `packages/cli/src/lib/prompts/builders.test.ts`. Find every test using the old `visualTesting` parameter and update to the new `playwright` shape. Specifically:

- Tests that set `visualTesting: { appUrl: ... }` (smoke-only) → `playwright: { appUrl: ..., smoke: true }`.
- Tests that set `visualTesting: { appUrl: ..., authored: { ... } }` (smoke + authored) → `playwright: { appUrl: ..., smoke: true, authored: { ... } }`.
- The "omits the authored section when visualTesting is set without authored" test → "omits the authored section when only smoke is set". Same fixture, just renamed to use `playwright: { appUrl: ..., smoke: true }`.
- Add a new test: "renders only the authored section when smoke is omitted":

```ts
it('renders only the authored section when smoke is omitted (authored-only)', () => {
  const prompt = buildTicketPrompt({
    key: 'KAN-1',
    githubRepo: 'a/b',
    jiraSite: 'https://x.atlassian.net',
    playwright: {
      appUrl: 'https://localhost:18443',
      authored: { testsDir: 'tests/e2e', testCommand: 'npm run test:e2e' },
    },
  });
  expect(prompt).not.toContain('Visual smoke verification');
  expect(prompt).toContain('Authored Playwright test');
});
```

Update existing snapshot expectations to reflect:
- Section headings unchanged (`Visual smoke verification`, `Authored Playwright test`).
- Authored fragment now contains the two new "do not" lines.

- [ ] **Step 7: Run snapshot tests with `--update`**

Run: `npm run test --workspace=crew-cli -- --run builders --update`
Expected: snapshots regenerate to reflect the new fragment content. Inspect the diff manually:

```bash
git diff packages/cli/src/lib/prompts/__snapshots__/builders.test.ts.snap
```

The diff should show:
- The authored fragment gaining the two "do not" paragraphs.
- No unrelated content drift.

- [ ] **Step 8: Run all prompt tests to verify they pass**

Run: `npm run test --workspace=crew-cli -- --run prompts`
Expected: PASS for `builders.test.ts` and `render.test.ts`.

- [ ] **Step 9: Commit**

```bash
git add packages/cli/src/lib/prompts/
git commit -m "feat(CREW-pw-β): playwright prompt fragments + buildTicketPrompt

Renames ticket-visual-{smoke,authored}.md to ticket-playwright-*. Adds
two assertions to the authored fragment instructing the agent NOT to run
'npm run docker:up' or 'npx playwright install' (both are crew's job).

buildTicketPrompt's visualTesting parameter is now playwright, with an
explicit smoke boolean to match the schema's smoke-or-authored-or-both
shape (was: smoke implicitly on when visualTesting was set)."
```

---

### Task 10: `agentNeedsAppRunning` — switch to `playwrightEnabled`

**Files:**

- Modify: `packages/cli/src/lib/run/app-lifecycle.ts`
- Modify: `packages/cli/src/lib/run/app-lifecycle.test.ts`

- [ ] **Step 1: Rewrite the test for the new shape**

Replace the contents of `packages/cli/src/lib/run/app-lifecycle.test.ts` (currently 45 lines) with:

```ts
import { describe, it, expect } from 'vitest';
import { agentNeedsAppRunning } from './app-lifecycle.js';
import type { ProjectConfig } from 'crew-shared';

function baseConfig(): ProjectConfig {
  return {
    name: 'test',
    repo_path: '/repo',
    default_branch: 'main',
    jira: { project_key: 'X', site: 'https://x.atlassian.net' },
    github: { repo: 'a/b' },
    db_clone: {
      postgres_service: 'postgres',
      postgres_user: 'postgres',
      postgres_database: 'postgres',
      required_tables: [],
      exclude_tables: ['kysely_migration*'],
    },
  } as ProjectConfig;
}

describe('agentNeedsAppRunning', () => {
  it('returns false when neither playwright nor bruno_smoke is enabled', () => {
    expect(agentNeedsAppRunning(baseConfig())).toBe(false);
  });

  it('returns true when playwright.smoke is enabled', () => {
    const cfg = baseConfig();
    cfg.playwright = { app_url: 'http://x', smoke: { enabled: true } };
    expect(agentNeedsAppRunning(cfg)).toBe(true);
  });

  it('returns true when playwright.authored is enabled', () => {
    const cfg = baseConfig();
    cfg.playwright = {
      app_url: 'http://x',
      authored: { enabled: true, tests_dir: 'tests/e2e', test_command: 'npm run test:e2e' },
    };
    expect(agentNeedsAppRunning(cfg)).toBe(true);
  });

  it('returns true when bruno_smoke is enabled', () => {
    const cfg = baseConfig();
    cfg.bruno_smoke = { enabled: true, base_url: 'http://x', collection_dir: 'bruno' };
    expect(agentNeedsAppRunning(cfg)).toBe(true);
  });

  it('returns true when both playwright and bruno are enabled', () => {
    const cfg = baseConfig();
    cfg.playwright = { app_url: 'http://x', smoke: { enabled: true } };
    cfg.bruno_smoke = { enabled: true, base_url: 'http://x', collection_dir: 'bruno' };
    expect(agentNeedsAppRunning(cfg)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=crew-cli -- --run app-lifecycle`
Expected: FAIL — implementation still references `config.visual_testing`.

- [ ] **Step 3: Update `agent-lifecycle.ts`**

Replace `packages/cli/src/lib/run/app-lifecycle.ts`:

```ts
import type { ProjectConfig } from 'crew-shared';
import { playwrightEnabled } from '../playwright/index.js';

export function agentNeedsAppRunning(config: ProjectConfig): boolean {
  return playwrightEnabled(config) || Boolean(config.bruno_smoke?.enabled);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace=crew-cli -- --run app-lifecycle`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/lib/run/app-lifecycle.ts \
        packages/cli/src/lib/run/app-lifecycle.test.ts
git commit -m "feat(CREW-pw-β): agentNeedsAppRunning uses playwrightEnabled

Replaces config.visual_testing?.enabled with the new accessor. Bruno
half unchanged. Either smoke or authored sub-mode keeps the docker
stack running for the agent."
```

---

### Task 11: `install.sh` apt deps + architecture-doc TOML update

**Files:**

- Modify: `scripts/install.sh`
- Modify: `docs/plans/architecture.md`

- [ ] **Step 1: Add Chromium apt deps to `install.sh`**

In `scripts/install.sh`, find the `if command -v apt-get …` block (around line 22). Extend the missing-pkg detection to include the Chromium libs.

Replace the existing apt block with:

```bash
# System deps for `crew run` — bubblewrap is the sandbox runtime, socat
# is the network-allowlist proxy that runs alongside it. Chromium libs
# are required for headless Playwright runs in projects that enable
# [playwright] in their crew config.
if command -v apt-get >/dev/null 2>&1; then
  missing_pkgs=()
  command -v bwrap  >/dev/null 2>&1 || missing_pkgs+=(bubblewrap)
  command -v socat  >/dev/null 2>&1 || missing_pkgs+=(socat)
  # Chromium runtime libraries (Playwright --with-deps list for linux).
  # Probe one canonical lib via ldconfig; if missing, install the full set.
  if ! ldconfig -p 2>/dev/null | grep -q libnss3.so; then
    missing_pkgs+=(
      libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2
      libdbus-1-3 libxcb1 libxkbcommon0 libxcomposite1 libxdamage1
      libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2
      libatspi2.0-0
    )
  fi
  if [[ ${#missing_pkgs[@]} -gt 0 ]]; then
    echo "Installing system deps via apt: ${missing_pkgs[*]}"
    sudo apt-get install -y "${missing_pkgs[@]}"
  fi
else
  if ! command -v bwrap >/dev/null 2>&1 || ! command -v socat >/dev/null 2>&1; then
    echo "warning: apt-get not found. Install 'bubblewrap', 'socat', and Chromium runtime libs (libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libdbus-1-3 libxcb1 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2 libatspi2.0-0) via your package manager before running 'crew run'." >&2
  fi
fi
```

- [ ] **Step 2: Update the example TOML in `docs/plans/architecture.md`**

In `docs/plans/architecture.md`, find the example TOML block (around line 140). It currently has a `[sandbox]` block but no Playwright block. Add a `[playwright]` block to the example so the architecture doc reflects the new shape:

Find the block starting with `[sandbox]` (around line 159) and insert *before* it:

```toml
[playwright]
app_url = "https://localhost:{httpsPort}"

[playwright.smoke]
enabled = true

[playwright.authored]
enabled = true
tests_dir = "tests/e2e"
test_command = "npm run test:e2e"
```

The `[sandbox]` block stays where it is.

- [ ] **Step 3: Run install.sh to confirm idempotency on the dev machine**

Run: `bash scripts/install.sh`
Expected: passes without error. On a machine that already has Chromium libs, the message says nothing about installing them; on one that doesn't, it apt-installs them.

- [ ] **Step 4: Commit**

```bash
git add scripts/install.sh docs/plans/architecture.md
git commit -m "feat(CREW-pw-β): install.sh apt-installs Chromium runtime libs

Probes libnss3 via ldconfig; if absent, apt-installs Playwright's full
--with-deps linux package list alongside bubblewrap and socat.

Architecture doc's example TOML gains a [playwright] block reflecting
the new shape. (visual_testing was never in the example.)"
```

---

## CREW-pw-γ — Wire `crew run`

After β is merged. Parallel-eligible with δ (`crew fix-pr` wiring).

### Task 12: Wire `crew run` — browser install, `.mcp.json` gating, `CREW_APP_URL` env, prompt builder

**Files:**

- Modify: `packages/cli/src/commands/run.ts`

- [ ] **Step 1: Update imports**

In `packages/cli/src/commands/run.ts`, update the import from `../lib/playwright/index.js` (already renamed in β-Task 6) to also bring in the new helpers:

Replace the existing playwright import line (was `import { resolveAppUrl, writeMcpFile } from '../lib/playwright/index.js';`) with:

```ts
import {
  installPlaywrightBrowsers,
  playwrightEnabled,
  resolveAppUrl,
  smokeEnabled,
  authoredEnabled,
  writeMcpFile,
} from '../lib/playwright/index.js';
```

- [ ] **Step 2: Update the `.mcp.json` writer gate**

Find the `if (config.visual_testing?.enabled) { ... }` block (around line 151). Replace with:

```ts
let resolvedAppUrl: string | undefined;
if (playwrightEnabled(config)) {
  const resolved = resolveAppUrl(config.playwright!.app_url, dockerPorts);
  resolvedAppUrl = resolved.raw;
  if (smokeEnabled(config)) {
    const writeResult = writeMcpFile(worktree, { appUrl: resolved.raw });
    console.log(pc.dim(`→ wrote ${join(worktree, '.mcp.json')} (CREW_APP_URL=${resolved.raw})`));
    if (writeResult.existed) {
      console.warn(pc.yellow('  ! .mcp.json already existed in worktree — overwritten'));
    }
  }
}
```

Key changes:
- `playwrightEnabled` gates the URL resolution (needed for both smoke and authored).
- `smokeEnabled` gates the `.mcp.json` write (only smoke needs the MCP server).
- `resolvedAppUrl` is populated whenever any playwright mode is on, so it's available for both the env injection (Step 4) and the prompt builder (Step 5).

- [ ] **Step 3: Insert the browser-install step**

Immediately after `startDockerBringup` returns the `dockerProcess` (around line 182, after `const dockerProcess = startDockerBringup(...)`), and **before** `const ghToken = readFileSync(...)` (around line 184), add:

```ts
  if (playwrightEnabled(config)) {
    console.log(pc.dim('→ ensuring Chromium is installed for Playwright…'));
    const result = await installPlaywrightBrowsers({ worktree, key, env: childEnv });
    if (result.rc !== 0) {
      fail(`playwright install failed (rc=${result.rc}). Log: ${result.logPath}`);
    }
    console.log(pc.dim(`    log: ${result.logPath}`));
  }
```

This runs sequentially before agent spawn — the agent does not start until browsers are ready. Docker bringup continues in parallel in the background.

- [ ] **Step 4: Update the prompt builder call**

Find the `buildTicketPrompt({ ... })` call (around line 188–215). Replace the `visualTesting:` block with:

```ts
    playwright:
      playwrightEnabled(config) && resolvedAppUrl
        ? {
            appUrl: resolvedAppUrl,
            startCommand: config.playwright?.start_command,
            smoke: smokeEnabled(config) || undefined,
            authored: authoredEnabled(config)
              ? {
                  testsDir: config.playwright!.authored!.tests_dir,
                  testCommand: config.playwright!.authored!.test_command,
                }
              : undefined,
          }
        : undefined,
```

(The `smoke: smokeEnabled(config) || undefined` shape passes `true` when smoke is on and `undefined` otherwise, matching the prompt builder's optional-boolean expectation. Same pattern as `authored`.)

- [ ] **Step 5: Inject `CREW_APP_URL` into the spawned claude env**

Find the `execa('claude', …)` invocation (around line 230) and the `env:` block within (around line 235–238). Update to include `CREW_APP_URL`:

```ts
    env: {
      ...childEnv,
      GH_TOKEN: ghToken,
      ...(resolvedAppUrl ? { CREW_APP_URL: resolvedAppUrl } : {}),
      ...(brunoEnvName ? { CREW_BRUNO_ENV: brunoEnvName } : {}),
    },
```

- [ ] **Step 6: Run typecheck + tests**

Run: `npm run typecheck`
Expected: PASS — all visual_testing references in run.ts are now resolved.

Run: `npm run test --workspace=crew-cli -- --run`
Expected: PASS.

- [ ] **Step 7: Run lint and format**

Run: `npm run lint && npm run format:check`
Expected: PASS. If format complains, run `npm run format` and re-stage.

- [ ] **Step 8: Commit**

```bash
git add packages/cli/src/commands/run.ts
git commit -m "feat(CREW-pw-γ): wire crew run for [playwright] integration

- Installs Chromium via 'npx playwright install chromium' in the
  worktree before agent spawn (gated on playwrightEnabled).
- .mcp.json writer gated on smokeEnabled (was visual_testing.enabled).
- Injects CREW_APP_URL into the spawned claude's process env so
  playwright.config.ts can reference it for baseURL.
- Prompt builder consumes the new playwright shape with explicit
  smoke + authored flags."
```

---

### Task 13: `crew run` — visual sanity-check on a real Recipes ticket

**Goal:** confirm the full per-run flow works end-to-end on a UI-touching ticket. This is a manual verification step — no code changes.

**Prerequisites:**
- KAN-prereq is merged (Recipes' `recipes.toml` has `[playwright]` and `playwright.config.ts` reads `process.env.CREW_APP_URL`).
- Tasks 1–12 are merged.

- [ ] **Step 1: Pick a low-stakes Recipes ticket that touches the UI**

Either an existing open ticket whose AC includes a visible change, or a placeholder ticket whose AC is "verify the home page renders the recipe list correctly".

- [ ] **Step 2: Dispatch `crew run`**

```bash
crew run KAN-<n>
```

- [ ] **Step 3: Observe the per-run flow**

Watch the tool-call stream and the run log at `/tmp/crew-run-<KEY>.log`. Confirm:

- Crew prints `→ ensuring Chromium is installed for Playwright…` before the agent boots.
- The Playwright install log (`/tmp/crew-playwright-<KEY>.log`) shows either "browsers already installed" (cache hit) or download progress (cache miss).
- The agent's transcript shows it using `mcp__playwright__*` tools to take a screenshot (smoke side).
- The agent runs `npm run test:e2e` and it exits 0 (authored side — only if the ticket's change has regression value and the agent authored a test).
- The agent does **not** run `npm run docker:up` (the new "do not run" prompt assertion landed).
- The PR is opened without a "manual verification needed" caveat.

- [ ] **Step 4: If anything fails, capture findings before retrying**

Note exactly what failed, where in the flow, and what the relevant log says. If the failure is in production code, file a bug ticket and fix in a follow-up. Do not "fix in place" without a code change tracked.

- [ ] **Step 5: Once verified, no commit needed**

This task is a verification gate, not a code change. The Epic's "Definition of done" references this task's success.

---

## CREW-pw-δ — Wire `crew fix-pr`

After β is merged. Parallel-eligible with γ.

### Task 14: Wire `crew fix-pr` — browser install, env injection, fix-pr playwright fragment

`crew fix-pr` is narrower than `crew run`: it does **not** write `.mcp.json` (the worktree retains the file from the original `crew run`), and its prompt template has no playwright branching today. The wiring is therefore three pieces: extend `spawnClaudeResume` to accept env, add the browser-install step, and add a fix-pr-specific playwright prompt fragment so the agent knows the stack is up and Chromium is installed.

**Files:**

- Modify: `packages/cli/src/lib/claude/spawn.ts` (extend `SpawnClaudeResumeOptions` with `env`)
- Modify: `packages/cli/src/lib/claude/spawn.test.ts` (or its existing tests; add env-passthrough test)
- Modify: `packages/cli/src/commands/fix-pr.ts` (browser install + env injection + plumb playwright options through)
- Create: `packages/cli/src/lib/prompts/templates/fix-pr-playwright.md`
- Modify: `packages/cli/src/lib/prompts/fix-pr.ts` (add `playwright` option + fragment branch)
- Modify: `packages/cli/src/lib/prompts/render.ts` (register the new template + add `playwrightBlock` placeholder for fix-pr)
- Modify: `packages/cli/src/lib/prompts/templates/fix-pr.md` (add `{{playwrightBlock}}` placeholder)
- Modify: `packages/cli/src/lib/prompts/builders.test.ts` (or wherever `buildFixPrPrompt` is tested; add cases)

#### Step 1: Extend `spawnClaudeResume` to accept env

- [ ] **Step 1a: Write a failing test for env passthrough**

Find the existing `spawn.test.ts` (if present — search via `grep -l spawnClaudeResume packages/cli/src/lib/claude/`). If it doesn't exist, create one at `packages/cli/src/lib/claude/spawn.test.ts`. Add:

```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('execa', () => ({ execa: vi.fn() }));
import { execa } from 'execa';
import { spawnClaudeResume } from './spawn.js';

describe('spawnClaudeResume', () => {
  it('passes additional env vars on top of process.env', () => {
    const execaMock = vi.mocked(execa);
    execaMock.mockReturnValue({
      stdout: { pipe: vi.fn() },
      stderr: { pipe: vi.fn() },
    } as unknown as ReturnType<typeof execa>);

    spawnClaudeResume({
      sessionId: 'abc',
      prompt: 'p',
      logFile: '/tmp/x.log',
      cwd: '/tmp',
      env: { CREW_APP_URL: 'https://localhost:8443' },
    });

    const [, , options] = execaMock.mock.calls[0]!;
    const passedEnv = (options as { env: Record<string, string> }).env;
    expect(passedEnv.CREW_APP_URL).toBe('https://localhost:8443');
    // PATH still set by the helper:
    expect(passedEnv.PATH).toBeDefined();
  });
});
```

- [ ] **Step 1b: Run to confirm fail**

Run: `npm run test --workspace=crew-cli -- --run spawn`
Expected: FAIL — `env` is not in `SpawnClaudeResumeOptions`.

- [ ] **Step 1c: Add `env` to `SpawnClaudeResumeOptions` + thread through**

Replace `packages/cli/src/lib/claude/spawn.ts`:

```ts
import { execa, type ResultPromise } from 'execa';
import { createWriteStream } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface SpawnClaudeResumeOptions {
  sessionId: string;
  prompt: string;
  logFile: string;
  /**
   * Working directory the spawned `claude` runs in. Required because claude
   * derives its project directory (and thus where to look up `--resume`
   * sessions) from cwd — letting it inherit the parent shell's cwd causes
   * "No conversation found" when fix-pr is invoked from outside the worktree.
   */
  cwd: string;
  /**
   * Extra env vars to merge on top of process.env. PATH is always augmented
   * with ~/.local/bin (see ensureLocalBinOnPath).
   */
  env?: NodeJS.ProcessEnv;
}

export function spawnClaudeResume(opts: SpawnClaudeResumeOptions): ResultPromise {
  const sub = execa(
    'claude',
    ['--dangerously-skip-permissions', '--resume', opts.sessionId, '-p', opts.prompt],
    {
      cwd: opts.cwd,
      env: {
        ...process.env,
        ...(opts.env ?? {}),
        PATH: ensureLocalBinOnPath(process.env.PATH),
      },
    },
  );
  const log = createWriteStream(opts.logFile);
  sub.stdout?.pipe(log);
  sub.stderr?.pipe(log);
  return sub;
}

function ensureLocalBinOnPath(currentPath: string | undefined): string {
  const localBin = join(homedir(), '.local', 'bin');
  const segments = (currentPath ?? '').split(':').filter(Boolean);
  if (segments.includes(localBin)) return currentPath ?? '';
  return [localBin, ...segments].join(':');
}
```

- [ ] **Step 1d: Run test to verify pass**

Run: `npm run test --workspace=crew-cli -- --run spawn`
Expected: PASS.

#### Step 2: Add fix-pr-specific playwright prompt fragment

- [ ] **Step 2a: Create the template**

Create `packages/cli/src/lib/prompts/templates/fix-pr-playwright.md`:

```markdown

## Playwright e2e in this worktree

Crew has prepared this worktree for Playwright runs:

- The application stack is running at **{{appUrl}}**.
- Chromium is installed (browser binary + system libs). `process.env.CREW_APP_URL` is set to the app URL.
{{authoredClause}}

**Two crew-managed concerns — do not duplicate:**

- **Do not run `npm run docker:up`.** The stack is already up.
- **Do not run `npx playwright install`.** Chromium is already installed.

If `npm run test:e2e` (or the project's equivalent) reports missing browsers, missing system libs, or "no app to test", surface the failure in your fix description and stop — that's a crew-setup gap, not your fault.
```

The `{{authoredClause}}` is a single line conditionally rendered when authored mode is on:

```
- This project authors Playwright tests under **{{testsDir}}/** runnable via `{{testCommand}}`. If your fix touches a user-facing flow with regression value, ensure the relevant tests pass before pushing.
```

When authored is off, `{{authoredClause}}` is the empty string.

- [ ] **Step 2b: Wire into `buildFixPrPrompt`**

In `packages/cli/src/lib/prompts/fix-pr.ts` (the prompt builder), add to the options interface and the `render` call:

```ts
export interface PlaywrightFixPrOptions {
  appUrl: string;
  authored?: { testsDir: string; testCommand: string };
}

export interface BuildFixPrPromptOptions {
  // … existing fields
  playwright?: PlaywrightFixPrOptions;
}

export function buildFixPrPrompt(opts: BuildFixPrPromptOptions): string {
  return render('fix-pr', {
    // … existing placeholders
    playwrightBlock: buildPlaywrightFixPrBlock(opts.playwright),
    // … rest
  });
}

function buildPlaywrightFixPrBlock(pw: PlaywrightFixPrOptions | undefined): string {
  if (!pw) return '';
  const authoredClause = pw.authored
    ? `\n- This project authors Playwright tests under **${pw.authored.testsDir}/** runnable via \`${pw.authored.testCommand}\`. If your fix touches a user-facing flow with regression value, ensure the relevant tests pass before pushing.`
    : '';
  return render('fix-pr-playwright', {
    appUrl: pw.appUrl,
    authoredClause,
  });
}
```

(The exact existing shape of `buildFixPrPrompt` is already visible in the file; merge these additions into the existing structure rather than replacing it wholesale.)

In `packages/cli/src/lib/prompts/templates/fix-pr.md`, add `{{playwrightBlock}}` placeholder in an appropriate slot (mirror where `{{brunoSmokeBlock}}` is — the two are conceptually parallel).

In `packages/cli/src/lib/prompts/render.ts`, add `'fix-pr-playwright'` to the registered template list and `playwrightBlock` to the placeholder list/type for the `'fix-pr'` template.

- [ ] **Step 2c: Add tests for the fragment**

In whichever test file covers `buildFixPrPrompt` (likely `packages/cli/src/lib/prompts/builders.test.ts` — search for `buildFixPrPrompt` to confirm), add:

```ts
describe('buildFixPrPrompt — playwright', () => {
  it('omits the playwright block when not provided', () => {
    const prompt = buildFixPrPrompt({
      key: 'KAN-1',
      feedback: 'fix it',
      feedbackSource: 'cli',
      conflictFiles: [],
    });
    expect(prompt).not.toContain('Playwright e2e');
  });

  it('renders the playwright block (smoke-only / no authored)', () => {
    const prompt = buildFixPrPrompt({
      key: 'KAN-1',
      feedback: 'fix it',
      feedbackSource: 'cli',
      conflictFiles: [],
      playwright: { appUrl: 'https://localhost:8443' },
    });
    expect(prompt).toContain('Playwright e2e');
    expect(prompt).toContain('https://localhost:8443');
    expect(prompt).not.toContain('authors Playwright tests under');
  });

  it('renders the authored clause when authored is set', () => {
    const prompt = buildFixPrPrompt({
      key: 'KAN-1',
      feedback: 'fix it',
      feedbackSource: 'cli',
      conflictFiles: [],
      playwright: {
        appUrl: 'https://localhost:8443',
        authored: { testsDir: 'tests/e2e', testCommand: 'npm run test:e2e' },
      },
    });
    expect(prompt).toContain('authors Playwright tests under **tests/e2e/**');
    expect(prompt).toContain('npm run test:e2e');
  });
});
```

Match field names (`feedback`, `feedbackSource`, `conflictFiles`) to what `BuildFixPrPromptOptions` actually defines today — the existing test file shows the right shape.

- [ ] **Step 2d: Run prompt tests**

Run: `npm run test --workspace=crew-cli -- --run prompts`
Expected: PASS.

#### Step 3: Wire the browser-install step + `CREW_APP_URL` injection in `fix-pr.ts`

- [ ] **Step 3a: Update imports**

In `packages/cli/src/commands/fix-pr.ts`, update the playwright lib import (line 27 today):

```ts
import {
  authoredEnabled,
  installPlaywrightBrowsers,
  playwrightEnabled,
  resolveAppUrl,
} from '../lib/playwright/index.js';
```

(Reorder per the project's `eslint-plugin-import` rules if needed.)

- [ ] **Step 3b: Insert browser-install step + compute resolved app URL**

Locate the section just before `spawnClaudeResume` is called (around line 263). After `const brunoSmoke = ...` (around line 242) and before `const prompt = buildFixPrPrompt({ ... })` (around line 244), insert:

```ts
let resolvedAppUrl: string | undefined;
if (projectConfig && playwrightEnabled(projectConfig)) {
  // Resolve URL from project config + dockerPorts (use whatever dockerPorts
  // accessor fix-pr.ts already has; if none, derive via the same path run.ts
  // uses — see brunoSmokeOptionsFor's dockerPorts source).
  const resolved = resolveAppUrl(projectConfig.playwright!.app_url, dockerPorts);
  resolvedAppUrl = resolved.raw;

  process.stderr.write(`→ ensuring Chromium is installed for Playwright…\n`);
  const result = await installPlaywrightBrowsers({
    worktree,
    key,
    env: process.env,
  });
  if (result.rc !== 0) {
    throw new Error(`playwright install failed (rc=${result.rc}). Log: ${result.logPath}`);
  }
  process.stderr.write(`    log: ${result.logPath}\n`);
}
```

> **Project-specific (fix-pr's docker ports):** `fix-pr.ts` already computes `dockerPorts` for the bruno-smoke path (see `brunoSmokeOptionsFor` and how it's called around line 242). Reuse that source — do not re-derive ports independently. If the existing code path doesn't expose `dockerPorts` cleanly to this section, lift it into a shared local variable as part of this step and pass it to both call sites.

- [ ] **Step 3c: Pass `playwright` options into `buildFixPrPrompt`**

Update the `buildFixPrPrompt` call (around line 244) to include the `playwright` option:

```ts
const prompt = buildFixPrPrompt({
  key,
  feedback,
  feedbackSource: source,
  conflictFiles: conflicts,
  brunoSmoke,
  playwright:
    projectConfig && playwrightEnabled(projectConfig) && resolvedAppUrl
      ? {
          appUrl: resolvedAppUrl,
          authored: authoredEnabled(projectConfig)
            ? {
                testsDir: projectConfig.playwright!.authored!.tests_dir,
                testCommand: projectConfig.playwright!.authored!.test_command,
              }
            : undefined,
        }
      : undefined,
  discoveredSkillsBlock: renderDiscoveredSkillsBlock(discoverSkills({ repoPath })),
});
```

- [ ] **Step 3d: Inject `CREW_APP_URL` into the resumed claude's env**

Update the `spawnClaudeResume` call (around line 263):

```ts
const sub = spawnClaudeResume({
  sessionId: session.sessionId,
  prompt,
  logFile,
  cwd: worktree,
  env: resolvedAppUrl ? { CREW_APP_URL: resolvedAppUrl } : undefined,
});
```

- [ ] **Step 3e: Run typecheck + tests**

Run: `npm run typecheck && npm run test --workspace=crew-cli -- --run`
Expected: PASS.

- [ ] **Step 3f: Run lint + format**

Run: `npm run lint && npm run format:check`
Expected: PASS. Run `npm run format` and re-stage if needed.

#### Step 4: Commit

- [ ] **Step 4a: Commit**

```bash
git add packages/cli/src/lib/claude/spawn.ts \
        packages/cli/src/lib/claude/spawn.test.ts \
        packages/cli/src/commands/fix-pr.ts \
        packages/cli/src/lib/prompts/templates/fix-pr-playwright.md \
        packages/cli/src/lib/prompts/templates/fix-pr.md \
        packages/cli/src/lib/prompts/fix-pr.ts \
        packages/cli/src/lib/prompts/render.ts \
        packages/cli/src/lib/prompts/builders.test.ts \
        packages/cli/src/lib/prompts/__snapshots__/

git commit -m "feat(CREW-pw-δ): wire crew fix-pr for [playwright] integration

- spawnClaudeResume now accepts an env option for caller-injected vars.
- fix-pr installs Chromium in the worktree before resuming, mirroring
  crew run's pre-launch contract.
- New fix-pr-playwright fragment tells the agent the stack is up and
  Chromium is installed; reinforces 'do not run docker:up' and 'do not
  run playwright install'.
- CREW_APP_URL injected into resumed claude env."
```

---

### Task 15: `crew fix-pr` — visual sanity-check on a real Recipes PR

**Goal:** confirm the per-fix-pr flow works end-to-end on a Recipes PR with a Playwright failure that the agent can actually fix.

**Prerequisites:**
- KAN-prereq merged.
- Tasks 1–14 merged.
- A Recipes PR exists with a failing `npm run test:e2e` check (or a failing visual smoke).

- [ ] **Step 1: Pick a Recipes PR with a Playwright-related failure**

Either an existing PR whose CI shows an e2e-test failure, or open a new PR with a deliberately broken UI change to exercise the path.

- [ ] **Step 2: Dispatch `crew fix-pr`**

```bash
crew fix-pr <PR-number-or-key>
```

- [ ] **Step 3: Observe the per-fix-pr flow**

Same checklist as Task 13's Step 3 but in the fix-pr context:

- Crew prints the browser-install step before resuming the agent.
- Agent reads the failing CI logs, navigates to the broken page via MCP, runs `npm run test:e2e` to verify the fix.
- The agent does **not** run `docker:up` or `playwright install`.
- The PR's checks go green after the agent's fix is committed.

- [ ] **Step 4: Same outcome handling as Task 13**

Capture findings if anything fails; no commit.

---

## CREW-pw-final — End-to-end Epic gate

### Task 16: Manual verification on a fresh Recipes ticket end-to-end

**Goal:** the Epic's "Definition of done" — a single uninterrupted `crew run` against a fresh, UI-touching Recipes ticket whose acceptance criteria includes "the e2e tests pass". Equivalent to what KAN-35 *should* have been.

**Prerequisites:** all four CREW-pw-* tickets merged. KAN-prereq merged.

- [ ] **Step 1: Pick or create a real Recipes ticket whose AC requires e2e**

The ticket should have AC such that an authored Playwright test exercises the change end-to-end. Example: "add a 'sort by calories' control to the recipe list" → AC: "tests/e2e/recipe-list.spec.ts has a test that sorts by calories and asserts the order".

- [ ] **Step 2: Dispatch `crew run`**

```bash
crew run KAN-<n>
```

- [ ] **Step 3: Observe the agent run to PR**

The PR description must:
- **Not** contain "manual verification needed" or any equivalent caveat about Docker / Chromium / system libs.
- Reference an authored e2e test that was run successfully.
- Pass CI on opening (e2e tests included).

- [ ] **Step 4: Close the Epic**

If the manual gate succeeds, the four CREW-pw-* tickets get marked Done in Jira. Move the Epic to Done. The KAN-35 manual-verification footnote is officially eliminated.

If it fails: capture exact failure mode, file a follow-up ticket, do not close the Epic until the gap is fixed.

---

## Self-review checklist

Before any subagent dispatches, verify:

- [ ] Spec coverage: every section in `2026-04-29-playwright-integration-design.md` (§1–§10) maps to a task here, except §10 (out of scope).
- [ ] No placeholders (TBD / TODO / "implement later" / etc.).
- [ ] Type / function names consistent: `playwrightEnabled`, `smokeEnabled`, `authoredEnabled`, `installPlaywrightBrowsers`, `playwrightLogPathFor`, `PlaywrightConfig`, `PlaywrightPromptOptions`, `playwrightSchema`, `playwrightSmokeSchema`, `playwrightAuthoredSchema`, `playwrightBlock`. Match these everywhere.
- [ ] Phase 0 outcomes are explicit yes/no shapes; if any of P0.1/P0.2/P0.3 returns "fails — other", that triggers a spec amendment (Task 4 Step 2) and may add bullets to later tasks.
- [ ] Commit messages all carry the right CREW-pw-α/β/γ/δ scope.
