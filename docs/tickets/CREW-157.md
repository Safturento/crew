# CREW-157 — migrate .agents/testing.md

Jira: https://safturento.atlassian.net/browse/CREW-157

## Goal

Populate the `.agents/testing.md` stub with a synthesis of crew's testing rules: Bruno collection layout, the same-commit-as-route-change rule (linking to the user-level skill rather than duplicating it), Playwright e2e config, daemon fixture seeding (`CREW_SEED_FIXTURES`), and the sandboxed-vs-un-sandboxed `excludedCommands` exception. Remove the inline Bruno section from root `AGENTS.md`; the index entry already points at `.agents/testing.md`.

## Relevant files

- `.agents/testing.md` — target topic doc (stub today; full content after this ticket).
- `AGENTS.md` — root; loses the inline "Bruno collection" section; index entry kept.
- `bruno/` — collection root with `endpoints/`, `flows/`, `environments/` (gitignored).
- `packages/dashboard/playwright.config.ts` — baseURL resolution from worktree `.env` `APP_URL`.
- `packages/daemon/seeds/dev.ts` — fixture seed, called from `serve.ts` when `CREW_SEED_FIXTURES=1`.
- `packages/cli/src/lib/env-spec/materialize.ts` — auto-injects `CREW_SEED_FIXTURES=1` for non-canonical worktrees.
- `.claude/settings.json` — `excludedCommands` for `bruno:smoke` + `test:e2e`.

## Decisions

- **No source doc to delete.** Synthesis-only ticket (per plan §"Ticket #4"); no `docs/plans/<topic>.md` to retire and no `docs/rationale/testing.md` to create.
- **Pointer, don't duplicate.** Naming conventions and `vars:post-response` chaining belong to the user-level `bruno-collection-maintenance` skill; the topic doc links to it for trigger events.
- **Surface the `CREW_SEED_FIXTURES` canonical-skip rule.** `materialize.ts` only injects the seed flag for non-canonical worktrees — that asymmetry is the surprising part agents need to know when reasoning about why their local stack has no fixtures.

## Open questions

- [ ] None.

## Ruled out

- Moving Bruno section to `.agents/bruno.md` instead of consolidating under `.agents/testing.md` — plan calls for one topic doc per the four Phase 2 testing surfaces (Bruno, Playwright, fixtures, sandbox exception). Splitting would fragment the index and break the "one doc per `covers:` scope" rule from `.agents/README.md`.

## Notes

Content audit (per Ticket #2 procedure, Step 2):

| Source section                                                        | Tag | Destination                                               |
| --------------------------------------------------------------------- | --- | --------------------------------------------------------- |
| Root `AGENTS.md` "Bruno collection" — bullets                         | A   | `.agents/testing.md` (condensed)                          |
| Root `AGENTS.md` "Bruno collection" — same-commit rule                | A   | `.agents/testing.md` (link to skill)                      |
| Per-package "Adding Bruno endpoint" index entries                     | A   | already correct; no change                                |
| Sandbox exception note inline in root `AGENTS.md` "Local development" | A   | kept in `.agents/local-dev.md`; testing doc cross-refs it |
| `packages/daemon/seeds/dev.ts` JSDoc                                  | A   | summarized + linked                                       |

No R (rationale) content surfaced — this is operational, not narrative. No S (stale) content.
