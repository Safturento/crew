# superpowers-chrome agent integration for visual-fidelity DOM inspection

## Context

The `visual-fidelity-check` skill is now firing reliably on every UI-touching `crew run` dispatch in projects with `[visual_fidelity]` configured (B1, shipped 2026-05-13: CREW-143, CREW-144, CREW-145). Its workflow runs four meaningful steps end-to-end — config read, touched-component identification, structural check (code's emitted classes vs Figma's resolved tokens), caller check (caller's variant props vs Figma's instance variant).

Step 5 (visual check) is currently a degraded placeholder. It reads:

> If `dashboardUrl` is set in project config AND the dashboard is reachable:
>
> 1. Open the dashboard via Playwright MCP (or whatever browser-control MCP is wired up).
> 2. For each touched component, navigate to a screen that exercises it…
> 3. Screenshot the relevant region.
> 4. Compare to Figma's screen-level screenshot from `<snapshotPath>/screens/`. Describe what you see in both, side-by-side.

The step is optional, the comparison is screenshot-vs-screenshot eyeballing, and the only browser the agent has wired up today is `@playwright/mcp` — which is fine for fresh-instance smoke runs but awkward for the kind of inspection visual fidelity actually needs.

The lived experience from the CREW-135 calibration runs and the ultimate test (May 12) is that **the structural Step 3 catches most things, but a non-trivial set of bugs only surface at runtime**:

- Tailwind classes the cva _would_ emit get purged because no caller uses them at compile time.
- CSS specificity wars where a parent's `bg-*` wins over the component's intended `bg-*`.
- Dark-mode / theme overrides applying when the design expects the light variant.
- Rendered icons: code passes the right _prop_, but the `<svg>` actually rendered is the wrong lucide glyph (or a CSS-only `<span>` standing in for an icon, surviving Step 4 because Step 4 only reads source).

Step 3 reads code; Step 4 reads callers. Neither reads the _rendered_ DOM. The screenshot-eyeball loop in the current Step 5 catches some of this when it runs, but it's brittle (pixel diffs degrade fast under DPR/font/rendering variance) and slow (the agent has to describe two screenshots in prose and compare).

The right primitive for this is Chrome DevTools Protocol: open the dashboard, navigate to the screen that exercises the touched component, query the live element via CSS selector, read computed styles directly, inspect the rendered `<svg>`, and compare each value to the Figma snapshot's `enrichment.boundVariables.resolvedHex` and `enrichment.componentProperties.Icon.name`. Programmatic, deterministic, and catches the runtime-only failures Step 3 cannot.

The `superpowers-chrome` plugin already provides this — a `browsing` skill plus a `chrome` MCP server (`use_browser` tool) that auto-starts Chrome and exposes CDP under a single action-based interface. It's installed in the user's local plugin cache today, but crew's worktree dispatch doesn't wire it into the agent's environment. That's what this spec addresses.

This is **B2**, the follow-up flagged in the B1 spec.

## Goals

1. **The chrome MCP server is available to crew-dispatched agents** in projects with `[visual_fidelity]` configured. Wired in alongside the existing playwright MCP (not replacing it), so the agent can reach `mcp__chrome__use_browser` for DOM inspection while playwright remains for smoke + authored E2E.

2. **The `browsing` skill is injected into the worktree** alongside `visual-fidelity-check`, so the agent has the action reference for `use_browser` close at hand instead of guessing.

3. **`visual-fidelity-check`'s Step 5 is rewritten as a live-DOM inspection step** that uses chrome to read computed styles and rendered SVG and compare to the Figma snapshot's enrichment data. Step 5 becomes required (not optional) when `dashboardUrl` is set; remains skipped with a verification-gap note when it isn't.

4. **Failure to find the chrome MCP server in the user's plugin cache does not block dispatch.** The agent falls back to the prior behavior (Step 5 degrades to "verification gap" and the structural + caller steps continue to run).

## Non-goals

