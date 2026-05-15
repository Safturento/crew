# CREW-162 — Phase 2: author `.agents/commands.md` + final root `AGENTS.md` lean cleanup

Jira: https://safturento.atlassian.net/browse/CREW-162

## Goal

Replace the stub `.agents/commands.md` with a real npm scripts cheatsheet, and remove the temporary Phase 2 migration notice from root `AGENTS.md` now that every topic has migrated. This is the last Phase 2 ticket — once it lands the progressive-disclosure system is feature-complete.

## Relevant files

- `.agents/commands.md` — was a one-line stub; now the cheatsheet.
- `AGENTS.md` — drop the "_Below this section, content is being migrated…_" blockquote. File is 42 lines (≤60 target).
- `docs/plans/` — already gone before this ticket; nothing to remove.

## Decisions

- **Treat the cleanliness sweep as `lint + format:check + typecheck + test:run` (no `build`).** The plan listed `build` too, but no service runs from precompiled output for unit/smoke flows. Build remains useful when shipping a dashboard bundle, but it isn't part of the every-PR sweep. Documented as such.
- **No new docs cross-links beyond `testing.md` / `local-dev.md` / `dispatch.md`.** Those are the three siblings `commands.md` actually overlaps with. The "See also" footer mirrors the convention used in `testing.md`.
- **Workspace names, not directory names.** The cheatsheet calls this out once at the top so per-package examples (`--workspace=crew-dashboard`, `--workspace=crew-daemon`) read unambiguously.

## Open questions

_None._

## Ruled out

- Adding `npm run baseline:capture` to the cleanliness sweep — it touches the docker stack and is an operational tool, not a verification gate. Documented in "Other root scripts" instead.

## Notes

Part B of the ticket scope ("Remove `docs/plans/` if empty") was a no-op: the directory was already cleaned up earlier in Phase 2. The plan's `wc -l AGENTS.md` ≤60 check passes at 42.
