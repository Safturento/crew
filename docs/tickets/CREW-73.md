# CREW-73 — Mandate a final `echo '→ PR <url>'` so dispatch wrap-up always ends on a tool call

Jira: https://safturento.atlassian.net/browse/CREW-73

## Goal

The three dispatch templates (`ticket.md`, `resume.md`, `fix-pr.md`) must instruct the agent that its absolute last action is a single `Bash` tool call printing either `→ PR <url>` (PR-opening dispatches) or `→ no-pr: <reason>` (epic guard / hand-back / hard failure). This kills the silent-tail symptom where prose-only wrap-ups make the run look dead even after success.

## Relevant files

- `packages/cli/src/lib/prompts/templates/ticket.md` — add Step 12 after the Jira "In Review" transition.
- `packages/cli/src/lib/prompts/templates/resume.md` — append a `## Final report` section.
- `packages/cli/src/lib/prompts/templates/fix-pr.md` — append a `## Final report` section.
- `packages/cli/src/lib/prompts/builders.test.ts` — focused assertion for the literal `echo "→ PR $(gh pr view` contract; refresh affected snapshots.
- `packages/cli/src/lib/prompts/resume.test.ts` — focused assertion for the resume builder.
- `packages/cli/src/lib/prompts/__snapshots__/builders.test.ts.snap` — auto-update via `vitest -u`.

## Decisions

- **One literal contract assertion per builder.** Snapshots catch unintended diff; the focused `echo "→ PR $(gh pr view` substring check catches the deliberate contract regressing (e.g. someone replaces it with `Bash gh pr view ...`). Cheap and load-bearing.
- **Resume's no-PR echo includes the `2>/dev/null || echo none` fallback.** Resume can be invoked when no PR exists yet; the inline shell fallback keeps the line single-tool-call without forcing the agent to branch.
- **No crew-side parsing of the echo line.** Out of scope per ticket — the user reads it directly off the tail. Parsing belongs in the structured-report follow-up captured in `docs/followups.md`.

## Out of scope

- Defining a structured JSON final-report payload — see `docs/followups.md` → "Structured final-report contract for agent dispatches".
- Touching CREW-72's `assistant.text` / `pr-link` rendering work.

## Notes

Acceptance criteria from the Jira ticket:

- All three templates carry the contract.
- Snapshot tests updated, focused assertion added, existing tests stay green.
- `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm run test:run` all pass.
