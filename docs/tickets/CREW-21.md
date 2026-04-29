# CREW-21 — Authored Playwright tests: prompt fragment + schema partial-rejection

Jira: https://safturento.atlassian.net/browse/CREW-21

## Goal

The dispatched agent gets an "Authored Playwright test" section in its prompt
when the project config sets `[visual_testing.authored]`, instructing it to
write `*.spec.ts` files in the configured `tests_dir` and run them via the
configured `test_command`. Schema must reject partial sub-tables (`tests_dir`
without `test_command`, or vice-versa). The "γ" of the visual-testing epic
(CREW-18).

Plan: [`docs/superpowers/plans/2026-04-28-visual-testing-via-playwright-mcp.md`](../superpowers/plans/2026-04-28-visual-testing-via-playwright-mcp.md),
tasks 13–16.

## Relevant files

- `packages/cli/src/lib/config/schema.ts` — already declares the
  `authored` sub-schema with both fields required (CREW-19). Verify nothing
  needs tightening when adding rejection tests.
- `packages/cli/src/lib/config/loader.test.ts` — append two failing-parse
  cases for partial `[visual_testing.authored]`.
- `packages/cli/src/lib/prompts/templates/ticket-visual-authored.md` — new
  template with `{{testsDir}}` and `{{testCommand}}` placeholders.
- `packages/cli/src/lib/prompts/ticket.ts` — extend `buildVisualTestingBlock`
  to render the authored fragment when `vt.authored` is set.
- `packages/cli/src/lib/prompts/builders.test.ts` — assertions for authored
  rendering (presence, ordering, omission).
- `README.md` — append "Authoring committed Playwright tests" paragraph to
  the existing "Visual testing (per project, optional)" subsection.

## Decisions

- **CREW-20 (β/smoke fragment) is not yet merged.** γ ships standalone:
  `buildVisualTestingBlock` returns the authored fragment alone when
  `vt.authored` is set, otherwise returns empty. When β merges, it can
  prepend the smoke fragment so both fragments concatenate as the plan
  envisioned. γ's tests assert only on authored content; the
  smoke-comes-first ordering assertion in plan task 14 is deferred to the β
  merge integration.
- **Schema is already strict.** Both `tests_dir` and `test_command` are
  declared `z.string().min(1)` (no `.optional()`), so Zod rejects partials
  by default. Task 13 only adds tests, no schema change.

## Out of scope

- `@playwright/test` install in target repos (Recipes, crew dashboard) —
  separate prerequisite tickets per the plan.
- Smoke-fragment integration ordering — handled when CREW-20 merges.

## Notes

The authored fragment instructs the agent to surface a "missing prereq" note
in the PR description rather than silently skipping when `tests_dir` doesn't
exist or `test_command` fails because the runner isn't installed. This
matches the plan's "fail-fast and surface the gap" stance.
