# `crew init` / `crew doctor` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `crew init` (interactive scaffold/converge of a project's crew-specific setup) and `crew doctor` (non-interactive diagnose + `--fix` + `--all`), built over a shared `lib/health/` check registry that also becomes the source of truth for the existing dispatch-time preflight gate.

**Architecture:** A `HealthCheck { name, scope, detect(), fix? }` registry in `packages/cli/src/lib/health/`. `crew doctor` runs all checks and collects results; `crew init` writes the crew-specific layer (TOML, env.toml, skeletons, settings.json) via `@inquirer/prompts`; the dispatch gate (`run`/`resume`/`fix-pr`) consumes the same registry via a fail-fast adapter that preserves today's `PreflightError` behavior.

**Tech Stack:** TypeScript ESM, commander, `@inquirer/prompts`, `ora`, `picocolors`, Vitest (all already in `packages/cli`). Config via `crew-shared` zod schema.

**Spec:** `docs/superpowers/specs/2026-06-05-crew-init-doctor-design.md`

---

## File structure & ticket mapping

| Phase (→ ticket) | Files | Responsibility |
| --- | --- | --- |
| **P1** Registry core | `lib/health/types.ts`, `run-health.ts`, `registry.ts` + 2 seed checks | The `HealthCheck` abstraction + collect-all runner + applicability assembly |
| **P2** Dispatch-gate migration | `lib/health/checks/excluded-commands.ts`, `app-url-resolves.ts`; rewrite `lib/preflight/run-preflight.ts` as adapter | Move the dispatch-critical checks into the registry; keep `run`/`resume`/`fix-pr` green |
| **P3** Remaining checks | `lib/health/checks/{playwright-config,chromium-installed,bruno-skeleton,docker-socket,apt-deps,baseline-present}.ts` | The rest of the check inventory |
| **P4** `crew doctor` | `commands/doctor.ts`, `lib/health/render.ts`, register in `index.ts` | Report + `--fix` + `--all` + exit codes |
| **P5** `crew init` | `commands/init.ts`, `lib/init/*`, register in `index.ts` | Wizard + scaffolders + idempotent converge |

**Conflict points (merge one-at-a-time, rebase between):** `lib/health/registry.ts` (P1/P2/P3 all add entries), `packages/cli/src/index.ts` (P4/P5 both append a `program.addCommand`). Per the parallel-merge convention, build in parallel but merge sequentially and rebase.

---

## Phase 1 — Registry core

### Task 1.1: `HealthCheck` types

**Files:**
- Create: `packages/cli/src/lib/health/types.ts`
- Test: `packages/cli/src/lib/health/types.test.ts`

- [ ] **Step 1: Write the failing test** (a type-level + helper smoke; checks the `ok()`/`fail()`/`warn()` result builders exist)

```ts
import { describe, it, expect } from 'vitest';
import { ok, warn, fail } from './types.js';

describe('CheckResult builders', () => {
  it('ok() yields a passing result', () => {
    expect(ok('config valid')).toEqual({ status: 'ok', headline: 'config valid' });
  });
  it('fail() carries remediation + fixable flag', () => {
    expect(fail('missing config', { remediation: 'run crew init', fixable: true })).toEqual({
      status: 'fail', headline: 'missing config', remediation: 'run crew init', fixable: true,
    });
  });
  it('warn() defaults fixable to false', () => {
    expect(warn('baseline missing').fixable).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=crew-cli -- health/types`
Expected: FAIL — `Cannot find module './types.js'`.

- [ ] **Step 3: Implement the types**

