# `crew init` / `crew doctor` — design

> **Purpose of this document.** A scoped design spec for two new CLI commands — `crew init` (interactive, scaffolds/converges a project's crew-specific setup) and `crew doctor` (non-interactive, diagnoses + fixes project and machine health) — built over a single shared **health-check registry** that also becomes the source of truth for the existing dispatch-time preflight gate. Config-schema rationalization and per-config-block reference docs are explicitly **deferred** (see §6); this spec builds against the current schema and is schema-agnostic by construction.
>
> Source: the 2026-04-30 "Unified `crew init` / `crew doctor` onboarding helper" followup (+ its 2026-06-05 update binding it to the `establishing-a-new-project` skill). Read `packages/cli/AGENTS.md` (thin-command rule) and `.agents/architecture.md` for system context.

## 1. Scope

**In scope:**

- A shared **`lib/health/`** module: a `HealthCheck` abstraction + a registry of project- and machine-scoped checks, each with `detect()` and an optional `fix()`.
- Refactor the existing `lib/preflight/` checks into that registry, and repoint the dispatch gate (`run`/`resume`/`fix-pr`) at it via a fail-fast adapter — so "healthy" is defined once and consumed three ways (dispatch gate, `doctor`, `doctor --fix`).
- **`crew init`** — interactive wizard (via the already-present `@inquirer/prompts`) that writes the crew-specific project layer and is safe to re-run (idempotent converge).
- **`crew doctor`** — non-interactive diagnosis with `--fix` and `--all`, CI-friendly exit codes.

**Out of scope (see §6):** config rationalization (`[app] url` consolidation), per-config-block reference docs, `.claude/settings.json` per-worktree ownership, and the global/repo-local doc-parity double-warn (handled manually outside this work).

## 2. Command surface

| Command | Mode | Purpose |
| --- | --- | --- |
| `crew init` | interactive | Set crew up for the current repo — wizard → write config + scaffolds. Idempotent: re-running converges (prompts pre-filled, rewrites managed blocks, diffs + confirms before overwriting hand-edits). |
| `crew doctor` | non-interactive | Report the current project's health (✓/⚠/✗ + remediation). Exit `1` if unhealthy. |
| `crew doctor --fix` | non-interactive | Apply the auto-fixable findings, then re-report. |
| `crew doctor --all` | non-interactive | Every configured project (`~/.config/crew/projects/*.toml`) + machine-wide checks. |

**Boundary:** `init` *creates/converges* (interactive, write-heavy); `doctor` *diagnoses/heals* (scriptable, machine-aware). They never overlap in intent — only in the check logic underneath, which lives in the shared registry.

## 3. Shared core — the health-check registry (`lib/health/`)

Generalize the existing `PreflightCheck` (`packages/cli/src/lib/preflight/types.ts`, today `{ name, run(ctx) }` that throws `PreflightError`) into a richer, collectible check:

```ts
type CheckStatus = 'ok' | 'warn' | 'fail';

interface CheckResult {
  status: CheckStatus;
  headline: string;                 // one-line summary
  remediation?: string;             // how to fix (shown for warn/fail)
  details?: Record<string, string>;
  fixable?: boolean;                // true iff fix() exists and is safe to auto-apply
}

interface HealthContext {
  config: ProjectConfig;            // from discoverProjectConfig / loadProjectConfig
  worktree: string;
  envVars?: Record<string, string>; // materialized env.toml (when present)
}

interface HealthCheck {
  name: string;                     // stable id, reused in logs + reports
  scope: 'project' | 'machine';
  detect: (ctx: HealthContext) => Promise<CheckResult>;
  fix?: (ctx: HealthContext) => Promise<void>;   // present iff safely auto-fixable
}
```

**Module layout:**

```
packages/cli/src/lib/health/
├── types.ts            # the interfaces above
├── checks/
│   ├── config-valid.ts        # zod-parse the TOML (schema-agnostic: delegates to schema.ts)
│   ├── env-materialized.ts    # env.toml refs resolve / .env present
│   ├── excluded-commands.ts   # absorbs lib/preflight/verify-excluded-commands.ts
│   ├── app-url-resolves.ts    # absorbs lib/preflight/probe-app-urls.ts logic
│   ├── playwright-config.ts   # playwright.config.ts + tests/e2e present when opted in
│   ├── chromium-installed.ts  # machine: Chromium present for Playwright projects
│   ├── bruno-skeleton.ts      # bruno collection present when opted in
│   ├── docker-socket.ts       # machine: docker socket reachable
│   ├── apt-deps.ts            # machine: required apt packages installed
│   └── baseline-present.ts    # warn-level: .agents/ + AGENTS.md present (see §4)
├── registry.ts         # assembles the applicable checks for a given project/scope
└── run-health.ts       # runs all applicable checks, COLLECTS results (no fail-fast)
```

- **`run-health.ts`** runs every applicable check and returns `{ check, result }[]` — it never throws on a failing check.
- **Dispatch gate adapter** (`lib/preflight/run-preflight.ts` becomes thin): runs the `scope: 'project'` checks via the registry and throws `PreflightError(name, headline, remediation, details)` on the first `fail`, preserving today's behavior for `run`/`resume`/`fix-pr`. `warn` results do not gate dispatch.
- `PreflightError` and the `lib/preflight/render-error.ts` remediation rendering are retained (dispatch-path UX unchanged).

**Refactor risk:** the preflight checks are dispatch-critical. The existing `lib/preflight/*.test.ts` suite is the regression guard — it must stay green through the migration; each absorbed check keeps its current behavior under the new shape.

## 4. `crew init`

A thin command (`src/commands/init.ts`) over `src/lib/init/`. Resolves the target repo from `cwd`; if a project config already exists it enters **converge** mode (defaults pre-filled from the current TOML/`env.toml`).

**Wizard prompts** (`@inquirer/prompts`), each defaulted:

- project name (default: repo dir basename), orchestration ports (daemon/dashboard), `app_url` template, contexts, and opt-ins: **Playwright e2e? · Bruno smoke? · Docker stack?**

**What it writes (crew-specific layer only):**

1. `~/.config/crew/projects/<name>.toml` — current schema; `${VAR}` refs for `[playwright].app_url` / `[bruno_smoke].base_url`. Writing this *is* registration (discovery is `cwd`-match via `discoverProjectConfig`; no separate registry).
2. repo `env.toml`, then invoke the **existing `crew env init`** (`lib/.../runEnvInit`) to materialize `.env`.
3. if Playwright opted in: `npm i -D @playwright/test` + scaffold `playwright.config.ts` + `tests/e2e/` skeleton.
4. if Bruno opted in: scaffold the collection skeleton.
5. `<repo>/.claude/settings.json` if absent; if a Docker stack is present, seed `sandbox.excludedCommands` with the smoke/e2e commands.

**Universal-baseline boundary.** `crew init` does **not** create the `establishing-a-new-project` baseline (`.agents/`, `AGENTS.md`, `CLAUDE.md` shim, README, `.gitattributes`/`.gitignore`, `docs/` tree) — a CLI cannot invoke an agent skill, and duplicating it is explicitly rejected by the followup. init *detects* the baseline (`baseline-present` check) and, if missing, prints a warning pointing at the skill, then proceeds. The baseline and the crew-specific layer are orthogonal and authored by different actors.

**Idempotency.** On re-run, init loads the current TOML/`env.toml` as prompt defaults and rewrites only the managed blocks. Before overwriting a file that has diverged from what crew last wrote, it shows a diff and asks for confirmation — never silent clobber.

## 5. `crew doctor`

A thin command (`src/commands/doctor.ts`) that drives `lib/health/run-health.ts` and renders results.

- **Project checks** (`scope: 'project'`): config-valid · env-materialized · excluded-commands · app-url-resolves · playwright-config · bruno-skeleton · baseline-present *(warn)*.
- **Machine checks** (`scope: 'machine'`, run under `--all`): apt-deps · chromium-installed (for Playwright projects) · docker-socket.
- **Rendering:** grouped per project (+ a machine section), each finding `✓`/`⚠`/`✗` with its remediation; footer `N problems (M auto-fixable)`. Uses the existing `ora`/`picocolors` CLI deps.
- **Exit codes:** `0` when no `fail` results; `1` when any `fail` (warns alone do not fail the exit — CI gate is for hard failures).
- **`--fix`:** runs `fix()` for every `fixable` `fail` (e.g. write missing `playwright.config.ts`, add an `excludedCommand`, run `env init`, `playwright install chromium`), then re-runs detection and reports the residual. Non-fixable fails are reported with a manual remediation (often "run `crew init`").
- **`--all`:** iterates every `~/.config/crew/projects/*.toml`, runs each project's project-scope checks, then the machine-scope checks once.

## 6. Deferred — and why

Both deferred config items sit **downstream of a schema change** that init/doctor are deliberately built not to depend on (the registry's `config-valid` check delegates to `schema.ts`; the wizard maps prompts to whatever blocks exist). They neither block nor are blocked by this work, and benefit automatically when they land.

- **Config rationalization (`[app] url` consolidation).** A schema redefinition + breaking migration (codemod over existing TOMLs, updates to `derive-urls`/docker/playwright/bruno/dispatch). It is a separate, higher-risk effort with its own spec; bundling it would couple a risky migration to a new-feature ship and force the wizard to be designed against a moving schema. The followup's own framing — *"coordinate with the onboarding helper so `crew init` writes the new shape"* — places init **downstream** of rationalization. When it lands, init's TOML writer + `config-valid` point at the new shape.
- **Per-config-block reference docs.** Documentation, not behavior; the followup gates it as a *"one-shot writing pass after the config rationalization spec lands"* (writing exhaustive per-option docs now documents a schema about to change). doctor's contextual remediation strings already deliver just-in-time config guidance and *reduce* the need; once the reference doc exists, remediation messages can link to it (a one-line enhancement).
- **`.claude/settings.json` per-worktree ownership** — gated on empirical bwrap/socat validation; separate.
- **Doc-parity double-warn** — a one-time hook de-dup, handled manually; its followup moves to Resolved separately.

## 7. Testing

- **Registry:** unit-test each `HealthCheck.detect()` over tmpdir fixture project dirs (asserting `ok`/`warn`/`fail` + remediation), and each `fix()` for correctness + idempotency (running it twice is a no-op the second time).
- **Dispatch-gate regression:** the existing `lib/preflight/*.test.ts` suite stays green; add a test asserting the adapter throws `PreflightError` on the first project `fail` and ignores `warn`.
- **`crew init`:** with mocked prompt answers, assert each scaffolded artifact (TOML, `env.toml`, playwright/bruno skeletons, `.claude/settings.json`) is written correctly; assert idempotent re-run shows-diff-then-converges and does not clobber a diverged file without confirmation.
- **`crew doctor`:** report rendering, `--fix` application + residual re-report, exit codes (`0`/`1`), and `--all` iteration, over fixture projects.
- **No Bruno/HTTP:** both commands are pure CLI — confirm no daemon route is added (no `bruno/` endpoint needed).

## 8. Open questions

- **`crew init` ↔ `crew env init` overlap:** init calls `runEnvInit`; should standalone `crew env init` be kept as-is, or eventually surfaced as a subset of `init`? (Lean: keep `env init` — it's the narrow re-materialize path used on fresh worktrees; init is the full setup.)
- **Machine-check fix autonomy:** is `playwright install chromium` (network + ~150MB download) safe to run under `--fix`, or should it be report-only with the command surfaced? (Lean: gate large/network fixes behind an explicit confirm even under `--fix`.)
- **`apt-deps` portability:** the apt check is Debian/Ubuntu-specific (matches the WSL/Ubuntu target). Should it no-op with a note on non-apt machines rather than fail? (Lean: yes — detect package manager, skip gracefully.)