- **Removing playwright-mcp.** Smoke runs (`npm run bruno:smoke`, `npm run test:e2e`) still need playwright; chrome is additive.
- **Vendoring the chrome MCP binary into crew.** We resolve from the user's installed plugin cache — same pattern `writeMcpFile` already uses for the chromium binary path.
- **A new `[chrome_browsing]` TOML block.** Chrome travels with `[visual_fidelity]`. Adding another knob would just create config surface for a thing that has no independent use case today.
- **Live-DOM inspection of paths outside `componentDir`.** The skill scopes to per-project `componentDir`; this step inherits that scope.
- **Cross-machine reproducibility when `superpowers-chrome` isn't installed.** If the plugin is absent, crew skips wiring chrome and warns. We don't try to auto-install it.

## Design

### Change B2.1 — Wire chrome MCP into the worktree's `.mcp.json`

> **Project-specific:** edits land in `packages/cli/src/lib/playwright/build-mcp-config.ts`, `packages/cli/src/lib/playwright/write-mcp-file.ts`, a new `packages/cli/src/lib/playwright/resolve-chrome-mcp-path.ts`, and `packages/cli/src/commands/run.ts`.

`writeMcpFile` currently emits a single-server `.mcp.json`:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest", "--headless", "--executable-path", "<chromium>"],
      "env": { "CREW_APP_URL": "<resolved>" }
    }
  }
}
```

Extend `buildMcpConfig()` to optionally emit a second `chrome` server alongside playwright:

```json
{
  "mcpServers": {
    "playwright": { ... },
    "chrome": {
      "command": "node",
      "args": ["/home/safturento/.claude/plugins/cache/superpowers-marketplace/superpowers-chrome/2.0.0/mcp/dist/index.js"]
    }
  }
}
```

New `resolveChromeMcpPath(homeDir?)`:

1. Looks in `~/.claude/plugins/cache/superpowers-marketplace/superpowers-chrome/`.
2. If the directory exists, lists immediate children (each is a version subdir like `2.0.0/`), picks the highest valid semver.
3. Returns `<dir>/<version>/mcp/dist/index.js` if it exists on disk.
4. Returns `null` otherwise (no plugin installed, no version dir, no built `dist/index.js`).

`writeMcpFile()` opts gain a `visualFidelity` boolean (renamed signature: drop the unused `appUrl`/`chromiumPath` if no playwright wiring is needed). When `visualFidelity` is set:

- Call `resolveChromeMcpPath()`.
- If it returns a path, include the `chrome` server entry in the emitted config.
- If it returns `null`, log a `pc.yellow` warning (`! superpowers-chrome plugin not found in ~/.claude/plugins/cache/ — chrome MCP not wired; visual-fidelity Step 5 will degrade to verification-gap`) and emit the playwright-only config.

`run.ts` currently gates writing `.mcp.json` on `playwrightEnabled(config) && config.playwright && smokeEnabled(config)`. Extend the gate so the file is also written when `config.visual_fidelity` is set (with playwright off / smoke off), since chrome-only is a valid configuration. The exact predicate:

```ts
const wantsMcp =
  (playwrightEnabled(config) && smokeEnabled(config)) || Boolean(config.visual_fidelity);
if (wantsMcp) {
  await writeMcpFile(worktree, {
    playwright:
      playwrightEnabled(config) && smokeEnabled(config)
        ? { appUrl, resolverCwd: config.repo_path }
        : undefined,
    chrome: Boolean(config.visual_fidelity),
  });
}
```

(Naming TBD during implementation — the writer's option shape probably wants a small refactor away from flat `{appUrl, resolverCwd}` toward `{playwright, chrome}` sub-objects so the conditionals stay clean.)

**Optional rename, in-scope for this ticket:** `packages/cli/src/lib/playwright/` is no longer accurate once chrome lives there. Rename to `packages/cli/src/lib/mcp-config/` and update the public re-export at `packages/cli/src/lib/index.ts`. This is a directory rename plus an import path bump — keep it in scope so the name doesn't lie for the next reader.

### Change B2.2 — Vendor the `browsing` skill into crew's skill-injection set

> **Project-specific:** edits land in `packages/cli/src/lib/skills/browsing/` (new), `packages/cli/src/lib/run/skill-injection.ts`, and `packages/cli/src/lib/run/skill-injection.test.ts`.

Add a vendored copy of the `browsing` skill source under `packages/cli/src/lib/skills/browsing/`:

```
packages/cli/src/lib/skills/browsing/
  SKILL.md
  COMMANDLINE-USAGE.md           # full action reference
  EXAMPLES.md                    # usage patterns
  README.md                      # short overview
  lib/                           # any helper docs the skill links to
