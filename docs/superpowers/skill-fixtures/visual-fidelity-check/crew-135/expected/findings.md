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

### F4. New Run button uses `color="white"` where Figma uses `color="idle"`

- **Severity:** medium
- **Kind:** caller (wrong color enum)
- **Components:** `TopNav.tsx` (line ~52-58, the `+ New Run` Button)
- **Evidence:**
  - Figma reference: every New Run pill instance on the Dashboard Screens (verified via Plugin API query against the file) declares `color="idle", intensity="loud", Icon=lucide/plus`. The `idle/loud` Pill variant resolves to `fills: [{ hex: "#64748B", tokenAlias: "state/idle -> slate/500" }]` — a slate-500 mid-gray, not a near-white.
  - Code: `TopNav.tsx` uses `<Button color="white" intensity="loud">` for the New Run button, which routes through `pillSurfaceClasses('white', 'loud')` and emits `bg-neutral-200` (#E5E5E5 near-white). The shipped button is therefore *the wrong color entirely*, not just the wrong shade of white.
- **Fix:** change `TopNav.tsx`'s New Run Button from `color="white"` to `color="idle"`. The helper `pillSurfaceClasses('idle', 'loud')` already emits `bg-slate-500 text-slate-950`, matching Figma's idle/loud variant — no helper changes needed.

**Iteration note:** The original calibration run (and the original expected list) framed this as a helper-level "wrong Tailwind shade" bug — `neutral-200` vs `zinc/50` for the `white/loud` recipe. That framing was *wrong*: the real bug is caller-side (wrong color enum). The helper's `white/loud` recipe is currently unused once the caller switches to `idle`. If a future caller does use `white/loud`, the neutral-200 vs zinc/50 shade nit is real but secondary — file as a separate finding then.

### F5. View PR + Open as page use Unicode arrows — each needs a DIFFERENT lucide icon

- **Severity:** medium
- **Kind:** caller (icon mismatch — two distinct specific icons)
- **Components:**
  - `AgentRow.tsx` (line ~119-121, View PR action for pr_open agents)
  - `AgentBody.tsx` (line ~85-90, View PR)
  - `AgentBody.tsx` (line ~94-99, Open as page link)
- **Evidence (verified via Plugin API instance lookup):**
  - **View PR** Figma instances (in the agent-list quick-actions, e.g. instance `I206:270;278:1544`) declare `Has Icon=true, Icon=lucide/git-pull-request`. NOT `lucide/arrow-up-right`.
  - **Open as page** Figma instance (`384:2565` in the agent drawer) declares `Has Icon=true, Icon=lucide/arrow-up-right`.
  - Code in both call sites renders Unicode `↗` (U+2197) inline in the link text. Two distinct problems compounding:
    - **Primitive mismatch** — text glyph rendered by browser font fallback, not an SVG; no stroke/size/color coordination with the button.
    - **Wrong-icon mismatch** — even if the Unicode were replaced with an arrow SVG, the View PR icon should be `lucide/git-pull-request` (a git-branch-with-circle glyph), not an arrow at all. The shipped button is therefore *the wrong icon entirely*.
- **Fix:** two distinct lucide imports:
  - View PR: `import { GitPullRequest } from 'lucide-react'; <Button><GitPullRequest aria-hidden /> View PR</Button>`
  - Open as page: `import { ArrowUpRight } from 'lucide-react'; <Button><ArrowUpRight aria-hidden /> Open as page</Button>`
- The specific Figma icon name must be part of the fix recommendation, not generic "use an SVG."

**Iteration note:** The original calibration run flagged this as Unicode-vs-SVG and proposed `lucide/arrow-up-right` for both. That was wrong: View PR's Figma icon is `lucide/git-pull-request`. Caught via direct Figma instance-properties query — exactly the data the snapshot is missing without Plugin-API support. The skill could not have produced the correct fix from the REST snapshot alone; this is the structural limitation captured in `docs/followups.md` (PR #182).

### F7. State badge dot renders as a solid filled circle; Figma uses an outlined ring (`lucide/circle`)

- **Severity:** medium
- **Kind:** caller (icon mismatch — visually distinct shapes)
- **Components:** `badge.tsx` (line ~43-49, the `hasIcon` rendering path)
- **Evidence (verified via Plugin API + user side-by-side screenshot):**
  - Figma reference: the Waiting state pill instance on the agent drawer (`275:1355`) declares `Has Icon=true, Icon=lucide/circle`. The default lucide/circle is an *outlined ring* (1px stroke, hollow center) at the badge's icon size. The user provided a direct side-by-side comparison confirming: Figma's badge has a thin red ring; code's badge has a solid red filled dot.
  - Code: `<span data-testid="badge-dot" className="inline-block h-1.5 w-1.5 rounded-full bg-{color}">` — a 6×6 CSS shape with solid background. Visually distinct from the outlined ring Figma renders. Not "visually similar" — visibly different shape.
- **Fix:** import the specific Figma icon: `import { Circle } from 'lucide-react'; <Circle className="size-2" aria-hidden />`. Default lucide/Circle is outlined (1px stroke, no fill), matching Figma. Remove the CSS-only span path. Rework Badge's `hasIcon` to render the lucide icon (color comes from `currentColor` via Tailwind's `text-*` already on the badge).

**Iteration note:** F7 was downgraded to a "judgment call" in calibration run-01 ("visually similar but different primitive"). Both run-01 AND run-02 made the same hedge despite the skill's iterated "icon findings are never judgment calls" rule. User feedback (with side-by-side screenshot) demonstrated this is a *visibly different shape*, not a primitive-purity concern. The dismissal pattern reflects an LLM tendency to under-flag visual differences in the absence of a screenshot — which the Plugin-API snapshot still won't directly provide. The skill's workflow.md was updated; the meta-pattern (skill needs to be MORE aggressive on icon findings until visual-diff is available) is captured in the followup.

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
