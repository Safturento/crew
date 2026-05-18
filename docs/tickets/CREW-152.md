# CREW-152 — P4: refresh crew DS fixture + validate gate against PR #193

Jira: https://safturento.atlassian.net/browse/CREW-152

## Goal

Phase 4 (Tasks 4.1–4.3) of `docs/superpowers/plans/2026-05-13-visual-fidelity-render-frame-anchor.md`.
"Done" = the crew-135 skill fixture carries the full Composites-page render-composite
snapshot (with `enrichment.componentInstances`), and a validation run of the
`visual-fidelity-check` skill against the frozen PR #193 patch surfaces all three known
regressions at HIGH severity.

## Relevant files

- `.crew/figma-snapshot/composites/` — committed, git-tracked snapshot artifact (CREW-173); source of the fixture refresh.
- `docs/superpowers/skill-fixtures/visual-fidelity-check/crew-135/snapshot/composites/` — fixture dir replaced wholesale.
- `docs/superpowers/skill-fixtures/visual-fidelity-check/crew-135/pr-193.patch` — frozen diff carrying PR #193's regressions.
- `docs/superpowers/specs/2026-05-13-visual-fidelity-render-frame-anchor.md` — gets a "Validation run" section appended.

## Decisions

- **Snapshot is a committed artifact** — CREW-173 made `.crew/figma-snapshot/` git-tracked. No `crew figma-snapshot` run; the worktree already has it. Copy (`cp`, not `mv`) into the fixture.
- **Fixture includes `snapshot/index.json` + `meta.json`** — Task 4.1 copies `composites/` _and_ the snapshot-root `index.json` (node → `{name, paths}` map) and `meta.json`, so the fixture is self-contained. The render-frame Step 4 name-resolution path (caller → composite by component name) depends on `index.json`; a `composites/`-only copy would force resolution against the out-of-fixture `.crew/` artifact.
- **Validation uses the frozen patch, not a live CREW-135 branch** — that branch was overwritten by a fresh re-dispatch; `pr-193.patch` is the frozen source of #193's regressions.

## Open questions

- [ ] None at start.

## Notes

If any of the three regressions fails to surface as HIGH, that's a spec input — pause and
surface, do not fix inline (per ticket Notes).
