# visual-fidelity-check workflow

The complete step-by-step procedure for running the gate. Each step has acceptance criteria — if you can't satisfy them, the step fails and the gate fails closed.

## Step 0: Read project config

```
1. cat <repo>/.crew/visual-fidelity.json   (or read [visual_fidelity] block from the main project TOML if no JSON exists)
2. If missing: see "Failure modes — Project has no config" in SKILL.md. Decide whether to proceed.
3. Record: figmaFileKey, snapshotPath, componentDir, codeConnectGlob, dashboardUrl
```

Verify the snapshot exists: `ls <snapshotPath>/index.json`. If not, **STOP** and surface as blocker.

## Step 1: Identify touched components

Run `git diff --name-only <base>...HEAD` (base = the PR's target branch, usually `main`). Filter to:

- Files under `componentDir` matching `*.tsx` (component sources)
- Files under `componentDir` matching `*.test.tsx` (test files — note for visual context, don't analyze)
- Any `.figma.tsx` files (Code Connect mappings — these signal touched components)
- Helper files referenced by the components (`lib/*-variants.ts`, `lib/utils.ts` if changed, `data/*.ts` if changed)

For each `.tsx` source file, the matching component is its export. For each `.figma.tsx` file, the linked component is the one it `figma.connect`s.

If the touched-component list is empty: gate is a no-op, **proceed** (but log that the gate ran and found nothing to check).

## Step 2: Map each component to its Figma reference

For each touched component:

1. Find the matching `.figma.tsx` file. If absent, flag it as a finding ("component has no Code Connect mapping, can't verify against Figma") and continue without a reference.
2. Parse the `.figma.tsx` to extract:
   - The Figma URL → parse the `node-id` query param → that's the Figma node ID (replace `-` with `:` for the canonical form)
   - The `restrictToVariants` config if present (tells you which Figma variants this code component maps to)
3. Look up the node ID in `<snapshotPath>/index.json` → get the path to the metadata JSON + screenshot.
4. Read the metadata JSON. Two data tiers may be present:
   - **`raw`** (always present) — full REST API node tree. Use for canonical structure, names, geometry, basic fills/strokes hex values.
   - **`enrichment`** (present when `crew figma-snapshot` completed its Plugin-API pass; absent on REST-only fallback runs) — adds:
     - `componentProperties` — for INSTANCE nodes, the _specific_ variant config (e.g. `{ type: "pill", color: "waiting", intensity: "mid", Icon: { id: "lucide/circle", name: "lucide/circle" } }`). INSTANCE_SWAP icon properties resolve to `{ id, name }` so you can read the specific lucide glyph directly.
     - `mainComponent` — `{ id, name, parentSetName }` for INSTANCE nodes, naming the resolved master variant (e.g. `name: "type=pill, color=waiting, intensity=mid"`).
     - `boundVariables` — flattened array of `{ path, variableName, resolvedAlias, resolvedHex }` per paint. `resolvedAlias` is the alias chain (e.g. `"state/running -> slate/400"`), `resolvedHex` is the final color in `#RRGGBB` form.

   **Always prefer `enrichment` over inferring from `raw`** when both are present — it carries the data REST can't expose. If `enrichment` is missing for a node you need to check, log this as a verification gap and degrade to inference from `raw`.

If the snapshot doesn't contain the node ID at all: the snapshot is incomplete for this component. Flag and continue.

## Step 3: Structural check

For each (component, variant) pair the code can produce:

1. Read the component source. Identify the cva config / helper function that produces classes for this variant.
2. Compute the class string the variant would emit. E.g., for `Button({ color: 'running', intensity: 'mid', size: 'sm' })`:
   - From `buttonSizes.sm`: `h-8 gap-1.5 px-3 text-sm ...`
   - From `pillSurfaceClasses('running', 'mid')`: `bg-slate-1050 border border-slate-500 text-slate-400`
   - From `buttonBase`: `inline-flex shrink-0 items-center justify-center gap-2 rounded-md font-medium ...`
3. Resolve each Tailwind class to its CSS hex value (use the project's known token map — e.g. `bg-slate-1050` → `#1C2538` from Crew's Tailwind extensions).
4. **Compare against Figma's enriched data first**, then fall back to `raw` if enrichment is absent:
   - **With `enrichment.boundVariables`** (preferred): each entry is `{ path: "fills[0].color", resolvedAlias: "state/running -> slate/400", resolvedHex: "#94A3B8" }`. Match by `resolvedHex`. Faster + unambiguous — no need to map token aliases yourself.
   - **REST-only fallback**: read `raw.fills`, `raw.strokes`, `raw.textColor` and compare hex against the code's emitted Tailwind values via the project token map.
5. For each property:
   - **Match (computed value == hex):** no finding
   - **Mismatch:** finding. Cite both sides:
     - Code: `bg-neutral-200` → #E5E5E5
     - Figma: `resolvedAlias: zinc/50` → #FAFAFA
     - Severity: depends on visual impact (large hex delta = high; near-identical hex = low)

Repeat for every (variant, property) combination the code can produce. Skip variants the code can't reach (e.g., if `Button` only accepts `xs | sm | default | lg`, don't check `button-icon-*` variants against Button's source).

## Step 4: Caller check

For each touched component, also check its callers:

1. `grep -rn '<ComponentName' <componentDir>` (exclude `.test.tsx` and `.figma.tsx`).
2. For each caller, extract the props passed: `<Button color="X" intensity="Y" size="Z">...</Button>`.
3. Look up the Figma file's Dashboard Screens snapshot for instances of the same component in the same screen / context. Read `<snapshotPath>/screens/<node>.json`. **The enrichment field is load-bearing here** — it's how you learn what variant the Figma design _actually_ uses, not just what set the instance points at:
   - **With `enrichment.componentProperties`** (preferred): the instance's variant config is read directly: `enrichment.componentProperties.{ type, color, intensity, Icon, Label, ... }`. INSTANCE_SWAP properties like `Icon` resolve to `{ id, name }` (e.g. `Icon: { id: "lucide/circle", name: "lucide/circle" }`) — read the specific lucide glyph name directly, no inference.
   - **With `enrichment.mainComponent.name`**: the resolved master variant is named (e.g. `"type=pill, color=waiting, intensity=mid"`) — parse the variant key=value pairs out of the name as a confirmation cross-check.
   - **REST-only fallback**: you only have the parent component ID; you must guess the variant from the instance's resolved styles. Note this as a verification gap.
4. Compare caller's chosen variant to Figma's variant for that instance:
   - Same → no finding
   - Different → finding. Cite (with enrichment data):
     - Caller file:line: `<Badge intensity="muted">`
     - Figma instance at `1:756` (agent drawer): `componentProperties.intensity = "mid"` (per `<snapshotPath>/screens/1-756.json` enrichment)
     - Diff: intensity should be `mid`, not `muted`

**When recommending a fix that names a specific lucide icon or other specific Figma resource, ALWAYS pull the exact name from `enrichment.componentProperties.{prop}.name`.** Do not infer or extrapolate from set-level defaults — set-level defaults are often unrelated to what individual instances actually use (the Pill set's default Icon is `lucide/git-pull-request`, but state-badge instances use `lucide/circle`, View PR instances use `lucide/git-pull-request`, Open as page uses `lucide/arrow-up-right` — all different per instance).

Also check for **content-level mismatches**:

- **Icon mismatches — ALWAYS a flag, never a judgment call.** Icons carry visual identity; treat them as first-class findings. Three sub-cases:
  - **Wrong primitive (Unicode vs SVG):** caller passes `↗`, `✓`, `×`, or any other Unicode glyph in text content where Figma's component property declares an `Icon` INSTANCE_SWAP. Flag with severity ≥ medium.
  - **Wrong specific icon:** caller passes an SVG, but it's a different lucide / icon-set glyph than what the Figma reference shows. (Even if it's "close" — a circle outline vs filled circle, an arrow-up vs arrow-up-right.) Flag with severity ≥ medium.
  - **Wrong icon shape (CSS approximation):** code renders a CSS-only span (e.g. `<span class="rounded-full h-1.5 w-1.5">`) as a stand-in for what Figma defines as an actual SVG icon component. Flag with severity ≥ medium — visually similar but a different primitive, and breaks the moment Figma's icon changes.
  - **Naming the right icon is part of the fix.** Don't write "use an SVG" — write "use `lucide/arrow-up-right` (per the Figma reference's `Icon` property)." If the snapshot's per-instance JSON doesn't tell you which icon (REST API limitation — see `docs/followups.md`), check the set-level default in the Pill set JSON's `componentPropertyDefinitions[Icon].defaultValue` for a starting guess, AND state explicitly that the icon was inferred, not directly read from the instance.
- **Stale className overrides** that fight the system: a `className="border-..."` after passing `intensity="ghost"` — the className probably overrides the intensity's intent. Flag for review.
- **Children content shape:** `<Button asChild><a>X ↗</a></Button>` patterns where Figma uses `<Button hasIcon><a>X</a></Button>` instead.

> **Anti-loophole:** If a finding maps to "the rendered visual doesn't match the Figma icon", do NOT downgrade it to a judgment-call / "visually similar enough" note. Icon mismatches are real bugs even when small. The user notices.

## Step 5: Live DOM check (required when `dashboardUrl` is set and chrome MCP is wired)

This step uses the `browsing` skill's `mcp__chrome__use_browser` tool to inspect the rendered DOM directly — reading computed CSS, the rendered `<svg>` for icons, and a viewport screenshot via auto-capture. Step 5 catches drift the static Step 3 cannot (Tailwind purging, specificity wars, theme overrides, conditional rendering bugs).

**Required when:** `dashboardUrl` is set in project config AND the worktree's `.mcp.json` includes a `chrome` server entry. (The dispatcher writes the chrome entry when the user has `superpowers-chrome` installed; missing chrome means the step degrades to a verification gap, not "passed".)

### Step 5.1 — Open the dashboard

Use `mcp__chrome__use_browser` with `action: "navigate"`, payload set to the resolved `dashboardUrl` from project config. Then `action: "await_element"` on a known landing-page selector (the dashboard's root layout element) with a generous timeout.

If chrome is unreachable or the navigate fails: log "verification gap: chrome unreachable at `<url>`" and skip 5.2–5.5. **Do not** mark Step 5 as passed.

### Step 5.2 — Identify the live element for each touched (component, variant)

For each (component, variant) the code can produce, identify the dashboard route or in-app navigation that surfaces an instance. Reuse the caller-map work from Step 4 — it already enumerates call sites. Pick a screen that exercises the variant.

Selector identification is the agent's responsibility per dispatch:

1. **Prefer `data-*` attributes** if the project's components expose them (`[data-component="agent-row"]`, etc.).
2. **Fall back to class signatures** that uniquely identify the variant (`.bg-state-running.border-state-running\/30`).
3. **Last resort: structural selectors** (`main > section > .first-row`). If you use a structural selector, log a verification-gap note in the report — the selector is fragile.

### Step 5.3 — Color-property check

For each touched (component, variant) instance:

1. Query the live element via the selector identified in 5.2.
2. Use `use_browser` `action: "eval"` with a small payload:
   ```js
   const el = document.querySelector('<selector>');
   const cs = getComputedStyle(el);
   return { bg: cs.backgroundColor, border: cs.borderColor, color: cs.color };
   ```
3. CDP returns each value in `rgb(R, G, B)` or `rgba(R, G, B, A)` form. Convert to `#RRGGBB` (and note alpha separately if present).
4. Look up the same paint role in the Figma snapshot's `enrichment.boundVariables` for this node. Compare `resolvedHex` to the computed value.
5. On mismatch: finding. Severity follows the existing rules (large hex delta = high; near-identical = low). Cite the live element's selector, the computed CSS value, and the Figma `resolvedAlias` + `resolvedHex`.

### Step 5.4 — Icon check

For each touched component whose Figma reference has an `Icon` INSTANCE_SWAP property (read from `enrichment.componentProperties.Icon`):

1. Query the icon slot via selector (`[data-icon-slot]`, the first child, etc.).
2. Use `use_browser` `action: "eval"` to inspect the rendered child:
   ```js
   const slot = document.querySelector('<selector>');
   const svg = slot.querySelector('svg');
   const span = slot.querySelector('span:not(:has(svg))');
   return {
     hasSvg: !!svg,
     svgOuter: svg?.outerHTML?.slice(0, 500),
     svgLucide:
       svg?.getAttribute('data-lucide') ||
       [...(svg?.classList || [])].find((c) => c.startsWith('lucide-')),
     spanText: span?.textContent,
     slotText: slot.textContent,
   };
   ```
3. Cases:
   - **`hasSvg` true, `svgLucide` matches `enrichment.componentProperties.Icon.name`** (e.g. both `lucide/circle`) → no finding.
   - **`hasSvg` true, `svgLucide` mismatches** → finding, severity ≥ medium. Name the expected lucide glyph in the fix.
   - **`hasSvg` false, `spanText` is a Unicode glyph** (↗, ✓, ×, etc.) → finding, severity ≥ medium. Name the expected lucide glyph.
   - **`hasSvg` false, `slot` is a styled `<span>`** (CSS-only icon) → finding, severity ≥ medium. Name the expected lucide glyph and call out the CSS-only-approximation pattern.

Step 5.4 is the _runtime_ counterpart to Step 4's caller-side icon check. Step 4 catches the source pattern; Step 5.4 catches cases where the source looks right but the rendered DOM disagrees (className override, conditional rendering, prop-forwarding bug).

### Step 5.5 — Screenshot capture and cross-reference

`use_browser`'s auto-capture saves a viewport PNG on every action — by the time you've completed 5.1–5.4, you have a stack of screenshots. Cite the most recent one (after navigation to the relevant screen) in the report. Cross-reference it with `<snapshotPath>/screens/<screen-node>.png` from the Figma snapshot.

If 5.1–5.4 already surfaced findings, link the screenshot pair as supporting evidence rather than redundantly describing the same diff in prose.

**Failure mode (dashboard unreachable mid-run):** if Step 5.1 succeeded but a subsequent action fails because docker stopped / port mismatch / etc., fail closed — log "verification gap: dashboard became unreachable at <action>" and surface in the report. Do not treat as "Step 5 passed."

## Step 6: Compile findings report

Report format (markdown, ~50-200 lines depending on findings count):

````markdown
# visual-fidelity-check report — YYYY-MM-DD

**Branch:** <branch name>
**Base:** <base branch>
**Touched components:** N
**Findings:** N high, N medium, N low (P pre-existing, F from this PR)

## High-severity findings

### Finding 1: <one-line summary>

- **Kind:** structural / caller / visual
- **File(s):** path:line
- **Code:**
  ```tsx
  <2-5 lines>
  ```
````

- **Figma reference:** node-id, variant name, relevant tokenAlias / hex
- **Diff:** what code produces vs what Figma intends
- **Fix:** specific change to make

## Medium-severity findings

(same format)

## Low-severity findings / judgment calls

(same format, plus a recommendation: flag in PR description, file as followup, fix in-scope, or accept as-is)

## Verification gaps

(things the skill could not check — missing snapshot data, unreachable dashboard, components without .figma.tsx, etc.)

```

## Step 7: Decide whether to claim done

| Findings | Action |
|---|---|
| Zero | Proceed to PR. Include the report (or a brief summary + link) in the PR description. |
| Any high-severity | DO NOT claim done. Fix, re-run the gate. |
| Only medium / low | Decide per-finding: fix now, or surface explicitly in PR description as "known issue, will follow up". Tell the user about the medium / low findings before they review the PR. |
| Verification gaps (couldn't run all checks) | Surface explicitly. Don't silently treat "skipped" as "passed". |

Default to fixing rather than deferring. Each deferred finding is a chance for the agent's eyeball-smoke to creep back in.

## Rules of evidence

- Don't generate findings without citing both code AND Figma reference. A finding like "padding might be off" with no specific values is unhelpful — sharpen or drop.
- Don't trust the spec / plan / cva config alone. They might be wrong. The Figma snapshot is the source.
- Don't over-fit to a single fixture. Findings should be general patterns (caller-side intensity mismatch, wrong helper shade, Unicode-vs-SVG) that recur across the codebase.
- If a finding's "fix" requires more than 5 lines of code change, escalate as a question rather than auto-fixing. Maybe the helper is wrong in a way that affects 30 sites — that's not a routine fix.
```