```ts
// packages/cli/src/lib/health/types.ts
import type { ProjectConfig } from 'crew-shared';

export type CheckStatus = 'ok' | 'warn' | 'fail';

export interface CheckResult {
  status: CheckStatus;
  headline: string;
  remediation?: string;
  details?: Record<string, string>;
  fixable?: boolean;
}

export interface HealthContext {
  config: ProjectConfig;
  worktree: string;
  envVars?: Record<string, string>;
}

export interface HealthCheck {
  name: string;
  scope: 'project' | 'machine';
  detect: (ctx: HealthContext) => Promise<CheckResult>;
  fix?: (ctx: HealthContext) => Promise<void>;
}

type Extra = Omit<CheckResult, 'status' | 'headline'>;
export const ok = (headline: string, extra: Extra = {}): CheckResult => ({ status: 'ok', headline, ...extra });
export const warn = (headline: string, extra: Extra = {}): CheckResult => ({ status: 'warn', headline, ...extra });
export const fail = (headline: string, extra: Extra = {}): CheckResult => ({ status: 'fail', headline, ...extra });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=crew-cli -- health/types`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/lib/health/types.ts packages/cli/src/lib/health/types.test.ts
git commit -m "feat(health): HealthCheck types + CheckResult builders"
```

### Task 1.2: collect-all runner

**Files:**
- Create: `packages/cli/src/lib/health/run-health.ts`
- Test: `packages/cli/src/lib/health/run-health.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { runHealth } from './run-health.js';
import { ok, fail, type HealthCheck } from './types.js';

const ctx = { config: {} as any, worktree: '/tmp/x' };

