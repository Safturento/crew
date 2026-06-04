# visual-fidelity-check report — 2026-06-03

**Branch:** CREW-136
**Base:** main
**Touched components:** 2 (`Switch` → node `335:242`, `FormField` → node `337:234`)
**Findings:** 0 high, 0 medium, 1 low (fixed in-scope) · 1 pre-existing note · 1 verification gap

Both components were checked against the on-disk snapshot (`.crew/figma-snapshot`) **and** a fresh
`get_design_context` pull of each node for exact resolved tokens.

## Switch (node 335:242) — structural check: all match

| Property | Code emits | Figma resolves | Result |
| --- | --- | --- | --- |
| track size | `h-[14px] w-[26px]` | 26×14 | ✅ |
| track radius | `rounded-full` | `rounded-[999px]` | ✅ |
| track ON bg | `bg-blue-1050` → #17253f | `--blue-1050` #17253f | ✅ |
| track OFF bg | `bg-secondary` → #1e293b (dark) | `--secondary` #1e293b | ✅ |
| thumb size | `size-3` (12px) | 12px | ✅ |
| thumb ON bg | `bg-blue-400` → #60a5fa | `--state/initializing` #60a5fa | ✅ |
| thumb OFF bg | `bg-muted-foreground` → #94a3b8 (dark) | `--muted-foreground` #94a3b8 | ✅ |
| thumb travel | `translate-x-3` (12px) = 24px inner − 12px thumb | `justify-end` (right edge) | ✅ |

Code Connect (`switch.figma.tsx`) maps `state` → `checked` and includes the `Label` next to the
toggle (`gap-1.5` ≈ Figma's 6px), mirroring the sibling `checkbox.figma.tsx` convention.

## FormField (node 337:234) — structural check

| Property | Code emits | Figma resolves | Result |
| --- | --- | --- | --- |
| stack direction | `flex flex-col` | `layoutMode: VERTICAL` | ✅ |
| stack gap | `gap-[5px]` | `itemSpacing: 5` | ✅ (fixed — was `gap-1.5`/6px) |
| label size | `text-[11px]` | 11px | ✅ |
| label weight | `font-normal` | Hanken Grotesk Regular | ✅ |
| label color | `text-muted-foreground` → #94a3b8 | `--muted-foreground` #94a3b8 | ✅ |
| label case | `uppercase` (caller passes natural case) | literal "LABEL" | ✅ |
| input | composes `<Input>` | instance of Input set (318:230) | see note |

### Low-severity finding (fixed in-scope)

- **Kind:** structural · **File:** `FormField.tsx:18`
- FormField stack gap was `gap-1.5` (6px); Figma `itemSpacing` is 5px. Changed to `gap-[5px]`.

## Pre-existing note (NOT from this PR — out of scope)

The shipped `Input` component (`ui/input.tsx`) diverges from the Figma Input node:

- height `h-9` (36px) vs Figma 30px
- bg `dark:bg-input/30` (translucent white 7% @30%) vs Figma `slate-1100` #172134
- border `border-input` (translucent white 7%) vs Figma `slate-600` #475569

This is a property of the `Input` component, which renders identically everywhere it is used — it is
**not** introduced by `FormField` (FormField composes `Input` unchanged). Input styling was Task 2.2,
which shipped independently and is explicitly out of scope for CREW-136 (see ticket re-scope note).
Flagging for awareness; recommend a separate followup if Input↔Figma parity is desired.

## Verification gap

- **No live in-app visual check (Step 5 / browser smoke).** By design, CREW-136 builds the components
  with **no caller sites yet** (modal-screen wiring is a later slice). The running dashboard mounts
  neither `Switch` nor `FormField` on any route, and the dashboard has no component playground/gallery
  page. There is therefore no rendered surface in the app to screenshot. Structural fidelity was
  verified against the snapshot + live `get_design_context` instead, which is authoritative for these
  isolated primitives.
