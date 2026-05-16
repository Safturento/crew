# visual-fidelity-check report — 2026-05-12

**Branch:** CREW-135
**Base:** main
**Touched components:** 6 — `ui/button.tsx`, `ui/badge.tsx`, `ui/tag.tsx`, `lib/pill-variants.ts`, `AgentRow.tsx`, `AgentBody.tsx`, `TopNav.tsx`
**Findings:** 4 high, 1 medium, 0 low (0 pre-existing, 5 from this PR)

## High-severity findings

### Finding 1: State badges use `intensity="muted"` (no border) where Figma uses `intensity="mid"` (1px state-colored stroke)

- **Kind:** caller
- **File(s):**
  - `packages/dashboard/src/components/AgentRow.tsx:67-69`
  - `packages/dashboard/src/components/AgentBody.tsx:65-72`
- **Code (AgentRow.tsx:67-69):**
  ```tsx
  <Badge role="status" aria-label={meta.label} color={agent.state} intensity="muted" hasIcon>
    {meta.label}
  </Badge>
  ```
- **Figma reference:** `composites/212-910.json` (AgentRow) variant `"state=waiting"` → `enrichment.componentInstances` entry matching the state-badge slot: `variantOverrides: "type=pill, color=waiting, intensity=mid"`, `resolvedStyles.strokes: [{ hex: "#F59E0B", tokenAlias: "amber/500" }]`. The Pill set's `intensity=mid` general definition (in `composites/272-120.json`) is a secondary reference — the **AgentRow render composite** is what makes `intensity="mid"` the right call here.
- **Diff:** code passes `intensity="muted"` → emits `bg-slate-1050 text-slate-400` (no border class). Figma intends `intensity="mid"` → should emit `bg-slate-1050 border border-slate-500 text-slate-400`.
- **Fix:** change `intensity="muted"` to `intensity="mid"` in both files (AgentRow.tsx:67 + AgentBody.tsx:65).

### Finding 2: Clear attention button has an outer border; Figma frame has none

- **Kind:** caller
- **File(s):** `packages/dashboard/src/components/TopNav.tsx:37-43`
- **Code:**
  ```tsx
  <Button
    color="running"
    intensity="mid"
    size="xs"
    onClick={onClearAttention}
    disabled={attentionCount === 0}
    className="border-white/10 text-muted-foreground hover:bg-popover disabled:opacity-40"
  >
  ```
- **Figma reference:** `snapshot/composites/243-120.json` (Clear attention composite) shows outer frame with `fills: []`, `strokes: []`. No outer border.
- **Diff:** code's `intensity="mid"` emits `border border-slate-500`, then the `className="border-white/10 ..."` override changes the color to white/10. Figma intends no border at all. The composite is functionally a button but visually a borderless frame — closest Button mapping is `color="running" intensity="ghost"`.
- **Fix:** change `intensity="mid"` to `intensity="ghost"`. Drop the stale `border-white/10 text-muted-foreground hover:bg-popover` className override (the system handles those concerns now).

### Finding 3: Clear attention count pill is loud (solid amber) where Figma is mid (hollow with stroke)

- **Kind:** caller
- **File(s):** `packages/dashboard/src/components/TopNav.tsx:47-49`
- **Code:**
  ```tsx
  <Badge color="waiting" intensity="loud" className="font-semibold">
    {attentionCount}
  </Badge>
  ```
- **Figma reference:** `snapshot/composites/243-120.json` child `332:230` (count-pill) → mainComponent `type=pill, color=waiting, intensity=mid`. Renders amber-1050 bg + amber/500 1px stroke + amber/400 text.
- **Diff:** code's `intensity="loud"` emits solid amber-400 bg with dark text — visually a different treatment. Figma's `intensity="mid"` is the hollow look with stroke.
- **Fix:** change `intensity="loud"` to `intensity="mid"`.

### Finding 4: "New Run" button uses wrong Pill variant entirely