```

The skill source is text/markdown only — we are **not** vendoring the MCP binary (that resolves from cache per B2.1). The skill files are static reference material and almost never change upstream; tracking them in-tree avoids the dispatch-time failure mode where a user installed `crew` but not `superpowers-chrome`.

Extend `SKILL_APPLICABILITY` in `skill-injection.ts`:

```ts
const SKILL_APPLICABILITY: ReadonlyArray<{
  name: string;
  applicable: (config: ProjectConfig) => boolean;
}> = [
  { name: 'visual-fidelity-check', applicable: (config) => Boolean(config.visual_fidelity) },
  { name: 'browsing', applicable: (config) => Boolean(config.visual_fidelity) },
];
```

Both skills travel together. Same gate. `copySkillIntoWorktree` already handles arbitrary skill names from the source root — no changes needed there.

### Change B2.3 — Rewrite `visual-fidelity-check` Step 5 as live-DOM inspection

> **Project-specific:** edits land in `packages/cli/src/lib/skills/visual-fidelity-check/workflow.md` (Step 5 section) and `packages/cli/src/lib/skills/visual-fidelity-check/SKILL.md` (Workflow overview + Related skills).

The current Step 5 is optional, screenshot-only, and effectively never fires. Rewrite it as a structured live-DOM inspection step with five sub-steps:

**Step 5.1 — Open the dashboard.** Use `mcp__chrome__use_browser` with `action: "navigate"`, payload set to the resolved `dashboardUrl` from project config. Wait for the dashboard's known ready state (await_element on a known landing-page selector). If chrome is unreachable or the navigate fails, log "verification gap: chrome unreachable" and skip 5.2–5.5.

**Step 5.2 — Navigate to a screen that exercises each touched component.** For each (component, variant) the code can produce, identify the dashboard URL or in-app navigation that surfaces an instance of that variant. The skill's existing caller-map work (Step 4) already enumerates call sites; reuse that map to pick a screen.

**Step 5.3 — Color-property check.** For each touched (component, variant):

1. Query the live element via CSS selector. **Selector identification is the agent's responsibility per dispatch** — the skill describes the strategy (prefer `data-*` attributes if present, fall back to component-name class signatures, fall back to structural selectors as last resort) but does not enforce a specific scheme. If the project's components don't expose stable selectors and the agent has to fall back to fragile structural ones, surface that as a verification-gap note in the report. Adding `data-component` / `data-variant` attributes to the Crew DS pill primitives is filed as a separate out-of-scope follow-up.
2. Use `use_browser` `action: "eval"` with a small payload reading `getComputedStyle(el).backgroundColor`, `borderColor`, `color`. CDP returns these in `rgb(...)` form.
3. Convert each to `#RRGGBB`.
4. Compare to `enrichment.boundVariables.resolvedHex` for the corresponding paint role from the Figma snapshot.
5. On mismatch: finding. Severity follows the existing rules (large hex delta = high, near-identical = low). Cite both sides plus the live element's selector.

**Step 5.4 — Icon check.** For each touched component that has an `Icon` INSTANCE_SWAP property in Figma (`enrichment.componentProperties.Icon`):

1. Query the icon slot via selector.
2. Inspect the rendered child: is it an `<svg>`? Is it a `<span>`? Is it a Unicode text node? Use `use_browser` `action: "eval"` to read `el.querySelector('svg, span')?.outerHTML` and `el.textContent`.
3. If it's an `<svg>`, read the lucide name from `data-lucide` / class signature / known marker. Compare to `enrichment.componentProperties.Icon.name`. Mismatch → finding, severity ≥ medium.
4. If it's a `<span>` standing in for an icon, finding, severity ≥ medium. Name the expected lucide glyph in the fix.
5. If it's Unicode text, finding, severity ≥ medium. Name the expected lucide glyph in the fix.

Step 5.4 is the _runtime_ counterpart to Step 4's caller-side icon check. Step 4 catches the source pattern; Step 5.4 catches cases where the source looks right but the rendered DOM disagrees (className override, conditional rendering, prop forwarding bug).

