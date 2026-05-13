# Expected findings — CREW-135 fixture

This is the ground-truth list of findings the `visual-fidelity-check` skill should produce when run against this fixture. Each finding has a **severity** (high / medium / low — informs whether the agent should block on it) and a **kind** (structural / visual / caller — informs what kind of evidence the skill should cite).

A "hit" means the skill produces a finding that names the same component + property + direction as one of these entries. False positives on judgment-call items (see "Allowed but not required" below) don't count against the skill.

---

## Required findings (skill must catch all)

### F1. State badges use `intensity="muted"` (no border) where Figma uses `intensity="mid"` (with border)

- **Severity:** high
- **Kind:** caller
- **Components:** `AgentRow.tsx` (line ~67), `AgentBody.tsx` (line ~65)
- **Evidence the skill should cite:**
  - Figma reference: agent drawer screen `1:756` shows pill with visible amber/500 stroke; pill set's `intensity=muted` variant has `strokes: []` per `snapshot/composites/272-120.json`.
  - Caller code: `<Badge color={...} intensity="muted">` — should be `intensity="mid"`.
- **Fix:** change `intensity="muted"` to `intensity="mid"` in both call sites.

### F2. Clear attention button has an outer border; Figma frame has none

- **Severity:** high
- **Kind:** caller
- **Components:** `TopNav.tsx` (line ~37-43)
- **Evidence:**
  - Figma reference: `snapshot/composites/243-120.json` shows the outer frame with `fills: []`, `strokes: []`.
  - Caller code: `<Button color="running" intensity="mid">` (mid emits `border border-slate-500`) plus a stale `className="border-white/10 ..."` override.
- **Fix:** change to `intensity="ghost"` and drop the `border-white/10 text-muted-foreground hover:bg-popover` className override (the system now handles those concerns).

### F3. Clear attention count pill is loud (solid) where Figma is mid (hollow)

- **Severity:** high
- **Kind:** caller
- **Components:** `TopNav.tsx` (line ~47-49)
- **Evidence:**
  - Figma reference: `snapshot/composites/243-120.json` child `332:230` is `type=pill, color=waiting, intensity=mid` — dark amber-1050 bg + amber/500 stroke + amber/400 text.
  - Caller code: `<Badge color="waiting" intensity="loud">` — emits solid amber-400 bg with dark text.
- **Fix:** change `intensity="loud"` to `intensity="mid"`.

### F4. `pillSurfaceClasses('white', 'loud')` uses wrong Tailwind shade

