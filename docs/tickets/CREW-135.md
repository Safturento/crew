# CREW-135 — T1: Pill primitives — Button/Badge/Tag color × intensity contract

Jira: https://safturento.atlassian.net/browse/CREW-135

## Goal

Reconcile the dashboard's pill primitives with the consolidated Figma Pill set.
Extract an internal `PillBase` that owns the shared anatomy; rebuild `Button` /
`Badge` / add `Tag` as thin wrappers; replace the boolean `hasIcon`/CSS-dot with
a real `icon: ReactNode` slot; tighten Button's size axis to 4 (`xs|sm|md|lg`);
retire `StateBadge` + `CountBadge` (folded into `Badge`). All callers migrate.

## Inputs

- Spec: `docs/superpowers/specs/2026-05-13-pill-contract-correction.md`
- Plan: `docs/superpowers/plans/2026-05-13-pill-contract-correction.md`
- Calibration fixture (closed PR #193 frozen diff + ground-truth findings):
  `docs/superpowers/skill-fixtures/visual-fidelity-check/crew-135/`

## Re-dispatch context

Third attempt. PR #177, #188, #193 all closed. The plan/spec were written against
PR #188's branch state; `main` is actually further back — it has neither
`lib/pill-variants.ts` nor `ui/tag.tsx`, and `StateBadge`/`CountBadge` still exist.
So Phase 1 *creates* `pill-variants.ts` + `tag.tsx` (plan says "edit"/"keep") and
Task 1.5 (delete StateBadge/CountBadge) is in scope, not a no-op.

## Decisions

- **`pill-variants.ts` reused verbatim from the frozen PR #193 diff** — the spec
  marks the surface-class logic correct and out of scope for re-litigation.
- **New Run button uses `color="idle"`, not `color="white"`** — fixture finding F4:
  Figma's New Run pill is `color=idle, intensity=loud`. The plan's `color="white"`
  example was a known bug; corrected here.
- **`visual-fidelity-check` skill is the oracle for per-instance caller props** —
  intensity / icon choices verified against `.crew/figma-snapshot` enrichment.

## Notes

Branch `CREW-135` on the remote carries the closed PR #193 commits; it is
intentionally left for this re-dispatch to overwrite (`--force-with-lease`).
