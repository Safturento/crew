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
   - **`raw`** (always present) — top-level REST API properties only (fills, strokes, absoluteBoundingBox, layoutMode, paddings, cornerRadius, effects, etc.). The recursive `children` subtree is deliberately omitted — nested instance data lives in `enrichment.componentInstances`. Use `raw` for top-level paint hex values, geometry, and layout when `enrichment` is missing.
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

## Step 4 — Caller check (render-frame anchored)

For every caller in the touched-files diff, walk:

1. **Find the render composite.** Open `<caller>.figma.tsx` in the same directory (or the nearest `.figma.tsx` that references the caller). Resolve its `figma.connect(...)` URL to a `{fileKey, nodeId}`. The composite JSON lives at `<fixture-root>/snapshot/composites/<safe-id>.json` (where `safe-id` is nodeId with `:` replaced by `-`).

2. **Bail if the composite is missing.** If the file does not exist, surface as:
   > **HIGH (missing-data, blocking):** caller `<file>:<line>` references render frame `<nodeId>`; composite JSON `<path>` not in fixture. Run `crew figma-snapshot` (or scope-extend the existing run) to capture before proceeding.

   Do **not** fall back to diffing against the component set. Falling back is the regression this rule closes.

3. **Find the relevant nested instance.** Inside the composite's `enrichment.componentInstances` array, match against the caller by:
   1. **Label first.** If the caller renders a Pill labelled `"New Run"`, find the entry where `componentPropertyOverrides.Label === "New Run"`.
   2. **Path next.** If no Label match (or multiple matches), use the `path` breadcrumb to disambiguate by position in the composite tree.
   3. **Position last.** If neither resolves, fall back to "the Nth instance of this mainComponentSetId in the composite", matching to the Nth call site in the caller's JSX.

   If no match resolves, surface as:
   > **MEDIUM (verification-gap):** caller `<file>:<line>` renders `<Primitive>` but no matching instance found in composite `<nodeId>`. Manual disambiguation required.

4. **Diff caller props vs `entry.variantOverrides`.**
   - Any mismatch on a variant axis (`color`, `intensity`, `size`, `type`) → **HIGH (encoding error)**.
   - Example: caller has `<Button color="white" intensity="loud" size="xs">` but `entry.variantOverrides == "type=button-sm, color=idle, intensity=loud"`. Wrong variant entirely — the bug is in the code or the upstream spec, not in token deltas.

5. **Diff `entry.componentPropertyOverrides` vs caller's prop values.**
   - Icon name mismatch (caller passes `<Plus />`, override is `lucide/check`) → **HIGH (encoding error)**.
   - `Has Icon` mismatch (caller passes `icon` prop when override is `false`, or vice versa) → **MEDIUM**.
   - `Label` mismatch (caller's children text doesn't match override) → **LOW** (often expected — components accept text via children regardless).

6. **Diff `entry.resolvedStyles` vs the surface classes the caller's props would emit.**
   - Variant axes all match but `resolvedStyles` carries a fill/stroke override that the caller's surface classes don't reproduce (rare — instance-level style override on top of the variant) → **MEDIUM**.
   - Tag with hex + tokenAlias from `resolvedStyles` so the fix is unambiguous.

This sub-flow is mechanical. Follow it as a checklist — no judgment calls about "what counts as the right reference." The render composite is the right reference. Always.

### Step 4 severity rules (anti-loophole summary)

| Finding | Severity |
|---|---|
| Caller's variant axis prop ≠ `entry.variantOverrides` | **HIGH (encoding error)** |
| Render composite missing for a touched caller | **HIGH (missing-data, blocking)** |
| Icon name mismatch (`componentPropertyOverrides.Icon`) | **HIGH (encoding error)** |
| `Has Icon` mismatch | **MEDIUM** |
| Instance-level style override not reproduced by caller's classes | **MEDIUM** |
| Verification gap (no matching nested instance found) | **MEDIUM** |
| `Label` text mismatch | **LOW** (usually expected) |

