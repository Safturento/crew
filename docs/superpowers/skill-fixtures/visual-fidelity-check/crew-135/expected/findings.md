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

### F5. View PR action uses Unicode `↗` instead of an SVG icon

- **Severity:** medium
- **Kind:** caller
- **Components:** `AgentRow.tsx` (line ~119-121), `AgentBody.tsx` (line ~85-90 for both "View PR ↗" and "↗ Open as page")
- **Evidence:**
  - Figma reference: View PR pill instance on agent drawer / agent page shows `Has Icon=true, Icon=lucide/arrow-up-right`. The icon has consistent stroke and color matching the text.
  - Code: `<a>View PR ↗</a>` — `↗` is a Unicode glyph, browser-font dependent.
- **Fix:** use SVG: `import { ArrowUpRight } from 'lucide-react'; <Button><ArrowUpRight aria-hidden /> View PR</Button>`. Drop the Unicode character from the link text.

---

## Allowed but not required (judgment-call findings)

These are observations the skill MAY surface but shouldn't be required for a passing run. Useful for "extra credit" calibration:

### J1. State badge dot is a CSS-only span, not an SVG icon

- **Components:** `badge.tsx:43-49` — `<span h-1.5 w-1.5 rounded-full bg-{color}>` (6×6 filled circle).
- **Note:** Figma's Pill set has an `Icon` INSTANCE_SWAP property defaulting to `lucide/git-pull-request` (the SET-level default — not what state-badge instances actually use). Visual end-result is "a small colored dot" in both cases. Whether this counts as a finding depends on whether the skill is told to match component primitives exactly or just visual end-result. Both stances are defensible; we leave it to the skill author.

### J2. Button-sm rendered height: 32px (h-8) vs Figma 30px

- **Components:** `button.tsx` buttonSizes.sm = `h-8`.
- **Note:** 2px difference, below typical visual-perception thresholds. Worth flagging if the skill is configured for high-precision matching; ignore if "near enough" is the bar.

---

## Should NOT be findings (false positives to avoid)

- "Figma uses `state/running` token alias, code uses `slate-400` literal" — these resolve to the same hex `#94A3B8`. The skill should ignore naming differences when computed values match.
- "Old StateBadge had pulse animation; new Badge does not" — that's a known feature loss, already filed as its own followup. Not a CREW-135 visual regression per the skill's scope.
- "Some buttons have hover styles in code that Figma reference doesn't show" — Figma reference is the resting state only. Hover styles are out of scope.
