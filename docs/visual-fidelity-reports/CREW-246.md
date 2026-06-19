# visual-fidelity-check report — 2026-06-19

**Branch:** CREW-246
**Base:** main
**Touched components:** DrawerHeader
**Findings:** 0 high, 0 medium, 0 low — exact match.

The agent drawer header was checked against the Figma source of truth: DrawerHeader
`594:803`. Variant data read from the node's `enrichment.componentInstances`.

## What was checked

CREW-246 adds a `Cancel` control to the `DrawerHeader` action cluster for running
agents, sharing the soft→hard escalation (`useCancelEscalation`) and the runner-command
mutations (`useCancelRun`/`useForceKill`) with the Runner page rows (CREW-245).

### Structural / caller check (enrichment)

The Figma `594:803` snapshot lists the action-cluster Pill instances. The relevant one:

| Instance | Figma (enrichment)                                             | Code emits                                                                    | Match |
| -------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----- |
| `Cancel` | `type=button-sm, color=error, intensity=muted, Has Icon=false` | `<Button color="error" intensity="muted" size="sm">Cancel</Button>` (no icon) | ✓     |

Cluster order in Figma: `Open as page` → … → `Cancel` → `✕ Close`. The code renders the
Cancel control immediately before the close button, after the other action buttons —
matching the spec ("next to Open as page, before ✕").

The `Force kill` escalation button (only shown in the `cancelling` state, ~10s after a
soft cancel) is not captured in this resting-state snapshot node. It reuses the canonical
escalation styling already established on the Runner row (CREW-245):
`color="error" intensity="loud"`.

### Visual / live-DOM check (chrome MCP)

Rendered the drawer for a running agent (`CREW-101`) and read computed styles on the
`Cancel` button:

- `color: oklch(0.704 0.191 22.216)` (error red text) ✓
- `backgroundColor: rgb(38, 32, 49)` (muted error pill fill) ✓
- `borderColor:` error red ✓
- `height: 32px` (`h-8`, size sm) ✓ · `fontSize: 14px` (`text-sm`) ✓
- `hasSvg: false` (no icon — matches Figma `Has Icon=false`) ✓
- cluster order: `["Open as page", "Cancel", "Close drawer"]` ✓

Clicking `Cancel` opens the `AlertModal` ("Cancel CREW-101?" → `Keep running` /
`Cancel run`), matching the drawer-cancel mock flow.

## Verification gaps

- The `cancelling`-state drawer mock (`756:1237`, Brainstorm page) is not part of the
  committed composites snapshot, so the `Force kill` button styling was verified against
  the shared Runner-row escalation control rather than a dedicated drawer node. The two
  share one implementation (`useCancelEscalation` + identical Pill variants), so parity
  holds by construction.
