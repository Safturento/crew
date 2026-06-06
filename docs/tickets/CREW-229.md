# CREW-229 — T6: crew init command

Jira: https://safturento.atlassian.net/browse/CREW-229

## Goal

Add the `crew init` command: an `@inquirer/prompts` wizard that scaffolds the
crew-specific project layer and is idempotent — re-running converges (prompts
pre-filled from the current config, rewrites managed blocks, diffs + confirms
before overwriting a diverged file). It does **not** create the universal
baseline (`.agents/`, `AGENTS.md`, README, hygiene, `docs/`) — a CLI can't invoke
an agent skill; instead it detects the baseline and warns, pointing at the
`establishing-a-new-project` skill.

This is **Phase 5, Tasks 5.2–5.3** of the crew-init-doctor plan. Task 5.1
(scaffolders in `lib/init/`) shipped under T2; P1–P3 of the registry shipped
under CREW-226/227. P4 (`crew doctor`, T5) is not yet merged, so there is no
`index.ts` conflict to sequence against this run.

## Relevant files

- `packages/cli/src/lib/init/run-init.ts` (new) — the testable `runInit` core
- `packages/cli/src/lib/init/prompts.ts` (new) — `@inquirer/prompts` answer-gathering
- `packages/cli/src/commands/init.ts` (new) — thin command wrapper
- `packages/cli/src/lib/init/{write-project-toml,write-env-toml}.ts` — extract
  `render*` so converge can diff prospective content before writing
- `packages/cli/src/lib/init/{scaffold-playwright,scaffold-bruno,write-settings-json}.ts` — reused as-is
- `packages/cli/src/commands/env.ts` — `runEnvInit` (materializes `.env`)
- `packages/cli/src/lib/health/checks/baseline-present.ts` — the baseline detect
- `packages/cli/src/index.ts` — register `initCommand`
- `README.md` — document the new command

## Decisions

- **`runInit` lives in `lib/init/run-init.ts`, not the command file** — keeps the
  command thin per `packages/cli/AGENTS.md`. Mirrors how the testable core is
  separated from the commander wrapper everywhere except `env.ts`.
- **Converge by content comparison** — for the two wholesale-managed files (project
  TOML, `env.toml`) runInit renders the prospective content, compares to the
  on-disk bytes: identical → idempotent no-op (no prompt); differs → call the
  injected `confirmOverwrite`; decline → leave untouched and record as skipped.
- **Skeletons are presence-gated** — playwright/bruno scaffolds are one-time
  bootstraps; if the primary artifact already exists (`playwright.config.ts` /
  `<collection>/bruno.json`) runInit skips re-scaffolding rather than clobbering a
  real suite. `.claude/settings.json` is array-merged by its writer (never clobbers).
- **`runEnvInit` only when a `[docker]` block is configured** — `runMaterialize`
  hard-requires `docker.canonical_worktree`; without it there is no worktree-id to
  derive. `env.toml` is still written for later `crew env init`/`refresh`.

## Open questions

- [ ] None blocking. (Spec §8 leanings — keep `env init`, confirm big fixes, apt
      skip-gracefully — live in the doctor/health phases, not here.)

## Notes

`confirmOverwrite` accepts a `boolean | (file) => boolean | Promise<boolean>` so
tests can inject `confirmOverwrite: () => false` (plan's "decline → untouched"
case) and the real command wires it to an `@inquirer/prompts` confirm showing the
diff.
