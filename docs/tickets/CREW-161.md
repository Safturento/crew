# CREW-161 — `.agents/workflow.md` (synthesis)

Jira: https://safturento.atlassian.net/browse/CREW-161

## Goal

Replace the stub at `.agents/workflow.md` with a crew-specific overlay of the user-level CLAUDE.md planning workflow. Names the CREW-\* Jira prefix, mirrors the doc-taxonomy table from `.agents/README.md` §10, captures crew's branching convention, and points at user-level rules (followup format, planning workflow) rather than copying them.

## Relevant files

- `.agents/workflow.md` — populated (was stub from CREW-154)
- `docs/superpowers/plans/2026-05-13-agent-progressive-disclosure-system.md` — "Ticket #8" defines scope + content

## Decisions

- **Pointer-not-copy for user-level rules.** Per ticket acceptance criterion: don't duplicate user-level CLAUDE.md's "Planning workflow" or "Followup detection" sections. Link to the section by name instead. Keeps `~/.claude/CLAUDE.md` as the source of truth and `.agents/workflow.md` as the repo overlay.
- **Branching convention sampled from recent history.** `git log --oneline -30` + `git branch -a` show two dominant patterns on crew: `CREW-<n>` for ticketed work (dispatched by `crew run`) and `feat/<scope>` / `docs/<scope>` / `chore/<scope>` / `fix/<scope>` for non-ticketed work. Documented both — `crew run` creates CREW-\* branches automatically.
- **Doc taxonomy is a pointer to `.agents/README.md` §10**, not a re-listing. That table is the canonical source; this doc names the crew-specific instances (filenames, locations).

## Open questions

- [ ] none

## Ruled out

- Restating the full planning-workflow checklist here — duplicates user-level CLAUDE.md and rots independently. Pointer suffices.

## Notes

Validator + cleanliness commands pass per acceptance criteria.