**Step 5.5 — Screenshot capture.** `use_browser`'s auto-capture already saves a viewport PNG on every action. Cite the most recent capture path in the report. Cross-reference it with `<snapshotPath>/screens/<screen-node>.png` from the Figma snapshot. If 5.1–5.4 already surfaced findings, link the screenshot pair as supporting evidence rather than redundantly describing it in prose.

**Failure mode:** if chrome is wired but the dashboard is unreachable (docker stack down, port mismatch), Step 5 fails closed — log "verification gap: dashboard unreachable at `<url>`" and surface in the report. **Do not** treat dashboard-unreachable as "Step 5 passed."

**Mandatory-ness change.** Step 5 was "optional, requires dashboardUrl." It becomes:

- `dashboardUrl` set and chrome MCP wired → Step 5 is **required**.
- `dashboardUrl` set, chrome MCP not wired (plugin not installed on this machine) → Step 5 logs a verification gap and is skipped. Findings report includes the gap so the user can decide to install the plugin or accept the partial coverage.
- `dashboardUrl` not set → Step 5 skipped (consistent with B1's behavior).

### Change B2.4 — Update `SKILL.md` workflow overview and related skills

> **Project-specific:** edits land in `packages/cli/src/lib/skills/visual-fidelity-check/SKILL.md`.

Two small edits:

1. **Workflow overview list, item 6:** update `**Visual check** (optional)` to `**Live DOM check** (required when `dashboardUrl` is set)`. One-line summary.
2. **Related skills section:** add `browsing` as a peer with one-line description ("controls the running dashboard via Chrome DevTools Protocol; required by Step 5").

### Change B2.5 — Wire `[visual_fidelity]` into crew's own project

> **Project-specific:** the `[visual_fidelity]` block goes in `~/.config/crew/projects/crew.toml` (user's local, machine-specific config — not committed to the repo, since the schema lives in `packages/shared/src/config/schema.ts` and only reads from the TOML). A new contributor-facing setup doc lands in `docs/visual-fidelity-setup.md`. Code Connect gap-fills land under `packages/dashboard/src/components/`.

Crew the project does not have `[visual_fidelity]` configured today. Wiring it is a verification prerequisite for this spec — without it, B2's dogfood fixture has to be `Recipes-App` (cross-repo) instead of the project the agent is actively running in.

The Crew Figma file is at `https://www.figma.com/design/9FeJPriqdsdA4n9R5Xsrr8/Crew` and contains two relevant pages: a `Composites` page (the design system) and a `Dashboard Screens` page (screen-level designs). The schema (`visualFidelitySchema` in `packages/shared/src/config/schema.ts`) requires: `figma_file_key`, `figma_pages` (array), `component_dir`, `dashboard_url`, with `snapshot_path` / `code_connect_glob` / `skip_snapshot` defaulted.

The wiring needs:

1. **`[visual_fidelity]` block in `~/.config/crew/projects/crew.toml`** — the user pastes a snippet that sets:
   - `figma_file_key = "9FeJPriqdsdA4n9R5Xsrr8"`
   - `figma_pages = ["Composites", "Dashboard Screens"]`
   - `component_dir = "packages/dashboard/src/components"`
   - `dashboard_url = "${APP_URL}"`
   - (Defaults take care of `snapshot_path` and `code_connect_glob`.)
2. **Contributor setup doc** (`docs/visual-fidelity-setup.md`) — committed. Contains the exact TOML snippet to paste, a one-paragraph explanation of why it's user-local instead of repo-committed, and the verification command (`crew figma-snapshot`). Linked from the project's `README.md` "Local development" section.
3. **Code Connect gap-fills.** The dashboard already has comprehensive `.figma.tsx` coverage for top-level components (AgentRow, AgentBody, ProjectRow, ProjectSection, TopNav, CountBadge, BrandMark, TokenTable, AgentsList, ProjectConfigBlock) and all `ui/` primitives (badge, button, dialog, form, input, label, separator). Confirmed missing as of this spec:
   - `Timeline/` components (Timeline, EventCard, FilterChips, LiveModeToggle, SearchBar) — none have `.figma.tsx`. These DO have Figma counterparts; gap-fill is in-scope for the implementing ticket.
   - `ColumnHeaderRow`, `ErrorFallback`, `ProjectsTable` — top-level components without Code Connect. Some may not have a Figma counterpart (ErrorFallback is generic). Implementer surveys each and authors `.figma.tsx` only where a Figma counterpart exists.
4. **First snapshot run.** Execute `crew figma-snapshot` from a fresh worktree against the Crew Figma file to populate `.crew/figma-snapshot/`. Sanity-check that `index.json` lists the expected nodes and that the per-node JSON includes the `enrichment` field. The snapshot artifacts are gitignored — they regenerate on every `crew run` dispatch via the existing pre-dispatch step.

This change is independent of B2.1–B2.4 (the agent-side work) and can ship in parallel. Dependency-wise:

- Neither blocks the other.
- B2.5 alone gives crew a working static gate (Steps 1–4 from B1 — already shipped).
- B2.1–B2.4 alone gives any vis-fid-configured project access to live-DOM inspection.
- Together they give crew the full Steps 1–5 dogfood.

The workflow.md file owns the detailed sub-steps; SKILL.md only carries the overview.

## Acceptance criteria

### B2.1–B2.4 (agent-side: chrome MCP + browsing skill + Step 5 rewrite)

- [ ] `crew run <KEY>` on a project with `[visual_fidelity]` set writes a worktree `.mcp.json` containing a `chrome` server entry pointing at the user's installed `superpowers-chrome` plugin's `mcp/dist/index.js`.
- [ ] When `[playwright]` is also enabled, both `playwright` and `chrome` server entries appear in the same `.mcp.json`. They do not conflict.
- [ ] When `superpowers-chrome` is not installed in the user's plugin cache, `crew run` logs a `pc.yellow` warning and omits the `chrome` entry; the dispatch continues and the agent works as before (Step 5 logs a verification gap).
- [ ] The worktree's `.claude/skills/` contains BOTH `visual-fidelity-check/` AND `browsing/` directories when `[visual_fidelity]` is set.
- [ ] `packages/cli/src/lib/skills/browsing/` is committed to the repo and matches the upstream `superpowers-chrome@2.0.0` skill content as of this spec's date. Refreshing it is a manual `cp -r` from the user's plugin cache; not automated in this ticket.
- [ ] `packages/cli/src/lib/skills/visual-fidelity-check/workflow.md` Step 5 is rewritten with sub-steps 5.1–5.5 as specified above. Old "optional screenshot diff" content is removed.
- [ ] `packages/cli/src/lib/skills/visual-fidelity-check/SKILL.md` workflow overview line 6 and Related skills section are updated.
- [ ] `packages/cli/src/lib/playwright/` is renamed to `packages/cli/src/lib/mcp-config/` with all imports updated. In-scope for this ticket — the name lies after chrome lives there, and the rename is a contained one-pass edit.
- [ ] Unit tests:
  - `buildMcpConfig` emits playwright-only, chrome-only, and both-servers shapes given the matching opts.
  - `resolveChromeMcpPath` returns the right path when the plugin is installed; returns `null` when the directory is empty / missing.
  - `writeMcpFile` emits the warning when chrome resolution fails; succeeds otherwise.
  - `skill-injection` includes both `visual-fidelity-check` and `browsing` when `config.visual_fidelity` is set.
- [ ] No regressions in the existing playwright wiring: `crew run` on a `[playwright]`-only project still emits the playwright-only config and no warning.

### B2.5 (crew's own vis-fid wiring)

- [ ] `docs/visual-fidelity-setup.md` is committed and contains a paste-ready `[visual_fidelity]` TOML snippet, a one-paragraph explanation of the user-local-vs-committed split, and the `crew figma-snapshot` verification command. Linked from the project's `README.md` "Local development" section.
- [ ] `.figma.tsx` Code Connect files exist for the Timeline-family components (Timeline, EventCard, FilterChips, LiveModeToggle, SearchBar) — each pointing at the canonical Figma node in the Crew file.
- [ ] `ColumnHeaderRow` and `ProjectsTable` get `.figma.tsx` files if a Figma counterpart exists. If no counterpart, leave them as-is and note the absence in the PR description. `ErrorFallback` is acknowledged as a generic primitive with no Figma counterpart.
- [ ] After the user pastes the TOML snippet into `~/.config/crew/projects/crew.toml`, `crew figma-snapshot` runs successfully from `/home/safturento/Repos/crew` and produces `.crew/figma-snapshot/index.json` plus per-node JSON with non-empty `enrichment` fields.
- [ ] `crew run` on a small CREW-\* test ticket against the wired-up crew project produces a dispatch where `visual-fidelity-check` fires, finds Code Connect mappings for the touched components, and reports findings (or no findings) based on the dispatched work.
- [ ] Move this spec's followup entry (if filed in `docs/followups.md` during prior planning) to Resolved as part of the implementing PR for whichever ticket closes the spec.

## Verification — dogfooding against crew itself

The implementation PRs verify against crew's own dashboard once B2.5 lands. Order matters:

1. **B2.5 lands first (or independently)** — crew's `[visual_fidelity]` is wired, `.figma.tsx` files exist, snapshot generates. The static gate (Steps 1–4 from B1) runs against any CREW-\* dispatch. This proves the wiring works in isolation, independent of chrome.
2. **B2.1–B2.4 lands** — chrome MCP + browsing skill + Step 5 rewrite. Now a fresh CREW-\* dispatch exercises the full Steps 1–5 pipeline.
3. **Calibration: re-introduce a known regression** — in a throwaway worktree, set `intensity="muted"` on a dashboard `AgentRow` Badge (or equivalent CREW-135-style regression). Confirm Step 5.3 catches the color mismatch at runtime via computed-style read, even when Step 3's static check would not (e.g. when a `safelist` change in Tailwind config would have prevented purging but the actual CSS specificity wins differently). The fixture writes itself into `docs/superpowers/skill-fixtures/visual-fidelity-check/crew-self/runs/<date>.md` for the historical record.

Cross-project verification against `Recipes-App` is also valuable but secondary. The principle is: crew dogfoods its own gate.

## Ticketing

Two sibling tickets, no Epic (per the "Epic adds value only with ≥2 children running in coordinated tracks" preference; here the two are independent and either can be the first to merge):

- **[CREW-146](https://safturento.atlassian.net/browse/CREW-146) — Wire chrome MCP + browsing skill + live-DOM Step 5** (covers B2.1–B2.4). Touches `packages/cli/src/lib/{playwright→mcp-config}/`, `packages/cli/src/lib/run/skill-injection.ts`, `packages/cli/src/lib/skills/{visual-fidelity-check,browsing}/`.
- **[CREW-147](https://safturento.atlassian.net/browse/CREW-147) — Wire `[visual_fidelity]` into crew's own project** (covers B2.5). Touches `docs/visual-fidelity-setup.md` (new), `README.md`, Code Connect files under `packages/dashboard/src/`, and includes a paste-ready TOML snippet in the ticket description for the user's local `crew.toml` edit.

Linked with `Relates to` only — no `blocks` / `is blocked by`. Parallel-friendly. The verification step assumes both have merged so dogfooding can happen on crew itself, but either can stand alone.

## Out of scope follow-ups

- **Auto-refresh of vendored `browsing` skill.** Today the implementer copies the latest skill content from their plugin cache during the ticket. A script (`npm run refresh-vendored-skills`) that copies from the user's installed cache would keep the vendored copy in sync without manual effort. Worth filing as a followup if drift becomes a recurring problem.
- **Live-DOM inspection of E2E test artifacts.** Step 5.5 captures a viewport screenshot via `use_browser` auto-capture. A future enhancement: also reach into the `test-results/` directory after authored E2E runs and pull the screenshots from failed assertions for cross-reference. Not in scope here.
- **Data-attribute conventions for selector reliability.** Step 5.3's CSS selectors will be fragile in projects that don't expose `data-component` / `data-variant` attributes on their components. Worth filing a project-level followup ("expose data-\* attributes on Crew DS pill primitives for visual-fidelity selectors") if the implementing PR finds the selectors too brittle.
- **Cross-project visual-fidelity wiring for Recipes-App.** B2.5 covers crew. `Recipes-App` already has its own setup via prior work; a future audit could ensure both projects' configs are consistent (especially the `dashboardUrl` env-var interpolation convention).