describe('runHealth', () => {
  it('runs all checks and collects results (no fail-fast)', async () => {
    const checks: HealthCheck[] = [
      { name: 'a', scope: 'project', detect: async () => fail('boom') },
      { name: 'b', scope: 'project', detect: async () => ok('fine') },
    ];
    const results = await runHealth(checks, ctx);
    expect(results.map((r) => [r.check.name, r.result.status])).toEqual([['a', 'fail'], ['b', 'ok']]);
  });

  it('a throwing detect() becomes a fail result, not an exception', async () => {
    const checks: HealthCheck[] = [
      { name: 'x', scope: 'project', detect: async () => { throw new Error('kaboom'); } },
    ];
    const [r] = await runHealth(checks, ctx);
    expect(r.result.status).toBe('fail');
    expect(r.result.headline).toContain('kaboom');
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npm test --workspace=crew-cli -- health/run-health` → FAIL (module missing).

- [ ] **Step 3: Implement**

```ts
// packages/cli/src/lib/health/run-health.ts
import { fail, type CheckResult, type HealthCheck, type HealthContext } from './types.js';

export interface CheckOutcome { check: HealthCheck; result: CheckResult; }

export async function runHealth(checks: HealthCheck[], ctx: HealthContext): Promise<CheckOutcome[]> {
  const out: CheckOutcome[] = [];
  for (const check of checks) {
    let result: CheckResult;
    try {
      result = await check.detect(ctx);
    } catch (err) {
      result = fail(`${check.name} errored: ${(err as Error).message}`);
    }
    out.push({ check, result });
  }
  return out;
}
```

- [ ] **Step 4: Run to verify it passes** — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(health): collect-all runHealth runner"`

### Task 1.3: registry + two seed checks (`config-valid`, `env-materialized`)

**Files:**
- Create: `packages/cli/src/lib/health/checks/config-valid.ts`, `checks/env-materialized.ts`, `registry.ts` (+ tests)

- [ ] **Step 1: Write failing tests** for both checks over tmpdir fixtures and for `registry.ts` applicability:

```ts
// registry.test.ts
import { describe, it, expect } from 'vitest';
import { checksFor } from './registry.js';

describe('checksFor', () => {
  it('project scope excludes machine checks', () => {
    const names = checksFor('project').map((c) => c.name);
    expect(names).toContain('config-valid');
    expect(names).not.toContain('docker-socket'); // machine-scoped
  });
});
```

```ts
// checks/config-valid.test.ts
import { describe, it, expect } from 'vitest';
import { configValid } from './config-valid.js';

describe('config-valid', () => {
  it('ok when the config parses', async () => {
    const r = await configValid.detect({ config: { name: 'x' } as any, worktree: '/tmp/x' });
    expect(r.status).toBe('ok');
  });
});
```

- [ ] **Step 2: Run to verify fail** — FAIL (modules missing).

- [ ] **Step 3: Implement the two checks + registry.**

`config-valid.ts` — delegates to the `crew-shared` zod schema (schema-agnostic: when the schema changes, this check tracks it). `detect()` re-parses `ctx.config` via the shared `projectConfigSchema.safeParse`; `ok` on success, `fail` with the zod issue summary + `remediation: 'run crew init'` on failure. No `fix()` (re-authoring config is `init`'s job).

`env-materialized.ts` — `detect()`: if `ctx.config` declares an `env.toml`, confirm the referenced vars are present in `ctx.envVars` (or that `.env` exists in `worktree`); `fail({ remediation: 'crew env init', fixable: true })` when not. `fix()`: call the existing `runEnvInit` (`packages/cli/src/commands/env.ts`, `export async function runEnvInit`). 

`registry.ts`:

```ts
// packages/cli/src/lib/health/registry.ts
import type { HealthCheck } from './types.js';
import { configValid } from './checks/config-valid.js';
import { envMaterialized } from './checks/env-materialized.js';
// P2/P3 add their imports here.

const ALL: HealthCheck[] = [configValid, envMaterialized /* …extended in P2/P3 */];

export function checksFor(scope: 'project' | 'machine' | 'all'): HealthCheck[] {
  if (scope === 'all') return ALL;
  return ALL.filter((c) => c.scope === scope);
}
```

- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(health): registry + config-valid + env-materialized checks"`

---

## Phase 2 — Migrate the dispatch-critical checks + repoint the gate

> Depends on P1. **Regression guard:** the existing `lib/preflight/*.test.ts` must stay green throughout.

### Task 2.1: Absorb `verify-excluded-commands` → `checks/excluded-commands.ts`

**Files:**
- Create: `packages/cli/src/lib/health/checks/excluded-commands.ts` (+ test)
- Reference (do not delete yet): `packages/cli/src/lib/preflight/verify-excluded-commands.ts`

- [ ] **Step 1: Write the failing test** — port the assertions from `verify-excluded-commands.test.ts` to the `HealthCheck` shape: a config with `bruno_smoke.enabled` and a `.claude/settings.json` missing the bruno command yields `fail` with `fixable: true` and the same remediation entries; a settings file that already covers them yields `ok`.

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** `excludedCommands: HealthCheck` reusing the existing `requiredEntries(config)` logic (move/copy it). `detect()` reads `<worktree>/.claude/settings.json`, diffs required vs present, `ok`/`fail`. `fix()` merges the missing entries into `sandbox.excludedCommands` (array-merge, never replace) and writes the file back.

- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `git commit -m "feat(health): excluded-commands check (absorbs preflight)"`

### Task 2.2: Absorb `probe-app-urls` → `checks/app-url-resolves.ts`

- [ ] Mirror Task 2.1 for the app-URL probe: port `probe-app-urls.ts` logic into `app-url-resolves.ts` as a `scope: 'project'` check (`detect()` resolves the `app_url` template against `envVars`; `fail` when a `${VAR}` is unresolved — `remediation` points at `env.toml`). No `fix()` (unresolved env is `init`/`env init` territory; surfaced via `env-materialized`). Test, run, commit (`feat(health): app-url-resolves check`).

### Task 2.3: Rewrite `run-preflight.ts` as a fail-fast adapter

**Files:**
- Modify: `packages/cli/src/lib/preflight/run-preflight.ts`
- Add registry entries: `packages/cli/src/lib/health/registry.ts` (add `excludedCommands`, `appUrlResolves`)

- [ ] **Step 1: Write the failing test** (`run-preflight.test.ts` — keep existing cases; add one):

```ts
it('throws PreflightError on the first project-scope fail and ignores warns', async () => {
  // build a ctx whose excluded-commands check fails; assert PreflightError(name='excluded-commands')
});
```

- [ ] **Step 2: Run → FAIL** (new assertion).

- [ ] **Step 3: Implement** — `runPreflight(ctx)` calls `runHealth(checksFor('project'), ctx)`, finds the first `fail`, and throws `new PreflightError(check.name, result.headline, result.remediation ?? '', result.details ?? {})`. `warn`/`ok` do not gate. Keep `PreflightError` + `render-error.ts` unchanged. Delete the now-absorbed `verify-excluded-commands.ts` / `probe-app-urls.ts` **only after** their callers point at the adapter and all preflight tests pass.

- [ ] **Step 4: Run the FULL preflight + dispatch suite** — `npm test --workspace=crew-cli -- preflight run resume fix-pr` → all PASS (regression guard).
- [ ] **Step 5: Commit** — `git commit -m "refactor(preflight): run-preflight is a fail-fast adapter over lib/health"`

---

## Phase 3 — Remaining checks

> Depends on P1 (and merges `registry.ts` after P2). One check per file under `lib/health/checks/`, each with its own `*.test.ts` over tmpdir fixtures. Each is added to `registry.ts`'s `ALL` array.

Implement these as `HealthCheck`s with the stated `detect`/`fix` contracts (TDD: failing test → implement → pass → commit, one commit per check):

- [ ] **`playwright-config.ts`** (`project`) — `detect`: when `config.playwright?.enabled`, require `<worktree>/playwright.config.ts` and `<worktree>/tests/e2e/` to exist; `fail({ fixable: true })` otherwise. `fix`: scaffold both from the canonical template (shared with `crew init`'s scaffolder — extract to `lib/init/scaffold-playwright.ts` in P5 and import it here, or vice-versa; the scaffolder is the single source).
- [ ] **`chromium-installed.ts`** (`machine`) — `detect`: when any configured project has `playwright.enabled`, check the Playwright Chromium revision is installed (reuse the resolution in `lib/run/` that already locates Chromium). `fail({ fixable: true, remediation: 'npx playwright install chromium' })`. `fix`: run the install **only after an explicit confirm** (large/network — see spec §8); under non-interactive `--fix`, report-only unless `--yes`.
- [ ] **`bruno-skeleton.ts`** (`project`) — `detect`: when `config.bruno_smoke?.enabled`, require the `bruno/` collection skeleton. `fail({ fixable: true })`. `fix`: scaffold via the shared `lib/init/scaffold-bruno.ts`.
- [ ] **`docker-socket.ts`** (`machine`) — `detect`: `docker info` / socket reachable; `fail` with remediation (start Docker). No `fix` (can't start the daemon for the user).
- [ ] **`apt-deps.ts`** (`machine`) — `detect`: required apt packages present. **Skip gracefully** (return `ok` with a note) when the package manager isn't apt (spec §8). `fix`: print the `sudo apt install …` command (report-only — never run sudo non-interactively).
- [ ] **`baseline-present.ts`** (`project`, **warn-level**) — `detect`: `<worktree>/AGENTS.md` and `<worktree>/.agents/` exist; `warn({ remediation: 'run the establishing-a-new-project skill' })` when missing (never `fail` — the baseline is orthogonal). No `fix`.

After all six: `git commit -m "feat(health): machine + scaffold checks"` (or one commit per check).

---

## Phase 4 — `crew doctor`

> Depends on P1–P3. Merges `index.ts` with P5.

### Task 4.1: result renderer

**Files:** Create `packages/cli/src/lib/health/render.ts` (+ test).

- [ ] TDD: `renderReport(outcomes, { project })` returns a grouped string — `✓`/`⚠`/`✗` (picocolors) per finding with remediation indented, and a footer `N problems (M auto-fixable)`. Test asserts counts + that `ok` lines render `✓` and `fail` lines include remediation. Commit.

### Task 4.2: the command

**Files:** Create `packages/cli/src/commands/doctor.ts` (+ test); Modify `packages/cli/src/index.ts`.

- [ ] **Step 1: Write the failing test** — drive `runDoctor({ cwd, fix, all, projects })` (the testable core, mirroring how `env.ts` exposes `runEnvInit`):
  - a fixture project with one fixable `fail` → `runDoctor` returns `{ exitCode: 1, fixed: 0 }`; with `fix: true` → applies `fix()`, re-detects, returns `{ exitCode: 0, fixed: 1 }`.
  - `all: true` iterates every project TOML + machine checks once.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** `runDoctor` + the thin `doctorCommand` (commander) with `--fix` and `--all`. Resolve project via `discoverProjectConfig(cwd)`; for `--all` enumerate `~/.config/crew/projects/*.toml` via the loader. Build `HealthContext` (materialize env via the same path `env-materialized` uses). `exitCode = anyFail ? 1 : 0`. Register: add `program.addCommand(doctorCommand);` in `index.ts` (append — conflict point with P5).
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `git commit -m "feat(cli): crew doctor command"`

---

## Phase 5 — `crew init`

> Depends on P1 (registry types + `config-valid` for converge validation). Reuses scaffolders shared with P3 checks. Merges `index.ts` with P4.

### Task 5.1: scaffolders (pure, no prompts)

**Files:** Create `packages/cli/src/lib/init/{write-project-toml,write-env-toml,scaffold-playwright,scaffold-bruno,write-settings-json}.ts` (+ tests).

- [ ] TDD each scaffolder as a pure function `(answers, worktree) => void` writing to a tmpdir, asserting file contents. `write-project-toml` emits the **current** schema with `${VAR}` refs. `write-settings-json` seeds `sandbox.excludedCommands` (array-merge if the file exists). `scaffold-playwright`/`scaffold-bruno` are the **single source** also imported by the P3 checks' `fix()`. One commit per scaffolder (or one for the set).

### Task 5.2: the wizard + converge

**Files:** Create `packages/cli/src/commands/init.ts` + `packages/cli/src/lib/init/prompts.ts` (+ test); Modify `index.ts`.

- [ ] **Step 1: Write the failing test** — drive `runInit({ cwd, answers })` (inject answers to bypass `@inquirer/prompts` in tests):
  - empty repo → writes TOML + env.toml + (opted-in) skeletons + settings.json; asserts each artifact.
  - existing config → **converge**: loads current values as defaults, rewrites managed blocks; asserts a diverged hand-edited file triggers the confirm path (inject `confirmOverwrite: false` → file untouched).
  - missing baseline → result includes a `baselineWarning`.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** `runInit` (orchestrates the scaffolders + `runEnvInit` + the `baseline-present` detect for the warning) and the thin `initCommand` whose `.action()` gathers answers via `@inquirer/prompts` then calls `runInit`. Register `program.addCommand(initCommand);` in `index.ts`.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `git commit -m "feat(cli): crew init command"`

### Task 5.3: docs + agent-doc parity

- [ ] Update `README.md` (user-facing commands) and run the `agents-doc-parity-check` skill — `packages/cli/AGENTS.md` "Common gotchas" and `.agents/architecture.md`/`commands.md` may need the two new commands noted. Update whatever `covers:` globs flag. Commit `docs: document crew init / doctor`.

---

## Self-Review

- **Spec coverage:** §2 surface → P4/P5 + flags; §3 registry → P1; §3 dispatch-gate adapter → P2.3; §4 init (wizard, scaffold set, baseline boundary, idempotency) → P5; §5 doctor (checks, `--fix`, `--all`, exit codes) → P3+P4; §6 deferred → not built (correct); §7 testing → each task is TDD; §8 open-question leanings (keep `env init`, confirm big fixes, apt skip-gracefully) → encoded in P3 (`chromium-installed` confirm, `apt-deps` skip) and P5 (`env init` reused, not replaced). No gaps.
- **Placeholders:** the repetitive checks (P3) and scaffolders (P5.1) are specified by concrete per-item `detect`/`fix` contracts (inputs, the exact artifact checked, the exact fix), not "same as above" — but full bodies are left to the implementing agent since each is a short, mechanical read/compare/write against a named file. The load-bearing abstractions (types, runner, registry, gate adapter, doctor core) carry full code.
- **Type consistency:** `HealthCheck`/`CheckResult`/`HealthContext`/`runHealth`/`checksFor`/`runDoctor`/`runInit` names are used identically across phases. `runEnvInit` referenced by its real export.
