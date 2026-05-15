# CREW-166 — AGENTS.md auto-load fix: CLAUDE.md @AGENTS.md shims

Jira: https://safturento.atlassian.net/browse/CREW-166

## Goal

Claude Code auto-loads `CLAUDE.md`, not `AGENTS.md`. Add thin `CLAUDE.md` →
`@AGENTS.md` shims at the repo root and in each package so the canonical
`AGENTS.md` content auto-loads for interactive sessions and `crew run`
dispatches alike. "Done" = the five shims exist and `.agents/README.md` no
longer claims `AGENTS.md` auto-loads.

## Relevant files

- `CLAUDE.md` — new root shim; `@AGENTS.md` import auto-loads at launch.
- `packages/{cli,daemon,dashboard,shared}/CLAUDE.md` — new per-package shims;
  `@AGENTS.md` resolves relative to the file, loading that package's own
  `AGENTS.md` on demand.
- `.agents/README.md:10` — corrected the false "AGENTS.md files auto-load"
  claim; now describes the `CLAUDE.md` shim mechanism.

## Decisions

- **Shims are thin, comment + one `@import` line.** `AGENTS.md` stays the
  canonical file; the shim comment says so explicitly to discourage edits.
- **`CLAUDE.md` is tracked normally.** It sits at repo/package roots, not
  under `.claude/`, so the `.claude/` ignore rule does not catch it
  (verified with `git check-ignore`).

## Notes

Implements Task 1 of `docs/superpowers/plans/2026-05-15-skill-storage-and-agents-autoload.md`.
Tasks 2 and 3 are tracked under sibling tickets of Epic CREW-169.
