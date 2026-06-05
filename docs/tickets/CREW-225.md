# CREW-225 — T2: Project scaffolders (`lib/init/` writers)

Jira: https://safturento.atlassian.net/browse/CREW-225

Part of Epic [CREW-223](https://safturento.atlassian.net/browse/CREW-223) (`crew init` / `crew doctor`).
Plan: `docs/superpowers/plans/2026-06-05-crew-init-doctor.md` → Phase 5, Task 5.1.

## Goal

Five pure, prompt-free file-writing scaffolders under `packages/cli/src/lib/init/`. Each is a
plain function `(answers, dir) => writtenPaths` that writes deterministic artifacts into a given
worktree (or projects dir). They are the **single source** that both `crew init` (T6) and the
auto-`fix()` of the playwright/bruno health checks (T4) call — no coupling between those consumers.

## Scope

- `types.ts` — shared `InitAnswers` shape consumed by the scaffolders.
- `write-project-toml.ts` — emits the current `projectConfigSchema` shape as TOML with `${VAR}`
  refs for `playwright.app_url` / `bruno_smoke.base_url`. Writes `<projectsDir>/<name>.toml`.
- `write-env-toml.ts` — the repo `env.toml` (a valid `env-spec`: orchestration ports + APP_URL /
  DAEMON_URL templates).
- `scaffold-playwright.ts` — `playwright.config.ts` + `tests/e2e/` skeleton.
- `scaffold-bruno.ts` — bruno collection skeleton (`bruno.json`, an environment, a health
  endpoint, a smoke flow).
- `write-settings-json.ts` — seed `sandbox.excludedCommands`; **array-merge** if the file exists,
  never replace.

## Acceptance

- Each scaffolder unit-tested writing into a tmpdir with asserted contents.
- `write-settings-json` merges rather than clobbers an existing settings file.
- `npm test --workspace=crew-cli` is green.

## Decisions

- **Pure functions, explicit destination dir.** Scaffolders never read `process.cwd()` or prompt —
  the wizard (T6) and the health-check `fix()`s (T4) pass the worktree/projects dir in. Keeps them
  trivially unit-testable and reusable by both consumers.
- **`write-project-toml` builds a JS object and `smol-toml`-stringifies it**, then the test asserts
  by re-parsing through `projectConfigSchema` (validity is the contract, not byte-exact layout).
- **`write-env-toml` is a hand-authored string template** (inline tables, human-editable) validated
  by re-parsing through `parseEnvSpec`. Re-uses the canonical orchestration/APP_URL/DAEMON_URL
  pattern from the repo `env.toml`.
- **`write-settings-json` computes its `excludedCommands` from the same rules as
  `lib/preflight/verify-excluded-commands.ts`** (`npm run bruno:smoke*`, `<test_command>*`,
  `docker compose*`). Kept local to the scaffolder for now; P2 (T3) owns the eventual single-source
  consolidation into `lib/health`.
- **Not added to `lib/index.ts` barrel** — mirrors `lib/preflight`, which is also imported directly
  by its consumers rather than re-exported.

## Relevant files

- `packages/cli/src/lib/init/` — new home for all five scaffolders + `types.ts` + `index.ts`.
- `packages/shared/src/config/schema.ts` — the `projectConfigSchema` shape `write-project-toml` emits.
- `packages/cli/src/lib/env-spec/types.ts` — the `envSpecSchema` `write-env-toml` must satisfy.
- `packages/cli/src/lib/preflight/verify-excluded-commands.ts` — the `excludedCommands` entry rules.
- `packages/dashboard/playwright.config.ts`, `bruno/` — shape references for the skeletons.

## Notes

Out of scope for this ticket: the wizard/prompts (T6), the health checks that consume these
scaffolders (T3/T4), and `crew init` registration in `index.ts`. This is purely the writer layer.
