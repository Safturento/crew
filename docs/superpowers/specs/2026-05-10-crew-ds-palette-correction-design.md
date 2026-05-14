# Crew DS Palette Correction — Design Spec

**Status:** Draft, awaiting user review
**Date:** 2026-05-10
**Brainstormed by:** safturento + Claude (Opus 4.7)

## Summary

Fix a foundational color mismatch in the Crew Design System: every Crew Semantic Colors variable currently aliases through Core's `mode` collection to `tw/colors / neutral/*`, while the dashboard's actual `.dark` palette in `packages/dashboard/src/index.css` is custom blue-tinted hex values (`--background: #05060a`, `--card: #1a1c24`, etc.). Re-alias Crew Semantic Colors directly to Core's `tw/colors / slate/*` shades, update the dashboard CSS to reference the same stock Tailwind utilities, then re-verify the migrated frames. Architectural side-effect: the two-collection mode chain (the trap our `figma-design-system-propagation` skill documents) stops applying to Crew DS consumers — they only need to set explicit mode on Crew Semantic Colors going forward.

## Context & motivation

### How this surfaced

During the 2026-05-10 manual frame-migration session (resolving CREW-117/CREW-119's deferred frame-migration followup), all three migrated frames (`1:2`, `1:378`, `1:1900`) bound their hardcoded fills to Crew DS semantic tokens. Bindings were structurally correct, but the user pointed out the page background "looked wrong." Investigation surfaced that the dashboard's `.dark` block uses custom hex values that don't match the resolved Crew DS chain.

### Concrete mismatch

| Token                     | Dashboard (`.dark`)      | Crew DS (resolved via Core)     | Match?          |
| ------------------------- | ------------------------ | ------------------------------- | --------------- |
| `--background`            | `#05060a`                | `#0a0a0a` (neutral-950)         | ❌              |
| `--foreground`            | `#e7e8ec`                | `#fafafa` (neutral-50)          | ❌              |
| `--card`                  | `#1a1c24`                | `#171717` (neutral-900)         | ❌              |
| `--popover`               | `#21232d`                | `#262626` (neutral-800)         | ❌              |
| `--primary`               | `#e7e8ec`                | `#e5e5e5` (neutral-200)         | ❌ (close)      |
| `--secondary` / `--muted` | `#21232d`                | `#262626` (neutral-800)         | ❌              |
| `--accent`                | `#292c38`                | `#404040` (neutral-700)         | ❌              |
| `--border`                | `rgba(255,255,255,0.07)` | `#404040` (neutral-700) — solid | ❌ structurally |
| `--ring`                  | `#7e8290`                | (varies)                        | ❌              |

The dashboard's palette is **slate (blue-tinted)**; Core's stock shadcn defaults are **neutral (pure grayscale)**. The CREW-122 assumption ("The dashboard's existing dark slate aesthetic matches Core's shadcn-default `mode/dark mode` values closely enough that a delta layer isn't needed yet") was never visually verified and is invalidated by the actual values.

The `--border` is also structurally different: dashboard uses a 7% white overlay; Crew DS resolves to a solid mid-gray. Migrated borders lose their transparency in mode resolution → render almost invisible.

### Why fix now (vs continuing to vertical slices)

The user explicitly framed Epic 1 as "consolidation, focusing on design changes first" — the existing migrated frames need to look right before more frames migrate against the same broken baseline. Continuing vertical slices would multiply the wrongness across more views. Foundational color correction is the prerequisite for any further design fidelity work.

### Why slate (not custom hex extensions)

Considered three options for reconciling the dashboard's custom values with Tailwind:

1. **Map to stock Tailwind slate shades (chosen)** — slight visual shift from current dashboard, but both code and design reference identical Tailwind classes, idiomatic and shadcn-friendly, future-update-friendly.
2. Extend Tailwind with custom shades like `slate-925`, `slate-975` to preserve exact pixel values — pixel-perfect but introduces non-standard shade numbers.
3. Custom semantic-named Tailwind classes (`--color-page-dark`, `--color-card-dark`) — preserves values but loses the "part of the slate scale" hint.

User picked #1 ("Map to stock Tailwind slate shades"). The dashboard's hand-picked custom palette wasn't pixel-load-bearing — it was a designer's approximation of "blue-tinted dark slate." Mapping to stock slate is what they were approximating.

## Architecture

### Current state

```
Dashboard CSS .dark block → custom hex values (#05060a, #1a1c24, etc.)
                            ❌ NOT REFERENCED by Crew DS

Crew DS / Semantic Colors → Core / mode → Core / tw/colors / neutral/*
                            ✓ Correct chain, ❌ wrong palette (neutral instead of slate)
```

### Target state

```
Dashboard CSS .dark block → var(--color-slate-*) (stock Tailwind utilities)
                            ✓ Same Tailwind shade name as Figma references

Crew DS / Semantic Colors → Core / tw/colors / slate/*
                            ✓ Correct palette, ✓ direct alias (skips Core / mode)
```

The dark-mode aliases in Crew Semantic Colors get re-pointed from Core's `mode` collection to Core's `tw/colors` collection directly. Light mode aliases also update to slate (light mode currently passes through neutral via Core's mode). Both sides — code and design — reference the same Tailwind shade names (e.g. `slate-950`, `slate-900`).

### Side benefit: simplified mode chain

Once Crew DS aliases directly to `tw/colors` (a mode-invariant single-mode collection), Crew DS itself becomes the single source of mode resolution for Crew consumers. Setting explicit dark mode on a frame requires only `setExplicitVariableModeForCollection(crewSemanticColors, darkModeId)` — no need to also set Core's `mode` collection. The figma-design-system-propagation skill's Trap 2 (two-collection mode chain) stops applying to Crew consumers.

Core's `mode` collection remains unmodified and remains useful for files that consume Core directly (without going through Crew DS).

## Section 1 — Re-alias every Crew Semantic Colors variable

Crew DS has **44 color variables** in `Crew / Semantic Colors`. They split into five groups, each with its own treatment.

### 1a. Standard shadcn semantics (19) — re-alias to slate

| Semantic                 | Old (via Core/mode → tw/colors) | New (direct → tw/colors)               | Dashboard `.dark` value       |
| ------------------------ | ------------------------------- | -------------------------------------- | ----------------------------- |
| `background`             | `neutral/950`                   | `slate/950`                            | `#05060a` → `slate/950`       |
| `foreground`             | `neutral/50`                    | `slate/200`                            | `#e7e8ec` → `slate/200`       |
| `card`                   | `neutral/900`                   | `slate/900`                            | `#1a1c24` → `slate/900`       |
| `card-foreground`        | `neutral/50`                    | `slate/200`                            | `#e7e8ec` → `slate/200`       |
| `popover`                | `neutral/800`                   | `slate/900`                            | `#21232d` → `slate/900`       |
| `popover-foreground`     | `neutral/50`                    | `slate/200`                            | `#e7e8ec` → `slate/200`       |
| `primary`                | `neutral/200`                   | `slate/200`                            | `#e7e8ec` → `slate/200`       |
| `primary-foreground`     | `neutral/900`                   | `slate/900`                            | `#05060a` → `slate/900`       |
| `secondary`              | `neutral/800`                   | `slate/800`                            | `#21232d` → `slate/800`       |
| `secondary-foreground`   | (foreground)                    | `slate/200`                            | `#e7e8ec` → `slate/200`       |
| `muted`                  | `neutral/800`                   | `slate/800`                            | `#21232d` → `slate/800`       |
| `muted-foreground`       | `neutral/400`                   | `slate/400`                            | `#b8bbc4` → `slate/400`       |
| `accent`                 | `neutral/700`                   | `slate/800`                            | `#292c38` → `slate/800`       |
| `accent-foreground`      | (foreground)                    | `slate/200`                            | `#e7e8ec` → `slate/200`       |
| `destructive`            | `red/400`                       | `red/400` (no change)                  | `oklch(0.704...)` → `red/400` |
| `destructive-foreground` | `slate/50`                      | `slate/50` (no change)                 | already correct               |
| `border`                 | `neutral/700`                   | `white` (RGB only — fills carry alpha) | `rgba(255,255,255,0.07)`      |
| `input`                  | (border)                        | `white` (RGB only)                     | `rgba(255,255,255,0.07)`      |
| `ring`                   | (varies)                        | `slate/500`                            | `#7e8290` → `slate/500`       |

Rationale:

- `popover`: dashboard `#21232d` is between slate/800 (`#1e293b`) and slate/900 (`#0f172a`). Picking `slate/900` keeps the convention "popover surface looks like card surface."
- `accent`: dashboard `#292c38` is closer to slate/700 but `slate/800` keeps secondary/muted/accent on the same shade (matches the dashboard's choice to use the same hex for secondary/muted, with accent one shade off).
- `border` / `input`: alias to `white` (RGB only) so consumer fills can carry the actual alpha. The migration captured fills with opacity 0.04 / 0.06 / 0.07 / 0.12 from the html.to.design import; those fills resolve to `white` × their captured alpha = intended white-overlay effect.

### 1b. State color tokens (8) — re-alias to \*-400 shades

The current Crew DS state aliases use _-500 shades (added in CREW-119), but the dashboard's actual OKLCH values cluster around lightness 0.7 (which corresponds to _-400 in Tailwind v4's slate/blue/red/etc. scales).

| State token          | Old alias     | New alias                 | Dashboard `--color-state-*` OKLCH                                                                                                                        |
| -------------------- | ------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `state/initializing` | `blue/500`    | `blue/400`                | `oklch(0.7 0.16 250)` → `blue/400` (`oklch(0.707 0.165 254.6)`)                                                                                          |
| `state/running`      | `slate/400`   | `slate/400` (no change)   | `oklch(0.78 0.005 260)` — closest acceptable; dashboard chroma is lower but slate/400 is the right family                                                |
| `state/idle`         | `slate/500`   | `slate/500` (no change)   | `oklch(0.65 0.01 260)` — closest acceptable; dashboard chroma lower                                                                                      |
| `state/waiting`      | `amber/400`   | `amber/400` (no change)   | `oklch(0.82 0.16 90)` → `amber/400` (`oklch(0.828 0.189 84.4)`)                                                                                          |
| `state/pr-open`      | `violet/500`  | `violet/400`              | `oklch(0.72 0.16 295)` → `violet/400` (`oklch(0.706 0.213 293.8)`)                                                                                       |
| `state/error`        | `red/500`     | `red/400`                 | `oklch(0.7 0.16 25)` → `red/400` (`oklch(0.704 0.191 22.2)`)                                                                                             |
| `state/finished`     | `emerald/500` | `emerald/500` (no change) | `oklch(0.72 0.096 150)` — dashboard chroma lower than emerald, but lightness matches `emerald/500` (`oklch(0.696 0.17 162.5)`) better than `emerald/400` |
| `state/foreground`   | `slate/950`   | `slate/950` (no change)   | dark contrast token added 2026-05-10 — correct as-is                                                                                                     |

Trade-offs:

- For `state/running` and `state/idle`, the dashboard uses very low chroma (near-grayscale slate); Tailwind's slate scale has slightly higher chroma. Visual will be a touch more blue-tinted than the original. Acceptable within this approach.
- For `state/finished`, dashboard chroma 0.096 is muted; emerald-500's chroma 0.17 is more saturated. Visual will be a touch more vibrant green. Acceptable.
- All state tokens are mode-invariant — they alias to the same primitive in both light and dark modes (state colors don't change with mode).

### 1c. Chart tokens (5) — defer

`chart-1` through `chart-5` exist in Crew DS (inherited from the upstream kit's `mode` collection) but the dashboard doesn't currently reference them. No runtime usage → low priority.

**Decision: leave aliases pointing through Core's `mode` collection.** When the dashboard adds chart usage (e.g. for token-by-tool histograms in `TokenTable`, or for state-history-bar timeline visualizations), address in that fidelity ticket.

Documented as a deferred concern in design-system.md so the next agent doesn't silently rebuild.

### 1d. Sidebar tokens (8) — defer

Same status as chart tokens. The dashboard doesn't ship a sidebar today. Aliases pointing through Core's `mode` collection stay as-is.

**Decision: defer.** Address when sidebar UI is introduced.

### 1e. Custom kit-extras (4) — defer

`background-color`, `semantic-background`, `semantic-border`, `semantic-foreground` are extras from the upstream shadcn community kit's `mode` collection (mirrored in Crew DS during CREW-122). The dashboard doesn't reference them.

**Decision: defer.** Address if/when one of these gets adopted.

### Light vs dark mode

For groups 1a + 1b, both light and dark mode aliases get updated. Slate is mode-invariant in `tw/colors` (single-mode collection), so both modes alias to the same slate shade — no per-mode value drift. Light-mode rendering keeps working because shadcn's stock slate light-mode palette closely matches the dashboard's `:root` block.

A deep light-mode design pass is deferred until a light-mode-supporting fidelity ticket arrives (the dashboard ships dark-only at runtime via `<html class="dark">` in `main.tsx`).

### Implementation note

Re-aliasing happens via `figma.variables.setValueForMode(variable, modeId, { type: 'VARIABLE_ALIAS', id: targetVarId })`. **27 variables** to rewrite (19 in 1a + 8 in 1b — the chart/sidebar/kit-extras stay untouched). Scriptable in one `use_figma` block per group.

## Section 2 — Update dashboard CSS to use stock Tailwind shades

### 2a. `.dark` block — replace hex with `var(--color-slate-*)` (19 tokens)

Replace `packages/dashboard/src/index.css`'s `.dark` block:

```css
.dark {
  --background: var(--color-slate-950);
  --foreground: var(--color-slate-200);
  --card: var(--color-slate-900);
  --card-foreground: var(--color-slate-200);
  --popover: var(--color-slate-900);
  --popover-foreground: var(--color-slate-200);
  --primary: var(--color-slate-200);
  --primary-foreground: var(--color-slate-900);
  --secondary: var(--color-slate-800);
  --secondary-foreground: var(--color-slate-200);
  --muted: var(--color-slate-800);
  --muted-foreground: var(--color-slate-400);
  --accent: var(--color-slate-800);
  --accent-foreground: var(--color-slate-200);
  --destructive: var(--color-red-400);
  --destructive-foreground: var(--color-slate-50);
  --border: rgb(255 255 255 / 0.07);
  --input: rgb(255 255 255 / 0.07);
  --ring: var(--color-slate-500);
}
```

### 2b. `:root` (light) block — inspect first, align to slate if mismatched (19 tokens)

Currently the `:root` block uses OKLCH values that mostly match Tailwind's stock slate palette (e.g. `--background: oklch(1 0 0)` = white, matches slate's lightest). Audit each value against `var(--color-slate-*)` equivalents:

```css
:root {
  --background: var(--color-white); /* was oklch(1 0 0) */
  --foreground: var(--color-slate-950); /* was oklch(0.13 0.028 261.692) — close to slate/950 */
  --card: var(--color-white); /* was oklch(1 0 0) */
  --card-foreground: var(--color-slate-950); /* matches foreground */
  --popover: var(--color-white);
  --popover-foreground: var(--color-slate-950);
  --primary: var(--color-slate-900); /* was oklch(0.21 0.034 264.665) — close to slate/900 */
  --primary-foreground: var(--color-slate-50); /* was oklch(0.985 ...) — close to slate/50 */
  --secondary: var(--color-slate-100); /* was oklch(0.967 0.003 264.542) — close to slate/100 */
  --secondary-foreground: var(--color-slate-900);
  --muted: var(--color-slate-100);
  --muted-foreground: var(
    --color-slate-500
  ); /* was oklch(0.551 0.027 264.364) — close to slate/500 */
  --accent: var(--color-slate-100);
  --accent-foreground: var(--color-slate-900);
  --destructive: var(--color-red-500); /* was oklch(0.577 0.245 27.325) — close to red/500 */
  --destructive-foreground: var(--color-slate-50);
  --border: var(--color-slate-200); /* was oklch(0.928 0.006 264.531) — close to slate/200 */
  --input: var(--color-slate-200);
  --ring: var(--color-slate-400); /* was oklch(0.707 0.022 261.325) — close to slate/400 */
}
```

(Per-mapping verification happens in implementation — these are best-fit guesses from the OKLCH-to-Tailwind-shade lookup. If any individual mapping looks wrong in browser smoke test, swap to the next nearest shade.)

### 2c. `@theme` state colors — replace OKLCH with `var(--color-*-400)` (7 tokens)

```css
@theme {
  /* ... existing color-* declarations ... */

  --color-state-initializing: var(--color-blue-400);
  --color-state-running: var(--color-slate-400);
  --color-state-idle: var(--color-slate-500);
  --color-state-waiting: var(--color-amber-400);
  --color-state-pr-open: var(--color-violet-400);
  --color-state-error: var(--color-red-400);
  --color-state-finished: var(--color-emerald-500);
}
```

### Visual change to the dashboard

Dark mode rendering will shift slightly:

- Background `#05060a` → `slate/950` (`#020617`) — slightly lighter and bluer
- Card `#1a1c24` → `slate/900` (`#0f172a`) — touch darker, more saturated blue
- Popover/secondary/muted/accent → canonical slate shades
- Borders stay at 7% white overlay (no functional change, slight color difference from previous solid mid-gray)
- State pills: pr-open and error shift from _-500 to _-400 (slightly brighter); initializing similarly. Running/idle/waiting/finished essentially unchanged.

Acceptable per chosen approach (Option 1, stock Tailwind slate). Visually verify in browser after deploy.

### Out of scope for Section 2

- `--color-state-foreground` (the dark-contrast token) — exists in Crew DS but not in dashboard CSS. Add to `@theme` only if/when the dashboard needs to reference it (currently used only in Figma).
- `--chart-*` and `--sidebar-*` — not currently in dashboard CSS, no action needed
- Animations, fonts, radius — unrelated to palette correction

## Section 3 — Republish + re-verify migrated frames

After Sections 1 and 2 land, the user republishes `Crew Design System` in Figma desktop. Then verify in the screens file:

1. **Cache verification (per propagation skill Trap 4):** in the screens file, re-import `Crew / Semantic Colors / background` and confirm the alias chain now ends at `tw/colors / slate/950`. If still showing the old chain, the publish missed the change — flag explicitly.
2. **Mode setup simplification:** existing migrated frames have explicit modes set on both `Crew / Semantic Colors` AND Core's `mode` collection. After this change, only the Crew Semantic Colors mode is load-bearing. Core's mode setting becomes a no-op but isn't harmful — leave or remove as preferred.
3. **Re-screenshot all 3 migrated frames** (`1:2`, `1:378`, `1:1900`) via the MCP `get_screenshot` tool. Confirm:
   - Page bg is the new slate-950 (slightly bluer than before)
   - Card surfaces are slate-900
   - Borders show as subtle white tint (now visible — were nearly invisible before)
   - All other elements render the new palette
4. **Visual smoke test in dashboard:** start the dashboard dev server, open the Agents page in dark mode, confirm no rendering regressions vs the new palette.

## Section 4 — Specific visual fixes (post-palette)

After the palette is correct, address known-defect items surfaced during the migration session:

### 4a. Inspect button styling consistency (frame `1:2`)

The `Inspect` button on the latency row currently has a solid red bg + dark text (rebound to `state/foreground` during migration as a one-off fix). Should follow the canonical tinted-pill pattern documented in `docs/plans/design-system.md`'s "StateBadge visual pattern":

- bg fill: `state/error` at opacity 0.18
- stroke: `state/error` at opacity 1.0
- text fill: `state/error` at opacity 1.0

This is a manual rebind in the screens file — three property changes on three nodes inside the Button frame.

### 4b. AgentBody embeds a hardcoded pill (Crew DS file, node `24:2`)

The `AgentBody` composite was built with a hand-rolled ellipse + text rather than composing a real `StateBadge` instance. Doesn't pick up StateBadge updates → renders as solid color block in Crew DS itself.

Fix: open AgentBody in Crew DS, delete the hand-built pill, replace with a `StateBadge` instance set to the variant matching the embedded sample (probably `state=waiting` to match the current sample data).

### 4c. Visual audit pass

Once the palette is correct and 4a/4b are resolved, screenshot all migrated frames + all 10 Crew DS composites via MCP `get_screenshot`. Walk through with the user. Surface and fix:

- Any other instance-level overrides masking palette updates
- Composites whose internal structure relies on hardcoded values that don't match the new palette
- Anything else the user notices that wasn't on this list

This audit might surface more issues than 4a/4b. Treat the unknown gap as part of the scope — don't pre-bound it.

## Section 5 — Doc + skill updates

### `docs/plans/design-system.md`

- Replace the "v1 overrides" section's "None for v1" claim with the new direct-to-tw/colors aliasing strategy
- Document the slate-mapping table from Section 1
- Note the architecture simplification: Crew DS now bypasses Core's `mode` collection
- Update the "Mode resolution" subsection to reflect the simpler chain
- Capture the future-extensibility patterns (the three patterns: stock Tailwind / extend Tailwind / custom semantic) in a new "Extending the palette" subsection

### `~/.claude/skills/figma-design-system-propagation/SKILL.md`

- Add to Trap 2 ("Mode collections don't auto-cascade across alias chains") a note: "Exception: when your override collection aliases directly to a mode-invariant primitive collection (like `tw/colors`) instead of through a multi-mode source collection (like `mode`), only one mode set is needed. Crew DS uses this direct-alias approach as of 2026-05-10."

### `~/.claude/skills/figma-screen-migration/SKILL.md`

- Phase 2's "Set modes (cross-collection)" section: similar exception note. Migration scripts can default to single-collection mode set if the project's design-system.md indicates direct-to-primitive aliasing.

### Memory entry (project-scoped)

Add a project memory: "Crew DS uses direct-alias-to-Tailwind-slate strategy" so future agent sessions don't reinvent the analysis.

## Future-extensibility patterns (informational)

The user asked: "with this new framework if we want to expand tailwind css colors in the future and add some custom ones will it be easy to do?" Answer: yes, three patterns cover all cases.

### Pattern 1 — Color is already in Tailwind palette

E.g. wanting to use `blue-500` somewhere new.

- **Code:** use `bg-blue-500` directly, or hook through a semantic via `var(--color-blue-500)`
- **Figma:** alias from Crew Semantic Colors to `Core / tw/colors / blue/500`. Or use the primitive directly without a semantic name.
- **No new infrastructure needed.** Current palette correction is entirely Pattern 1.

### Pattern 2 — Brand-new custom color not in Tailwind

E.g. wanting `brand-purple = #5b21b6`.

- **Code:** extend `@theme` block in `packages/dashboard/src/index.css`:
  ```css
  @theme {
    --color-brand-purple: #5b21b6;
  }
  ```
  Tailwind v4 auto-generates `bg-brand-purple`, `text-brand-purple`, etc.
- **Figma:** create a `Crew / Primitives` collection (JIT — only when first needed), add `brand-purple` variable. Optional: add a Crew Semantic Colors variable aliasing to it for semantic naming.

### Pattern 3 — Custom semantic on existing Tailwind value

E.g. wanting `warning` to map to `blue-500`.

- **Code:** extend `@theme` block: `--color-warning: var(--color-blue-500)`
- **Figma:** add `warning` variable to Crew Semantic Colors aliasing to `tw/colors / blue/500`. Same shape as how state tokens (`state/waiting` → `tw/colors / amber/400`) work today (added in CREW-119).

**Convention across all three:** the Tailwind class name in code matches the variable name in Figma. Designer says "I used `bg-warning`" → developer ships `bg-warning` → no translation step.

## Out of scope

- **Vertical slice work** for the remaining 8 frames (Projects list, Project Page, Register modal, New Run flow ×3, Edit project modal, Delete confirmation modal). That's Epic 2, separate spec.
- **QuickAction button wiring** (Resume / Finish / Inspect / Provide input → daemon endpoints). Functional concern, not visual; tracked in its own followup; will become a separate epic.
- **Composite skeleton-fidelity → pixel-fidelity polish** for the 10 Crew DS composites. Pre-existing followup; the user's plan is to handle this opportunistically during vertical slices, not as a standalone polish pass.
- **Light mode override** for Crew DS — light mode aliases get updated to slate alongside dark in Section 1, but a deep light-mode design pass (the dashboard ships dark-only today) is deferred until a light-mode-supporting fidelity ticket arrives.
- **`ErrorFallback` composite** (the only remaining un-built composite from Phase 4). Lands when a fidelity ticket touching error UI surfaces it.
- **Modifying Core** (the kit fork). All changes are in Crew DS and dashboard CSS only.

## Acceptance criteria

- [ ] All 19 standard shadcn semantic variables in `Crew / Semantic Colors` (group 1a) re-aliased per the table; both light and dark modes
- [ ] All 8 state tokens (group 1b) re-aliased per the table; both modes (mode-invariant)
- [ ] Chart, sidebar, and kit-extras (groups 1c–1e, 17 variables) explicitly documented as deferred — no action taken, rationale captured in design-system.md
- [ ] Dashboard `.dark` block in `packages/dashboard/src/index.css` updated per Section 2a (19 tokens)
- [ ] Dashboard `:root` block updated per Section 2b (19 tokens), with browser smoke test confirming any swapped shade looks right
- [ ] Dashboard `@theme` state colors updated per Section 2c (7 tokens)
- [ ] Crew DS published in Figma desktop
- [ ] Cache verification per propagation skill's Trap 4 confirms latest aliases reach the screens file (sample at least 3 different tokens — e.g. `background`, `state/error`, `border`)
- [ ] Screenshots of frames `1:2`, `1:378`, `1:1900` (via MCP `get_screenshot`) show the new slate palette rendering, with state pills showing the new \*-400 mapping where applicable
- [ ] Inspect button (frame `1:2`) follows tinted-bg pattern
- [ ] AgentBody composite (Crew DS node `24:2`) embeds a real StateBadge instance, not a hand-rolled pill
- [ ] Visual audit done; any newly-surfaced issues either fixed or explicitly deferred with a followup entry
- [ ] `docs/plans/design-system.md` updated per Section 5 (includes the deferred groups so future agents see the gap)
- [ ] `figma-design-system-propagation` skill amended per Section 5
- [ ] `figma-screen-migration` skill amended per Section 5
- [ ] Project memory entry added for the direct-alias strategy
- [ ] No regressions in dashboard dev server when running in dark mode (smoke test: Agents page, drawer open, agent page full)

## Risks + mitigations

| Risk                                                                            | Mitigation                                                                                                                                                                                       |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Slate visual shift surprises the user                                           | Spec calls out the shift in Section 2; review screenshots in browser after deploy and rollback if undesirable                                                                                    |
| Re-aliasing breaks frames whose mode setup assumes Core's `mode` collection     | Existing frames have explicit Core mode set already (set during migration); leaving it doesn't hurt. New frames migrated post-fix only need Crew Semantic Colors mode — captured in skill update |
| Dashboard dev/prod render divergence                                            | CSS change is straightforward (custom hex → Tailwind utility var); both dev and prod use the same compiled CSS, no SSR concerns                                                                  |
| Re-alias scripts hit override-stickiness on already-bound fills in screens file | Migrated frames' fills were bound BEFORE the palette correction; bindings stay valid (same variable id), only resolved value changes. No re-binding needed in consumer fills.                    |
| Light mode looks wrong after slate switch                                       | Dashboard ships dark-only; light mode is unused at runtime. Visual check happens during a future light-mode-supporting fidelity ticket.                                                          |

## Open questions

None. The mapping decisions in Section 1 are intentional approximations of the dashboard's hand-picked palette to stock slate shades (per user's chosen approach). If specific mappings produce undesirable visual results during Section 3 verification, individual semantics can be adjusted in a follow-up edit without recasting the architecture.
