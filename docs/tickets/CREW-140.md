# CREW-140 — `crew run` dispatch integration (T-B2)

Jira: https://safturento.atlassian.net/browse/CREW-140

## Goal

Wire the `crew figma-snapshot` work from CREW-139 into the dispatch flow so the agent gets the snapshot for free and is told to invoke `visual-fidelity-check` before claiming a UI-touching task done. Two surfaces: the `crew run` orchestration (pre-dispatch snapshot call), and the dispatched agent's run-prompt (gate section).

## Relevant files

- `packages/cli/src/commands/run.ts` — added pre-dispatch `runPreDispatchFigmaSnapshot` call (between MCP write and prompt build) and passed `visualFidelity` into `buildTicketPrompt`
- `packages/cli/src/lib/run/figma-snapshot-step.ts` — new orchestration helper wrapping `runFigmaSnapshot` with non-fatal logging semantics
- `packages/cli/src/lib/prompts/ticket.ts` — added `VisualFidelityPromptOptions` + `buildVisualFidelityBlock` helper, plumbed through `buildTicketPrompt`
- `packages/cli/src/lib/prompts/templates/ticket.md` — slotted `{{visualFidelityBlock}}` after the bruno-smoke block
- `packages/cli/src/lib/prompts/templates/ticket-visual-fidelity.md` — new template fragment

## Decisions

- **Non-fatal snapshot failures.** Per plan: when the snapshot generation errors (e.g. no `FIGMA_API_TOKEN`), surface a warning and let dispatch continue. The dispatched agent's `visual-fidelity-check` skill becomes a no-op for that run rather than blocking work entirely.
- **Gate-text content beyond the auto-discovered skill bullet.** The user-scoped `visual-fidelity-check` skill is already auto-discovered into the `discoveredSkillsBlock`, but the dedicated gate section adds the worktree-specific snapshot path + the project-specific component dir, which the skill description doesn't carry. The two surfaces complement each other: the discovered-skills bullet says "this skill exists, here's when to use it"; the gate section says "for this run, here's where the snapshot is + what counts as 'UI-touching'".
- **B2.3 end-to-end smoke deferred to manual verification.** The full smoke requires `FIGMA_API_TOKEN` set in the host shell + a fresh `crew run <KEY>` dispatch. Not viable inside an autonomous crew-dispatched worker. The wiring is covered by unit tests (`figma-snapshot-step.test.ts`, `builders.test.ts`) — surfaced as a manual-verify item in the PR description.

## Open questions

- [ ] none

## Ruled out

- **Threading `runFigmaSnapshot` directly into `runRun` without an orchestration helper.** Kept tests at the boundary — testing `runRun` itself would require pulling apart its procedural body, while the helper has clean inputs/outputs for the three behaviours that matter (skipped / ok / warning).

## Notes

Verification summary:
- `npm run typecheck --workspaces` — clean
- `npx vitest run packages/cli` — 608 passing
- `npm run lint` — clean
- `npm run bruno:smoke` — 10/10 passing (no daemon routes changed)
- Pre-existing `packages/dashboard` test failures (path-alias `@/data/state-meta` resolution) are present on `main` too — unrelated to this work.
