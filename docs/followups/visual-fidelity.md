# Followups — Visual Fidelity Tooling

> Part of the crew followups queue. Index + format: [`../followups.md`](../followups.md). Entry template, ticketing protocol, and the Active/Resolved/Abandoned lifecycle live in the user-level `~/.claude/CLAUDE.md` "Followup detection" section.

(entries below, newest at top)


## 2026-06-24 — figma-snapshot compact enrichment can't represent non-instance affordances (hyperlinks, bespoke text)

**What:** The compact enrichment script (`.claude/skills/figma-snapshot-refresh/enrichment-script.js`) records only `componentInstances` (plus `boundVariables`/`depthWarnings` on the captured node). Any load-bearing affordance built from **non-instance** nodes — a bespoke `TEXT` node carrying a `hyperlink`, a frame whose fill is bound to a link token — has **zero JSON representation**; it survives only in the PNG. Surfaced concretely on the New Run ticket-picker: the epic group headers ("KAN-30 · DRAG-AND-DROP REORDERING") with their key-range hyperlink bound to `button/link-fg` are invisible in `composites/362-2212.json`, which lists the 6 `ModalSelectionRow` instances flat with no group wrappers and no linked-key header. An implementer reading only the JSON would not know the grouped-with-linked-epic-key structure exists.