- **Kind:** caller (encoding error)
- **Severity:** HIGH
- **File:** `packages/dashboard/src/components/TopNav.tsx:53-60`
- **Code:**
  ```tsx
  <Button color="white" intensity="loud" size="xs" icon={<Plus />}>
    New Run
  </Button>
  ```
- **Render composite:** `composites/245-133.json` variant `"Active Tab=agents"` → `enrichment.componentInstances` entry where `componentPropertyOverrides.Label === "New Run"`:
  - `variantOverrides: "type=button-sm, color=idle, intensity=loud"`
  - `resolvedStyles.fills[0]: { hex: "#64748B", tokenAlias: "state/idle", opacity: 1 }`
  - `resolvedStyles.textColor: { hex: "#020617", tokenAlias: "state/foreground" }`
  - `resolvedStyles.strokes: []`
- **Diff:** code chose `white / loud / xs` (white CTA, h-6, 12px font, 12px icon). Figma renders `idle / loud / sm` (slate-500 CTA, h-8, 14px font, 16px icon). Three axes wrong: `color`, `size`, and the consequent geometry/typography.
- **Fix:**
  ```tsx
  <Button color="idle" intensity="loud" size="sm" icon={<Plus />}>
    New Run
  </Button>
  ```
  Drop any `font-semibold` className override — `font-medium` is the Button default and matches Figma's Hanken Grotesk Medium.
- **Why high-severity:** caller chose a variant Figma doesn't use at this call-site. Not a token delta — wrong variant entirely. Per SKILL.md "set vs composite" anti-loophole: never reach this conclusion by diffing against the Pill set's white-loud variant.

## Medium-severity findings

### Finding 5: View PR / Open as page use Unicode arrow instead of `lucide/arrow-up-right` SVG

- **Kind:** caller
- **File(s):**
  - `packages/dashboard/src/components/AgentRow.tsx:117-122` (View PR action)
  - `packages/dashboard/src/components/AgentBody.tsx:85-90` (View PR + Open as page)
- **Code (AgentRow.tsx:117-122):**
  ```tsx
  <Button color="running" intensity="mid" size="xs" asChild>
    <a href={agent.prUrl ?? '#'} target="_blank" rel="noreferrer" onClick={stop}>
      View PR ↗
    </a>
  </Button>
  ```
- **Figma reference:** View PR pill instance uses `Has Icon=true, Icon=lucide/arrow-up-right`. SVG has controlled stroke + matches text color exactly.
- **Diff:** code uses Unicode U+2197 ("↗") which is a text glyph rendered by the browser's font fallback. Stroke weight, color, and metrics don't match Figma's icon.
- **Fix:** replace Unicode with SVG: `import { ArrowUpRight } from 'lucide-react';` then `<a><ArrowUpRight aria-hidden /> View PR</a>`. The Button base class `[&_svg:not([class*='size-'])]:size-4` already handles SVG sizing.

## Low-severity / judgment-call findings

### Note A: State badge dot is a CSS-only span, not an SVG icon

`badge.tsx:43-49` renders `<span h-1.5 w-1.5 rounded-full bg-{color}>` (6×6 filled circle). Figma's Pill set has an Icon INSTANCE_SWAP defaulting to `lucide/git-pull-request` (set-level default, not what state-badge instances use). Visual end-result is "a small colored dot" in both cases. **Not flagging as a finding** — visually equivalent for the use case, and matching Figma's primitive exactly would require refactoring Badge to accept an icon component. Note for future iteration.

## Verification gaps

- Rendered screenshot capture not run (dashboardUrl skipped this run); structural + caller checks sufficient for the findings above. The user's remote-control screenshot of CREW-135's actual rendered state confirms Finding 1 (no visible badge borders) and Finding 3 (solid yellow count pill).

---

**Findings 1–5 must be fixed before claiming this task complete.** Re-run the gate after fixing.