**Never** diff against a component **set** variant when a render composite exists. If a finding's "Figma reference" line names `composites/272-120.json` (or any other set's JSON) instead of a render composite, the diff target is wrong — re-do Step 4 with the proper composite.

## Step 5: Live DOM check (required when `dashboardUrl` is set and chrome is wired)

Steps 3–4 read code and callers; neither reads the _rendered_ DOM. Step 5 opens the running dashboard via the chrome MCP server and inspects live elements — computed styles and rendered SVG — against the Figma snapshot's `enrichment` data. This catches runtime-only failures the static checks cannot: purged Tailwind classes, CSS specificity wars, theme overrides, and icons where the source looks right but the rendered glyph is wrong.

**When this step runs:**

- `dashboardUrl` set **and** the `chrome` MCP server is wired (`mcp__chrome__use_browser` available) → Step 5 is **required**.
- `dashboardUrl` set but chrome is **not** wired (the `superpowers-chrome` plugin is not installed on this machine) → log a verification gap, skip 5.1–5.5, and record the gap in the report so the user can decide to install the plugin or accept partial coverage.
- `dashboardUrl` **not** set → skip Step 5 (consistent with Steps 1–4 behavior).

**Step 5.1 — Open the dashboard.** Call `mcp__chrome__use_browser` with `action: "navigate"` to the resolved `dashboardUrl`. Wait for a known ready-state element (`await_element` on a landing-page selector). If chrome is unreachable or navigate fails, log `verification gap: chrome unreachable` and skip 5.2–5.5.

**Step 5.2 — Navigate to a screen exercising each touched component.** For each `(component, variant)` the code can produce, identify the dashboard URL or in-app navigation that surfaces an instance of that variant. Reuse the caller map from Step 4 to pick a screen.

**Step 5.3 — Color-property check.** For each touched `(component, variant)`:

1. Query the live element via CSS selector. **Selector identification is the agent's responsibility:** prefer `data-*` attributes if present, fall back to component-name class signatures, fall back to structural selectors as a last resort. If the project's components expose no stable selectors and you must use fragile structural ones, surface that as a verification-gap note in the report.
2. Use `mcp__chrome__use_browser` `action: "eval"` to read `getComputedStyle(el)`'s `backgroundColor`, `borderColor`, `color`. CDP returns these as `rgb(...)`.
3. Convert each to `#RRGGBB`.
4. Compare to `enrichment.boundVariables.resolvedHex` for the corresponding paint role from the Figma snapshot.
5. On mismatch: finding. Severity per the existing rules (large hex delta = high, near-identical = low). Cite both sides plus the live element's selector.

**Step 5.4 — Icon check.** For each touched component with an `Icon` INSTANCE_SWAP property in Figma (`enrichment.componentProperties.Icon`):

1. Query the icon slot via selector.
2. Use `action: "eval"` to read `el.querySelector('svg, span')?.outerHTML` and `el.textContent`.
3. If it is an `<svg>`, read the lucide name (`data-lucide` / class signature / known marker) and compare to `enrichment.componentProperties.Icon.name`. Mismatch → finding, severity ≥ medium.
4. If it is a `<span>` standing in for an icon, or a Unicode text node, → finding, severity ≥ medium. Name the expected lucide glyph in the fix.

Step 5.4 is the runtime counterpart to Step 4's caller-side icon check — it catches cases where the source looks right but the rendered DOM disagrees (className override, conditional rendering, prop-forwarding bug).

**Step 5.5 — Screenshot cross-reference.** `use_browser` auto-captures a viewport PNG on every action. Cite the most recent capture path in the report and cross-reference it with `<snapshotPath>/screens/<screen-node>.png` from the Figma snapshot. If 5.1–5.4 already surfaced findings, link the screenshot pair as supporting evidence rather than re-describing it in prose.

**Failure mode:** if chrome is wired but the dashboard is unreachable (docker stack down, port mismatch), Step 5 fails closed — log `verification gap: dashboard unreachable at <url>` and surface it in the report. Do **not** treat dashboard-unreachable as "Step 5 passed."

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
