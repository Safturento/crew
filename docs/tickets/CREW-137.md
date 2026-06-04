# CREW-137 — T3: Modal infrastructure (Modal, AlertModal, ModalSelectionRow, Stepper)

Jira: https://safturento.atlassian.net/browse/CREW-137

## Goal

Add the modal-family composites from the consolidated Crew Figma DS, building the
components only (no live caller sites — modal screens get wired in separate slices):

- `AlertModal` — confirmation dialog (Cancel + Action) over shadcn AlertDialog.
- `Modal` — slot pattern via `children`, wraps shadcn Dialog with Crew dark styling.
- `ModalSelectionRow` — rich picker rows (primary + secondary mono + meta + badge slot).
- `Stepper` — numbered progress indicator for multi-step modals.

Each ships a `.tsx`, a `*.test.tsx`, and a `.figma.tsx` Code Connect mapping.

## Relevant files

- `packages/dashboard/src/components/ui/alert-dialog.tsx` — new shadcn AlertDialog primitive (authored, not via CLI — see Decisions).
- `packages/dashboard/src/components/Modal.tsx` / `AlertModal.tsx` / `ModalSelectionRow.tsx` / `Stepper.tsx` — new composites.
- `packages/dashboard/src/components/ui/button.tsx` — the T1 (CREW-135) Button contract these compose against.
- `.crew/figma-snapshot/composites/` — fidelity reference PNGs (`355-238` Modal, `373-413` AlertModal, `350-236` ModalSelectionRow, `378-462` Stepper).

## Decisions

- **Plan node IDs reused verbatim** — `.crew/figma-snapshot/index.json` confirms the
  plan's node IDs map to the live components (Modal `355:238`, AlertModal `373:413`,
  ModalSelectionRow `350:236`, Stepper `378:462`) in file `9FeJPriqdsdA4n9R5Xsrr8`.
- **Adapt to the shipped T1 Button contract, not the plan's stale snippets.** The
  `2026-05-12-ds-to-code-reconciliation.md` plan was written against an earlier Button
  API (`size="icon-sm"`, `hasIcon`). CREW-135 actually shipped `PillBase` with sizes
  `xs|sm|md|lg` and an `icon: ReactNode` slot. The Modal/AlertModal close + action
  buttons use the real contract: icon-only close = `<Button color="running"
intensity="ghost" size="sm" icon={<X />} aria-label="Close" />` (matches DrawerHeader).
- **Author `alert-dialog.tsx` by hand, mirroring `dialog.tsx`.** The repo uses the
  unified `radix-ui` package (`import { AlertDialog as AlertDialogPrimitive } from
'radix-ui'`), not per-primitive `@radix-ui/react-*`. shadcn's CLI output would import
  the wrong package and can't reach `ui.shadcn.com` from the sandbox anyway.
- **Stepper styling matches the snapshot** — active step = bright foreground text,
  inactive = muted; `·` between number and label, `›` chevron between steps. The
  plan's blue-pill active style does not match the Figma render.

## Notes

Blocked-by T1 (CREW-135) is already shipped on main. T2 (CREW-136, form composites)
is parallel and independent.