- **Severity:** medium
- **Kind:** structural (helper-level, not caller)
- **Components:** `pill-variants.ts` (line ~9-13)
- **Evidence:**
  - Figma reference: `type=button-sm, color=white, intensity=loud` variant in `snapshot/composites/272-120.json` has `fills: [{ hex: "#FAFAFA", tokenAlias: "zinc/50" }]`.
  - Code: `WHITE_CLASSES.solidBg = 'bg-neutral-200'` (#E5E5E5) — visibly dimmer than zinc/50.
- **Fix:** change `WHITE_CLASSES.solidBg` from `'bg-neutral-200'` to `'bg-zinc-50'`. Optionally also align `WHITE_CLASSES.text` from `'text-slate-950'` to `'text-zinc-950'` (Figma uses zinc/950, but slate/950 is visually indistinguishable — acceptable).

### F5. View PR / Open as page render the wrong icon — Unicode glyph instead of `lucide/arrow-up-right`

- **Severity:** medium
- **Kind:** caller (icon mismatch)
- **Components:** `AgentRow.tsx` (line ~119-121, View PR), `AgentBody.tsx` (line ~85-90 — both "View PR ↗" and "↗ Open as page")
- **Evidence:**
  - Figma reference: View PR / Open as page pill instances declare `Has Icon=true, Icon=lucide/arrow-up-right` (the specific lucide glyph). The rendered icon has controlled stroke + matches the text color.
  - Code renders `↗` (Unicode U+2197 NORTH EAST ARROW) inline in the link text. Two distinct problems:
    - **Primitive mismatch** — text glyph rendered by browser font fallback, not an SVG; no stroke / size / color coordination with the button.
    - **Visual mismatch** — the Unicode glyph's shape and weight do not match `lucide/arrow-up-right`. The arrow on screen looks visibly different from the Figma reference.
- **Fix:** import the specific Figma icon: `import { ArrowUpRight } from 'lucide-react'; <Button><ArrowUpRight aria-hidden /> View PR</Button>`. Naming the *specific* lucide glyph is part of the fix; "use an SVG" is incomplete.

### F7. State badge dot is a CSS-only span instead of an icon component

- **Severity:** medium
- **Kind:** caller (icon mismatch — visual identity)
- **Components:** `badge.tsx` (line ~43-49, the `hasIcon` rendering path)
- **Evidence:**
  - Figma reference: the Pill set's `Has Icon=true` paths declare an `Icon` INSTANCE_SWAP property that plugs in an actual icon component. State-badge instances in the agent-row Figma reference (`snapshot/screens/1-756.png`) render their dot as a bound lucide icon, sharing stroke/anti-aliasing/circle-geometry with the rest of the DS's iconography.
  - Code renders `<span data-testid="badge-dot" className="inline-block h-1.5 w-1.5 rounded-full bg-{color}">` — a 6×6 CSS shape. Visually close but a different primitive: no shared stroke/anti-aliasing with other icons, hard-coded size, breaks if Figma's badge icon ever becomes anything other than a filled circle.
- **Fix:** rework Badge's `hasIcon` path to accept (or default to) a real icon component — e.g. `<Circle className="size-2 fill-current" />` from `lucide-react`, with the specific lucide variant matching Figma's set-level default for the Pill `Icon` property (`lucide/circle` filled, or whatever the Figma instance's `componentProperties.Icon` resolves to once the Plugin-API snapshot is wired up — see followups).

**Iteration note:** F7 was originally noted as a "judgment call" in the calibration run's J1 section. User feedback flagged it as a real bug. The skill's workflow.md was updated to remove the "icon mismatches can be judgment calls" carve-out — icon-shape divergence is always a finding, severity ≥ medium.

---

### F6. WorktreePathLink Copy button has stale `text-muted-foreground` className override

- **Severity:** low
- **Kind:** caller (stale post-migration override)
- **Components:** `AgentBody.tsx` (the `WorktreePathLink` inner Button — copy worktree path)
- **Evidence:**
  - PR #177 migrated this Button from `variant="ghost"` to `color="running" intensity="ghost"` but kept the existing `className="h-auto px-1 py-0 text-xs uppercase tracking-wide text-muted-foreground hover:text-foreground hover:bg-transparent"`.
  - `pillSurfaceClasses('running', 'ghost')` already emits `text-slate-400` which `text-muted-foreground` aliases to. The `text-muted-foreground` portion is redundant.
  - Layout overrides (`h-auto px-1 py-0 text-xs uppercase tracking-wide`) are real and intentional — the Copy button is a tiny inline affordance, not a standard xs Button.
  - `hover:text-foreground` adds real behavior (hover state) not provided by the system.
- **Fix:** drop the `text-muted-foreground` portion of the className. Keep the layout overrides + the hover variant. Low priority — visual impact is zero (system emits the same color).

(Added 2026-05-12 after calibration run — the skill caught this; original author's expected list missed it. Fixture updated to reflect the real bug surface.)

## Allowed but not required (judgment-call findings)

These are observations the skill MAY surface but shouldn't be required for a passing run. Useful for "extra credit" calibration:

### J2. Button-sm rendered height: 32px (h-8) vs Figma 30px

- **Components:** `button.tsx` buttonSizes.sm = `h-8`.
- **Note:** 2px difference, below typical visual-perception thresholds. Worth flagging if the skill is configured for high-precision matching; ignore if "near enough" is the bar.

---

## Should NOT be findings (false positives to avoid)

- "Figma uses `state/running` token alias, code uses `slate-400` literal" — these resolve to the same hex `#94A3B8`. The skill should ignore naming differences when computed values match.
- "Old StateBadge had pulse animation; new Badge does not" — that's a known feature loss, already filed as its own followup. Not a CREW-135 visual regression per the skill's scope.
- "Some buttons have hover styles in code that Figma reference doesn't show" — Figma reference is the resting state only. Hover styles are out of scope.