**Why noticed:** Auditing the 2026-06-24 full-enrichment snapshot (PR #410) for New Run picker coverage at the user's request. The composite captured the rows/toggle/states faithfully (Available-only Switch, blocked-by `Meta`, running Pill), but the epic-grouping + Jira-link affordance — a spec'd CREW-279 feature — appears nowhere in JSON. Not a picker blocker (the PNG carries it for visual-fidelity-check, and CREW-279's plan specifies the linked-key behavior in prose), so deferred rather than fixed inline.

**Anchors:** `.claude/skills/figma-snapshot-refresh/enrichment-script.js` (`walkChildren`, depth-6 cap at L128–130, `componentInstances`-only capture); `.crew/figma-snapshot/composites/362-2212.json`; `.crew/figma-snapshot/screens/1-3418.json` (4 `depthWarnings` at the picker `Container` rows); memory `project_new_run_picker_figma`; the design spec/plan `docs/superpowers/*/2026-06-23-figma-snapshot-enrich*`; CREW-283 (compact-output ticket that set the `componentInstances`-only shape).

**What's been considered:** The compact shape was a deliberate CREW-283 decision (drop everything but instances + bound vars to keep the artifact small). Capturing _every_ non-instance text node would re-bloat it — the win was the trim. The targeted version is narrower: capture a non-instance node **only when it carries signal** — a `hyperlink` (URL or node link) or a fill/stroke bound to a link-category token (e.g. `button/link-fg`). That's a small, high-value set: interactive affordances that aren't DS instances. Open whether to also emit a minimal group-structure outline (per-epic wrapper frames) or leave layout grouping screenshot-only.

**Shape of work:** Small change to `enrichment-script.js` — in `walkChildren`, when a node has a non-empty `hyperlink` or a bound variable resolving to a link-category token, push a compact `linkAffordances` (or fold into a thin `annotations`) entry `{id, name, text, href|nodeLink, tokenAlias}`. Add a unit fixture under the snapshot lib tests. One ticket; touches the skill script + a test, no CLI-lib change. Mind the depth-6 cap — deep affordances would still need a `depthWarning`, so the screen-vs-composite scope split (composite captures depth-reset detail) stays the recovery path.

**Open questions:** (1) New top-level key (`linkAffordances`) vs. extend each instance entry — link headers aren't instances, so probably top-level. (2) Capture group-wrapper structure too, or only the interactive link nodes? (3) Does the depth-6 cap need raising for screen-scope nodes, or is the composite-scope capture a sufficient recovery path (lean: sufficient, keep the cap)?

## 2026-06-06 — figma-snapshot committed baseline predates content-scoped freshness (full re-enrich needed)

**Ticket:** [CREW-238](https://safturento.atlassian.net/browse/CREW-238)

**What:** The committed `.crew/figma-snapshot/meta.json` is from 2026-05-22 and only carries `figmaFileVersion` + `capturedAt` — no `nodeHashes`. `crew figma-snapshot --check` therefore can't do content-scoped freshness and bails with "snapshot predates content-scoped freshness … Run the figma-snapshot-refresh skill to regenerate the baseline." A clean baseline needs a full re-export + re-enrich of every tracked node.

**Why noticed:** During the pill/button hover-states change (2026-06-06) I ran the figma-snapshot-refresh producer gate after adding a Figma "Hover states" reference frame. `--check` reported the pre-format baseline; a full refresh turned out to be a 44-node migration unrelated to the hover work, so it was pulled back out (baseline restored via `git checkout .crew/figma-snapshot/`) and parked here.

**Anchors:**

- `.crew/figma-snapshot/meta.json` — old-format baseline (no `nodeHashes`)
- `.claude/skills/figma-snapshot-refresh/` — the full-refresh procedure (REST export → per-node enrich via `use_figma` → merge → verify)
- `crew figma-snapshot --check` — the staleness reporter that flags it

**What's been considered:**

- The full refresh exports **44 nodes**, not just DS components: it sweeps in brainstorm scratch frames (`660:859`, `665:864` — 55 nested instances) and every Dashboard Screen, because `[visual_fidelity].figma_pages` includes the whole "Composites" + "Dashboard Screens" pages. The brainstorm frames are scratch artifacts that arguably shouldn't be tracked at all — worth scoping the export (or excluding scratch frames) as part of this.
- Enrichment is a manual round-trip (each batch's JSON hand-merged into per-node files) — error-prone and token-heavy. A CLI-side `--enrich` would remove the hand-merge entirely (overlaps the existing 2026-05-12 "Move PAGE_DIR_MAP into project config" tooling cleanup).

**Shape of work:** one focused session: optionally scope the export to exclude scratch frames, then run the figma-snapshot-refresh full procedure end-to-end and commit the regenerated baseline. Possibly a small CLI change to automate enrichment.

**Open questions:** Should brainstorm/scratch frames be excluded from the snapshot scope before regenerating, or enriched as-is?

## 2026-06-04 — chrome MCP browser fails to auto-start on port 9223 in crew dispatches

**What:** During `crew run` dispatches, the `superpowers-chrome` MCP server is wired into the worktree `.mcp.json` correctly (server resolves, `browser_mode` even reports `running: true` with a pid + port 9223), but every `navigate`/DOM action fails with `Chrome did not become ready on port 9223 within 15000ms`. The Chrome process spawns but its CDP endpoint never answers the readiness probe — so `visual-fidelity-check` Step 5 (the live computed-style / rendered-pixel cross-check the gate explicitly routes to chrome MCP) cannot run. The gate degrades to structural + caller checks plus a Playwright-MCP screenshot, which is sound for token/structure parity but skips the chrome-driven computed-style inspection the skill prescribes.

**Why noticed:** CREW-219 (Fix PR comment modal). Reached Step 5, `mcp__chrome__use_browser` was present in the tool inventory, but Chrome would not bind 9223 across repeated retries and a headed/headless toggle. `/tmp/crew-mcp-CREW-219.log` showed the wiring itself was clean (no plugin-resolution warnings), so the failure is the browser launch, not the MCP config. Likely a WSL2 sandbox networking / Chrome-launch-flags issue (system `google-chrome` at `/usr/bin/google-chrome`; the server manages its own profile under `~/.cache/superpowers/browser-profiles/`). Distinct from the [2026-06-03 caller-less-primitive gap](#2026-06-03--no-live-render-surface-for-caller-less-ds-primitives-visual-fidelity-step-5-gap): there the component had no render surface; here the surface renders fine (confirmed via Playwright MCP) but the chrome MCP browser won't come up.

**Anchors:** `/tmp/crew-mcp-CREW-<KEY>.log` (per-dispatch wiring diagnostic, CREW-184); `superpowers-chrome` MCP at `~/.claude/plugins/cache/superpowers-marketplace/superpowers-chrome/2.0.0/mcp/dist/index.js`; readiness probe on port 9223; `.agents/dispatch.md` step 8 (`writeMcpFile` / chrome wiring); `docs/visual-fidelity-reports/CREW-219.md` (verification-gap section).

**What's been considered:** Retries + headed-mode toggle (`show_browser`) did not help — the process is up but the CDP port is unresponsive, pointing at a launch-flag / WSL loopback issue rather than a race. Not fixable from inside a dispatch (chrome setup is outside the per-ticket remit and lives in the plugin + host). Worth a focused infra pass: capture the chrome stderr/launch flags the MCP server uses, try `--no-sandbox` / explicit `--remote-debugging-address=127.0.0.1`, and confirm the WSL2 loopback reaches 9223. Until then, chrome-dependent Step 5 is effectively unavailable in dispatches and the gate should be allowed to degrade to structural + Playwright-screenshot evidence with an explicit logged gap.

**Shape of work:** infra/debug spike on the superpowers-chrome launch path (not a crew code change first — diagnose, then decide whether crew's `writeMcpFile` should pass extra Chrome flags or set `--remote-debugging-address`).

**Open questions:** Is this WSL2-specific, or does it also fail on the maintainer's primary host? Does Playwright MCP (which launches its own `--headless` chromium and _does_ work in-dispatch) hint at the missing flag the chrome server needs?

## 2026-06-03 — No live render surface for caller-less DS primitives (visual-fidelity Step 5 gap)

**What:** `visual-fidelity-check` Step 5 (live in-browser DOM/screenshot check) cannot run for a new DS component that has no caller site yet. The dashboard mounts components only where a feature uses them and has no component playground/gallery/storybook route, so a freshly-built primitive (built ahead of its consumer, per the DS-reconciliation slicing) renders nowhere in the running app. The gate degrades to structural-only (snapshot + `get_design_context`), which is sound for token/structure parity but skips the rendered-pixel cross-check.

**Why noticed:** Building CREW-136 (Switch + FormField) — both are "components only, no live caller sites yet" by ticket scope. The visual-fidelity gate's Step 5 had no screen to exercise; logged as a verification gap in `docs/visual-fidelity-reports/CREW-136.md`. This recurs for every isolated DS primitive that lands before its consumer (a deliberate pattern in the DS→code reconciliation epic CREW-134).

**Anchors:** `docs/visual-fidelity-reports/CREW-136.md` (verification-gap section); `.claude/skills/visual-fidelity-check/workflow.md` Step 5; `packages/dashboard/src/App.tsx` (hash routing, no gallery route); CREW-134 epic.

**What's been considered:** A dev-only `/__gallery` route (or a Ladle/Storybook-lite harness) that renders every `ui/` primitive + composite in a known state would give Step 5 a deterministic surface and double as a DS smoke page. Tradeoff: another build surface to maintain vs. closing a recurring gate gap. Structural-only verification has been accepted as sufficient for skeleton-fidelity primitives so far, so this is a "nice to have", not blocking.

**Shape of work:** Small dashboard feature — one route + a static list rendering each component across its variant matrix. Could reuse the `.figma.tsx` `example` snippets as the render source. Sits behind a dev/env flag so it doesn't ship to the normal nav.

**Open questions:** Reuse an existing tool (Ladle/Storybook) or hand-roll a single route? Does the visual-fidelity skill need a config key pointing at the gallery URL pattern so Step 5 can auto-navigate per component?

## 2026-05-18 — visual-fidelity-check: per-fixture snapshot copy vs committed artifact + Step 4 path-vocab drift

**What:** Two coupled gaps in the `visual-fidelity-check` skill-fixture model, surfaced while reconciling render-frame Phase 4 against CREW-173.

1. The skill-fixture system (`docs/superpowers/skill-fixtures/visual-fidelity-check/<case>/`) gives each calibration case its own frozen `snapshot/composites/`. CREW-173 made `.crew/figma-snapshot/` a committed, git-tracked artifact — so a per-fixture snapshot copy now duplicates data git already versions (a calibration replay can pin the commit whose snapshot it wants). Decide: keep the per-fixture `snapshot/` copy, or have calibration runs read the committed `.crew/figma-snapshot/` directly and drop the copy.
2. The merged skill content (`workflow.md` Step 4, `SKILL.md` "Before authoring specs" section) locates composites at `<fixture-root>/snapshot/composites/<safe-id>.json`. But Step 0 records `snapshotPath` (not `fixture-root`), and Steps 2/5 use `<snapshotPath>`. In a normal (non-calibration) gate run there is no fixture — composites live at `<snapshotPath>/composites/`. Step 4's path is wrong for the common case; the two coincide only inside a calibration run.

**Why noticed:** Reconciling render-frame Phase 4 / CREW-152 against CREW-173's committed-artifact model. Task 4.1 copies the snapshot into `crew-135/snapshot/composites/` — that copy step raised "is the per-fixture snapshot still needed?", and grepping the skill for the path surfaced the `<fixture-root>` vs `<snapshotPath>` inconsistency.

**Anchors:** `.claude/skills/visual-fidelity-check/workflow.md` (Step 0 config keys; Step 4 ~line 74); `.claude/skills/visual-fidelity-check/SKILL.md` ("Before authoring specs" section); `docs/superpowers/skill-fixtures/visual-fidelity-check/` (`_template/`, `crew-135/`); render-frame plan Task 4.1; CREW-173.

**What's been considered:** The Phase 4 reconciliation deliberately kept the per-fixture snapshot copy — minimal change to make CREW-152 dispatchable. The two gaps are coupled: if calibration runs read the committed `.crew/figma-snapshot/` directly, the skill collapses to one path vocabulary (`<snapshotPath>`), `<fixture-root>` disappears, and Phase 4 Task 4.1's copy step also drops.

**Shape of work:** One design pass on the fixture model, then a small interactive skill-content edit unifying `workflow.md` Step 4 + `SKILL.md` on `<snapshotPath>`. Not a `crew run` (edits `.claude/skills/`).

**Open questions:** Does any calibration case need a snapshot _different_ from crew's current committed one? If yes, the per-fixture copy stays justified; if every case just wants "crew's snapshot at commit X", git already provides that.

## 2026-05-18 — `.agents/design-system.md` frontmatter URLs stale after Crew DS consolidation

**What:** `.agents/design-system.md`'s `project_library_url` frontmatter still points at the archived `DsA7QuEa2WthDATkksd1Bq` ("Crew-Design-System") file. After the 2026-05-12 consolidation the Crew DS lives as the `Composites` page inside `9FeJPriqdsdA4n9R5Xsrr8` — the same file as `screens_file_url` (which itself carries a stale `/Untitled` slug). The doc body still describes "three files (Core, Crew DS, Crew Dashboard Screens)" — really two now (Core + the consolidated Crew file). The `design-with-figma` skill reads this frontmatter for URLs.

**Why noticed:** Flagged as explicitly out-of-scope in CREW-175 ("fold in if trivial, else leave as a separate followup"). Not folded in: not a pure URL swap — `project_library_url` collapsing into `screens_file_url`'s file changes the doc's "three files" mental model, so the prose needs a pass too.

**Anchors:** `.agents/design-system.md` lines 9–12 (frontmatter URLs) and line 22 ("three files" prose); live file `9FeJPriqdsdA4n9R5Xsrr8` (slug `Crew`); DS on its `Composites` page, screens on `Dashboard Screens`.

**Shape of work:** Small doc-only edit — update `project_library_url`, fix the `/Untitled` slug on `screens_file_url`, rework the "three files" sentence to "two files". Decide whether `project_library_url` and `screens_file_url` should remain two frontmatter keys pointing at the same file or collapse to one.

## 2026-05-18 — `index.css` falls outside every `.agents/*.md` `covers` glob

**What:** `packages/dashboard/src/index.css` holds the Tailwind v4 `@theme` token block, the `:root`/`.dark` semantic-color palette, custom dark-tinted color shades, radii, and the global base styles — core design-system infrastructure — yet no `.agents/<topic>.md` `covers` glob includes it. `design-system.md` covers only `packages/dashboard/src/components/**`; `architecture.md` covers `packages/*/src/**/*.ts` (not `.css`). A change to the design system's actual token/base layer carries **zero** `agents-doc-parity-check` obligation.

**Why noticed:** Surfaced running the doc-parity audit for PR #243, which dropped a `font-size: 14px` root override that was warping the entire Tailwind rem scale (every `h-*`/`p-*`/`gap-*`/`text-*` rendered at 0.875× nominal). The audit correctly reported "no `.agents/` doc covers `index.css`" — itself the gap: a change that materially shifts every component's rendered sizing app-wide had no doc-parity gate at all.

**Anchors:** `.agents/design-system.md` `covers:` frontmatter (lines 5–8); `packages/dashboard/src/index.css`; PR #243 (merged); `agents-doc-parity-check` skill.

**What's been considered:** Add `packages/dashboard/src/index.css` to `design-system.md`'s `covers` list — natural owner: the doc's "Extending the palette" and "Fonts" sections already reference `index.css` by name. One-line frontmatter addition, low risk.

**Shape of work:** One-line `covers` addition to `.agents/design-system.md`. Optionally a wider sweep for other DS-relevant infra files (`main.tsx` sets `<html class="dark">` at boot; `vite.config.ts`).

**Open questions:** None blocking — fold into any future dashboard-touching PR.

## 2026-05-17 — figma-snapshot `index.json` `screenshotPath` can point at PNG that was never written

**What:** `emitSnapshot` writes an `index.json` entry with a `screenshotPath` for every exported node, but the PNG at that path may not exist — when the node's image URL is `null`, when the image download fails, or (after CREW-171) when the whole image pass fails non-fatally. `screenshotPath` is a _claimed_ path, not a guarantee.

**Why noticed:** Raised in CREW-171 code review. CREW-171 made the image pass non-fatal (metadata written before images, image failures warn and skip the PNG), which widens how often a `screenshotPath` entry can lack its file. Sole consumer is the `visual-fidelity-check` skill — agent-followed Markdown, not brittle code — a missing screenshot becomes an observed gap the agent flags. So no crash today, and unconditional `screenshotPath` predates CREW-171.

**Anchors:** `packages/cli/src/lib/figma-snapshot/emit.ts` (`IndexEntry`, the metadata-write loop ~line 78); `.claude/skills/visual-fidelity-check/workflow.md` Step 2; CREW-171.

**What's been considered:** Two options. (a) Make `screenshotPath` honest — write `index.json` _after_ the image pass with the field omitted/null for nodes whose PNG didn't land. Downside: reintroduces "index lost when images fail" problem CREW-171 fixed unless the index is written twice. (b) Leave `index.json` as-is, add explicit per-entry `hasScreenshot: boolean` (or `screenshotPath: string | null`) populated after the image pass. Leaning (b).

**Shape of work:** Small change in `emit.ts` — restructure so the image pass back-fills a screenshot-present flag into the already-written index, then rewrites `index.json` once at the end. Touches the `IndexEntry` shape, so the `visual-fidelity-check` skill doc + any snapshot-schema notes need a matching update. One ticket.

**Open questions:** Should `index.json` be written once (after images) or twice (metadata guarantee + final with flags)?

## 2026-05-16 — figma-snapshot `resolvedStylesFor` text-color heuristic picks the first TEXT descendant

**What:** The nested-instance enrichment walk added in CREW-150 resolves each instance's `resolvedStyles.textColor` via `node.findOne((n) => n.type === 'TEXT')` — the first text node in document order anywhere in the subtree. For a single-label primitive (a Pill) that's right. For a composite instance with multiple text descendants it may grab the wrong glyph's color, and the skill's Step 4 `resolvedStyles.textColor` diff would then silently compare the caller against the wrong text run.

**Why noticed:** Code review of CREW-150 (Phase 2 of the render-frame-anchor plan). The enrichment script's embedded comment ("single primary text child") already acknowledges the assumption.

**Anchors:** `resolvedStylesFor` in `packages/cli/src/lib/figma-snapshot/enrichment-prompt.ts`; CREW-150; CREW-152 (Phase 4, consumes this data shape); `docs/superpowers/plans/2026-05-13-visual-fidelity-render-frame-anchor.md` §1.

**What's been considered:** Acceptable for the current Pill-centric fixture — every fixture instance touched today has at most one text child. A more robust heuristic would prefer the text node bound to the instance's `Label` component property, or the largest/topmost text run.

**Shape of work:** Small — targeted change to the `resolvedStylesFor` text-node selection, plus a fixture case with a multi-text composite. Best sized once Phase 4 surfaces a real multi-text composite.

**Open questions:** Should text-color resolution be tied to the `Label` INSTANCE/TEXT property specifically (deterministic, but skips decorative text), or stay structural with a better tie-breaker?

## 2026-05-15 — `crew fix-pr` does not refresh `.mcp.json` — chrome wiring goes stale on resume

**What:** `crew fix-pr` resumes an agent into an existing worktree but never (re)writes `.mcp.json` or re-runs `runSkillInjection`. After CREW-146 PR A, `crew run` and `crew resume` write a `chrome` MCP server entry (and inject the `browsing` skill) for `[visual_fidelity]` projects, but `fix-pr` does not. A `fix-pr` on a `[visual_fidelity]` project whose original `crew run` predated CREW-146 dispatches an agent into a worktree with no `chrome` entry — silently losing visual-fidelity Step 5's live-DOM capability.

**Why noticed:** Code review of CREW-146 PR A. The re-plan **spec** (Change 4) names three files for the widened `.mcp.json` write gate — `run.ts`, `resume.ts`, **and `fix-pr.ts`**. The **plan** (Task 4) scoped the gate to only `run.ts` + `resume.ts`. PR A followed the plan, so `fix-pr.ts` was left untouched. `fix-pr.ts` writes no `.mcp.json` at all today, so wiring it is genuinely new scope rather than a one-line gate widening.

**Anchors:** `packages/cli/src/commands/fix-pr.ts`; the write-gate block in `packages/cli/src/commands/resume.ts` (the shape to mirror); `docs/superpowers/specs/2026-05-15-crew-146-chrome-integration-replan.md` Change 4; `docs/superpowers/plans/2026-05-15-crew-146-chrome-integration.md` Task 4; `docs/tickets/CREW-146.md` (Decisions section records this divergence).

**What's been considered:** Two paths. (a) Add the `resume.ts`-style write-gate block to `fix-pr.ts` before `spawnClaudeResume` — also consider re-running `runSkillInjection`. (b) Decide `fix-pr` deliberately never refreshes `.mcp.json` and reconcile the spec. The "stale `.mcp.json` is a real footgun" comment in `resume.ts` argues for (a).

**Shape of work:** Small — one write-gate block plus possibly one `runSkillInjection` call in `fix-pr.ts`, mirroring `resume.ts`; or a doc-only spec reconciliation. Fold in a command-layer test asserting a `[visual_fidelity]` `fix-pr` produces the `chrome` entry.

**Open questions:** Does `fix-pr` resume into a worktree fresh enough that re-asserting `.mcp.json` is always safe? Should `browsing` skill re-injection ride along?

