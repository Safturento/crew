# CREW-168 — De-reference personal skills + documentation updates

Jira: https://safturento.atlassian.net/browse/CREW-168

## Goal

Final ticket of Epic CREW-169. Remove crew's hard references to the
maintainer's personal `reaching-for-*` skills, and bring every remaining doc
into line with the corrected model: crew-owned skills committed in-repo at
`.claude/skills/`, injected into dispatched worktrees, discovered natively by
Claude Code. "Done" = no `reaching-for-*` references outside historical
`docs/`; no stale `discoverSkills` references implying live code; README
documents the required Claude Code plugins and that crew is otherwise
self-contained.

## Relevant files

- `packages/daemon/AGENTS.md` — dropped the `user-level reaching-for-backend-patterns`
  clause from the "Writing a new route or service" row; kept `.agents/architecture.md`.
- `packages/dashboard/AGENTS.md` — dropped the `user-level reaching-for-frontend-libraries`
  clause from the "Writing a React component" row; also corrected the now-stale
  "user-level" qualifier on `visual-fidelity-check` (a crew-owned skill).
- `.agents/testing.md` — both `bruno-collection-maintenance` references now
  describe it as a crew-owned, in-repo skill injected + natively discovered.
- `README.md` — rewrote the `bruno-collection-maintenance` paragraph; added a
  "Required Claude Code plugins" section.
- `docs/superpowers/specs/2026-05-13-agent-progressive-disclosure-system.md` —
  appended a correction note to the risk-table row claiming Claude Code reads
  `AGENTS.md` natively.

## Decisions

- **`.agents/dispatch.md` needed no change.** Plan Task 3 Step 2 asked for a
  rewrite of its "Skill injection" / "Discovered skills" sections, but CREW-167
  (PR #222, merged) already rewrote them to the corrected unconditional-injection
  model — see the CREW-167 ticket file. The lone surviving `discoverSkills`
  reference in dispatch.md is an intentional, explicitly-superseded historical
  pointer, left as-is.
- **Corrected `visual-fidelity-check`'s "user-level" qualifier too.** Plan Step 1
  named only `reaching-for-*`, but the same row in `packages/dashboard/AGENTS.md`
  carried an equally-stale `user-level` label on `visual-fidelity-check`, which
  is now crew-owned. Fixed it in the same pass — bringing every doc into line is
  the ticket's stated goal.
- **Root `AGENTS.md` left unchanged.** Its only skill mention
  (`agents-doc-parity-check`) carries no user-level qualifier; the trigger text
  stays accurate.

## Notes

Implements Task 3 of
`docs/superpowers/plans/2026-05-15-skill-storage-and-agents-autoload.md`
(Parts 2e + 4 of the design spec). Docs-only change — no code, no routes, no UI.
