# CREW-80 — env.toml docs: README schema/maintenance section + setup-wizard followup amendment

Jira: https://safturento.atlassian.net/browse/CREW-80

## Goal

Document the new `env.toml` pipeline: a permanent README section (schema, materialization rules, commands, maintenance checklist) and a single-bullet amendment to the setup-wizard followup so future onboarding work scaffolds `env.toml` alongside the user-config TOML.

## Relevant files

- `README.md` — receives a new top-level `## Project setup with env.toml` H2 between `## Setup` and `## Status`.
- `docs/followups.md` — `### 2026-04-30 — Unified crew init / crew doctor onboarding helper` entry's "New project" bullet gains a clause for `env.toml` scaffolding.
- `docs/superpowers/plans/2026-05-02-env-toml-pipeline.md` — Task 9 is the source of the README content; copy verbatim where it specifies.
- `packages/cli/src/lib/env-spec/{types,resolve,materialize}.ts` — the maintenance checklist enumerates these as files to update on schema bumps.

## Decisions

- **Section placement** — the plan says "after the Playwright subsection… as a new top-level section before the next H2". The next H2 after `## Setup` is `## Status` (line 169). Inserting the new H2 between Setup and Status keeps the existing Setup subsection group intact.
- **No project-specific names in the maintenance checklist** — per CLAUDE.md ("don't hardcode 'Recipes-App'"), the checklist refers to "each project's bundled `scripts/setup.mjs`" generically rather than naming Recipes.

## Open questions

- None.

## Notes

Pure docs change — no tests, no build artifacts. Verification is grep-based: confirm the new H2 appears in `grep -n '^## ' README.md`, confirm the maintenance checklist enumerates types / Zod schema / resolver / materialize / README / project-side script / env.toml bump / tests / validate, and confirm the followup bullet now mentions `env.toml` scaffolding between the existing TOML walk-through and the Playwright `npm install` clause.
