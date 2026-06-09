# Followups

A queue between "noticed it" and "decided what to do about it." Items might become Jira tickets, get fixed inline during related work, or be explicitly abandoned. Triage periodically.

Format: see the user-level `~/.claude/CLAUDE.md` "Followup detection" section.

Organization: Active is grouped by topic (not chronology) since the dominant access pattern is "is there a followup about X?" — grep by area. Each entry retains its original `YYYY-MM-DD — title` so date context survives.

## Contents

- [Active](#active)
  - [Figma & Crew DS](#figma--crew-ds)
    - [2026-06-04 — `FinishSteps` checklist has no Crew DS Figma counterpart](#2026-06-04--finishsteps-checklist-has-no-crew-ds-figma-counterpart)
    - [2026-05-24 — Publish `state/pr-merged` variable in Crew DS Figma](#2026-05-24--publish-statepr-merged-variable-in-crew-ds-figma)
    - [2026-05-12 — Move figma-snapshot PAGE_DIR_MAP into project config](#2026-05-12--move-figma-snapshot-page_dir_map-into-project-config)
    - [2026-05-12 — Pill trailing-icon support + CodeChip mono-font composite](#2026-05-12--pill-trailing-icon-support--codechip-mono-font-composite)
    - [2026-05-12 — Explore intensity-axis for Button (parallels StateBadge muted/mid/loud)](#2026-05-12--explore-intensity-axis-for-button-parallels-statebadge-mutedmidloud)
    - [2026-05-11 — `idle` and `waiting` agent states not reachable from daemon fixtures](#2026-05-11--idle-and-waiting-agent-states-not-reachable-from-daemon-fixtures)
    - [2026-05-09 — Crew Dashboard Screens: 3 remaining ad-hoc modal frames need DS Modal swap + semantic-token bindings](#2026-05-09--crew-dashboard-screens-3-remaining-ad-hoc-modal-frames-need-ds-modal-swap--semantic-token-bindings)
  - [Visual Fidelity Tooling](#visual-fidelity-tooling)
    - [2026-06-06 — figma-snapshot committed baseline predates content-scoped freshness (full re-enrich needed)](#2026-06-06--figma-snapshot-committed-baseline-predates-content-scoped-freshness-full-re-enrich-needed)
    - [2026-06-04 — chrome MCP browser fails to auto-start on port 9223 in crew dispatches](#2026-06-04--chrome-mcp-browser-fails-to-auto-start-on-port-9223-in-crew-dispatches)
    - [2026-06-03 — No live render surface for caller-less DS primitives (visual-fidelity Step 5 gap)](#2026-06-03--no-live-render-surface-for-caller-less-ds-primitives-visual-fidelity-step-5-gap)
    - [2026-05-18 — visual-fidelity-check: per-fixture snapshot copy vs committed artifact + Step 4 path-vocab drift](#2026-05-18--visual-fidelity-check-per-fixture-snapshot-copy-vs-committed-artifact--step-4-path-vocab-drift)
    - [2026-05-18 — `.agents/design-system.md` frontmatter URLs stale after Crew DS consolidation](#2026-05-18--agentsdesign-systemmd-frontmatter-urls-stale-after-crew-ds-consolidation)
    - [2026-05-18 — `index.css` falls outside every `.agents/*.md` `covers` glob](#2026-05-18--indexcss-falls-outside-every-agentsmd-covers-glob)
    - [2026-05-17 — figma-snapshot `index.json` `screenshotPath` can point at PNG that was never written](#2026-05-17--figma-snapshot-indexjson-screenshotpath-can-point-at-png-that-was-never-written)
    - [2026-05-16 — figma-snapshot `resolvedStylesFor` text-color heuristic picks the first TEXT descendant](#2026-05-16--figma-snapshot-resolvedstylesfor-text-color-heuristic-picks-the-first-text-descendant)
    - [2026-05-15 — `crew fix-pr` does not refresh `.mcp.json` — chrome wiring goes stale on resume](#2026-05-15--crew-fix-pr-does-not-refresh-mcpjson--chrome-wiring-goes-stale-on-resume)
  - [Dashboard UI](#dashboard-ui)
    - [2026-06-06 — `dialog` / `popover` animation classes are inert (no tailwindcss-animate plugin)](#2026-06-06--dialog--popover-animation-classes-are-inert-no-tailwindcss-animate-plugin)
    - [2026-06-05 — Drawer `liveMode` + section-collapse leak across an in-place agent switch](#2026-06-05--drawer-livemode--section-collapse-leak-across-an-in-place-agent-switch)
    - [2026-06-05 — Dashboard has no cancel action; CLI kill never notifies the daemon](#2026-06-05--dashboard-has-no-cancel-action-cli-kill-never-notifies-the-daemon)
    - [2026-06-04 — New Run modal step 2 is a text entry, not the Figma open-ticket picker](#2026-06-04--new-run-modal-step-2-is-a-text-entry-not-the-figma-open-ticket-picker)
    - [2026-06-03 — CREW-137 modal composites unverified until wired into a screen](#2026-06-03--crew-137-modal-composites-unverified-until-wired-into-a-screen)
    - [2026-05-22 — `${APP_URL}` template literal in DrawerHeader docker pill (backend bug)](#2026-05-22--app_url-template-literal-in-drawerheader-docker-pill-backend-bug)
    - [2026-05-22 — Layer-1 RunMetrics widget loses its drawer home in the redesign — find it a new one](#2026-05-22--layer-1-runmetrics-widget-loses-its-drawer-home-in-the-redesign--find-it-a-new-one)
    - [2026-05-13 — TopNav BrandMark renders a different glyph than the Figma "crew" mark](#2026-05-13--topnav-brandmark-renders-a-different-glyph-than-the-figma-crew-mark)
    - [2026-05-13 — "Hide finished" toggle on Agents List has no Figma reference (scope drift either way — reconcile)](#2026-05-13--hide-finished-toggle-on-agents-list-has-no-figma-reference-scope-drift-either-way--reconcile)
    - [2026-05-10 — Wire dashboard QuickAction buttons (Resume / Finish / Inspect / Provide input) to daemon endpoints](#2026-05-10--wire-dashboard-quickaction-buttons-resume--finish--inspect--provide-input-to-daemon-endpoints)
    - [2026-05-10 — Polish the CREW-119/CREW-117 Crew DS composites (skeleton-fidelity → pixel-fidelity)](#2026-05-10--polish-the-crew-119crew-117-crew-ds-composites-skeleton-fidelity--pixel-fidelity)
    - [2026-05-08 — Tool-name filtering in the timeline Filters dropdown](#2026-05-08--tool-name-filtering-in-the-timeline-filters-dropdown)
    - [2026-05-08 — Surface `crew finish` step results in the dashboard](#2026-05-08--surface-crew-finish-step-results-in-the-dashboard)
    - [2026-05-05 — Dashboard silently drops agents whose project isn't in `/api/projects`](#2026-05-05--dashboard-silently-drops-agents-whose-project-isnt-in-apiprojects)
    - [2026-04-29 — Slice 1c agents continuation work](#2026-04-29--slice-1c-agents-continuation-work)
    - [2026-04-29 — CREW-25 cva-refactor cleanup leftovers](#2026-04-29--crew-25-cva-refactor-cleanup-leftovers)
    - [2026-04-28 — Dashboard write/action endpoint surfaces](#2026-04-28--dashboard-writeaction-endpoint-surfaces)
    - [2026-04-28 — Dashboard agent detail drawer + full-page route](#2026-04-28--dashboard-agent-detail-drawer--full-page-route)
    - [2026-04-28 — Dashboard New Run modal + projects route view](#2026-04-28--dashboard-new-run-modal--projects-route-view)
    - [2026-04-28 — `useAttention.clear()` snapshot semantic isn't directly tested](#2026-04-28--useattentionclear-snapshot-semantic-isnt-directly-tested)
  - [Daemon, CLI & Dispatch](#daemon-cli--dispatch)
    - [2026-06-05 — `bruno-skeleton` fix() defaults the scaffolded port instead of deriving it from config](#2026-06-05--bruno-skeleton-fix-defaults-the-scaffolded-port-instead-of-deriving-it-from-config)
    - [2026-06-04 — `finish_steps` table accumulates across `crew finish` re-runs (no run scoping)](#2026-06-04--finish_steps-table-accumulates-across-crew-finish-re-runs-no-run-scoping)
    - [2026-06-04 — Runner pidfile has no liveness identity (recycled-PID false positive)](#2026-06-04--runner-pidfile-has-no-liveness-identity-recycled-pid-false-positive)
    - [2026-06-04 — `GET /api/runner/logs` reads the whole log file into memory](#2026-06-04--get-apirunnerlogs-reads-the-whole-log-file-into-memory)
    - [2026-06-03 — `deriveState` falls through to `finished` when PR-create isn't detected](#2026-06-03--derivestate-falls-through-to-finished-when-pr-create-isnt-detected)
    - [2026-06-03 — `getStackUrl` is orphaned + duplicated by `docker-list`'s port/URL helpers](#2026-06-03--getstackurl-is-orphaned--duplicated-by-docker-lists-porturl-helpers)
    - [2026-05-23 — GitHub webhook as a future PR-status detection mechanism (parking-lot)](#2026-05-23--github-webhook-as-a-future-pr-status-detection-mechanism-parking-lot)
    - [2026-05-22 — CREW-183's `installNodeModules` fix doesn't extend to `crew fix-pr`](#2026-05-22--crew-183s-installnodemodules-fix-doesnt-extend-to-crew-fix-pr)
    - [2026-05-18 — Daemon has no reaper for orphaned runs stuck in `running`](#2026-05-18--daemon-has-no-reaper-for-orphaned-runs-stuck-in-running)
    - [2026-05-15 — `parity_violations` metric is recorded end-to-end but never computed (always null)](#2026-05-15--parity_violations-metric-is-recorded-end-to-end-but-never-computed-always-null)
    - [2026-05-14 — Per-turn metric series so cache size can be graphed over a run](#2026-05-14--per-turn-metric-series-so-cache-size-can-be-graphed-over-a-run)
    - [2026-05-07 — Port allocator detects collisions only at `docker compose up` time](#2026-05-07--port-allocator-detects-collisions-only-at-docker-compose-up-time)
    - [2026-05-05 — Per-ticket model selection (use Sonnet for trivial work)](#2026-05-05--per-ticket-model-selection-use-sonnet-for-trivial-work)
    - [2026-05-05 — Daemon container's `~/.claude/projects` mount is broader than crew's transcript ingest needs](#2026-05-05--daemon-containers-claudeprojects-mount-is-broader-than-crews-transcript-ingest-needs)
    - [2026-05-04 — Generalize the hardcoded `db-clone-from-main.sh` post-bringup hook into a configurable TOML-registered startup script](#2026-05-04--generalize-the-hardcoded-db-clone-from-mainsh-post-bringup-hook-into-a-configurable-toml-registered-startup-script)
    - [2026-05-03 — `crew run` post-stream "waiting up to 120s for docker bringup" log is misleading after CREW-83](#2026-05-03--crew-run-post-stream-waiting-up-to-120s-for-docker-bringup-log-is-misleading-after-crew-83)
    - [2026-05-03 — `chokidar` dep added to daemon but no code imports it](#2026-05-03--chokidar-dep-added-to-daemon-but-no-code-imports-it)
    - [2026-05-03 — `crew run` swallows background-task failures into `/tmp` logs](#2026-05-03--crew-run-swallows-background-task-failures-into-tmp-logs)
    - [2026-05-03 — Transcript line printer truncates tool-call inputs mid-string](#2026-05-03--transcript-line-printer-truncates-tool-call-inputs-mid-string)
    - [2026-05-02 — `crew restart --hard` should not silently bail when a PR exists](#2026-05-02--crew-restart---hard-should-not-silently-bail-when-a-pr-exists)
    - [2026-05-02 — `crew fix-pr` skips env materialization and full verification](#2026-05-02--crew-fix-pr-skips-env-materialization-and-full-verification)
    - [2026-05-01 — Structured final-report contract for agent dispatches (dashboard prerequisite)](#2026-05-01--structured-final-report-contract-for-agent-dispatches-dashboard-prerequisite)
    - [2026-05-01 — Render assistant.text preamble alongside same-event tool calls](#2026-05-01--render-assistanttext-preamble-alongside-same-event-tool-calls)
    - [2026-05-01 — Crew owns DB replication end-to-end (off per-project shim scripts)](#2026-05-01--crew-owns-db-replication-end-to-end-off-per-project-shim-scripts)
    - [2026-05-01 — Generic `--git-common-dir` helper in `crew-shared` (third-caller trigger)](#2026-05-01--generic---git-common-dir-helper-in-crew-shared-third-caller-trigger)
    - [2026-05-01 — `crew run`/`resume`/`restart` against an already-shipped ticket has no safety net](#2026-05-01--crew-runresumerestart-against-an-already-shipped-ticket-has-no-safety-net)
    - [2026-05-01 — Playwright integration self-review cleanups](#2026-05-01--playwright-integration-self-review-cleanups)
    - [2026-04-30 — Surface subagent activity in transcript outputs](#2026-04-30--surface-subagent-activity-in-transcript-outputs)
    - [2026-04-30 — `crew resume` deferred follow-ups](#2026-04-30--crew-resume-deferred-follow-ups)
    - [2026-04-29 — Promote `resolveAppUrl` to shared `lib/url-substitution/`](#2026-04-29--promote-resolveappurl-to-shared-liburl-substitution)
  - [Architecture & Config](#architecture--config)
    - [2026-04-30 — Crew owns `.claude/settings.json` per worktree (gated on empirical bwrap/socat validation)](#2026-04-30--crew-owns-claudesettingsjson-per-worktree-gated-on-empirical-bwrapsocat-validation)
    - [2026-04-30 — Project config rationalization](#2026-04-30--project-config-rationalization)
    - [2026-04-30 — Unified `crew init` / `crew doctor` onboarding helper](#2026-04-30--unified-crew-init--crew-doctor-onboarding-helper)
    - [2026-04-30 — Per-config-block reference docs](#2026-04-30--per-config-block-reference-docs)
    - [2026-04-30 — CI integration of authored Playwright runs](#2026-04-30--ci-integration-of-authored-playwright-runs)
    - [2026-04-28 — Flesh out the project-resolution design](#2026-04-28--flesh-out-the-project-resolution-design)
    - [2026-04-26 — Architecture doc open questions still unresolved](#2026-04-26--architecture-doc-open-questions-still-unresolved)
  - [Process & Conventions](#process--conventions)
    - [2026-05-15 — `.agents/` topic-doc system vs native `.claude/rules/` and agents.md alignment](#2026-05-15--agents-topic-doc-system-vs-native-clauderules-and-agentsmd-alignment)
    - [2026-05-12 — Rethink followup-tracking system (priority tier + Jira backlog sync)](#2026-05-12--rethink-followup-tracking-system-priority-tier--jira-backlog-sync)
- [Resolved](#resolved)
  - [2026-06-08 — Hook command paths in settings.json were relative, breaking on cwd drift](#2026-06-08--hook-command-paths-in-settingsjson-were-relative-breaking-on-cwd-drift)
  - [2026-05-24 — `CREW_STARTUP_EVENTS_DIR` bypasses `DaemonConfig` and reads `process.env` directly inside `app.ts`](#2026-05-24--crew_startup_events_dir-bypasses-daemonconfig-and-reads-processenv-directly-inside-appts)
  - [2026-06-05 — Preflight fail-fast order surfaces `bruno-skeleton` before `excluded-commands` (red test on main)](#2026-06-05--preflight-fail-fast-order-surfaces-bruno-skeleton-before-excluded-commands-red-test-on-main)
  - [2026-06-04 — Daemon test suite flakes under full-parallel `test:run`](#2026-06-04--daemon-test-suite-flakes-under-full-parallel-testrun)
  - [2026-06-05 — Global doc-parity hook double-warns in crew (two parity warnings per commit)](#2026-06-05--global-doc-parity-hook-double-warns-in-crew-two-parity-warnings-per-commit)
  - [2026-06-03 — Wire CREW-136 `Switch` into the Timeline live toggle](#2026-06-03--wire-crew-136-switch-into-the-timeline-live-toggle)
  - [2026-06-03 — Sticky Timeline toolbar overlaps the minimap stripe + scrollbar](#2026-06-03--sticky-timeline-toolbar-overlaps-the-minimap-stripe--scrollbar)
  - [2026-05-19 — `crew figma-snapshot` has no per-node refresh](#2026-05-19--crew-figma-snapshot-has-no-per-node-refresh)
  - [2026-05-13 — visual-fidelity-check accuracy: snapshot lacks `componentProperties` (REST API limit) + calibration pattern≠specific finding pattern](#2026-05-13--visual-fidelity-check-accuracy-snapshot-lacks-componentproperties-rest-api-limit--calibration-patternspecific-finding-pattern)
  - [2026-05-11 — Crew DS is partial vs Dashboard Screens; Timeline container + Bash event tags missing](#2026-05-11--crew-ds-is-partial-vs-dashboard-screens-timeline-container--bash-event-tags-missing)
  - [2026-05-23 — TokensByTool Figma component lacks the Cost column shipped in CREW-195](#2026-05-23--tokensbytool-figma-component-lacks-the-cost-column-shipped-in-crew-195)
  - [2026-05-23 — Drawer Timeline still rendering EventCard, not Figma-spec TranscriptRow](#2026-05-23--drawer-timeline-still-rendering-eventcard-not-figma-spec-transcriptrow)
  - [2026-05-13 — Agent drawer / agent page search input missing leading magnifying-glass icon](#2026-05-13--agent-drawer--agent-page-search-input-missing-leading-magnifying-glass-icon)
  - [2026-05-13 — Agent drawer Close button uses Unicode "✕" glyph instead of `lucide/x` SVG](#2026-05-13--agent-drawer-close-button-uses-unicode--glyph-instead-of-lucidex-svg)
  - [2026-05-08 — Wire `StateHistoryBar`, `TokenTable`, and Token-usage section into `AgentBody`](#2026-05-08--wire-statehistorybar-tokentable-and-token-usage-section-into-agentbody)
- [Abandoned](#abandoned)
  - [2026-05-12 — Re-link 8 detached AgentRow tiles in modal-overlay screen backgrounds](#2026-05-12--re-link-8-detached-agentrow-tiles-in-modal-overlay-screen-backgrounds)
  - [2026-05-09 — Manual rename of Figma screens file to "Crew Dashboard Screens"](#2026-05-09--manual-rename-of-figma-screens-file-to-crew-dashboard-screens)
  - [2026-04-27 — Dashboard mobile responsive layout polish](#2026-04-27--dashboard-mobile-responsive-layout-polish)

## Active

### Figma & Crew DS

#### 2026-06-04 — `FinishSteps` checklist has no Crew DS Figma counterpart

**What:** CREW-220 shipped `packages/dashboard/src/components/FinishSteps.tsx` — the agent drawer's live `crew finish` step checklist (ok/skip/error rows). It is figma-less feature-internal (same status as `MinimapStripe`): no finish-checklist was ever designed in the Crew DS Figma, so the component borrows the `TokensByTool` card shell and the status palette (`emerald-500` / `muted-foreground` / `red-400`) by hand. A future fidelity pass could design a proper Figma counterpart and a `.figma.tsx` Code Connect mapping so it joins the regular DS-composite inventory.

**Why noticed:** Building T8 of the dashboard-actions Epic (CREW-208). The `visual-fidelity-check` had no snapshot component to compare against — by design here, but worth a deliberate design pass rather than leaving it as a permanent gap.

**Anchors:**

- `packages/dashboard/src/components/FinishSteps.tsx` — the code component
- `.agents/design-system.md` — "Code-shipped composites" inventory (row marked _no Figma — feature-internal_)
- `packages/dashboard/src/components/TokensByTool.tsx` — the card shell + section idiom it borrows

**Shape of work:** small Crew DS Figma pass (one card composite, three status row variants) + a `FinishSteps.figma.tsx` mapping; opportunistic, low priority.

#### 2026-05-24 — Publish `state/pr-merged` variable in Crew DS Figma

**What:** CREW-202 added a `pr_merged` agent state in dashboard code (emerald-500 family, same shade as `finished`). The dashboard binds the new state via direct Tailwind classes (`text-emerald-500`, `bg-emerald-1050`, etc.) in `STATE_CLASSES.pr_merged`. The corresponding Crew DS Figma variable (`state/pr-merged → tw/colors/emerald/500`) was not added in the same pass, so the Figma DS state-token table is one row behind the code.

**Why noticed:** `agents-doc-parity-check` during CREW-202 implementation flagged `.agents/design-system.md`'s state-tokens table as a covered file. The doc was updated to call out the divergence; this followup ensures the Figma side catches up.

**Anchors:** `.agents/design-system.md` § "State tokens"; `packages/dashboard/src/data/state-meta.ts` (`STATE_CLASSES.pr_merged`); Crew DS file `DsA7QuEa2WthDATkksd1Bq` → `Semantic Colors` collection (where the 7 existing `state/*` variables live).

**What's been considered:** Reusing `state/finished` instead of adding a new variable was tempting (both are emerald-500) but conflates two semantically-distinct states — `finished` means "Finish ran cleanly," `pr_merged` means "PR closed, Finish is next." Keeping them as separate aliases (even when they resolve to the same shade today) preserves the option to differentiate later (e.g. swap pr_merged to `emerald/400` for slight contrast against `finished`'s `emerald/500`).

**Shape of work:** ~5 min in Figma — add `state/pr-merged` to `Crew / Semantic Colors` aliasing `Core / tw/colors / emerald/500`. Rebind StateBadge/Pill component instances for the new state if the design language warrants a distinct visual treatment from `finished`. Re-run `crew figma-snapshot` and confirm `visual-fidelity-check` still passes against the dashboard.

#### 2026-05-12 — Move figma-snapshot PAGE_DIR_MAP into project config

**What:** `emit.ts` hardcodes `Composites → composites/` and `Dashboard Screens → screens/` in a module-level map. Any other page name falls through to a sanitized slug. This is crew-dashboard-specific knowledge living in a generic CLI helper — violates AGENTS.md's "Don't hardcode project-specific knowledge" rule.

**Why noticed:** Self-review of CREW-139. The map matches the spec's example output structure exactly, but only because the spec was written for crew. A second project adopting the snapshot would either need to use one of these names or accept the kebab-cased fallback.

**Anchors:** `packages/cli/src/lib/figma-snapshot/emit.ts` (the `PAGE_DIR_MAP` const); `packages/shared/src/config/schema.ts` (`visualFidelitySchema` — where the map could live); CREW-139 PR / self-review notes.

**Shape of work:** Add an optional `page_dir_map = { "Composites" = "composites", … }` field to `visualFidelitySchema`; in `emit.ts`, look up `opts.pageDirMap?.[name]` first, fall back to slug. ~30 line change + tests.

**Open questions:** Worth doing before a second project adopts the snapshot, or is YAGNI?

#### 2026-05-12 — Pill trailing-icon support + CodeChip mono-font composite

**What:** Two coupled Crew DS gaps surfaced during the 2026-05-12 polish pass.

1. **Pill has no trailing-icon support.** The `Pill` set supports a leading `Icon` (BOOLEAN `Has Icon` + INSTANCE_SWAP `Icon`) but not a trailing one. Two patterns need it: the "Filters" dropdown button (`lucide/filter` + `lucide/chevron-down`) and the docker URL chip (`docker` glyph + `lucide/arrow-up-right`). Left as raw FRAMEs named "Filters (raw — pending trailing-icon Pill support)" / "CodeChip (raw — ...)" rather than migrated to Pill.
2. **CodeChip mono-font composite missing.** The agent drawer + agent page show two "code-style" chips in the header — worktree path with folder icon + git-branch suffix, and docker URL with external-link icon. Both use **Fira Code mono**, neither fits Pill (which is Hanken Grotesk Medium 14). Also blocked on the trailing-icon limitation.

**Anchors:** Pill set node ID `272:120` in Figma file `9FeJPriqdsdA4n9R5Xsrr8`. Affected raw frames: `1:944` / `1:2115` (Filters), `1:807` / `1:1978` (docker URL / CodeChip).

**What's been considered:**

- Add `Has Trailing Icon` (BOOLEAN) + `Trailing Icon` (INSTANCE_SWAP) to all 320 Pill variants — generalizes but doubles the icon-related property surface.
- Build a separate `DropdownButton` composite wrapping Pill with a fixed trailing chevron — cleaner semantic intent.
- For CodeChip: add a `type=code-chip` Pill variant with Fira Code (inconsistent with otherwise Hanken Grotesk Pill) vs build a separate CodeChip composite.

**Shape of work:** ~1h Figma plugin work for trailing-icon Pill, or ~30min for DropdownButton. Pairing with CodeChip composite (~30min). The two share the trailing-icon problem — natural pair.

**Open questions:**

- Is trailing-icon only for dropdown chevrons, or general-purpose? If only chevrons, DropdownButton is right.
- Is mono treatment used anywhere else besides the two header chips? Sample size of 2 is borderline for its own composite.

#### 2026-05-12 — Explore intensity-axis for Button (parallels StateBadge muted/mid/loud)

**What:** Crew DS Button has 8 variants (default, destructive, danger, outline, secondary, ghost, link, warning) but each is a single visual treatment. StateBadge by contrast has an `intensity` VARIANT axis with 3 values (muted/mid/loud). User noticed that `warning` might benefit from an outline-style sibling treatment — same way `destructive` has its loud-solid version and `danger` is its quieter tinted+stroke counterpart. The pattern would extend: every "loud" colored button might want a "tinted" or "outline" sibling, mirroring StateBadge.

**Why noticed:** Mid-session during Phase 1 of the Button rollout Epic on 2026-05-12. User said "I wonder if we should have an outline version for that as well like error vs destructive — we might just end up with the same variants as we have for the pills in the end." Deferred to keep the in-session Epic bounded.

**Anchors:** Crew DS Button COMPONENT_SET `204:50` in file `DsA7QuEa2WthDATkksd1Bq`; StateBadge intensity pattern — see [`project_crew_ds_palette_strategy`](https://github.com/Safturento/crew/) memory; current pair pattern `destructive` (loud solid red) ↔ `danger` (quiet tinted red with stroke).

**What's been considered:**

- **Per-variant pairs** (existing pattern). Repeat what we did for destructive/danger: add a `warning-quiet` for every "loud" variant. Pro: matches existing. Con: variant count balloons.
- **Explicit `intensity` VARIANT axis** (StateBadge parallel). Single new axis: `intensity = solid / tinted / outline`. Composable. Con: naive 8×3×4 = 96 components (vs current 32). Better candidate for "only colored variants, not default/outline/ghost/link."
- **Only certain colors get sibling treatments.** Maybe `warning` is the only one and the answer is just `warning-outline` as a one-off.

**Shape of work:** Conversation first — settle which colors need intensity siblings and whether to refactor to a unified `intensity` axis. ~30–60 min spec + 1–2h implementation. Includes a possible token-naming alignment decision.

**Open questions:**

- [ ] Unified `intensity` axis or stay with per-variant pairs?
- [ ] If pairs: which colors need siblings? (`warning` for sure; `secondary`/`ghost` don't seem to need it; `default` is already neutral.)
- [ ] Naming convention for siblings if going pairs-based.
- [ ] Whether to backport to the existing `destructive` ↔ `danger`. Probably not worth the rename churn but worth flagging.

#### 2026-05-11 — `idle` and `waiting` agent states not reachable from daemon fixtures

**What:** The dashboard's `AgentState` union has 7 values; `StateBadge` + `STATE_CLASSES` cover all 7. But the daemon's `deriveState` only produces 5 of them (`initializing`, `running`, `pr_open`, `error`, `finished`) from runs + tool_calls. `idle` and `waiting` come from explicit `state_transitions` rows that the dev seed never writes. Result: those two badges are typed and styled but can't be visually exercised in dev.

**Why noticed:** During the 2026-05-11 state-color migration verification. The dashboard renders 5 states cleanly; the migration's correctness for `idle`/`waiting` is verified only via code paths, not visually.

**Anchors:** `packages/daemon/src/services/AgentsService.ts:328-336` (`deriveState`); `packages/daemon/src/services/AgentsService.ts:45-52` (`StateTransitionState`); `packages/dashboard/src/data/state-meta.ts` (`STATE_CLASSES`); `packages/dashboard/src/components/StateBadge.tsx`.

**What's been considered:** Two paths — (a) Showcase route `#/dev/badges` renders all 21 StateBadge variants × intensities + CountBadge × 7 + AgentRow attention-tint examples statically. Independent of daemon state, ~30 min. (b) Seed-level fix — extend `dev.ts` to insert agents whose state arrives via `state_transitions` rows. Needs daemon-side understanding of when `idle`/`waiting` are emitted in prod. Larger scope.

**Shape of work:** Either ~30 lines for the showcase route, OR a daemon-side investigation + seed extension.

**Open questions:** Are `idle` and `waiting` ever expected to be the _current_ state of an agent (visible in the agents list) or only intermediate transitions visible in `StateHistoryBar`? If only transitions, the showcase route is sufficient.

#### 2026-05-09 — Crew Dashboard Screens: 3 remaining ad-hoc modal frames need DS Modal swap + semantic-token bindings

**Partially resolved 2026-05-10 / 2026-05-12:** Migrations of the agents-related frames (Agents List `1:2`, Drawer Open `1:378`, Agent full page `1:1900`) shipped in the 2026-05-10 interactive Figma-MCP session. Projects-view frames (`1:2334`, `1:2443`) shipped in the 2026-05-12 in-session Button rollout Epic with full token bindings and DS instance swaps. What remains is the 3 ad-hoc modal frames.

**What:** Three ad-hoc modal frames (`New Run modal - 3. Confirm` `9:2`, `Project Page - Edit project modal` `18:2`, `Project Page - Delete confirmation modal` `23:2`) in `9FeJPriqdsdA4n9R5Xsrr8` still render with hardcoded fills + detached primitive structures. Originally blocked on Crew DS Modal composites not existing — those composites have since been built (Modal / AlertModal / ModalSelectionRow per `project_crew_ds_modal_composites` memory, 2026-05-12). Now unblocked but not migrated.

**Anchors:** Figma frames `9:2`, `18:2`, `23:2` in `9FeJPriqdsdA4n9R5Xsrr8`; Modal composites built 2026-05-12 — see `project_crew_ds_modal_composites` memory; [CREW-126](https://safturento.atlassian.net/browse/CREW-126), [CREW-120](https://safturento.atlassian.net/browse/CREW-120) (Epic) — original scope.

**What's been considered:** Per-frame designer pass — open each in Figma desktop, swap detached structures to Modal/AlertModal/ModalSelectionRow instances, bind remaining fills via the picker. Probably 1-2h per modal × 3 frames. Hybrid agent-prepared candidate map possible.

**Shape of work:** One ticket per modal (3 tickets) or one bundled "modal migration" ticket. Designer-led; agent assists with binding scripts once the hex→token map is decided.

**Open questions:**

- [ ] How are the 3 ad-hoc modals' content layouts captured before deletion — screenshots? Re-authoring off live screens?
- [ ] Padding/gap/radius FLOAT bindings in the same pass, or deferred?

### Visual Fidelity Tooling

#### 2026-06-06 — figma-snapshot committed baseline predates content-scoped freshness (full re-enrich needed)

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

#### 2026-06-04 — chrome MCP browser fails to auto-start on port 9223 in crew dispatches

**What:** During `crew run` dispatches, the `superpowers-chrome` MCP server is wired into the worktree `.mcp.json` correctly (server resolves, `browser_mode` even reports `running: true` with a pid + port 9223), but every `navigate`/DOM action fails with `Chrome did not become ready on port 9223 within 15000ms`. The Chrome process spawns but its CDP endpoint never answers the readiness probe — so `visual-fidelity-check` Step 5 (the live computed-style / rendered-pixel cross-check the gate explicitly routes to chrome MCP) cannot run. The gate degrades to structural + caller checks plus a Playwright-MCP screenshot, which is sound for token/structure parity but skips the chrome-driven computed-style inspection the skill prescribes.

**Why noticed:** CREW-219 (Fix PR comment modal). Reached Step 5, `mcp__chrome__use_browser` was present in the tool inventory, but Chrome would not bind 9223 across repeated retries and a headed/headless toggle. `/tmp/crew-mcp-CREW-219.log` showed the wiring itself was clean (no plugin-resolution warnings), so the failure is the browser launch, not the MCP config. Likely a WSL2 sandbox networking / Chrome-launch-flags issue (system `google-chrome` at `/usr/bin/google-chrome`; the server manages its own profile under `~/.cache/superpowers/browser-profiles/`). Distinct from the [2026-06-03 caller-less-primitive gap](#2026-06-03--no-live-render-surface-for-caller-less-ds-primitives-visual-fidelity-step-5-gap): there the component had no render surface; here the surface renders fine (confirmed via Playwright MCP) but the chrome MCP browser won't come up.

**Anchors:** `/tmp/crew-mcp-CREW-<KEY>.log` (per-dispatch wiring diagnostic, CREW-184); `superpowers-chrome` MCP at `~/.claude/plugins/cache/superpowers-marketplace/superpowers-chrome/2.0.0/mcp/dist/index.js`; readiness probe on port 9223; `.agents/dispatch.md` step 8 (`writeMcpFile` / chrome wiring); `docs/visual-fidelity-reports/CREW-219.md` (verification-gap section).

**What's been considered:** Retries + headed-mode toggle (`show_browser`) did not help — the process is up but the CDP port is unresponsive, pointing at a launch-flag / WSL loopback issue rather than a race. Not fixable from inside a dispatch (chrome setup is outside the per-ticket remit and lives in the plugin + host). Worth a focused infra pass: capture the chrome stderr/launch flags the MCP server uses, try `--no-sandbox` / explicit `--remote-debugging-address=127.0.0.1`, and confirm the WSL2 loopback reaches 9223. Until then, chrome-dependent Step 5 is effectively unavailable in dispatches and the gate should be allowed to degrade to structural + Playwright-screenshot evidence with an explicit logged gap.

**Shape of work:** infra/debug spike on the superpowers-chrome launch path (not a crew code change first — diagnose, then decide whether crew's `writeMcpFile` should pass extra Chrome flags or set `--remote-debugging-address`).

**Open questions:** Is this WSL2-specific, or does it also fail on the maintainer's primary host? Does Playwright MCP (which launches its own `--headless` chromium and _does_ work in-dispatch) hint at the missing flag the chrome server needs?

#### 2026-06-03 — No live render surface for caller-less DS primitives (visual-fidelity Step 5 gap)

**What:** `visual-fidelity-check` Step 5 (live in-browser DOM/screenshot check) cannot run for a new DS component that has no caller site yet. The dashboard mounts components only where a feature uses them and has no component playground/gallery/storybook route, so a freshly-built primitive (built ahead of its consumer, per the DS-reconciliation slicing) renders nowhere in the running app. The gate degrades to structural-only (snapshot + `get_design_context`), which is sound for token/structure parity but skips the rendered-pixel cross-check.

**Why noticed:** Building CREW-136 (Switch + FormField) — both are "components only, no live caller sites yet" by ticket scope. The visual-fidelity gate's Step 5 had no screen to exercise; logged as a verification gap in `docs/visual-fidelity-reports/CREW-136.md`. This recurs for every isolated DS primitive that lands before its consumer (a deliberate pattern in the DS→code reconciliation epic CREW-134).

**Anchors:** `docs/visual-fidelity-reports/CREW-136.md` (verification-gap section); `.claude/skills/visual-fidelity-check/workflow.md` Step 5; `packages/dashboard/src/App.tsx` (hash routing, no gallery route); CREW-134 epic.

**What's been considered:** A dev-only `/__gallery` route (or a Ladle/Storybook-lite harness) that renders every `ui/` primitive + composite in a known state would give Step 5 a deterministic surface and double as a DS smoke page. Tradeoff: another build surface to maintain vs. closing a recurring gate gap. Structural-only verification has been accepted as sufficient for skeleton-fidelity primitives so far, so this is a "nice to have", not blocking.

**Shape of work:** Small dashboard feature — one route + a static list rendering each component across its variant matrix. Could reuse the `.figma.tsx` `example` snippets as the render source. Sits behind a dev/env flag so it doesn't ship to the normal nav.

**Open questions:** Reuse an existing tool (Ladle/Storybook) or hand-roll a single route? Does the visual-fidelity skill need a config key pointing at the gallery URL pattern so Step 5 can auto-navigate per component?

#### 2026-05-18 — visual-fidelity-check: per-fixture snapshot copy vs committed artifact + Step 4 path-vocab drift

**What:** Two coupled gaps in the `visual-fidelity-check` skill-fixture model, surfaced while reconciling render-frame Phase 4 against CREW-173.

1. The skill-fixture system (`docs/superpowers/skill-fixtures/visual-fidelity-check/<case>/`) gives each calibration case its own frozen `snapshot/composites/`. CREW-173 made `.crew/figma-snapshot/` a committed, git-tracked artifact — so a per-fixture snapshot copy now duplicates data git already versions (a calibration replay can pin the commit whose snapshot it wants). Decide: keep the per-fixture `snapshot/` copy, or have calibration runs read the committed `.crew/figma-snapshot/` directly and drop the copy.
2. The merged skill content (`workflow.md` Step 4, `SKILL.md` "Before authoring specs" section) locates composites at `<fixture-root>/snapshot/composites/<safe-id>.json`. But Step 0 records `snapshotPath` (not `fixture-root`), and Steps 2/5 use `<snapshotPath>`. In a normal (non-calibration) gate run there is no fixture — composites live at `<snapshotPath>/composites/`. Step 4's path is wrong for the common case; the two coincide only inside a calibration run.

**Why noticed:** Reconciling render-frame Phase 4 / CREW-152 against CREW-173's committed-artifact model. Task 4.1 copies the snapshot into `crew-135/snapshot/composites/` — that copy step raised "is the per-fixture snapshot still needed?", and grepping the skill for the path surfaced the `<fixture-root>` vs `<snapshotPath>` inconsistency.

**Anchors:** `.claude/skills/visual-fidelity-check/workflow.md` (Step 0 config keys; Step 4 ~line 74); `.claude/skills/visual-fidelity-check/SKILL.md` ("Before authoring specs" section); `docs/superpowers/skill-fixtures/visual-fidelity-check/` (`_template/`, `crew-135/`); render-frame plan Task 4.1; CREW-173.

**What's been considered:** The Phase 4 reconciliation deliberately kept the per-fixture snapshot copy — minimal change to make CREW-152 dispatchable. The two gaps are coupled: if calibration runs read the committed `.crew/figma-snapshot/` directly, the skill collapses to one path vocabulary (`<snapshotPath>`), `<fixture-root>` disappears, and Phase 4 Task 4.1's copy step also drops.

**Shape of work:** One design pass on the fixture model, then a small interactive skill-content edit unifying `workflow.md` Step 4 + `SKILL.md` on `<snapshotPath>`. Not a `crew run` (edits `.claude/skills/`).

**Open questions:** Does any calibration case need a snapshot _different_ from crew's current committed one? If yes, the per-fixture copy stays justified; if every case just wants "crew's snapshot at commit X", git already provides that.

#### 2026-05-18 — `.agents/design-system.md` frontmatter URLs stale after Crew DS consolidation

**What:** `.agents/design-system.md`'s `project_library_url` frontmatter still points at the archived `DsA7QuEa2WthDATkksd1Bq` ("Crew-Design-System") file. After the 2026-05-12 consolidation the Crew DS lives as the `Composites` page inside `9FeJPriqdsdA4n9R5Xsrr8` — the same file as `screens_file_url` (which itself carries a stale `/Untitled` slug). The doc body still describes "three files (Core, Crew DS, Crew Dashboard Screens)" — really two now (Core + the consolidated Crew file). The `design-with-figma` skill reads this frontmatter for URLs.

**Why noticed:** Flagged as explicitly out-of-scope in CREW-175 ("fold in if trivial, else leave as a separate followup"). Not folded in: not a pure URL swap — `project_library_url` collapsing into `screens_file_url`'s file changes the doc's "three files" mental model, so the prose needs a pass too.

**Anchors:** `.agents/design-system.md` lines 9–12 (frontmatter URLs) and line 22 ("three files" prose); live file `9FeJPriqdsdA4n9R5Xsrr8` (slug `Crew`); DS on its `Composites` page, screens on `Dashboard Screens`.

**Shape of work:** Small doc-only edit — update `project_library_url`, fix the `/Untitled` slug on `screens_file_url`, rework the "three files" sentence to "two files". Decide whether `project_library_url` and `screens_file_url` should remain two frontmatter keys pointing at the same file or collapse to one.

#### 2026-05-18 — `index.css` falls outside every `.agents/*.md` `covers` glob

**What:** `packages/dashboard/src/index.css` holds the Tailwind v4 `@theme` token block, the `:root`/`.dark` semantic-color palette, custom dark-tinted color shades, radii, and the global base styles — core design-system infrastructure — yet no `.agents/<topic>.md` `covers` glob includes it. `design-system.md` covers only `packages/dashboard/src/components/**`; `architecture.md` covers `packages/*/src/**/*.ts` (not `.css`). A change to the design system's actual token/base layer carries **zero** `agents-doc-parity-check` obligation.

**Why noticed:** Surfaced running the doc-parity audit for PR #243, which dropped a `font-size: 14px` root override that was warping the entire Tailwind rem scale (every `h-*`/`p-*`/`gap-*`/`text-*` rendered at 0.875× nominal). The audit correctly reported "no `.agents/` doc covers `index.css`" — itself the gap: a change that materially shifts every component's rendered sizing app-wide had no doc-parity gate at all.

**Anchors:** `.agents/design-system.md` `covers:` frontmatter (lines 5–8); `packages/dashboard/src/index.css`; PR #243 (merged); `agents-doc-parity-check` skill.

**What's been considered:** Add `packages/dashboard/src/index.css` to `design-system.md`'s `covers` list — natural owner: the doc's "Extending the palette" and "Fonts" sections already reference `index.css` by name. One-line frontmatter addition, low risk.

**Shape of work:** One-line `covers` addition to `.agents/design-system.md`. Optionally a wider sweep for other DS-relevant infra files (`main.tsx` sets `<html class="dark">` at boot; `vite.config.ts`).

**Open questions:** None blocking — fold into any future dashboard-touching PR.

#### 2026-05-17 — figma-snapshot `index.json` `screenshotPath` can point at PNG that was never written

**What:** `emitSnapshot` writes an `index.json` entry with a `screenshotPath` for every exported node, but the PNG at that path may not exist — when the node's image URL is `null`, when the image download fails, or (after CREW-171) when the whole image pass fails non-fatally. `screenshotPath` is a _claimed_ path, not a guarantee.

**Why noticed:** Raised in CREW-171 code review. CREW-171 made the image pass non-fatal (metadata written before images, image failures warn and skip the PNG), which widens how often a `screenshotPath` entry can lack its file. Sole consumer is the `visual-fidelity-check` skill — agent-followed Markdown, not brittle code — a missing screenshot becomes an observed gap the agent flags. So no crash today, and unconditional `screenshotPath` predates CREW-171.

**Anchors:** `packages/cli/src/lib/figma-snapshot/emit.ts` (`IndexEntry`, the metadata-write loop ~line 78); `.claude/skills/visual-fidelity-check/workflow.md` Step 2; CREW-171.

**What's been considered:** Two options. (a) Make `screenshotPath` honest — write `index.json` _after_ the image pass with the field omitted/null for nodes whose PNG didn't land. Downside: reintroduces "index lost when images fail" problem CREW-171 fixed unless the index is written twice. (b) Leave `index.json` as-is, add explicit per-entry `hasScreenshot: boolean` (or `screenshotPath: string | null`) populated after the image pass. Leaning (b).

**Shape of work:** Small change in `emit.ts` — restructure so the image pass back-fills a screenshot-present flag into the already-written index, then rewrites `index.json` once at the end. Touches the `IndexEntry` shape, so the `visual-fidelity-check` skill doc + any snapshot-schema notes need a matching update. One ticket.

**Open questions:** Should `index.json` be written once (after images) or twice (metadata guarantee + final with flags)?

#### 2026-05-16 — figma-snapshot `resolvedStylesFor` text-color heuristic picks the first TEXT descendant

**What:** The nested-instance enrichment walk added in CREW-150 resolves each instance's `resolvedStyles.textColor` via `node.findOne((n) => n.type === 'TEXT')` — the first text node in document order anywhere in the subtree. For a single-label primitive (a Pill) that's right. For a composite instance with multiple text descendants it may grab the wrong glyph's color, and the skill's Step 4 `resolvedStyles.textColor` diff would then silently compare the caller against the wrong text run.

**Why noticed:** Code review of CREW-150 (Phase 2 of the render-frame-anchor plan). The enrichment script's embedded comment ("single primary text child") already acknowledges the assumption.

**Anchors:** `resolvedStylesFor` in `packages/cli/src/lib/figma-snapshot/enrichment-prompt.ts`; CREW-150; CREW-152 (Phase 4, consumes this data shape); `docs/superpowers/plans/2026-05-13-visual-fidelity-render-frame-anchor.md` §1.

**What's been considered:** Acceptable for the current Pill-centric fixture — every fixture instance touched today has at most one text child. A more robust heuristic would prefer the text node bound to the instance's `Label` component property, or the largest/topmost text run.

**Shape of work:** Small — targeted change to the `resolvedStylesFor` text-node selection, plus a fixture case with a multi-text composite. Best sized once Phase 4 surfaces a real multi-text composite.

**Open questions:** Should text-color resolution be tied to the `Label` INSTANCE/TEXT property specifically (deterministic, but skips decorative text), or stay structural with a better tie-breaker?

#### 2026-05-15 — `crew fix-pr` does not refresh `.mcp.json` — chrome wiring goes stale on resume

**What:** `crew fix-pr` resumes an agent into an existing worktree but never (re)writes `.mcp.json` or re-runs `runSkillInjection`. After CREW-146 PR A, `crew run` and `crew resume` write a `chrome` MCP server entry (and inject the `browsing` skill) for `[visual_fidelity]` projects, but `fix-pr` does not. A `fix-pr` on a `[visual_fidelity]` project whose original `crew run` predated CREW-146 dispatches an agent into a worktree with no `chrome` entry — silently losing visual-fidelity Step 5's live-DOM capability.

**Why noticed:** Code review of CREW-146 PR A. The re-plan **spec** (Change 4) names three files for the widened `.mcp.json` write gate — `run.ts`, `resume.ts`, **and `fix-pr.ts`**. The **plan** (Task 4) scoped the gate to only `run.ts` + `resume.ts`. PR A followed the plan, so `fix-pr.ts` was left untouched. `fix-pr.ts` writes no `.mcp.json` at all today, so wiring it is genuinely new scope rather than a one-line gate widening.

**Anchors:** `packages/cli/src/commands/fix-pr.ts`; the write-gate block in `packages/cli/src/commands/resume.ts` (the shape to mirror); `docs/superpowers/specs/2026-05-15-crew-146-chrome-integration-replan.md` Change 4; `docs/superpowers/plans/2026-05-15-crew-146-chrome-integration.md` Task 4; `docs/tickets/CREW-146.md` (Decisions section records this divergence).

**What's been considered:** Two paths. (a) Add the `resume.ts`-style write-gate block to `fix-pr.ts` before `spawnClaudeResume` — also consider re-running `runSkillInjection`. (b) Decide `fix-pr` deliberately never refreshes `.mcp.json` and reconcile the spec. The "stale `.mcp.json` is a real footgun" comment in `resume.ts` argues for (a).

**Shape of work:** Small — one write-gate block plus possibly one `runSkillInjection` call in `fix-pr.ts`, mirroring `resume.ts`; or a doc-only spec reconciliation. Fold in a command-layer test asserting a `[visual_fidelity]` `fix-pr` produces the `chrome` entry.

**Open questions:** Does `fix-pr` resume into a worktree fresh enough that re-asserting `.mcp.json` is always safe? Should `browsing` skill re-injection ride along?

### Dashboard UI

#### 2026-06-06 — `dialog` / `popover` animation classes are inert (no tailwindcss-animate plugin)

**Ticket:** [CREW-237](https://safturento.atlassian.net/browse/CREW-237)

**What:** `packages/dashboard/src/components/ui/dialog.tsx` and `popover.tsx` carry `data-[state=open]:animate-in`, `fade-in-0`, `zoom-in-95`, `slide-in-from-*`, etc. — the standard shadcn animation classes. But the project has **no** `tailwindcss-animate` (Tailwind v3) or `tw-animate-css` (Tailwind v4) plugin installed and no `@plugin`/`@import` for one in `index.css`, so those utilities don't exist and the classes are dead no-ops. The Modal/AlertModal/Popover surfaces currently pop in/out with no animation.

**Why noticed:** Building the CREW-232 `Drawer` composite (PR for the Radix-Dialog drawer migration), I went to reuse `slide-in-from-right` for the drawer's enter/exit and found the utility undefined. Worked around it by defining custom `drawer-in`/`drawer-out`/`overlay-in`/`overlay-out` keyframes + `--animate-*` theme vars in `index.css` (matching the existing `att-pulse` pattern) — so the drawer animates, but the broader dead-class problem remains for the other overlays.

**Anchors:** `packages/dashboard/src/components/ui/dialog.tsx`, `packages/dashboard/src/components/ui/popover.tsx`, `packages/dashboard/src/index.css` (`@theme` `--animate-*`, `@keyframes`), `packages/dashboard/package.json` (no animate dep).

**What's been considered:** Two clean directions — (a) adopt `tw-animate-css` (the Tailwind v4 successor) via `@import 'tw-animate-css'` in `index.css`, which lights up every existing `animate-in`/`slide-*` class at once (so all modals/popovers start animating — a visual change to audit); or (b) strip the dead classes and define only the handful of custom keyframes actually wanted, per-surface (the path the Drawer took). (a) is less code but a broader behavior change; (b) is explicit but more verbose.

**Shape of work:** small — one decision (adopt-plugin vs strip-and-define) plus the follow-through. If (a), audit the now-live modal/popover animations for jank. Out of scope for the drawer PR, which only needed its own keyframes.

#### 2026-06-05 — Drawer `liveMode` + section-collapse leak across an in-place agent switch

**What:** `AgentDrawer` is rendered without a React `key` (`packages/dashboard/src/App.tsx:130`: `{route.kind === 'agent-drawer' && <AgentDrawer agentKey={route.key} />}`), so navigating from one agent route to another (browser back/forward between two `#/agent/:key` URLs, or any future "next agent" affordance) reuses the same `Timeline` instance — the `agentKey` prop changes but the component is not remounted. CREW-232 fixed this for the persisted filter + search state by re-seeding during render, but `liveMode` (seeded from `agentState` per the `isLiveByDefault` default) and the section-collapse `Record` still keep the _previous_ agent's values across such a switch. So back/forward between a finished agent and a running one can show the wrong live-mode default, and collapsed sections from agent A bleed into agent B.

**Why noticed:** 2026-06-05 CREW-232 implementation. Verifying filter persistence in the running app via SPA hash navigation (not `page.goto`, which full-reloads and hides the reuse) surfaced that the unkeyed drawer reuses `Timeline`. The filter/search half was in scope and got the render-time re-seed; `liveMode`/collapse were left as-is because they aren't persisted and the dominant UX path (close drawer → `#/` unmounts → open another) remounts cleanly. The gap only bites the direct agent→agent navigation paths.

**Anchors:** `packages/dashboard/src/App.tsx:130` (the unkeyed `<AgentDrawer>`); `packages/dashboard/src/components/Timeline/Timeline.tsx` (the `seededFor !== agentKey` render-time re-seed added by CREW-232 — the pattern to extend; `liveMode` `useState(() => isLiveByDefault(agentState))` and `collapsed` `useState<Record<string, boolean>>({})` are the two that still don't reset).

**What's been considered:** Two clean options — (1) add `key={route.key}` to `<AgentDrawer>` in `App.tsx`, remounting the whole drawer subtree per agent so _all_ state resets for free (simplest; minor cost is a re-fetch/animation on each agent→agent nav, which is arguably desirable); or (2) extend the in-`Timeline` render-time re-seed to also reset `liveMode` and `collapsed` when `agentKey` changes (keeps the fix local, no remount). Option 1 is the holistic fix and also covers any other latent reuse-staleness in the drawer subtree; option 2 is narrower. Either is small.

**Shape of work:** XS — one-line `key` add, or a few lines extending the existing re-seed block, plus a Timeline rerender-without-remount test for `liveMode`/collapse (mirror the CREW-232 `re-seeds filters when the agent key changes without a remount` test).

#### 2026-06-05 — Dashboard has no cancel action; CLI kill never notifies the daemon

**Ticket:** [CREW-235](https://safturento.atlassian.net/browse/CREW-235) — Epic "Runner control parity (UI ⇄ CLI run-lifecycle actions)", needs-planning. This is the Epic's graceful-path half; resolution gated on Epic completion.

**What:** There is no way to stop an in-flight `crew run` from the dashboard, and stopping one from a separate shell (`kill`, killing the container, deleting the worktree) never tells the daemon the run ended. `crew run` only POSTs `…/runs/:id/complete` on a clean exit of the foreground process — claude exits normally, or a foreground Ctrl+C that the `sigintHandler` forwards to claude before falling through to the `completeRun` call. An out-of-band kill skips that path entirely, so the run row keeps `completed_at = null` and the agent shows "running" forever (the orphaned-run symptom). The dashboard's action surface (the CREW-208 lineage: New Run / Fix PR / Finish) has no Cancel verb, so the operator's only recourse is a CLI kill — which is exactly what orphans the run.

**Why noticed:** 2026-06-05 session. After hard-resetting the four Dashboard-polish runs (CREW-231–234) from the command line — there's no dashboard control for it — all four kept showing "running" on the dashboard. Tracing it: the kill bypassed `completeRun`, leaving the run rows in-flight. The display self-corrects on re-dispatch (state derivation keys off the latest run by id), but the orphaned rows persist underneath, and there's no graceful way to end a run from the UI in the first place.

**Anchors:** `packages/cli/src/commands/run.ts` ~`:587`–`:657` (the abort controller, `sigintHandler`, and the `completeRun` call reached only on the clean path); `packages/daemon/src/routes/runs.ts` (the `:runId/complete` endpoint a Cancel action would land); `packages/cli/src/lib/runner/` + `packages/daemon/src/routes/runner.ts` (the host runner that executes dispatched verbs — a Cancel would need it to signal the spawned process); the CREW-208 dashboard-actions lineage. Pairs with the 2026-05-18 reaper followup below.

**What's been considered:** Two complementary angles, both wanted — (1) a **dashboard Cancel/Abort action** routed through the action queue + runner (signal the spawned `crew run` process) so it lands a clean `completeRun`, mirroring how New Run / Fix PR / Finish already flow; (2) a **daemon-side reaper** (the 2026-05-18 followup) as the backstop for kills that bypass _any_ graceful path (SIGKILL, container death). The action handles the intentional case cleanly; the reaper catches the rest. The terminal-state question is shared with the reaper: a cancelled/reaped run probably wants a distinct `cancelled`/`abandoned` state rather than `error`.

**Shape of work:** Belongs to the not-yet-planned runner-status/logs epic (item #3 of the 2026-06-05 dashboard worklist) or a dedicated run-lifecycle-control slice — not its own ticket until that epic is brainstormed. Medium: a daemon action verb + route, runner support for signalling a tracked child process, a dashboard button on active agents, and the terminal-state decision.

**Open questions:**

- Does the runner currently track the PID of each `crew run` it spawns well enough to signal it cleanly? (Check `packages/cli/src/lib/runner/`.)
- New terminal state (`cancelled`) vs reusing `error`? Resolve together with the reaper followup, which raises the same question.

#### 2026-06-04 — New Run modal step 2 is a text entry, not the Figma open-ticket picker

**What:** CREW-218's New Run modal ships step 2 ("Pick a ticket") as a single `FormField` where the operator types a ticket key, and step 3 ("Confirm") omits the Figma's "Title" summary row. The Figma frames (`1:3418`, `9:2`) instead show a searchable list of the project's **open Jira tickets** (rows like `KAN-31 · Drag-and-drop reordering…` with a priority badge + a "Filter open tickets…" search input) and a ticket _title_ on the confirm step. Both gaps have the same root cause: no daemon endpoint serves open tickets or a ticket summary to the dashboard — `DaemonClient` exposes only `listProjects` / `listAgents` / `enqueueAction` / `getRunnerStatus`. The plan (T6 step 2) explicitly deferred live ticket fetching ("otherwise skip in v1").

**Why noticed:** Implementing CREW-218. Step 1 (project picker) maps cleanly to `listProjects()`, but steps 2–3 need data the dashboard can't fetch yet, so the modal degrades to a typed key. Surfaced during the visual-fidelity pass as the largest code↔Figma divergence (medium, intentional).

**Anchors:**

- `packages/dashboard/src/components/NewRunModal.tsx` — step 2 `FormField`; step 3 `SummaryRow`s (no Title).
- Figma `1:3418` (Select Ticket), `9:2` (Confirm) + composites `362:2212` / `362:2213` in `.crew/figma-snapshot/`.
- `packages/dashboard/src/data/DaemonClient.ts` — the missing `listOpenTickets(project)` / `getTicket(key)` surface.
- `packages/shared/src/jira` — the Jira client the daemon would call.
- Sibling followup directly above: "CREW-137 modal composites unverified" — CREW-218 is the wiring ticket it anticipated; its Modal/Stepper/ModalSelectionRow/FormField fidelity is now verified (AlertModal still unwired).

**What's been considered:** A `GET /api/projects/:slug/tickets` (open issues via the project's Jira board) + `GET /api/tickets/:key` (summary) would let step 2 become the real picker and step 3 show the title. Out of scope for T6 (dashboard-only); needs a daemon route + Jira-client call + Bruno coverage. Also open: should the New Run modal's "Spawn agent" respect runner-online status (like T5's QuickAction degradation), or is queuing-while-offline acceptable since the daemon holds the pending action until a runner connects? Today it always enqueues.

**Shape of work:** One daemon ticket (open-tickets + ticket-summary routes + Jira client + Bruno) blocking one dashboard ticket (swap step 2's FormField for a `ModalSelectionRow` list with the search `Input`, add the Title row to step 3). The runner-gating question is a small separate decision, possibly just a disabled-state on Spawn.

**Open questions:**

- [ ] Source of "open tickets" — the project's Jira board/JQL, or only tickets with no existing agent yet?
- [ ] Should Spawn be disabled / warn when no runner is online?

#### 2026-06-03 — CREW-137 modal composites unverified until wired into a screen

**What:** CREW-137 added the modal-family composites (Modal, AlertModal, ModalSelectionRow, Stepper) but wired none into a live screen, so their visual fidelity could not be verified at merge — the PR shipped on component-build correctness alone. When the first real consumer lands (e.g. the New Run modal), verify each composite against its Figma reference and adjust the composite where it diverges.

**Why noticed:** Merging Batch B (CREW-137). The modal composites have no caller site yet, so visual fidelity is unverifiable until one exists — flagged at merge time as deferred verification.

**Anchors:** the CREW-137 composites in `packages/dashboard/src/components/` (Modal, AlertModal, ModalSelectionRow, Stepper) + their `.figma.tsx`; CREW-137; the deferred modal screens (New Run / Register / Edit / Delete) marked out-of-scope in Epic CREW-134. Related: the 2026-05-09 "3 remaining ad-hoc modal frames need DS Modal swap" followup.

**What's been considered:** Visual fidelity here is deferred-by-construction (build-then-wire). The first wiring ticket (most likely the New Run modal) should bake in a `visual-fidelity-check` pass over the modal + any composite it uses, treating divergences as adjust-the-composite work rather than caller-only fixes.

**Shape of work:** No standalone ticket — fold a "verify modal composites against Figma" acceptance criterion into whichever ticket first wires a modal into a screen.

**Open questions:** Which screen wires the first modal — the New Run flow? That ticket owns the verification.

#### 2026-05-22 — `${APP_URL}` template literal in DrawerHeader docker pill (backend bug)

**What:** The DrawerHeader's docker pill renders the literal string `${APP_URL}` for some agents in production (DOM `href` becomes `https://crew.tail82463c.ts.net/$%7BAPP_URL%7D` — the `${…}` is URL-encoded by the browser). The dashboard is showing exactly what the daemon returns; the bug is in `deriveAppUrl` in `packages/shared/src/config/derive-urls.ts` returning the project-config template verbatim without expanding `${CREW_VITE_PORT}` (or whichever env var the project's `app_url` template references) against the worktree's `env.toml`.

**Why noticed:** PR #262 review of CREW-185 (drawer visual fidelity). Reviewer caught it on the live production drawer using chrome MCP. Out of scope for CREW-185 because the ticket is "Frontend-only" and explicitly says "If a finding requires a new data field, surface as out-of-scope + file a followup" — the fix is in `shared/`, not the dashboard.

**Anchors:**

- `packages/shared/src/config/derive-urls.ts` — `deriveAppUrl` (where template expansion should happen)
- `packages/dashboard/src/components/DrawerHeader.tsx:101–113` — the consumer pill that surfaces whatever string it gets
- Project config `app_url` field — typically `"http://localhost:${CREW_VITE_PORT}"` or similar
- Worktree `env.toml` — where `CREW_VITE_PORT` (and similar per-worktree vars) get materialized
- CREW-185 PR #262 review comment (2026-05-23)

**What's been considered:**

- Expand against `process.env` directly in `deriveAppUrl` — simple but conflates daemon-process env with worktree env.
- Pass the worktree's resolved env into `deriveAppUrl` as a second arg — cleaner, matches how the rest of `shared/config/` handles per-worktree state.
- Render a friendlier error in the dashboard (e.g. "app URL not configured for this worktree") rather than the literal string — defensive, but masks the upstream bug.

**Shape of work:** Small. Locate `deriveAppUrl`, thread the worktree's resolved env vars in, substitute `${VAR}` tokens before returning. Add a unit test for the template-expansion path. ~30 min including tests.

**Open questions:**

- Should expansion fail loudly (throw) or silently (leave the token unexpanded) when a referenced var isn't set? Loud is better for catching misconfigured worktrees early.
- Is `${VAR}` the only template syntax to support, or also `$VAR` / `{{ VAR }}`? Existing `env.toml` usage will dictate this.

#### 2026-05-22 — Layer-1 RunMetrics widget loses its drawer home in the redesign — find it a new one

**Ticket:** [CREW-209](https://safturento.atlassian.net/browse/CREW-209) — parked in Backlog (needs planning); folds in the `parity_violations` efficacy check.

**What:** The 2026-05-21 drawer redesign (Figma `9FeJPriqdsdA4n9R5Xsrr8`, AgentBody `220:246`) does not include `RunMetrics` anywhere. The widget renders Layer-1 cohort metrics (`docLoadCoveragePct`, `cleanlinessPass`, `prClaimInputTokens`, `parityViolations`) and currently sits between AgentHeader and Timeline in `AgentBody.tsx:45`. The drawer code-migration plan (this session, 2026-05-22) drops it from drawer + AgentPage entirely. The component itself stays — `RunMetrics.tsx` is solid — but with no caller it'll be dead code until placed somewhere.

**Why noticed:** Drawer code-migration brainstorm 2026-05-22. The Figma redesign is intentionally focused on per-agent run state (DrawerHeader + TokensByTool + TimelineSection); cohort metrics are an orthogonal concern. Drop-and-revisit was the right call mid-brainstorm, but the widget shouldn't just evaporate — Layer-1 is the whole point of CREW-164.

**Anchors:**

- `packages/dashboard/src/components/RunMetrics.tsx` — the widget being dropped
- `packages/dashboard/src/components/MetricsTrendWidget.tsx` — sibling widget that may share the same fate / home
- `packages/dashboard/src/components/AgentBody.tsx:45` — current call-site, deleted by the drawer migration
- CREW-164 (Layer-1 metrics pipeline — what produces the data)
- Drawer migration spec: `docs/superpowers/specs/2026-05-22-drawer-code-migration-design.md` (to be written this session)

**What's been considered:**

- **Dedicated `/metrics` route.** RunMetrics + MetricsTrendWidget on their own screen. Clean separation between "what's happening with this run" (drawer) and "how are runs doing across cohorts" (metrics page). Largest scope.
- **Sidebar/footer on AgentPage.** Less disruptive but reintroduces the same "doesn't belong here" problem the drawer redesign solved.
- **Per-run drawer footer.** Show the _single run's_ metrics at the bottom of the drawer (small row of 4 values), distinct from the cohort aggregate. Requires deciding whether to keep `RunMetrics` (cohort-aware) or build a per-run variant.

**Shape of work:** Decision-first. Once placement is decided, implementation is small — re-render `RunMetrics` in a different location, or build a thin per-run variant if going that route. The blocker is product/design clarity on what the metrics are _for_ in this UI.

**Open questions:**

- What story do Layer-1 metrics tell, and to whom? (Cohort health snapshot for ops? Per-run quality gate for an author? Both?)
- Are `RunMetrics` (cohort) and `MetricsTrendWidget` two surfaces of the same idea or distinct? They share a backend (`/api/metrics`) but render differently.
- Does anyone actively look at these metrics today, or was the widget aspirational? If aspirational, deprecation is a third option.

#### 2026-05-13 — TopNav BrandMark renders a different glyph than the Figma "crew" mark

**What:** The `BrandMark` component at the top-left of the TopNav renders a check-in-rounded-square SVG in code (two rounded rects + a checkmark path) while the Figma reference shows a squarish-dotted "crew" mark. Verified 2026-05-21 against `packages/dashboard/src/components/BrandMark.tsx`: current SVG is `<rect>... <path d="M7 12 L11 16 L17 8" .../>` — clearly checkbox-styled, not the Figma mark.

**Why noticed:** 2026-05-13 ultimate-test visual comparison. Visible on all 5 captured screens — the check-in-square glyph appears identically rendered in code, the squarish-dot mark appears identically in Figma.

**Anchors:**

- `packages/dashboard/src/components/BrandMark.tsx` — current implementation
- `packages/dashboard/src/components/BrandMark.figma.tsx` — Code Connect mapping
- Figma component: `220:211` (BrandMark on Composites page)
- Note: pre-existing drift, not a CREW-135 regression. The brand mark may have been redesigned in Figma after the initial dashboard implementation.

**Shape of work:** Small — refresh BrandMark.tsx's SVG path to match the Figma reference. Compare the Figma node's SVG content to the code's SVG, update path data accordingly.

**Open questions:** Is the Figma BrandMark the canonical brand intent, or did Figma drift from a previously-agreed mark? Confirm with design owner before changing.

#### 2026-05-13 — "Hide finished" toggle on Agents List has no Figma reference (scope drift either way — reconcile)

**What:** The Agents List rendered output shows a `Hide finished` toggle (outlined pill, top-right of the agent list area). Verified 2026-05-21: `components/AgentsList.tsx:62` renders the toggle. No Figma frame captured during the 2026-05-13 ultimate test surfaces this control — the Figma `1:2` Agents List reference has no equivalent toggle. Either the Figma is stale (control was added in code post-Figma-design) or the code over-shipped.

**Why noticed:** 2026-05-13 ultimate-test visual comparison (screen 1 — Agents List).

**Anchors:**

- `packages/dashboard/src/components/AgentsList.tsx:62` — toggle implementation
- Source of the feature: CREW-107 (PR #142, "Hide finished toggle on AgentsList") — code-side feature that shipped without Figma alignment
- Figma reference: `1:2` — no Hide finished toggle visible

**What's been considered:**

- **Code-first feature:** real UX request shipped without going through Figma first. Solution: add it to the Figma design retroactively.
- **Over-shipped feature:** the toggle isn't actually wanted; remove from code.
- **Design owner unilaterally chose not to include it in Figma:** also requires reconciliation.

**Shape of work:** ~15min: confirm with design owner whether the toggle stays in code (add to Figma) or comes out of code (remove). Easy decision once asked.

**Open questions:** Which way does the user want to reconcile?

**2026-06-06 update — half reconciled:** decision is "keep it." The bespoke outlined-pill toggle (with its own `hover:opacity-80`) was replaced with the DS `Switch` component (`AgentsList.tsx`, mirrors `LiveModeToggle`) during the pill/button hover-states change. The control now has a DS basis that exists in Figma (`Switch` set `335:242`), resolving the "scope drift / no DS reference" half. **Remaining:** the Figma AgentsList _screen_ (`1:2`) still doesn't depict the toggle — add a `Switch` instance there for screen-level parity, then this can move to Resolved.

#### 2026-05-10 — Wire dashboard QuickAction buttons (Resume / Finish / Inspect / Provide input) to daemon endpoints

**Ticket:** [CREW-208](https://safturento.atlassian.net/browse/CREW-208) (Epic) — parked in Backlog; resolution gated on Epic completion (Epic exception).

**What:** CREW-119 landed the v2 quick-action buttons in the agents list (`Resume + Finish` for `idle`, `Provide input` for `waiting`, `View PR + Finish` for `pr_open`, `Inspect` for `error`). The buttons fire an `onAction(kind, agent)` callback up through `AgentRow → ProjectSection → AgentsList`, but `App.tsx` currently does **not** mount a handler — clicks no-op. The visual contract is shipped; the functional contract is not. Each action needs a daemon endpoint and a mutation hook that the App-level handler dispatches.

**Why noticed:** CREW-119 autonomous run on 2026-05-10. The original CREW-119 ticket scope was "visual fidelity sweep" — landing functional behavior for brand-new actions like `Resume` was out of scope (the daemon has no resume endpoint today), but landing the buttons visually wasn't.

**Anchors:**

- `packages/dashboard/src/components/AgentRow.tsx` — exports `QuickActionKind` (`resume | finish | view-pr | provide-input | inspect`)
- `packages/dashboard/src/App.tsx` — `<AgentsList … />` mount; add an `onAgentAction` prop
- `packages/daemon/src/routes/` — needs new endpoints (`POST /agents/:key/resume`, `/finish`, `/inspect`, `/answer`)
- `bruno/endpoints/agents/` — would gain four new `.bru` files

**What's been considered:**

- **Wire up incrementally as endpoints land.** Start with `finish` (closest to existing transcript completion), then `provide-input` (already partially supported), then `resume` and `inspect`.
- **Single `POST /agents/:key/action { kind }` endpoint** vs verb-per-action. Verb-per-action mirrors REST norms; single dispatcher centralizes permissions but loses semantic clarity.
- **Route through `useMutation` from TanStack Query** so optimistic updates + invalidation are uniform with the existing list query.

**Visual styling consistency note (added 2026-05-10):** the `Inspect` button on the latency row in frame `1:2` currently renders as solid red bg with dark text — drifted from the canonical pill pattern. When this ticket lands the dashboard handler, also pick a button styling pattern consistent with the StateBadge tinted-bg approach OR explicitly decide it should be a solid destructive shadcn `Button` variant.

**Shape of work:** Likely two tickets — one daemon-side (add four endpoints + matching `.bru` files) and one dashboard-side (mount `onAgentAction` in `App.tsx`, wire each kind through TanStack `useMutation`, surface success/error toasts). Both can run in parallel after the endpoint contracts are settled.

**Open questions:**

- [ ] Does `inspect` need its own daemon-side action or is "open the agent drawer focused on the error transcript" enough?
- [ ] Should `resume` from `idle` reuse the `crew run` codepath or be a separate "rehydrate" verb?

#### 2026-05-10 — Polish the CREW-119/CREW-117 Crew DS composites (skeleton-fidelity → pixel-fidelity)

**What:** CREW-119 + CREW-117 built ten Crew DS composites on the Composites page at **skeleton fidelity** — names, semantic-token bindings, and slot structure correct, but visual treatment intentionally minimal. `BrandMark` and `StateBadge` are now pixel-fidel after the 2026-05-10 frame migration polish. The other composites are placeholder boxes with sample text. They need a designer pass — type ramps tightened, padding/gap bound to Core `tw/space`, hover/focus states added, variant axes grown (`AgentRow.state`, `TopNav.route`, `ProjectSection.expanded`).

**Specific known defect — AgentBody embeds a hardcoded state pill:** during the 2026-05-10 frame-migration session AgentBody (`24:2`) was found rendering its state pill as a solid color block. **Sub-issue resolved 2026-05-12:** verified during the in-session DS consolidation that AgentBody's metadata row's pill node (now `220:233` in `9FeJPriqdsdA4n9R5Xsrr8`) is a real `StateBadge` INSTANCE — broader composite polish (Timeline placeholder buildout, action-row buttons) remains active under this followup.

**Why noticed:** CREW-119 + CREW-117 autonomous runs on 2026-05-10 — Crew DS build-out was descoped from pixel-perfect to skeleton fidelity to keep run scopes reasonable.

**Anchors:**

- Crew DS (consolidated): `9FeJPriqdsdA4n9R5Xsrr8` Composites page
- Component node IDs in archived Crew DS file: `BrandMark=19:3`, `StateBadge=20:23`, `TopNav=21:2`, `AgentRow=21:9`, `ProjectSection=21:21`, `AgentsList=21:25`, `AgentBody=24:2`, `StateHistoryBar=25:4`, `TokenTable=26:4`, `ViewportFrame=27:4` (may have moved post-consolidation)
- Dashboard CVA configs: `packages/dashboard/src/components/{AgentRow,StateBadge,TopNav,ProjectSection,AgentBody,StateHistoryBar,TokenTable,ViewportFrame}.tsx`
- `docs/plans/design-system.md` — Component inventory + "StateBadge visual pattern (canonical)" section

**Shape of work:** Likely folded into individual fidelity tickets as they arise (e.g. a future "Projects List fidelity" ticket would polish `TopNav`). No standalone ticket needed unless the user wants to schedule a dedicated polish pass.

#### 2026-05-08 — Tool-name filtering in the timeline Filters dropdown

**What:** Today's drawer timeline lets users filter by event _type_ (Tool calls / Assistant prose / Thinking / System / Hooks & skills / Other). It doesn't let them filter by _tool name_ (Bash / Read / Grep / Edit / etc.). Once a long-running agent racks up 800+ tool calls, "show me only the Bash invocations" becomes a useful triage gesture. Add a tool-name section inside the Filters dropdown built by CREW-118.

**Why noticed:** 2026-05-08 triage of the chip→dropdown redesign. We agreed to keep the initial dropdown scoped to event-type filtering only — tool-name filtering has its own UX problems (long, dynamic list per agent; ordering / search inside the popover; user might want "fewest" vs "most" used) that deserve a designer pass.

**Anchors:**

- [CREW-118](https://safturento.atlassian.net/browse/CREW-118) — the dropdown ticket this would extend
- `docs/designs/design_handoff_crew_dashboard/` — design hand-off; would need an additional update
- `packages/dashboard/src/components/FilterChips.tsx` (today) / Filters dropdown (post-CREW-118) — host component
- The set of tool names is dynamic — read from the timeline event stream rather than a hardcoded list

**What's been considered:**

- **Sub-section in the same dropdown.** Type checkboxes on top, tool-name checkboxes below, separated by a divider. Risk: long tool lists make the popover scroll.
- **Separate "Tools" dropdown.** Two buttons in the row. Cleaner per-section UX, but eats more horizontal space.
- **Search-inside-the-popover.** Type checkboxes always visible at top; tool-name section below with a small filter input. Scales to long lists.

Lean toward search-inside-popover when this iteration ships.

**Shape of work:** One ticket, dependent on CREW-118 landing first. Designer hand-off update for the new section, then implementation extends the dropdown's checkbox model with a tool-name list source (derived from the agent's timeline events).

**Open questions:**

- Tool-name filters compose with type filters (AND), or alternative axis (OR)? Probably AND.
- Tool aliases worth normalizing (e.g. `mcp__atlassian__jira_get_issue` → `Jira: get_issue`)? Raw is simplest.
- Count next to each tool name live-updating or fixed at popover-open time? Fixed is much cheaper.

#### 2026-05-08 — Surface `crew finish` step results in the dashboard

**Ticket:** [CREW-208](https://safturento.atlassian.net/browse/CREW-208) (Epic) — parked in Backlog; resolution gated on Epic completion (Epic exception).

**What:** `crew finish` from the CLI prints a structured checklist as it runs — `step()` (`packages/cli/src/commands/finish.ts:120-132`) wraps each cleanup operation and emits a green ✓ on success or yellow ! on skip/warn. None of this flows to the daemon. Once finish lands, the dashboard's only signal is the agent's terminal state — there's no record of which steps succeeded, which were skipped, or what failed and why. The drawer should expose a per-step checklist with the same success/skip/error semantics.

**Why noticed:** 2026-05-08 conversation triaging finish-related bugs in CREW-94. While walking through "finish runs have no transcript by design", the user pointed out that finish _does_ have an observable surface — the CLI's structured output — it just isn't piped through the daemon.

**Anchors:**

- `packages/cli/src/commands/finish.ts:120-132` — `step()` helper, the natural emit point for per-step events
- `packages/cli/src/commands/finish.ts:226-235, 301-315` — current daemon parity (registerRun + completeRun only)
- `packages/daemon/src/services/EventBus.ts` — natural place to publish per-step events on the SSE firehose
- `packages/dashboard/src/components/AgentBody.tsx` — where step results would render
- `packages/shared/src/transcripts/` — schema would land here if finish steps are modeled as a new event type
- [CREW-116](https://safturento.atlassian.net/browse/CREW-116) — prerequisite bug-fix ticket

**What's been considered:**

- **Per-step SSE events.** New `finish-step` event type in `crew-shared` with `{ runId, step, status, message? }`. CLI emits via existing daemon HTTP client; daemon publishes to EventBus → dashboard subscribes via slice-1c's `CrewEventStream`. Live-updating checklist. Most consistent with slice 1c.
- **Per-step rows in a new `finish_steps` table.** CLI POSTs each step result; daemon writes a row; drawer queries at open time. Simpler. Doesn't stream live, but finish completes in tens of seconds.
- **Bundled completion payload.** CLI accumulates results, sends all at once. Cheapest. If finish hangs mid-step, dashboard sees nothing until completion or timeout.

The SSE shape feels right — matches slice 1c's "live updates" feel.

**Shape of work:** One ticket, depends on CREW-116 so finish runs are correctly modeled before adding more surface. Author the new event type in `crew-shared`, add a daemon endpoint, emit from `finish.ts`'s `step()` helper, render in the drawer alongside the timeline.

**Open questions:**

- Drawer layout: inline (between StateHistoryBar and Timeline) vs dedicated panel?
- Pre-existing finish runs in the DB will have no step data. Drawer should render nothing rather than an empty state.
- Distinguish skip vs error in the schema (CLI uses `warn()` for both). Schema should have three states (success/skip/error).

#### 2026-05-05 — Dashboard silently drops agents whose project isn't in `/api/projects`

**What:** `packages/dashboard/src/components/AgentsList.tsx:21-22` filters projects by `byProject.has(p.name)` and only renders sections for projects returned by `/api/projects`. An agent whose `projectName` field doesn't match any registered project disappears from the UI entirely — no warning, no fallback bucket. The companion compose-mount bug (the daemon container had no bind-mount for `~/.config/crew/projects/`, so `/api/projects` returned `[]`) made this manifest as "every agent is invisible." That mount is fixed, but the silent-drop UX is still wrong.

**Why noticed:** User dispatched `crew run CREW-95`, agent registered fine but the dashboard at `localhost:5173` was empty. Even after fixing the mount, any project name mismatch (typo in TOML, project deregistered while agents are still active) re-creates the same silent failure.

**Anchors:**

- `packages/dashboard/src/components/AgentsList.tsx:21-22` — the filter that drops everything
- `packages/dashboard/src/data/types.ts` — `Agent.projectName` field shape
- `packages/daemon/src/services/ProjectsService.ts:28` — silently returns `[]` when configDir is missing
- `docker-compose.yml` — daemon volume list

**What's been considered:**

- Render orphan agents under a synthetic `Unregistered` section with a banner "this agent's project isn't registered — register it via `crew register`."
- Daemon-side: include orphan agents in `/api/agents` with a synthetic project entry.
- Show a top-level toast when `/api/agents` has rows that no `/api/projects` row matches.

The "synthetic Unregistered section" feels right — single render path, no extra API surface.

**Shape of work:** Single small dashboard PR. Add an `Unregistered` group key when an agent's projectName has no match in `projects[]`. Update `AgentsList.test.tsx` to cover the orphan path. ~30 min.

**Open questions:**

- Should the `Unregistered` section sort first (most urgent) or last? Lean first.
- Does the slice 1c "Hide finished" toggle interact with this? Probably independent.

#### 2026-04-29 — Slice 1c agents continuation work

**Ticket:** [CREW-94](https://safturento.atlassian.net/browse/CREW-94) (Epic) — resolution gated on Epic completion per the user-level CLAUDE.md "Epic exception" convention.

**What:** Slice 1b (CREW-47) deliberately punted seven concerns into a future "slice 1c":

1. **SSE / `GET /events`** — push-based dashboard updates.
2. **`crew finish` daemon integration** — register a "finish" run on the daemon.
3. **`idle` / `waiting` state derivation** — needs explicit signaling or a heuristic.
4. **`GET /api/agents/:key`** — single agent + transcript. Drawer prerequisite.
5. **`GET /api/agents/:key/state-history`** — state transitions.
6. **Drawer/timeline endpoints** — whatever else the agent-detail drawer needs.
7. **PR URL extraction from JSONL** — `runs.pr_url` column stays NULL.

**Why noticed:** [CREW-47](https://safturento.atlassian.net/browse/CREW-47) "Out of scope" list and [CREW-49](https://safturento.atlassian.net/browse/CREW-49) "Out of scope" (mentions slice 1c will likely add a `state_transitions` table).

**Anchors:** [CREW-47](https://safturento.atlassian.net/browse/CREW-47); `docs/superpowers/plans/2026-04-29-agents-data-end-to-end.md`; `packages/daemon/src/migrations/0001_agents_runs_tool_calls.ts` — `pr_url` column declared, NULL in slice 1b; `packages/daemon/src/services/IngestService.*` — adds PR URL extraction in 1c.

**Shape of work:** Becomes a new Epic ("Slice 1c: agents drawer + push updates") with child tickets — `state_transitions` migration; single-agent + state-history endpoints; SSE endpoint + dashboard subscription; agent detail drawer; `crew finish` daemon registration; idle/waiting heuristic.

#### 2026-04-29 — CREW-25 cva-refactor cleanup leftovers

**What:** Three small TD items surfaced in CREW-25's PR description as "Follow-ups (not in this PR)":

1. **`STATE_META.colorVar` is unused.** `STATE_CLASSES` is single source of truth. Verified: `colorVar` still defined for all 7 states in `state-meta.ts:5,11–22` but no production code reads it.
2. **`@source inline(...)` directives are redundant.** All state classes are now literal in source. Verified: 6 `@source inline(` directives still in `index.css:79,82,85,88,91,94`.
3. **`ALL_STATES` and `ACTIVE_STATES` are duplicated across files.** Lift to `state-meta.ts`.

**Why noticed:** [PR #35](https://github.com/Safturento/crew/pull/35) (CREW-25) description.

**Anchors:** `packages/dashboard/src/data/state-meta.ts:5,11–22`; `packages/dashboard/src/index.css:79–94`; `packages/dashboard/src/components/StateBadge.tsx:15,80`, `packages/dashboard/src/components/AgentRow.tsx:16`; `packages/dashboard/src/data/state-meta.test.ts:56`.

**Shape of work:** One small cleanup ticket touching 5 files. Drop `colorVar`, drop `@source inline` directives (verify build-output), lift the two `Set<AgentState>` constants. Bundle into the next dashboard refactor that touches these files.

#### 2026-04-28 — Dashboard write/action endpoint surfaces

**What:** §10 of the dashboard UI design lists daemon API additions the UI depends on for write/action surfaces. None exist yet:

- `POST /jobs/run` — start `crew run` (project + ticket key)
- `POST /jobs/fix-pr` — start `crew fix-pr`
- `POST /jobs/finish` — start `crew finish`
- `GET /jira/:project/tickets` — proxy to Jira (cached)
- `POST /projects` / `PATCH /projects/:name` / `DELETE /projects/:name` — projects CRUD writing TOML files
- `POST /attention/clear` — clear all sticky favicon badges

**Why noticed:** `docs/superpowers/specs/2026-04-26-dashboard-ui-design.md` §10. Prerequisite for the New Run modal, Projects route, cross-tab clear-attention surface.

**Anchors:** `docs/superpowers/specs/2026-04-26-dashboard-ui-design.md` §10; `packages/daemon/src/routes/` — destination; `packages/cli/src/commands/run.ts`, `fix-pr.ts`, `finish.ts` — endpoints have to dispatch to same code paths; `packages/shared/src/config/loader.ts` — projects CRUD writes TOML files.

**Shape of work:** Probably its own Epic ("Daemon write surfaces"), parallel-able with Slice 1c. Each `POST /jobs/*` endpoint spawns the same orchestration the CLI does — argues for hoisting `runRun`/`runFixPr`/`runFinish` into a callable library. Projects CRUD touches the TOML loader's write-path (doesn't exist today).

**Open questions:**

- Authentication: localhost-only, but accidental `POST /jobs/run` could spawn an agent against the wrong ticket. Probably needs a confirmation token or idempotency key.
- `/jobs/` endpoints sync (return when agent exits) or async (return immediately, observe via SSE)? Async fits long-lived runs.

#### 2026-04-28 — Dashboard agent detail drawer + full-page route

**Ticket:** [CREW-94](https://safturento.atlassian.net/browse/CREW-94) (Epic) — folded into the Slice 1c Epic alongside the agents-continuation followup above.

**What:** The `AgentDetailPlaceholder` component currently renders "The agent detail drawer ships in a follow-up plan." That follow-up plan does not exist yet. The drawer is the dashboard's primary drill-down surface — without it, `/agents/:key` is a dead end. The full-page variant (`/agent/:key/full`) is also unbuilt.

**Why noticed:** [PR #20](https://github.com/Safturento/crew/pull/20) (CREW-17) called the drawer "future epic" in non-goals. The dashboard foundation plan listed it under "Out of scope (will be subsequent plans)."

**Anchors:** `packages/dashboard/src/components/AgentDetailPlaceholder.tsx`; `packages/dashboard/src/App.tsx`; `docs/superpowers/specs/2026-04-26-dashboard-ui-design.md` §5; Slice 1c read endpoints — backend prerequisites.

**Shape of work:** Becomes a child of the slice-1c epic since it depends on `GET /api/agents/:key` and state-history. Phase A: drawer component + route wiring against fixtures. Phase B: wire to real endpoints. Phase C: full-page variant.

#### 2026-04-28 — Dashboard New Run modal + projects route view

**What:** Two more frontend surfaces deferred from the foundation plan:

1. **New Run modal** — project picker → ticket picker → confirm. Exposed by the top nav's `+ New Run` button (currently a no-op). Depends on `POST /jobs/run` and `GET /jira/:project/tickets`.
2. **Projects route view** — list of registered projects, TOML viewer, edit/register form. Currently `#/projects` renders a placeholder. Depends on projects CRUD endpoints.

**Why noticed:** Dashboard foundation plan explicitly listed both under "Out of scope."

**Anchors:** `packages/dashboard/src/App.tsx`; `docs/superpowers/specs/2026-04-26-dashboard-ui-design.md` §6 (New Run modal), §7 (Projects route); `docs/superpowers/plans/2026-04-26-dashboard-foundation-and-agents-list.md` Out-of-scope list.

**Shape of work:** Frontend tickets paired with the dashboard write-endpoint epic above. Projects route also needs a TOML formatter for display — pairs with per-config-block reference docs.

#### 2026-04-28 — `useAttention.clear()` snapshot semantic isn't directly tested

**What:** `useAttention.clear()` is documented in the foundation plan as having a "snapshot" semantic — calling clear adds _currently-attention_ keys to `dismissed`, but newly-attention agents that arrive later still bubble up. The behavior is exercised through `App.test.tsx`'s end-to-end flow but not directly unit-tested.

**Why noticed:** [PR #20](https://github.com/Safturento/crew/pull/20) (CREW-17) "Known coverage gaps" section.

**Anchors:** `packages/dashboard/src/attention/useAttention.ts`; `packages/dashboard/src/attention/attention.test.ts` — no `clear()` cases; `packages/dashboard/src/App.test.tsx:60` — only existing test that hits `clear()` indirectly.

**Shape of work:** Tiny cleanup. Add 2–3 RTL test cases. Bundle into the cva-cleanup ticket above or stand alone.

### Daemon, CLI & Dispatch

#### 2026-06-05 — `bruno-skeleton` fix() defaults the scaffolded port instead of deriving it from config

**What:** The `bruno-skeleton` health-check `fix()` (`packages/cli/src/lib/health/checks/bruno-skeleton.ts`) builds an `InitAnswers` from the loaded `ProjectConfig` but omits `ports`, so `scaffoldBruno` falls back to `DEFAULT_DAEMON_PORT` (7773) when it writes the `environments/local.bru` `baseUrl`. A project whose daemon runs on a different port gets a scaffolded bruno environment pointing at the wrong port. The config does carry `bruno_smoke.base_url`, but that's typically a `${DAEMON_URL}` template resolved per-worktree from `env.toml` — the port isn't statically knowable from the config alone, which is why the scaffolder takes an explicit `ports.daemon` instead.

**Why noticed:** Code review of CREW-227 (T4 health checks). Flagged Minor — the scaffold is a starting skeleton the user edits, and the doctor command that invokes `fix()` is a later ticket (CREW-228), so nothing consumes this path yet.

**Anchors:**

- `packages/cli/src/lib/health/checks/bruno-skeleton.ts` — `fix()` omits `ports` from `InitAnswers`
- `packages/cli/src/lib/init/scaffold-bruno.ts` — `DEFAULT_DAEMON_PORT = 7773` fallback; `ENV_CONTENTS(port)` writes `baseUrl`
- `packages/cli/src/lib/init/types.ts` — `InitAnswers.ports?: { daemon; dashboard }`

**What's been considered:** Parsing the port out of `bruno_smoke.base_url` works only when it's a literal; for the common `${DAEMON_URL}` template it would need the materialized env (the same `envVars` the `env-materialized` check already builds). Cleanest fix is probably to thread the resolved daemon port through the `HealthContext` (or have `fix()` read `ctx.envVars`) once CREW-228 wires the doctor command and decides how the context carries materialized env.

**Open questions:** Does the doctor `HealthContext` already carry a resolved daemon port / `DAEMON_URL` by the time `fix()` runs, or does the bruno fix need to materialize env itself?

#### 2026-06-04 — `finish_steps` table accumulates across `crew finish` re-runs (no run scoping)

**What:** The daemon's `finish_steps` table (migration `0007`, CREW-215) has no `(agent_key, run_id)` discriminator and no unique constraint on `(agent_key, idx)`. `FinishStepsService.list(key)` returns _every_ row for the agent ordered by `id`. Meanwhile the CLI resets its per-step `index` to 0 at the start of each `crew finish` run (`makeStepReporter`, `packages/cli/src/commands/finish.ts`). So a second `crew finish` for the same key (a retry after a partial failure, or a manual re-run) appends a fresh `0,1,2,…` sequence — the agent's checklist becomes `[0,1,2,…,0,1,2,…]` and grows unbounded over the agent's lifetime. The drawer shows the concatenation of all runs with no visual run boundary.

**Why noticed:** Code review of CREW-220 (T8). The dashboard consumer (`FinishSteps.tsx`) originally keyed rows on `step.index`, which collides on the repeated indices — fixed in CREW-220 by keying on `${ts}-${index}`. But that's a band-aid over the daemon-side question: should the checklist be scoped to the latest run (or grouped per run) rather than an ever-growing concatenation?

**Anchors:**

- `packages/daemon/src/migrations/0007_finish_steps.ts` — table DDL (no run_id, no unique idx)
- `packages/daemon/src/services/FinishStepsService.ts:62-77` — `list()` returns all rows by `id`
- `packages/cli/src/commands/finish.ts` — `makeStepReporter` resets `index` per run
- `packages/dashboard/src/components/FinishSteps.tsx` — consumer; `${ts}-${index}` key works around the collision

**What's been considered:** Two shapes — (a) clear prior `finish_steps` for the agent at the start of each run (latest-run-only semantics, simplest, matches "the drawer shows the current cleanup"); (b) add a `run_id` and group/scope the checklist per run (keeps history, more UI work). (a) is likely enough — finish is terminal cleanup, history of prior failed attempts has low value.

**Shape of work:** small daemon change (clear-on-new-run or run_id column + migration) + a `FinishStepsService` tweak; optional dashboard grouping if (b). The CREW-220 key fix means there's no rendering bug in the meantime, just unbounded growth + concatenated display.

#### 2026-06-04 — Runner pidfile has no liveness identity (recycled-PID false positive)

**What:** `crew runner` (CREW-216) tracks its supervisor by bare PID in `~/.config/crew/runner.pid`. `isProcessAlive(pid)` (`packages/cli/src/commands/runner.ts`) only asks "is _some_ process with this PID alive" via `process.kill(pid, 0)`. After a reboot or PID recycle, a stale pidfile can point at an unrelated live process, so `crew runner status` reports "running" and `crew runner start` no-ops (and `stop` would SIGTERM a stranger). Standard pidfile limitation; acceptable for v1 but a latent foot-gun on a long-lived host.

**Why noticed:** Code review of CREW-216 (this session) flagged it Minor — the runner is the first long-lived crew process, so it's the first place this classic pidfile gap bites.

**Anchors:** `packages/cli/src/commands/runner.ts` `isProcessAlive` / `readPidFile`; `packages/cli/src/lib/runner/supervisor.ts` `startRunner`/`stopRunner` (the pure liveness consumers).

**What's been considered:** stamp the pidfile with a start token (write `pid:starttoken`, where the token is e.g. the supervisor's start time) and compare on read; or verify `/proc/<pid>/cmdline` contains `crew runner __supervise` before trusting the pid. The `/proc` check is Linux-only (the runner is a Linux/WSL host process today, so acceptable), the start-token approach is portable but needs a way to fetch the live process's start time.

**Shape of work:** small, contained — one helper that validates pid identity, threaded through the `readPid`/`isAlive` boundaries already injected into `startRunner`/`stopRunner`/`runnerStatus`. The pure layer doesn't change; only the command's boundary wiring does.

#### 2026-06-04 — `GET /api/runner/logs` reads the whole log file into memory

**What:** `tailLog` in `packages/daemon/src/routes/runner.ts` does `readFile(logPath, 'utf8')` then slices the last N lines. The `tail` _count_ is capped (≤2000), which bounds the response, but nothing bounds how much is read off disk — a long-lived host runner with an unrotated `~/.crew/runner/runner.log` makes the route allocate the entire file per request. It's a latent self-DoS on a long-running host once there's a real producer.

**Why noticed:** Code review of CREW-215 (this session) flagged it as the one non-cosmetic finding, but classified it as a followup rather than a blocker: it's inert until T4 (CREW-216, the host runner process) actually writes to that log. No producer exists at merge time.

**Anchors:** `packages/daemon/src/routes/runner.ts` `tailLog()` (the `readFile(... 'utf8')`); the `LogsQuerySchema` `tail` cap. Producer side lands in Task T4 of Epic CREW-208 (`docs/superpowers/plans/2026-06-03-dashboard-agent-actions.md`).

**What's been considered:** bounded trailing read (fs `stat` + a `read` of the last ~256KB, then split) avoids loading the whole file; alternatively, commit to a log-rotation story for `runner.log` and document a max size. The bounded-read is the smaller change and doesn't require a rotation policy.

**Shape of work:** small, contained — swap the full read for a trailing-chunk read in one function; existing route tests still apply. Best folded into T4 (CREW-216) when the producer ships, so the bound and the writer land together.

#### 2026-06-03 — `deriveState` falls through to `finished` when PR-create isn't detected

**What:** `AgentsService.deriveState` ends with `return 'finished'` (`packages/daemon/src/services/AgentsService.ts`) as the catch-all after `completedAt != null`, `exitCode == 0`, `!prMerged`, `!hasPrCreate`. So _any_ cleanly-completed run whose PR-create signal was missed renders as **finished** — a state that otherwise means "PR merged and cleaned up via `crew finish`". It silently masquerades a detection miss (or a genuinely PR-less run) as a successful close-out, with no visible distinction from a real finish. This is the second half of the 2026-06-03 status bug (CREW-31/32/174 showed `finished` instead of `pr_open`); the immediate fix only hardened the `hasPrCreate` matcher, leaving the fallthrough as a latent footgun for any other reason detection could miss.

**Why noticed:** Root-cause investigation of "three agents marked finished instead of pr_open" (this session). The matcher fix (broadening prefix-match → per-line "starts with `gh pr create`", shared helper `hasPrCreateInvocation` in crew-shared) addressed the reported incident. When asked whether to also harden the fallthrough, user chose "matcher only" — so this is the explicitly-deferred half.

**Anchors:** `packages/daemon/src/services/AgentsService.ts` `deriveState()` (the `return 'finished'` at the end); `crew-shared` `hasPrCreateInvocation`; the live transition twin in `IngestService.ts` `computeNextState` (where a completed-but-undetected run just stays `running`, _disagreeing_ with the list/getByKey display that shows `finished`). Branch `fix/pr-create-detection-cd-prefix`.

**What's been considered:**

- A completed `run`/`fix-pr` with no detected PR and no `finish` run is arguably `error` (it was supposed to open a PR and the signal we have says it didn't), or a distinct "completed, no PR" state — not `finished`.
- Note the cross-path inconsistency: the SQL-derived display (`AgentsService`) calls it `finished`, while the live tool-call machine (`computeNextState`) leaves it `running`. Whatever the resolution, these two should agree.
- Residual matcher gap (same area, cheap to fold in): `hasPrCreateInvocation` is per-line/start-anchored, so a _single-line_ `git push && gh pr create …` (no newline) still won't match. The dispatch prompt puts them on separate lines, so this isn't the observed failure, but it's the next brittle edge.

**Shape of work:** small, contained — decide the right terminal state for "completed, PR-create not observed", make `deriveState` + `computeNextState` agree on it, add the `&&`-chained matcher case. One ticket. Needs a design call on the state name before coding.

**Open questions:** Is "completed, no PR detected" really an error, or a legitimate no-op outcome (epic-guard exit, ticket already shipped — the prompt's `→ no-pr:` path)? If legitimate, `finished` may be defensible and the real fix is just surfacing _why_ (a distinct label/tooltip) rather than changing the state.

#### 2026-06-03 — `getStackUrl` is orphaned + duplicated by `docker-list`'s port/URL helpers

**What:** `packages/cli/src/lib/docker/compose.ts:52` `getStackUrl(project)` has no production caller — only `compose.test.ts` references it (already true at `origin/main`, predating CREW-31). CREW-31's new `list-stacks.ts` re-implements its two concerns independently: `getHostPort` parses `docker port <id> <spec>` (last-colon segment), and `stackUrl` builds `https://localhost[:port]` with the `443`→no-suffix rule. So the repo now carries two copies of that port-parse + URL-build logic, one of them dead in production.

**Why noticed:** Flagged in the CREW-31 self-review (Senior Code Reviewer subagent). Left out of CREW-31's PR to keep scope tight — `getStackUrl` lives in an unrelated module and deleting/refactoring it would expand the diff into `compose.ts` + `compose.test.ts` for no behavioral gain on the ticket.

**Anchors:** `packages/cli/src/lib/docker/compose.ts:52` (`getStackUrl`), `packages/cli/src/lib/docker/compose.test.ts:44` (its only caller), `packages/cli/src/lib/docker/list-stacks.ts:38,81` (`getHostPort` + `stackUrl`).

**What's been considered:** Two clean resolutions — (a) delete `getStackUrl` + its test outright since it's dead, leaving `list-stacks.ts` as the single home; or (b) if a caller is still expected, have `getStackUrl` delegate to `getHostPort` + a shared URL builder so the parse/format logic lives once. (a) is simplest given there's no caller.

**Shape of work:** Tiny — one deletion (or one delegation refactor) plus test cleanup in the `docker/` lib subdir. Not worth a ticket on its own; fold into the next docker-lib touch.

#### 2026-05-23 — GitHub webhook as a future PR-status detection mechanism (parking-lot)

**What:** CREW-202 settled on `gh api` polling + a manual "Refresh PR status" button for PR-closure detection. A GitHub webhook → daemon HTTP endpoint would be the realtime alternative: GitHub fires `pull_request` events the moment a PR is merged/closed/reopened, daemon receives them via `POST /api/github/webhook`, transitions state immediately without lag. Worth revisiting once we have the bandwidth.

**Why noticed:** Explicit parking-lot during the CREW-202 brainstorm. User has Tailscale set up so the daemon's HTTP could be reached without a public ingress — makes the webhook path more feasible than usual (most users would need ngrok or similar).

**Anchors:** CREW-202 (polling-based detection ships first); `packages/daemon/src/routes/` (where the webhook route would land); Tailscale Funnel docs for non-public-IP exposure.

**What's been considered:**

- Polling is "good enough" for v1 — bounded lag (minutes) is acceptable for a PR-merge signal that's typically minutes-to-hours of human inattention anyway.
- Webhook adds: HMAC signature verification (per repo or per organization), per-repo configuration step (the user has to set the webhook URL + secret in GitHub repo settings), exposure (Tailscale Funnel or public IP).
- Could be additive — webhook fires immediately when configured; polling fallback runs for repos where the webhook isn't set up.

**Shape of work:** New daemon route + GitHub webhook config helper (CLI subcommand?) + signature-verification middleware. Probably medium — most of the cost is the per-repo wiring rather than the daemon code itself.

**Open questions:**

- Per-repo or per-organization webhook? Per-org is fewer configurations but only works for orgs you admin.
- Should the daemon expose the webhook URL via Tailscale by default, or require explicit opt-in?
- Coexistence with polling: if both are active, debounce so duplicate transitions don't fire?

#### 2026-05-22 — CREW-183's `installNodeModules` fix doesn't extend to `crew fix-pr`

**What:** CREW-183 (PR #256) added an `installNodeModules` step before `installPlaywrightBrowsers` inside `prepareAgentEnvironment` so bare worktrees no longer no-op the chromium install. The fix covers `crew run` and `crew resume`, but **not `crew fix-pr`** — that command uses `runResumePreflight` instead of `prepareAgentEnvironment`, and `runResumePreflight` never installs node_modules. Result: a `crew fix-pr` dispatch on a freshly bare worktree still trips the silent `npx playwright install` no-op (warning only, rc=0), the worktree-pinned chromium revision never lands on disk, and `npm run test:e2e` from the fix-pr agent fails with `Executable doesn't exist at .../chromium_headless_shell-<rev>/...`.

**Why noticed:** Re-running the e2e suite during the CREW-181 fix-pr cycle (PR #259) — the user explicitly asked "the 183 fix should be in place now, can you try to re-run the e2e setup and tests?" The cycle had been dispatched via `crew fix-pr CREW-181` after #256 merged, but the e2e suite still failed with the same shape of error CREW-183 was meant to fix. `/tmp/crew-playwright-CREW-181.log` shows the playwright "ran without first installing your project's dependencies" warning; no `/tmp/crew-npm-install-CREW-181.log` exists — confirming `installNodeModules` never ran for this dispatch path.

**Anchors:** `packages/cli/src/commands/fix-pr.ts` (calls `runResumePreflight`, never `prepareAgentEnvironment`); `packages/cli/src/lib/preflight/run-resume-preflight.ts` (no install step); `packages/cli/src/lib/run/agent-environment.ts:83-99` (the CREW-183 fix that fix-pr bypasses); CREW-183 ticket / PR #256; CREW-181 PR #259 verification re-run.

**What's been considered:** Three placements:

1. Add `installNodeModules` (+ `installPlaywrightBrowsers`) to `runResumePreflight`, gated on the same `playwrightEnabled(config)` check — mirrors the existing `prepareAgentEnvironment` shape.
2. Lift the install steps into a shared helper both `prepareAgentEnvironment` and `runResumePreflight` call — avoids drift between the two entrypoints if a third install step is ever added.
3. Make fix-pr go through `prepareAgentEnvironment` directly — likely a larger refactor since fix-pr deliberately uses a slimmer preflight (the worktree already exists, the stack is already up for an in-flight PR, etc.).

(2) is the most defensible: the duplication-risk surface is the same shape as the bug, so a shared helper closes the class of problem rather than patching one branch.

**Shape of work:** Roughly mirrors PR #256 — one new helper file (or extract from `agent-environment.ts`), two callsites, gated on `playwrightEnabled`. Add a test that exercises `runResumePreflight` and asserts both install steps run in order. ~50-line patch + tests.

**Open questions:**

- Should the helper also handle the docker-stack readiness check, or stay scoped to install? `prepareAgentEnvironment` does both; `runResumePreflight` does docker too but separately. Probably keep them separate — the docker bringup is the load-bearing reason fix-pr has its own preflight.
- Does the fix-pr dispatch need to surface the install log paths back to the agent's prompt template the way `prepareAgentEnvironment` does? Look at how `runResumePreflight`'s result is currently threaded.

#### 2026-05-18 — Daemon has no reaper for orphaned runs stuck in `running`

**Ticket:** [CREW-235](https://safturento.atlassian.net/browse/CREW-235) — Epic "Runner control parity (UI ⇄ CLI run-lifecycle actions)", needs-planning. This is the Epic's backstop half; resolution gated on Epic completion.

**What:** A crew run can finish its real-world work — PR opened and merged, Jira ticket Done — while the daemon's run record stays stuck in `running` indefinitely. The daemon marks a run complete only when the CLI delivers `POST /api/agents/runs/:id/complete` on Claude exit. If that call never lands (CLI crash, daemon down at exit, killed process), the run sits in `running` forever — `completed_at` null, metrics null, no PR URL — and the dashboard shows the agent as perpetually active. Nothing detects or reaps these.

**Why noticed:** CREW-158's daemon run (run 23, started 2026-05-14) was found still `running` 4 days later, even though its work had shipped via merged PR #208 and the ticket is `Done`. Manual recovery with `POST /api/agents/runs/23/complete` `exitCode 137` — which lands the agent in `error`, because the daemon derives `error` from any non-zero exit and only `exitCode 0` yields a clean completion. So orphaned runs are both invisible (no detection) and unrecoverable to a clean state (manual completion can only produce `error`).

**2026-06-05 update — recurred:** hard-resetting the four Dashboard-polish runs (CREW-231–234) from the CLI left all four stuck showing `running`, same mechanism (an out-of-band kill bypasses `completeRun`). This is the backstop half of a pair: the graceful half is the 2026-06-05 "Dashboard has no cancel action; CLI kill never notifies the daemon" followup (above), which would handle the _intentional_ stop cleanly; this reaper catches kills that bypass any graceful path. The terminal-state open question below is shared between the two — resolve together.

**Anchors:** `packages/daemon/src/routes/runs.ts` (register + `:runId/complete` endpoints); `packages/daemon/src/services/AgentsService.ts`, `IngestService.ts` (run state); `packages/cli/src/lib/preflight/run-resume-preflight.ts` (existing orphan-detection on the resume path); CREW-158 / daemon run 23 / PR #208.

**What's been considered:** Two angles, possibly both — (1) **detection / reaping:** daemon-side sweep that flags runs `running` past a threshold (e.g. no transcript activity for N hours) and either auto-completes them or surfaces them in the dashboard for manual recovery; (2) **durable exit signalling:** make the CLI's completion POST survive a crash (retry / on-disk intent), or a daemon-side fallback that notices the ingested transcript tail going idle. The CLI already has orphan-detection in `run-resume-preflight.ts` for the _resume_ path — a daemon reaper would generalize that to runs nobody resumes.

**Open questions:** What's the right "stuck" threshold? And the right terminal state for a reaped run — `error` (honest: it never completed cleanly) or a distinct `abandoned` / `stale` state so it's visually separable from runs that genuinely crashed? CREW-158 showed conflating the two is misleading.

#### 2026-05-15 — `parity_violations` metric is recorded end-to-end but never computed (always null)

**What:** CREW-164's `computeRunMetrics` derives three of the four Layer-1 metrics from a run's transcript (`cleanlinessPass`, `prClaimInputTokens`, `docLoadCoveragePct`). The fourth, `parityViolations`, is hard-wired to `null` — there is no transcript-only signal for `.agents/` doc-parity violations. The `runs.parity_violations` column, the `MetricsService` aggregate (`parityViolationRate`), the `/api/metrics` payload, and the dashboard widgets all carry the metric end-to-end; only the _capture_ is a stub.

**Why noticed:** Building the metrics pipeline for CREW-164. Plan Step 26 ("compute the four metrics") gave no formula for parity. The Phase 3 commit/PR hook (CREW-160) is the component that detects `.agents/` parity violations, but at run-completion time it leaves nothing the daemon can read.

**Anchors:** `packages/daemon/src/services/computeRunMetrics.ts` (the `parityViolations: null` line + its doc comment); `packages/daemon/src/services/MetricsService.ts` `aggregate()` → `parityViolationRate`; CREW-160 (Phase 3 hook); CREW-164.

**What's been considered:** The metric is null-safe everywhere — `MetricsService.aggregate` filters nulls out of `parityViolationRate`, so a null parity column never skews the cohort. The honest stub (`null`) was chosen over a fabricated `0`.

**Shape of work:** Depends on what signal the Phase 3 hook leaves behind. If the hook writes a violation count into the transcript (a `system`/`attachment` event) or a worktree sidecar file, `computeRunMetrics` gains a small extractor. If it only annotates the PR, capture moves out of the transcript path entirely. Small once the signal source exists; blocked until then.

**Open questions:**

- Where does the Phase 3 hook record violation counts — transcript event, worktree file, or PR comment only?
- Is "violations introduced on this run" or "violations outstanding at run end" the right semantic?

#### 2026-05-14 — Per-turn metric series so cache size can be graphed over a run

**What:** Today `baseline_metrics` (and Phase 4's planned `run_metrics`) record one row per run — only the final-turn snapshot. To graph cache size over time of a run, or cache size per turn, we need a per-turn time series: one row per turn carrying `turn_index`, `uncached_tokens`, `cache_read_tokens`, `cache_creation_tokens`, `total_tokens`, plus the bash/tool counts that occurred on that turn. A second table (`run_turn_metrics` keyed by `(run_id, turn_index)`) is the natural shape. The single-row aggregate stays useful as the headline; the per-turn table powers shape diagnostics (does context climb linearly? does it spike at PR-claim time? do cleanliness-check turns drag a huge cache read?).

**Why noticed:** 2026-05-14 conversation closing out CREW-154's baseline-metrics fix. User: "in the future we might even be able to graph data about cache size over the time of a run and cache size over turns — that's definitely out of scope and a separate enhancement though." Recording so it doesn't evaporate when the Phase 4 metrics pipeline is being designed.

**Anchors:**

- `scripts/baseline-metrics-capture.ts` — current one-row-per-run shape; `countTurns` / `lastPrClaimTokens` already iterate per-turn data
- Phase 4 ticket `CREW-164` — natural landing (the `0003_run_metrics` migration + MetricsService work)
- Transcript JSONL events at `~/.claude/projects/<slug>/<session_id>.jsonl` — each assistant message's `message.usage` is one turn's data point

**What's been considered:** The per-turn table is additive — doesn't replace the per-run aggregate, just complements it. A view (`run_summary`) over `run_turn_metrics` can derive the per-run aggregate, so we don't need to double-write.

**Shape of work:** Single ticket, lands in Phase 4 / CREW-164's scope. Add `run_turn_metrics` table to the `0003_run_metrics` migration; extend `MetricsService` to emit per-turn rows on transcript ingest; expose `/api/metrics/run/:id/turns` for the future dashboard widget. Dashboard charts are a downstream enhancement.

**Open questions:**

- Sample rate: every turn, or every N tokens? Every turn is fine to start.
- Retention: keep forever, or expire alongside transcripts? Probably tied to transcript lifetime.

#### 2026-05-07 — Port allocator detects collisions only at `docker compose up` time

**What:** `allocatePort(basename, varName)` (`packages/cli/src/lib/env-spec/allocate-port.ts:19`) is a deterministic `md5(basename::varName) % 16383` mapping into `[16384, 32767]`. There's no collision detection — the function returns a port whether or not it's free on the host or already claimed by another worktree's `.env`. Failures surface only when `docker compose up --wait` tries to bind the port and gets `EADDRINUSE`. Hash collisions are rare per project (~1/32k per varName pair); cross-worktree collisions on the same host are the more common case.

**Why noticed:** Surfaced 2026-05-07 during the failure-mode walkthrough for the "defer fix-pr env prep to the agent" spec. After that change ships, port-collision failures move from the wrapper's pre-spawn `ensureStackRunning` into the agent's Step 0.5 — wasted session round-trip when the collision is detectable at port-allocation time.

**Anchors:**

- `packages/cli/src/lib/env-spec/allocate-port.ts:19-23` — the no-detection allocator
- `packages/cli/src/lib/env-spec/materialize.ts` — the writer that calls `allocatePort`
- `packages/cli/src/lib/docker/ensure-stack-running.ts` — where `EADDRINUSE` surfaces today
- `packages/cli/src/commands/docker-env.ts` — the `crew docker-env` command

**What's been considered:**

- **Allocate-time host-port probe.** After computing the candidate port, attempt `net.createServer().listen(port)` on `127.0.0.1`. On `EADDRINUSE`, fall through to deterministic-rehash (`md5(basename::varName::saltN)`). Pro: catches all real-world cases. Con: introduces non-determinism in the port number when the original collides.
- **Cross-worktree allocation registry.** A user-level file (`~/.crew/port-registry.toml`) recording `(basename, varName) → port`. Catches cross-worktree collisions even when neither stack is running. More state to manage.
- **Drop-in library** (`get-port`, `portfinder`). Loses determinism entirely.

Lean toward allocate-time probe + deterministic-rehash.

**Shape of work:** One ticket. ~50 lines + tests in `allocate-port.ts`. Materialize call site stays the same shape.

**Open questions:** Should the rehash salt be persisted (so subsequent runs reproduce the same port), or recomputed each time?

#### 2026-05-05 — Per-ticket model selection (use Sonnet for trivial work)

**What:** `crew run` / `fix-pr` / `finish` invoke `claude` without a `--model` flag (`packages/cli/src/lib/claude/spawn.ts:34,67`), so every dispatched agent inherits the user's local Claude Code default — currently Opus 4.7. There's no per-ticket, per-command, or per-project mechanism to downshift to Sonnet for tasks where Opus's reasoning depth is overkill (typo fixes, mechanical refactors, dependency bumps, doc-only edits, follow-up cleanup tickets). At single-agent scale this doesn't matter; at parallel-dispatch scale, Opus-for-everything will be the dominant cost driver.

**Why noticed:** User on the Claude Max 20x plan, watching CREW-95 burn 1.5M tokens on its own. Surfaced 2026-05-05 during slice 1c brainstorming.

**Anchors:**

- `packages/cli/src/lib/claude/spawn.ts:34,67` — `spawnClaudeResume` and `spawnClaudeFresh`
- `packages/cli/src/commands/run.ts`, `fix-pr.ts`, `finish.ts` — three dispatch sites
- `packages/shared/src/projects/` — natural home for a `default_model` config knob
- Anthropic model IDs as of 2026-05: `claude-opus-4-7`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`

**What's been considered:**

- **CLI flag:** `crew run --model sonnet KAN-1`. Lowest-friction.
- **Project-config knob:** `default_model = "sonnet"` in the project TOML.
- **Jira label-driven:** dispatch reads ticket labels; if `model:sonnet` (or `chore`/`trivial`), downshifts.
- **Auto-classification by Claude:** ask Sonnet to read the ticket and decide. Self-fulfilling token cost.

CLI flag + project-config knob feel like the right v1.

**Shape of work:** Two small PRs. (1) `--model <name>` flag on `crew run` / `fix-pr` / `finish`. ~30 lines + tests. (2) `default_model` in project TOML, read by the same threading. Resolution: CLI flag → project config → built-in default (Opus).

**Open questions:**

- Should the dashboard surface which model an agent ran under? (Likely yes — relevant for cost analysis.)
- Does crew also need to pass `--model` to subagent dispatches? Probably not.
- When does Haiku 4.5 enter the picture?

#### 2026-05-05 — Daemon container's `~/.claude/projects` mount is broader than crew's transcript ingest needs

**What:** `docker-compose.yml` mounts `${HOME}/.claude/projects:/root/.claude/projects:ro` so the daemon's IngestService can tail real-agent JSONL transcripts. The mount is read-only, but it covers _every_ project's transcripts plus MCP server settings/oauth tokens and memory files for all of the user's projects — not just crew. A daemon vulnerability (or a future feature that surfaces transcript content) could read material that has nothing to do with crew.

**Why noticed:** Code review of CREW-87 (foundation ticket A of the dockerization Epic CREW-86). Reviewer flagged it as worth narrowing or filtering before the dockerized daemon ships beyond the local-only canonical use case.

**Anchors:** `docker-compose.yml` (the `${HOME}/.claude/projects:/root/.claude/projects:ro` line); `packages/daemon/src/services/IngestService.ts` (the consumer); CREW-87, CREW-86 Epic.

**What's been considered:** Two narrowing approaches — (a) mount only the specific per-project subdirs the IngestService is configured to ingest; (b) keep the broad mount but filter at the IngestService layer so only configured projects' transcripts are ever opened. (a) is tighter at the docker layer; (b) is more flexible if the set of ingested projects changes at runtime.

**Shape of work:** Small. One ticket — modify the compose mount to a project-aware list (likely materialized through env.toml), or add the IngestService-side filter.

**Open questions:** Should the canonical compose continue mounting broadly while worktree compose narrows?

#### 2026-05-04 — Generalize the hardcoded `db-clone-from-main.sh` post-bringup hook into a configurable TOML-registered startup script

**What:** `packages/cli/src/lib/docker/start-bringup.ts:51-79` hardcodes a single post-bringup hook: looks for `<repo>/scripts/db-clone-from-main.sh`, runs it if executable, otherwise silently skips. Inflexible: a project that wants a differently-named script (or multiple steps, or `npm run seed`) has no way to register it. Generalize by adding an optional `[docker] post_bringup_command` field, defaulting to the current literal for backward compat.

**Why noticed:** 2026-05-04 conversation while planning the crew dockerization Epic. Two trails: (1) Recipes' user-profile data hasn't been propagating to worktrees; (2) crew's own "post-bringup mock-data seed" lives best inside the daemon container's entrypoint, but a future project may want different host-side behavior.

**Anchors:**

- `packages/cli/src/lib/docker/start-bringup.ts:51-79` — hardcoded lookup + invocation
- `packages/cli/src/lib/docker/start-bringup.test.ts`
- `packages/shared/src/config/schema.ts` — `[docker]` block (new field lands here)
- `~/.config/crew/projects/recipes.toml` — reference TOML

**What's been considered:**

- **Single string** vs **array of steps**. Lean: array, with single-string shorthand.
- **Just renaming the convention path** vs **fully configurable**. Lean: fully configurable.
- **Where the script runs.** Today host shell with `cwd = worktree`. Probably keep.
- **Exit-code handling.** Today: hook failure logs but doesn't propagate. Lean: keep, consider adding `fail_dispatch_on_error` flag.

**Shape of work:** One ticket. Schema field addition + start-bringup.ts read-and-execute generalization + test fixture. ~1–2 hours.

**Open questions:**

- Field name. Lean: `post_bringup_command`.
- Should the TOML field accept inline shell, or only a path-to-script? Lean: accept either.

#### 2026-05-03 — `crew run` post-stream "waiting up to 120s for docker bringup" log is misleading after CREW-83

**What:** `packages/cli/src/commands/run.ts:451-469` waits up to 120s on `dockerProcess` after the agent finishes streaming. CREW-83 made `prepareAgentEnvironment`'s `fresh` mode block on bringup and throw on non-zero exit, so by the time we reach this post-stream block `dockerProcess` is always already-resolved with `exitCode === 0`. The 120s race becomes a guaranteed-fast no-op, but the user still sees `→ waiting up to 120s for docker bringup…` printed. Cosmetically noisy.

**Why noticed:** Self-review of CREW-83 PR.

**Anchors:** `packages/cli/src/commands/run.ts:451-469`; `packages/cli/src/lib/run/agent-environment.ts:51-68`; `docs/superpowers/plans/2026-05-03-agent-dispatch-preflight.md` Task 3.

**Shape of work:** Small. Either delete the wait/log block or tighten it to a one-liner that reads the resolved exit code without the misleading wait message. ~10 lines.

#### 2026-05-03 — `chokidar` dep added to daemon but no code imports it

**What:** CREW-50 added `chokidar ^4.0.3` to `packages/daemon/package.json` per the slice 1b plan + ticket acceptance criteria. The shipped `IngestService` (and the `tailTranscript` helper it uses) still polls via `fs.open`/`stat` every 200ms — chokidar isn't actually imported anywhere. Either the migration to fs-event watching needs to happen in a follow-up slice, or the dep should be dropped.

**Why noticed:** Code-reviewer flagged it during CREW-50 self-review.

**Anchors:** `packages/daemon/package.json:28`; `packages/daemon/src/services/IngestService.ts`; `packages/shared/src/transcripts/tail.ts:23-72`; `docs/superpowers/plans/2026-04-29-agents-data-end-to-end.md:498-510`.

**Shape of work:** Two paths. (a) Migrate `tailTranscript` to chokidar-driven (cheaper to react to writes; more moving parts in tests). (b) Drop the dep + amend the plan note.

**Open questions:** Does the polling tail's 200ms latency matter for the dashboard slice? If not, (b) is right.

#### 2026-05-03 — `crew run` swallows background-task failures into `/tmp` logs

**What:** `crew run` kicks off docker bringup and Playwright/Chromium install as background processes, prints `→ docker bringup running in background (log: /tmp/crew-docker-<KEY>.log)` once, and never surfaces failures back to the user once the foreground transcript stream begins. If the background task fails, the user only finds out by tailing the `/tmp` log — typically only after watching the agent flail against missing infrastructure.

**Why noticed:** Recipes KAN-12 on 2026-05-03. Docker bringup failed immediately (`invalid project name "recipes-KAN-12"...`). User watched the agent stream for ~5 minutes assuming env had been set up. Diagnosis required jumping to `/tmp/crew-docker-KAN-12.log`.

**Anchors:** `packages/cli/src/lib/docker/start-bringup.ts`; `packages/cli/src/commands/run.ts`; `/tmp/crew-docker-<KEY>.log`, `/tmp/crew-playwright-<KEY>.log`.

**What's been considered:**

- **Pre-flight wait + fail-fast:** block `→ launching claude in headless mode` on docker bringup completion. Tradeoff: longer wall-clock before agent starts.
- **Streaming background-task status into the foreground:** concurrent watcher that tees the `/tmp` log once failure is detected.
- **Surface in the agent prompt:** extend the existing `docker_unavailable` shape.
- Combination: pre-flight wait for docker, streaming watcher for Playwright.

**Shape of work:** One ticket. Two commits — docker pre-flight wait + Playwright surfacing. Tests mock `start-bringup` to return failure and assert `crew run` aborts.

**Open questions:**

- For docker: wait for `docker compose up --wait` before launching the agent, or only fail-fast on the validation step?
- Should the agent's prompt receive a `docker_failed` disclosure for graceful-degrade behavior, or is hard-aborting better UX?

#### 2026-05-03 — Transcript line printer truncates tool-call inputs mid-string

**What:** `summarizeInput` in the shared transcript parser slices Bash command summaries to 140 chars and all other tool inputs to 120 chars. As a result, `crew run`'s live transcript stream regularly shows lines that end mid-string (`[TodoWrite][622 tok] {"todos":[{"content":"Read KAN-12 context","status":"in_progress","activeForm":` — cut off).

**Why noticed:** 2026-05-03 chat about KAN-12. User explicitly called out the truncated `[TodoWrite]` line.

**Anchors:** `packages/shared/src/transcripts/parser.ts:95-112` (`summarizeInput`); `packages/shared/src/transcripts/parser.ts:72,82-93` (`ASSISTANT_TEXT_MAX_LEN`); `packages/cli/src/lib/run/stream-transcript.ts`.

**What's been considered:**

- **Print full lines, no truncation.** Simplest. Risk: 50KB Edit input blows up scrollback.
- **Per-tool truncation policy.** Bash → full command. TodoWrite → structured summary. Edit/Write → file path only. Default → full or smart-summarized via tool-name allowlist.
- **Terminal-width awareness.** `process.stdout.columns` could cap to 1-2 wrapped lines. Tradeoff: weirder copy/paste.

Right answer is per-tool policy.

**Shape of work:** One ticket. A `summarizeInput` rewrite dispatching per tool name. New tests in `packages/shared/src/transcripts/parser.test.ts`.

**Open questions:**

- Does `formatAssistantText`'s `ASSISTANT_TEXT_MAX_LEN = 120` get the same treatment, or stay capped?
- Max-line config knob (`CREW_TRANSCRIPT_MAX_LINE_CHARS`)? Probably no.

#### 2026-05-02 — `crew restart --hard` should not silently bail when a PR exists

**What:** `crew restart --hard` is the "blow away local state and redo this ticket from scratch" command. When the ticket already has an open PR, restart bails (steering toward `crew fix-pr`). That's wrong when the user has _materially changed the ticket scope_ mid-flight — added a new task to the Jira description, swapped the design, etc. The user's intent is "redo against the new scope," not "patch the existing branch with one more diff." `fix-pr` is for incremental review-comment application.

**Why noticed:** During Recipes [KAN-45](https://safturento.atlassian.net/browse/KAN-45), a runtime bug surfaced post-merge. Jira description was updated mid-flight with a new Task 10. User tried `crew restart --hard KAN-45`; crew bailed because PR existed. Forced fallback to `crew fix-pr` — which doesn't read the Jira description (only PR review comments), so Task 10 was never picked up.

**Anchors:** crew's restart command implementation; `crew fix-pr` command; KAN-45 (Recipes [#42](https://github.com/Safturento/Recipes/pull/42)); transcript at `~/.claude/projects/-home-safturento-Repos-Recipes-KAN-45/acbbad62-77cf-4afa-a6ce-a83d4d564806.jsonl`.

**What's been considered:**

- **Bail with steering message** (current). Too restrictive.
- **Allow restart with `--force-overwrite-pr` flag.** Explicit opt-in.
- **Auto-detect Jira-vs-PR drift.** If Jira's `updated` is newer than PR's `created`, restart's overwrite is probably what the user wants — surface the drift in the bail message.
- **Always proceed and force-push.** Risks accidental work loss.

Auto-detect is most user-friendly; the flag is the cheapest first step.

**Shape of work:** Small command-flag addition + decision on default behavior. Auto-detect needs `getJiraIssue` for `updated` + `gh pr view --json createdAt` in restart's pre-flight.

**Open questions:**

- Is the bail driven by branch protection rules on the remote, or crew's own pre-flight?
- Should restart auto-detect drift, or just expose a flag?

#### 2026-05-02 — `crew fix-pr` skips env materialization and full verification

**What:** `crew fix-pr` dispatches an agent with a prompt naming `superpowers:verification-before-completion` as required, but the dispatched agent applies review-comment changes and exits without running the project's verify cycle (docker bringup, db setup, smoke tests). Two related gaps:

1. **Env materialization is skipped before agent dispatch.** Generated files like `.env.docker-backend` are missing on the worktree if a previous restart wiped local state. The agent inherits a worktree where `docker compose up` would fail.
2. **Verification is skipped after agent edits.** A 6-line change ships without proving the stack still works.

**Why noticed:** During Recipes [KAN-45](https://safturento.atlassian.net/browse/KAN-45). Agent applied a small test-regex tightening, pushed `db04c38`, reported the PR URL, exited. No `docker:up`, no `db:setup`, no `bruno:smoke` in the entire transcript. When user ran `npm run docker:up`, it failed: `env file .env.docker-backend not found`.

**Anchors:** `crew fix-pr` command (`packages/cli/src/commands/fix-pr.ts`); `superpowers:verification-before-completion` skill; env-materialization from CREW-79 / `bringUpWorktreeEnv`; KAN-45 (Recipes [#42](https://github.com/Safturento/Recipes/pull/42)).

**What's been considered:**

- For (1): fix-pr should call `bringUpWorktreeEnv` before agent dispatch, mirroring `crew run`.
- For (2): either make verification skill more forceful (best-effort) or add an explicit post-agent verify step (reliable). Latter pairs with the auto-detect failure-and-loop behavior under the structured final-report contract.

**Shape of work:** Two related changes in fix-pr — env-bringup step before dispatch, post-agent verify step. On verify failure, either auto-trigger a follow-up loop or surface for manual decision.

**Open questions:**

- Auto-trigger another agent iteration on verify failure, or surface for manual decision?
- Is "the project's verify command" derivable from `[playwright]`/`[bruno_smoke]`, or does it need a new TOML option?
- Does the same gap affect `crew resume`?

#### 2026-05-01 — Structured final-report contract for agent dispatches (dashboard prerequisite)

**What:** Define a machine-readable "final report" that every `crew run` / `resume` / `restart` / `fix-pr` dispatch emits as its last action — at minimum: status (success/failure), PR URL (or "no PR opened" with reason), notable warnings, follow-up flags. Crew parses it and renders a real footer; the dashboard later reads it for run outcomes, success-rate metrics, attention queues.

**Why noticed:** During diagnosis of the "tail goes silent at end of run" complaint (KAN-40 session, 2026-05-01). User picked the tight scope (just mandate a one-line echo) and parked the broader as "definitely important for reporting in the dashboard later."

**Anchors:** `packages/cli/src/lib/prompts/templates/ticket.md`, `templates/resume.md`, `templates/fix-pr.md` — producer side; `packages/cli/src/lib/run/stream-transcript.ts` — consumer side; `packages/dashboard/` — eventual downstream consumer; CREW-72 — companion ticket.

**What's been considered:**

- **Inline echo:** agent ends with `echo '→ PR <url>'`. Cheap, parseable, no schema. Doesn't extend past PR URL.
- **Structured JSON line:** agent ends with `echo 'CREW_REPORT={"status":...}'`. Extensible.
- **Crew assembles report itself** from existing signals (exit code, `pr-link` event, transcript scan). Doesn't depend on agent doing the right thing but can't capture agent-judgment fields.
- Hybrid: crew assembles objective fields, agent contributes judgment via structured echo.

**Shape of work:** Design pass first. (1) Spec doc covering payload schema. (2) Plan decomposing into tickets — prompt contract + parser + footer renderer + daemon API surface. (3) Don't start until the dashboard work needs it.

**Open questions:**

- JSON line vs multi-line key-value vs a dedicated tool-call shape?
- Where does warnings/follow-ups contract come from? Possibly `docs/followups.md` reference.
- Backwards-compat: how do older agents (running an older prompt) interact with a parser expecting a report?

#### 2026-05-01 — Render assistant.text preamble alongside same-event tool calls

**What:** `streamTranscript` parses each assistant event with `parseToolCall` first and short-circuits on a hit, so the common Claude Code shape `[TextContent("Let me read the file."), ToolUseContent(...)]` only renders the tool-call line — the preamble text is dropped. CREW-72 added `assistant.text` rendering for _standalone_ text events, but mixed-content events still drop the text half.

**Why noticed:** CREW-72 self-review by superpowers:code-reviewer. Strictly out-of-scope for the silent-tail bug but worth tracking.

**Anchors:** `packages/cli/src/lib/run/stream-transcript.ts:92-105`; `packages/shared/src/transcripts/parser.ts`.

**What's been considered:** Two text snippets per event (preamble line + tool-call line) is the natural rendering. Alternative: collapse into one line (denser but mixes prefixes; rejected).

**Shape of work:** Small. Drop the early `continue` after the tool-call branch. One added test.

**Open questions:** Should the preamble line precede or follow the tool-call line?

#### 2026-05-01 — Crew owns DB replication end-to-end (off per-project shim scripts)

**What:** Crew's per-worktree DB replication today is split awkwardly between crew and the project. The bringup script calls a project-side shim — `<repo>/scripts/db-clone-from-main.sh` — which in turn calls `crew db-clone <branch>`. Meanwhile the project's backend container runs migrations + seed via its `entrypoint.sh`, on the same database, with no coordination. Brittle three-way handshake. Generalize so crew owns the whole DB lifecycle.

**Why noticed:** CREW-68 to fix the immediate race between db_clone and backend seed. The fix lands as a quick-win; the underlying brittleness is structural. User's framing: "this feels like a symptom of being in this middle state where crew is still relying on some scripts that are a part of recipe's infrastructure."

**Anchors:** `packages/cli/src/lib/docker/start-bringup.ts`; `packages/cli/src/lib/db-clone/clone.ts`; `packages/cli/src/commands/db-clone.ts`; `<recipes>/scripts/db-clone-from-main.sh`; `<recipes>/packages/backend/entrypoint.sh`; CREW-68.

**What's been considered:** Path A (chosen for CREW-68): backend healthcheck, crew's bringup `--wait` before clone. Path B: crew sets `CREW_SKIP_SEED=1` env on backend; project's entrypoint honors it. Both are bandages. The deeper move — invert ownership: crew brings DB up, runs migrations, runs clone, THEN brings up rest. Project's `entrypoint.sh` becomes purely "run the dev server."

**Shape of work:** Design pass first — this is a contract change touching every project using `[db_clone]`. Likely sequence: (1) Spec doc covering crew-vs-project responsibilities. (2) Plan into tickets — contract definition + crew-side orchestration + Recipes-side migration. (3) Watch for second adopters before generalizing.

**Open questions:**

- Does crew's bringup need to run migrations directly, or stay in project's hands?
- Where does seed live? On canonical only? Opt-in via config? Worktree?
- Projects with no canonical worktree (brand-new setups, CI)?
- Crew take over `docker compose up` orchestration entirely (postgres-up → migrate → clone → rest-up), or stay declarative via healthchecks?
- Is the project config currently expressive enough?

#### 2026-05-01 — Generic `--git-common-dir` helper in `crew-shared` (third-caller trigger)

**What:** `appendExcludeLine` in `packages/cli/src/lib/playwright/write-mcp-file.ts` resolves the worktree-aware path to `.git/info/exclude` by shelling out to `git rev-parse --git-common-dir`. It's the only caller today. If a second or third call site needs the same resolution, factor a small helper into `crew-shared`.

**Why noticed:** Explicitly carved out of CREW-67's scope as "worth considering if a third call site needs `--git-common-dir`, but YAGNI for one."

**Anchors:** `packages/cli/src/lib/playwright/write-mcp-file.ts`; CREW-67.

**Shape of work:** Small refactor. Once a second/third caller appears, lift into `crew-shared` (`git/common-dir.ts` exporting `resolveGitCommonDir(worktreePath)`) and migrate call sites.

#### 2026-05-01 — `crew run`/`resume`/`restart` against an already-shipped ticket has no safety net

**What:** None of the agent-spawning commands check whether the target ticket has already been shipped (PR merged, ticket Done). Running `crew run CREW-X` against a ticket whose work is already on `main` produces non-deterministic agent behavior — best case "no work to do"; worst case junk PR.

**Why noticed:** During CREW-66 follow-up to CREW-65: _"if I run `crew run CREW-65` or `crew resume CREW-65`, will it pick up the new work or just break in a weird, new way?"_ No defensive check.

**Anchors:** `packages/cli/src/commands/run.ts` — `runRun`; `packages/cli/src/commands/resume.ts`; `packages/cli/src/commands/restart.ts`; `mcp__atlassian__jira_get_issue` — already used in the agent's first prompt step.

**Shape of work:** One ticket. Add Jira preflight at the top of `run` / `resume` / `restart`: fetch ticket; if `status.statusCategory.key === "done"`, refuse with useful error suggesting `crew fix-pr` or `--force`. Bonus: detect "in review" with open PR.

**Open questions:**

- Opt-out (`--force` to bypass) vs opt-in?
- What states qualify as "already shipped"? `Done` unambiguous; `In Review` more nuanced.
- Project-specific terminal status names vary.
- Live in `runRun` reused by others, or in `prepareAgentEnvironment`?

#### 2026-05-01 — Playwright integration self-review cleanups

**What:** Three small cleanups noted in CREW-58's self-review but explicitly bundled out:

1. **Ubuntu 24.04+ apt names.** `scripts/install.sh`'s hardcoded apt list targets Ubuntu 22.04 / Debian 12 names. Ubuntu 24.04+ renamed several to `t64` (e.g. `libasound2t64`).
2. **Test casts.** `packages/cli/src/lib/playwright/install-browsers.test.ts` uses `as unknown as ReturnType<typeof execa>` (3 sites). Could use `ResultPromise` from execa directly.
3. **`[playwright.smoke] enabled = false` UX.** The schema declares `enabled: z.literal(true)`, so writing `enabled = false` produces a literal-mismatch validation error rather than a clean no-op.

**Why noticed:** [PR #53](https://github.com/Safturento/crew/pull/53) (CREW-58) self-review section.

**Anchors:** `scripts/install.sh` (lines 30–35); `packages/cli/src/lib/playwright/install-browsers.test.ts:40,58,69`; `packages/shared/src/config/schema.ts:5–7`; [CREW-58](https://safturento.atlassian.net/browse/CREW-58).

**Shape of work:** Three independent micro-tickets (or one bundled cleanup). Item 1 needs Ubuntu 24.04+ to validate; items 2 and 3 land standalone.

#### 2026-04-30 — Surface subagent activity in transcript outputs

**What:** crew's transcript views don't distinguish subagent (Task tool) events from top-level activity. The `.jsonl` session files DO contain them — CREW-62's session file has 293 `isSidechain: true` lines. The data layer captures them; the rendering layers (`packages/shared/src/transcripts/parser.ts`, `tail.ts`, the dashboard agent view) don't carry the marker forward.

**Why noticed:** While filing CREW-63, user asked whether subagent executions were tracked. Empirical check showed the data is recorded but not surfaced.

**Anchors:**

- `packages/shared/src/transcripts/parser.ts` — no `isSidechain` field
- `packages/shared/src/transcripts/tail.ts` — no labeling
- `packages/shared/src/transcripts/types.ts` — event types
- Daemon: `tool_calls` table from CREW-49 migration. Verify whether it captures sidechain
- Dashboard agent view (path TBD)
- Empirical data: `~/.claude/projects/-home-safturento-Repos-crew-CREW-62/` — 293 `isSidechain` lines

**Shape of work:** Likely two tickets. (1) Extend transcript types + parser to carry sidechain markers. Decide CLI rendering: indented-under-parent / separate stream / both. (2) Dashboard agent view subagent timeline. Verify whether `tool_calls` table already captures sidechain.

**Open questions:**

- Are subagent events always in the parent's JSONL, or sometimes their own session file?
- Dashboard UX shape: interleave / collapsible-per-task / sidebar tree?
- Should the CLI's live tail collapse-by-default or expand-by-default for sidechain rows?

#### 2026-04-30 — `crew resume` deferred follow-ups

**What:** Four deferred concerns from the `crew resume / restart / reset` design:

1. **Multi-session resume picker.** Interactive picker for older `.jsonl` sessions.
2. **`crew resume --new-session` flag.** Force fresh claude even when a session exists — preserve old + fork.
3. **Telemetry on resume/restart events.** Daemon's run-state model doesn't track "this run was resumed N times."
4. **`-m` interaction with future `crew init`.** Onboarding wizard might seed `-m` with a "first-run" template.

**Why noticed:** Design spec for CREW-63 §8. PR [#58](https://github.com/Safturento/crew/pull/58) shipped without addressing.

**Anchors:** `docs/superpowers/specs/2026-04-30-crew-resume-design.md` §8; [CREW-63](https://safturento.atlassian.net/browse/CREW-63); `packages/cli/src/lib/run/find-latest-session.ts`.

**Shape of work:** Each is its own ticket when needed. None urgent today.

#### 2026-04-29 — Promote `resolveAppUrl` to shared `lib/url-substitution/`

**What:** `resolveAppUrl` lives at `packages/cli/src/lib/playwright/resolve-app-url.ts` but has three callers (CLI run/fix-pr/agent-environment for `playwright.app_url` and `bruno_smoke.base_url`). The Bruno smoke design spec prescribed promoting if a third caller emerged. That threshold has been crossed.

**Why noticed:** Spec §13 of Bruno smoke design. Verified 3 active callers post-CREW-58 rename.

**Anchors:**

- `packages/cli/src/lib/playwright/resolve-app-url.ts` + test
- Callers: `packages/cli/src/commands/run.ts:156,167`, `packages/cli/src/commands/fix-pr.ts:160`, `packages/cli/src/lib/run/agent-environment.ts:47`
- `docs/superpowers/specs/2026-04-29-bruno-smoke-tests-design.md` §13

**Shape of work:** Single small refactor PR. `git mv` to `packages/cli/src/lib/url-substitution/`, update callers' imports, leave a re-export in `lib/playwright/index.ts` or update everyone. Tests unchanged.

### Architecture & Config

#### 2026-04-30 — Crew owns `.claude/settings.json` per worktree (gated on empirical bwrap/socat validation)

**What:** Today the project's `.claude/settings.json` (committed in-tree) and the crew TOML's `[sandbox]` block (per-project crew config) are two hand-maintained sources for the same truth — sandbox allowlist, allowWrite paths, etc. They drift. A spec should decide whether crew writes a generated `.claude/settings.json` per worktree using the "tag header + refuse to clobber" pattern from `docker-env.sh`.

**`sandbox.excludedCommands` MUST list the project's smoke / e2e commands when the project has a docker stack the agent will exercise** (any project with `[docker]` configured + `[playwright]` or `[bruno_smoke]` enabled). KAN-12 (Recipes, 2026-05-03) burned ~45 min of debugging on this. Initial fix attempt (PR #45 in Recipes, since reverted) added `localhost` + `127.0.0.1` to `sandbox.network.allowedDomains`. That changed nothing — `allowedDomains` is an HTTPS egress filter, while the sandbox actually wraps the agent in `bwrap --unshare-net`, giving it its own loopback distinct from the host's. Empirical test confirmed: `excludedCommands: ["npm run bruno:smoke", "npm run test:e2e"]` runs the listed commands un-sandboxed, exposing the host netns to the smoke/e2e workflow.

**`excludedCommands` is necessary but not sufficient — the dev server has to start in the same netns the runner uses.** KAN-17 (Recipes, [PR #49](https://github.com/Safturento/Recipes/pull/49), 2026-05-03) shipped with both `npm run bruno:smoke` and `npm run test:e2e` already in `excludedCommands`, and `npm run test:e2e` _still_ got `ECONNREFUSED` on `https://localhost:17253`. Likely failure mode: dev server bound to host loopback, but if the agent restarted it via a sandboxed Bash call (e.g. plain `npm run dev`), it bound to the agent's bwrap loopback. Mitigations the doctor / generator should enforce: (a) Playwright config owns dev-server lifecycle via a `webServer` block so un-sandboxed `npm run test:e2e` brings up its own server in the same netns; (b) any dev-server-start command is also in `excludedCommands`; (c) the run-time prompt to the agent calls out that ad-hoc `curl` against the app URL from sandboxed Bash will always `ECONNREFUSED`.

**Empirical prereq — validate `bwrap`/`socat` are load-bearing (folded in from 2026-04-30 sibling followup):** Crew preflights `bwrap` (and `install.sh` installs `socat`), but neither is invoked from crew's TS source — verified by grep. Hypothesis: Claude Code's built-in sandbox uses them transitively. If it silently runs un-sandboxed when they're missing, that's a finding that affects every other sandbox-related decision in this followup. One-shot empirical test: uninstall `bwrap` on a test machine, run a sandboxed agent, observe what fails / what runs un-sandboxed silently. Result feeds back into the settings.json design.

**Why noticed:** Surfaced repeatedly — §10.4 + §10.5 of the Playwright integration design spec, CREW-57's open questions, and architecture.md's open questions list.

**Anchors:**

- `docs/superpowers/specs/2026-04-29-playwright-integration-design.md` §10.4, §10.5
- `docs/tickets/CREW-57.md` open question
- `docs/rationale/architecture.md` "Settled questions"
- Reference for the tag-header pattern: `packages/cli/src/lib/docker/env.ts`
- `packages/cli/src/commands/run.ts:84` — bwrap preflight string
- `scripts/install.sh:25–27` — bubblewrap + socat install

**Shape of work:** Empirical pass on bwrap/socat first (one-shot), then design spec on settings.json ownership. Likely deliverables for the spec: (1) Decision tree: when does crew clobber? When does it warn-and-skip? What's the migration path for existing committed `settings.json`? (2) Generator that reads the TOML's `[sandbox]` and emits a tagged `.claude/settings.json` per worktree. (3) Drift-detection at `crew run` startup.

**Open questions:**

- Should the project's committed `.claude/settings.json` become source-of-truth and the TOML auto-syncs? Or vice versa? Or is the TOML a strict superset and the file is fully crew-owned?

#### 2026-04-30 — Project config rationalization

**What:** The `[sandbox]` / `[docker]` / `[playwright]` / `[bruno_smoke]` / `[db_clone]` blocks have grown organically and now duplicate URL/port concepts across multiple sub-blocks. A future spec should consolidate where it makes sense — likely a top-level `[app] url = ...` shared across modes, with per-block URLs preserved as overrides for projects whose frontend and backend live at different URLs.

**Why noticed:** Spec §10.1 of the Playwright integration design. CREW-56's out-of-scope list.

**Anchors:**

- `docs/superpowers/specs/2026-04-29-playwright-integration-design.md` §10.1
- `packages/shared/src/config/schema.ts` — current config shape
- [CREW-56](https://safturento.atlassian.net/browse/CREW-56) out-of-scope list

**What's been considered:** Per-block URLs preserved as overrides. Top-level `[app] url` becomes default when sub-blocks omit theirs.

**Shape of work:** Design spec → schema migration plan → write codemod for existing TOMLs. Coordinate with the unified onboarding helper so `crew init` writes the new shape.

#### 2026-04-30 — Unified `crew init` / `crew doctor` onboarding helper

**What:** A single subcommand for project setup, both new and existing:

- **New project:** walk through writing the TOML, **scaffold an `env.toml` at the project repo root** (prompt for orchestration ports, app vars, contexts). The scaffolded project TOML at `~/.config/crew/projects/<name>.toml` MUST use `${VAR}`-style references for `[playwright].app_url` and `[bruno_smoke].base_url`. Run `npm install -D @playwright/test` if Playwright opted in, scaffold `playwright.config.ts` + `tests/e2e/` skeleton, scaffold Bruno collection skeleton if opted in. **Scaffold `<repo>/.claude/settings.json` when absent**, and when the project has a docker stack populate `sandbox.excludedCommands` with smoke / e2e commands.
- **Existing project:** modify the TOML in place, run machine-wide health checks (apt deps, Chromium installed for every configured project, docker socket reachable). For existing projects with hand-authored `.claude/settings.json`, **doctor mode should diagnose missing-smoke/e2e-in-`excludedCommands`** and offer a one-command fix.

Two halves ship as one subcommand.

**Why noticed:** Spec §10.2 of the Playwright integration design. CREW-56's out-of-scope list.

**Anchors:**

- `docs/superpowers/specs/2026-04-29-playwright-integration-design.md` §10.2
- `packages/cli/src/commands/` — destination
- `~/.config/crew/projects/<name>.toml` — files this writes/edits

**Shape of work:** Design spec covering wizard question tree and diagnostic rules → implementation plan with TDD steps. Pairs with per-config-block reference docs so wizard prompts point at canonical documentation.

**Open questions:**

- One subcommand with a mode flag (`crew init --check`?) vs two thin commands sharing a library?

**Update (2026-06-05) — builds on the `establishing-a-new-project` skill.** As of 2026-06-04 a user-level `establishing-a-new-project` skill (in `~/dotfiles`, public) owns the _universal, stack-agnostic_ repo baseline: `.agents/` + `AGENTS.md` + the `CLAUDE.md` shim + a human-facing `README.md` + git hygiene (`.gitattributes`/`.gitignore`) + the `docs/` tree (followups, superpowers specs+plans). `crew init` should **build on top of** that skill — assume/invoke it for the baseline — and own only the **crew-specific, stack-coupled** layer: the project TOML at `~/.config/crew/projects/<name>.toml`, the repo `env.toml`, `<repo>/.claude/settings.json` (sandbox + `excludedCommands`), the Playwright/Bruno skeletons, project registration, and `doctor` health-checks. It must not duplicate the baseline. This also settles the **skill-vs-subcommand** split: a **subcommand** for crew onboarding (imperative, deterministic machine-state) and a **skill** for the universal baseline (agent-guided authoring). The remaining open question (one subcommand with a mode flag vs two thin commands) is unaffected.

#### 2026-04-30 — Per-config-block reference docs

**What:** Every TOML option documented with its purpose, defaults, validation rules, and required project-side setup. Lives in `docs/config-reference.md` or similar.

**Why noticed:** Spec §10.3 of the Playwright integration design. CREW-56's out-of-scope list.

**Anchors:**

- `docs/superpowers/specs/2026-04-29-playwright-integration-design.md` §10.3
- `packages/shared/src/config/schema.ts` — source of truth; reference docs derive from this
- README's current per-feature subsections — partial coverage, scattered

**Shape of work:** One-shot writing pass after the config rationalization spec lands. Could potentially auto-generate from the zod schema's `.describe()` calls, but tangential.

#### 2026-04-30 — CI integration of authored Playwright runs

**What:** Run authored Playwright tests as a GitHub Action in the project's CI on PR push, in addition to the agent-side `npm run test:e2e` gate. Today no CI workflow at all in this repo, so this spans two concerns: (1) introduce a baseline GitHub Actions workflow file; (2) add Playwright e2e to it.

**Why noticed:** Spec §1 of Bruno smoke design and Playwright integration spec both call out CI integration. CREW-22 explicitly notes "no GitHub Actions workflow exists yet."

**Anchors:**

- `docs/tickets/CREW-22.md` "Out of scope"
- `docs/superpowers/specs/2026-04-29-bruno-smoke-tests-design.md` §1
- `docs/superpowers/specs/2026-04-29-playwright-integration-design.md`
- `packages/dashboard/playwright.config.ts` (+ future `tests/e2e/`)
- `.github/workflows/` — currently empty

**Shape of work:** Two tickets. (1) Baseline CI workflow — typecheck/lint/test:run on push to PR branches. ~50 lines. (2) Authored Playwright in CI — extends with `npx playwright install --with-deps chromium` + `npm run test:e2e --workspace=crew-dashboard`. Decide whether CI also runs Bruno smoke.

**Open questions:** Self-hosted runner or GitHub-hosted? GitHub-hosted re-installs chromium per run; cache helps.

#### 2026-04-28 — Flesh out the project-resolution design

**What:** The design exploration at `docs/rationale/project-resolution.md` is explicitly marked pre-implementation notes — "Initial leaning", "Sketched implementation outline", with no chosen approach locked in. The triggering incident — `crew run <KAN-ticket>` from inside the `crew` repo failing with a wrong-project error — is still real today. CLI partial workaround: `--project <name>` flag exists on `crew list` and `crew status` but not on `crew run` / `crew fix-pr` / `crew finish` / `crew resume`.

**Why noticed:** Doc opens with `**Status:** Pre-implementation design notes`. PR [#21](https://github.com/Safturento/crew/pull/21) merged it with the explicit intent "needs fleshing out before this drives any code." Five months of subsequent work on the daemon + dashboard sharpens the need: the dashboard's write endpoints will land project-by-name from a non-CLI surface.

**Anchors:**

- `docs/rationale/project-resolution.md`
- `.agents/local-dev.md` — current cwd-only behavior + pointer to this followup
- [PR #21](https://github.com/Safturento/crew/pull/21)
- `packages/cli/src/commands/list.ts:105`, `packages/cli/src/commands/status.ts:91` — partial `--project` flag
- `packages/cli/src/lib/discover-project-config.ts` — current cwd-only resolver
- `packages/shared/src/config/loader.ts` — `loadProjectConfigByName` exists but no key-prefix resolver

**What's been considered:** Four options (A: ticket-key prefix, B: explicit `--project`, C: per-user default, D: hybrid precedence). Initial leaning is D (hybrid).

**Shape of work:** Brainstorm → spec → implementation plan. Likely one ticket lands the shared resolver (`packages/shared/src/config/resolveProject.ts`), then a sweep migrating each command. Dashboard endpoints should consume the same resolver from day one.

#### 2026-04-26 — Architecture doc open questions still unresolved

**What:** Three of the five original architecture "Open questions" are still genuinely open (the open ones now live in `.agents/architecture.md` under "Currently open architectural questions"; the settled ones are recorded in `docs/rationale/architecture.md`):

1. **Distribution past Phase 1.** Phase 1 ships via local `npm link`. Past that: `npm publish` is the easy default; Node SEA single-binary is fancier but ergonomic for shipping to multiple machines without a Node install.
2. **Auth secrets storage.** Where do gh-token, jira-token, anthropic-api-key live? Currently per-repo `.claude/secrets/`. Architecture doc proposes per-user `~/.config/crew/secrets.toml`.
3. **MCP tools or REST?** Agent uses MCP for Jira; daemon will use REST for transitions outside the agent context. Some duplication acknowledged.

The other two open questions (sandbox config drift, Phase 2 + Phase 3 separation) are subsumed by other followups and shipped slices.

**Why noticed:** Original architecture plan's "Open questions" section.

**Anchors:**

- `.agents/architecture.md` "Currently open architectural questions"
- `docs/rationale/architecture.md` "Settled questions"
- For #1: `scripts/install.sh`, README's Install section
- For #2: `~/.config/crew/.secrets.env`, `packages/cli/src/commands/finish.ts` `readJiraSecrets`, daemon's eventual JIRA client
- For #3: agent's MCP Jira config, `packages/cli/src/lib/jira/client.ts` (REST)

**Shape of work:** Each is independent. #1 punts until "we want to install crew on a machine that doesn't already have it." #2 is design-spec-then-implementation. #3 likely doesn't need its own ticket — accept the duplication.

### Process & Conventions

#### 2026-05-15 — `.agents/` topic-doc system vs native `.claude/rules/` and agents.md alignment

**Ticket:** [CREW-210](https://safturento.atlassian.net/browse/CREW-210) — parked in Backlog (needs planning).

**What:** crew's `.agents/<topic>.md` system — per-topic docs with `covers:` path globs, indexed from `AGENTS.md`'s "When you need it" table — is a hand-rolled equivalent of Claude Code's native `.claude/rules/` feature: topic `.md` files with `paths:` frontmatter that lazy-load when Claude touches matching files. Decide whether to migrate `.agents/` onto `.claude/rules/`, keep `.agents/` as-is (now that its load path is fixed), or run both.

**Why noticed:** While brainstorming the skill-storage consolidation spec + the `AGENTS.md` auto-load fix, empirical testing showed Claude Code does **not** auto-load `AGENTS.md` — only `CLAUDE.md`. The CREW-153 spec's risk table had dismissed this exact risk with a fabricated "Verified by research: Claude Code reads AGENTS.md natively." Reading the official memory docs surfaced `.claude/rules/`, which delivers path-scoped lazy topic docs natively — crew built a custom version of a native feature, and the custom version's load mechanism never worked.

**Anchors:** `.agents/` (9 topic docs + `README.md`); `packages/cli/scripts/hooks/doc-parity-gate.sh` (CREW-163, keyed on `covers:`); `scripts/validate-agents-frontmatter.ts`; `~/.claude/skills/agents-doc-parity-check` (the `covers:`-overlap audit skill); CREW-153 spec/plan at `docs/superpowers/{specs,plans}/2026-05-13-agent-progressive-disclosure-system.md`; Claude Code `.claude/rules/` reference: https://code.claude.com/docs/en/memory.

**What's been considered:** The decision hinges on **cross-agent portability** — the user wants this agent-context setup to work with agents _beyond_ Claude Code, which is the original reason `AGENTS.md` (a cross-tool convention) was chosen over `CLAUDE.md`. A straight migration to `.claude/rules/` is Claude-only and would sacrifice that. So the real question: once the auto-load fix lands, does `.agents/` genuinely serve the cross-agent goal — and does crew's implementation match how the `AGENTS.md` ecosystem actually intends the system to work?

**Shape of work:** Its own brainstorm → spec. **Must** begin with a thorough read of the full https://agents.md/ spec (not just the homepage) to understand the intended cross-agent `AGENTS.md` model, then reconcile crew's `.agents/` + `covers:` implementation against it. Then decide: keep `.agents/`, migrate to `.claude/rules/`, or run both. Whatever survives, the doc-parity hook (CREW-163), the frontmatter validator, and `agents-doc-parity-check` are downstream and may need rework.

**Open questions:** Once a `CLAUDE.md` → `@AGENTS.md` shim exists, what does `.agents/` + `covers:` buy over `.claude/rules/` + `paths:` for the Claude-Code case? Which non-Claude agents are actually in scope (Codex, Cursor, Gemini, …), and do they read nested/topic-scoped docs at all? Does the agents.md spec even define a topic-doc/lazy-load layer, or is that purely a crew invention layered on a flat `AGENTS.md`?

#### 2026-05-12 — Rethink followup-tracking system (priority tier + Jira backlog sync)

**Ticket:** [CREW-211](https://safturento.atlassian.net/browse/CREW-211) — parked in Backlog; discuss separately before planning.

**What:** The current `docs/followups.md` convention captures items well at the "noticed it" moment but has two gaps. (a) **No priority tier** — entries within Active have no signal for what's near-term vs long-tail. (b) **Single surface** — followups live in a versioned markdown file, but Jira is where the rest of the user's work is prioritized, tracked, and resolved.

**Why noticed:** During the 2026-05-12 brainstorm for the agent visual-verification skill. User asked whether priority tiering and Jira-backlog sync would solve the underlying visibility/management problem.

**Anchors:**

- `~/.claude/CLAUDE.md` — current convention lives in the "Followup detection" section
- `docs/followups.md` — the file format under discussion
- Memory: `feedback_autonomous_doc_prs.md`
- Jira project: `CREW` — but the convention is user-level, not project-specific

**What's been considered:**

- **Add a `**Priority:** near-term | someday` line** to the entry template.
- **Sub-section split**: `## Near-term` and `## Long-tail` under `## Active`.
- **One-way sync to Jira backlogs**: a `crew followups sync` CLI that reads `docs/followups.md`, creates Jira tickets for each `## Active` entry without a `**Ticket:**` link, parks them in the project's backlog. Followups still author in markdown (low friction); prioritization happens in Jira.
- **Followup-first vs ticket-first capture**: value of the markdown file is the _thin-bullet capture moment_ — no auth, no project selection, no ADF authoring. Markdown stays as the capture surface; sync bridges to Jira.
- **Multi-repo concern**: a Crew-side observation about Recipes shouldn't auto-create a Jira ticket in CREW. Sync needs a per-entry "target project" hint.

**Shape of work:**

- ~1-2 hour design pass: settle sync semantics, entry-template additions (priority, target project), CLI surface.
- ~half-day implementation: `crew followups sync` command, parser, Jira create/link via existing Rovo MCP path, dry-run mode, an update pass for `~/.claude/CLAUDE.md`.
- ~half-day rollout: backfill existing entries with priority + target project, first sync, validate.

**Open questions:**

- Does sync run automatically (cron, pre-`crew run` hook) or stay manual?
- When a Jira ticket is created, does the markdown entry stay in `## Active` (with `**Ticket:**` line) or move to a new `## In Jira` section?
- What about followups in repos without a Jira project (e.g., user-level `~/.claude/` work)? Sync skips them.
- Should priority on the markdown side map directly to Jira priority, or stay a separate signal?

## Resolved

### 2026-06-08 — Hook command paths in settings.json were relative, breaking on cwd drift

**Resolved 2026-06-08:** Changed both `PreToolUse` hook commands in `.claude/settings.json` from `./packages/cli/scripts/hooks/<name>.sh` to `$CLAUDE_PROJECT_DIR/packages/cli/scripts/hooks/<name>.sh`, and documented the absolute-path convention in `.agents/dispatch.md` (§Verification gates) so future hook registrations follow it. Shipped in this same PR. (#351)

**What:** Both crew `PreToolUse` hooks — `visual-fidelity-pr-gate.sh` (matcher `Bash`) and `update-config-reminder.sh` (matcher `Edit|Write`) — were registered with `./`-relative command paths. Claude Code resolves a hook `command` against the shell's *current working directory*, not the project root, so the moment a session's cwd drifts out of the worktree root the path stops resolving: `/bin/sh: 1: ./packages/cli/scripts/hooks/visual-fidelity-pr-gate.sh: not found` (exit 127, non-blocking). The gate silently no-ops — i.e. the visual-fidelity PR gate is *disabled* exactly when cwd has wandered. The script's own header comment already flagged the subdir-failure case; this makes the registration robust to it.

**Why noticed:** A `gh pr create` for an unrelated `~/dotfiles` change surfaced a `PreToolUse:Bash hook error` line in chat. The session's Bash cwd had drifted to `~/dotfiles` (a persistent `cd` earlier in the session), so crew's relative-path gate resolved against dotfiles and 127'd. Ironically the non-blocking failure let the dotfiles PR through unchecked; with cwd at the crew root the same gate would have fired (and correctly blocked, since no `visual-fidelity-check` ran). Confirmed the cause empirically: `pwd` returned `/home/safturento/dotfiles` mid-session.

**Anchors:** `.claude/settings.json` (PreToolUse hooks); `packages/cli/scripts/hooks/visual-fidelity-pr-gate.sh` + `update-config-reminder.sh`; `.agents/dispatch.md` §Verification gates; Claude Code hook env var `$CLAUDE_PROJECT_DIR`. Sibling resolved entry: "2026-06-05 — Global doc-parity hook double-warns in crew".

### 2026-05-24 — `CREW_STARTUP_EVENTS_DIR` bypasses `DaemonConfig` and reads `process.env` directly inside `app.ts`

**Resolved 2026-06-08:** Folded `startupEventsDir` into `DaemonConfig` (CREW-236). `config.ts` now carries `CREW_STARTUP_EVENTS_DIR` in the zod schema (default `process.env.CREW_STARTUP_EVENTS_DIR ?? join(homedir(), '.crew', 'startup')`) and exposes it as `config.startupEventsDir`; `app.ts` onReady reads `config.startupEventsDir` instead of `process.env`. `config.test.ts` covers the new field (default + override); `events.test.ts`'s manual env-var dance is gone (it now passes the dir through `parseDaemonConfig({ CREW_STARTUP_EVENTS_DIR: ... })`); the package-level `src/test/setup.ts` pin stays as the blanket safety net (the schema default consults `process.env` so it still flows through for tests that build config from a partial env object). (#NN)

**What:** The onReady hook in `packages/daemon/src/app.ts:112` reads `process.env.CREW_STARTUP_EVENTS_DIR ?? join(homedir(), '.crew', 'startup')` directly, instead of going through `parseDaemonConfig` like `CREW_CONFIG_DIR` and `CREW_DB_FILE` do. Every test that builds the app via `buildApp` has to either (a) accept that the chokidar watcher will scan the developer's real `~/.crew/startup` and replay historical startup events into the EventBus, or (b) set the env var manually around its `setupApp`. The route-level `events.test.ts` was hit by (a) until 2026-05-24 — a fresh subscriber received a leaked startup event instead of the one the test had just published (UUID mismatch). Worked around in-test; the architectural fix is to fold `startupEventsDir` into `DaemonConfig` so `parseDaemonConfig({ CREW_STARTUP_EVENTS_DIR: ... })` is the single source of truth and tests just override it the way they already override config/db paths.

**2026-06-06 update:** the _test-side symptom_ is now handled package-wide — PR #343 added a daemon `vitest.config.ts` whose setup file pins `CREW_STARTUP_EVENTS_DIR` at a fresh empty temp dir, so no test scans the developer's real `~/.crew/startup`. This entry stays open for the **architectural** fix it actually describes: folding `startupEventsDir` into `DaemonConfig` (the setup file is a harness workaround, not the single-source-of-truth wiring). The "Daemon test suite flakes under full-parallel `test:run`" followup — the runtime symptom of this same gap — is now Resolved by #343.

**Why noticed:** Debugging the pre-existing `events.test.ts > streams a published event with correct id/event/data framing` failure during a "address the test failures agents keep mentioning in PRs" sweep. Conversation 2026-05-24; the test fix landed in `fix/daemon-events-test-isolation`, but the root cause is that one env var escaped the config layer.

**Anchors:** `packages/daemon/src/app.ts:105-118` (onReady hook), `packages/daemon/src/config.ts` (`parseDaemonConfig` — needs the new field), `packages/daemon/src/services/IngestService.ts` (`watchStartupEvents` consumer), `packages/daemon/src/routes/events.test.ts` (current workaround at `setupApp`).

### 2026-06-05 — Preflight fail-fast order surfaces `bruno-skeleton` before `excluded-commands` (red test on main)

**Resolved 2026-06-06:** The merge resolution was correct — `registry.ts`'s `ALL` order is intentional (`brunoSkeleton` is grouped with the scaffold checks, ahead of the CREW-226 P2 `excludedCommands`). The drift lived only in the test: it enables `bruno_smoke` against an empty worktree (so `excluded-commands` has a required entry to miss), which now also trips `bruno-skeleton` first. Fixed by scaffolding a `bruno/bruno.json` in the test worktree so `bruno-skeleton` passes and `excluded-commands` is again the asserted first fail. No product change. (#342)

**What:** `packages/cli/src/lib/preflight/run-preflight.test.ts` > "drives the real registry by default: a missing settings.json fails excluded-commands" is **failing on `main`** (verified at base commit `7ca8d32`, independent of CREW-228). The test builds a config with `bruno_smoke` enabled and neither a `bruno/` skeleton nor a `.claude/settings.json`, then asserts `runPreflight` throws `PreflightError(checkName: 'excluded-commands')`. But `registry.ts`'s `ALL` array now orders `brunoSkeleton` (index 3) ahead of `excludedCommands` (index 8), and the fail-fast adapter throws on the _first_ fail — so it throws `bruno-skeleton` instead. Either the registry order or the test's expectation drifted when T3 (CREW-226) and T4 (CREW-227) merged their registry entries in different orders.

**Why noticed:** Running the cleanliness sweep (`npm run test:run`) during CREW-228 (the `crew doctor` command, which doesn't touch `registry.ts` or preflight). The failure reproduces at the base commit before any CREW-228 work, confirming it is pre-existing and out of this ticket's scope. (Independently re-confirmed during CREW-229 / T6 `crew init` — same single failure, touching none of `preflight/`, `registry.ts`, or this test.)

**Anchors:** `packages/cli/src/lib/health/registry.ts` (the `ALL` order); `packages/cli/src/lib/preflight/run-preflight.test.ts:82`; `packages/cli/src/lib/health/checks/bruno-skeleton.ts` (fails when `bruno_smoke.enabled` and no skeleton present); CREW-226 (T3, preflight adapter), CREW-227 (T4, the six checks). `git checkout 7ca8d32 -- … && npx vitest run preflight/run-preflight` reproduces.

### 2026-06-04 — Daemon test suite flakes under full-parallel `test:run`

**Resolved 2026-06-06:** Root cause was **not** the speculated SQLite-tmpdir/port fixture race below. The full-app route tests build the app via `buildApp`, whose `onReady` hook starts a chokidar watcher on the startup-event dir; with `CREW_STARTUP_EVENTS_DIR` unset it defaulted to the developer's real `~/.crew/startup`, and chokidar's initial scan (`ignoreInitial:false`) replayed every historical `<key>.jsonl` through `IngestService` — a burst of synchronous better-sqlite3 writes that starved later `app.inject` calls and tripped the 5s timeout (deterministic on any machine whose `~/.crew/startup` is non-empty; CI's is empty, hence green there). Fixed package-wide by a daemon-local `vitest.config.ts` whose setup file pins `CREW_STARTUP_EVENTS_DIR` at a fresh empty temp dir. (#343) The deeper architectural fix — folding `startupEventsDir` into `DaemonConfig` — stays tracked in the open "`CREW_STARTUP_EVENTS_DIR` bypasses `DaemonConfig`…" followup.

**What:** Running the daemon vitest suite at full parallelism (35 files at once, as `npm run test:run` does) produces non-deterministic failures: across consecutive runs I saw `routes/runner.test.ts > tails the last N lines` fail alone, then it + `routes/runs.test.ts > returns 409 when already completed`, then a single failure again — while every one of those tests passes 3/3 in isolation. The failing _set_ changes run-to-run with no code change, and the slow case clocked ~7.7s for a normally-instant route test, pointing at resource/timing contention rather than a logic bug.

**Why noticed:** During CREW-222 verification (a CLI-only change touching zero daemon files), `npm run test:run` went red on daemon route tests. Investigation (systematic-debugging) proved the diff touches only `packages/cli`, the daemon binary is byte-identical to origin/main, the tests pass in isolation, and the failing set is non-deterministic — i.e. pre-existing environmental flakiness, not a regression from CREW-222.

**Anchors:** `packages/daemon/src/routes/runner.test.ts`, `packages/daemon/src/routes/runs.test.ts`; root `package.json` `test:run` (cross-workspace vitest). Repro: `cd packages/daemon && npx vitest run` a few times on WSL.

### 2026-06-05 — Global doc-parity hook double-warns in crew (two parity warnings per commit)

**Resolved 2026-06-05:** Removed crew's repo-local `doc-parity-gate.sh` registration from `crew/.claude/settings.json` in favour of the global hook. Diffing the two confirmed the global hook (`~/.claude/hooks/doc-parity-gate.sh`, tracked in dotfiles) is a **strict superset** — identical `.agents/` `covers:` parity logic, plus a README-freshness nudge and extra merge-base fallbacks — so crew loses nothing and gains the README check. The repo-local script + its test stay in-repo (now unregistered) as a portable, re-registerable fallback.

**What:** The user-level `~/.claude/hooks/doc-parity-gate.sh` fired on every `git commit` / `gh pr create` in every repo — including crew, which already wired its own repo-local `doc-parity-gate.sh` via `crew/.claude/settings.json` — so crew commits triggered two soft doc-parity warnings, one from each hook.

**Anchors:** `~/.claude/hooks/doc-parity-gate.sh` (global, from `~/dotfiles/claude/hooks/`); `packages/cli/scripts/hooks/doc-parity-gate.sh` + `.test.sh` (crew repo-local, CREW-163, now unregistered); `crew/.claude/settings.json` PreToolUse Bash hooks.

### 2026-06-03 — Wire CREW-136 `Switch` into the Timeline live toggle

**Resolved 2026-06-03:** Shipped under [CREW-212](https://safturento.atlassian.net/browse/CREW-212). `LiveModeToggle.tsx` now renders the DS `Switch` (`ui/switch.tsx`) + a "Live" label associated via `htmlFor`, replacing the bespoke `<button role="switch">` with hand-rolled emerald styling. Behaviour is preserved (Radix `Switch.Root` exposes `role=switch` / `aria-checked`; the existing toggle tests pass) and a new test asserts `[data-slot="switch"]`. The custom emerald active styling was dropped in favour of the DS Switch's on-state colour (option (a) — swap the whole control for `<Switch>` + label).

**What:** CREW-136 added a shadcn `Switch` primitive to the dashboard but wired it to no caller. The Timeline's "Live" toggle is the intended consumer — today it's a bespoke `<button role="switch">` in `LiveModeToggle.tsx` with hand-rolled emerald styling + a CSS status dot, predating the Switch component. Replace it with the DS `Switch` so the live toggle stops hand-rolling its own switch UI.

**Why noticed:** Verifying the Batch B PRs before merge. CREW-136's Switch landed (PR #305) with no live caller; the obvious home is the Timeline live toggle, which still rolls its own.

**Anchors:** `packages/dashboard/src/components/Timeline/LiveModeToggle.tsx` (bespoke `role="switch"` button to replace); `packages/dashboard/src/components/ui/switch.tsx` (the CREW-136 Switch, now on main); `Timeline.tsx:349` (`<LiveModeToggle active={liveMode} onChange={onLiveModeChange} />`); CREW-136.

**What's been considered:** The existing control carries a "Live" text label + status dot, not a bare switch. Decide whether to (a) swap the whole control for `<Switch>` + a "Live" label, matching the Figma form-switch, or (b) keep the labelled-pill affordance but build it on the Switch primitive. The emerald active styling is custom — reconcile against the DS Switch on-state colour.

**Shape of work:** Small — one component swap in `LiveModeToggle.tsx` + its test, plus a visual-fidelity pass against the Figma Switch. Likely folds into one "Timeline toolbar polish" ticket with the sticky-overlap fix below.

**Open questions:** Does the Figma DS define a labelled "Live" switch variant, or just the bare Switch? If bare, the "Live" label + dot composition stays a caller-side decision.

### 2026-06-03 — Sticky Timeline toolbar overlaps the minimap stripe + scrollbar

**Resolved 2026-06-03:** Shipped under [CREW-212](https://safturento.atlassian.net/browse/CREW-212). The toolbar was lifted out of the scroll viewport (option (b)): it now renders as a non-sticky `shrink-0` flex child above the scroll `div`, and the scroll `div` + `MinimapStripe` are wrapped in their own `relative flex min-h-0 flex-1 flex-col` box so the minimap and native scrollbar span only the event list. `onSectionJump` was simplified to `target.offsetTop` now that no sticky header sits inside the viewport. The two `Timeline.test.tsx` toolbar tests were updated to assert the toolbar is outside the (single) `overflow-y-auto` viewport and not sticky.

**What:** When the Timeline toolbar was refactored to `sticky top-0` (so it pins while the event list scrolls), it began overlapping two full-height siblings: the `MinimapStripe` (right-edge section-nav stripe) and the scroll container's native scrollbar (gutter `stable`). Both run from y=0 of the scroll area, so their top region renders under the pinned toolbar instead of starting below it.

**Why noticed:** Manual verification of the Batch B Timeline work before merge — the sticky toolbar visibly collides with the minimap stripe + scrollbar at the top of the drawer / agent-page timeline.

**Anchors:** `Timeline.tsx:198-260` — outer `relative flex h-full` wraps the scroll `div` (`ref=scrollRef`, `overflow-y-auto`, `scrollbarGutter: 'stable'`, lines 201-202), the `sticky top-0 z-10` `TimelineToolbar` (lines 204-206), and the `MinimapStripe` sibling (lines 254-260); `packages/dashboard/src/components/Timeline/MinimapStripe.tsx` (`SCROLLBAR_GUTTER = 14`, positioning).

**What's been considered:** Candidate fixes — (a) offset `MinimapStripe`'s top by the toolbar height so it starts below the pinned toolbar; (b) move the toolbar out of the scroll container (sibling above it) so the scrollbar + minimap span only the event list — changes the sticky semantics but is the cleanest structurally; (c) opaque toolbar background masking the overlap (partial — doesn't fix the native scrollbar). Leaning (b).

**Shape of work:** Small-to-medium layout fix in `Timeline.tsx` + `MinimapStripe.tsx`; verify sticky behaviour still works and the minimap still aligns to sections. Pairs with the Switch-wiring followup above as "Timeline toolbar polish."

**Open questions:** Should the toolbar stay inside the scroll container (sticky) or move above it (scroll area then covers only the list)? That decides whether the minimap/scrollbar need a top offset or naturally clear the toolbar.

### 2026-05-19 — `crew figma-snapshot` has no per-node refresh

**Resolved 2026-06-03:** Shipped. `crew figma-snapshot` now has a `--node-id <id>[,<id>...]` flag for selective per-node refresh (option (a) from "What's been considered") — see `packages/cli/src/commands/figma-snapshot.ts` (the `--node-id` option, mutually exclusive with `--check`). The auto-detecting `--changed-since` variant (option (b)) was not built; the related "`--check` reports false STALE on whole-file churn" concern is now tracked separately by [CREW-174](https://safturento.atlassian.net/browse/CREW-174) (content-scoped freshness). The disproportionate full-export cost for the common single-node case is resolved.

**In-session blocker:** scoped for in-session brainstorm + implementation immediately after the AgentRow card-redesign spec lands. Hard prereq before the AgentRow `crew run` dispatches.

**What:** `crew figma-snapshot` only supports `--check` (boolean staleness) and a full page-walk export. A one-component Figma edit invalidates the committed snapshot in exactly one place but forces a full export + per-node enrichment-batch dance through `figma-use` to re-land it. Most refreshes in practice are single-node touch-ups; the full-document cost is disproportionate.

**Why noticed:** Mid-session, refreshing the committed snapshot after a small AgentRow Figma edit. Paused from AgentRow card-redesign brainstorming to handle the refresh and noticed the lack of selective export. Tooling cost compounds as the DS grows.

**Anchors:** `packages/cli/src/commands/figma-snapshot.ts` (CLI flag handling — only `--check` today); `packages/cli/src/lib/figma-snapshot/emit.ts` (page-level walk in `emitSnapshot`); `.claude/skills/figma-snapshot-refresh/` (skill procedure that batches `use_figma` enrichment).

**What's been considered:** Two flag shapes. (a) `--node-id <id>[,<id>...]` — explicit per-node refresh; caller has to know what changed but it's mechanical. (b) `--changed-since` — compares live Figma file's per-node `lastModified` against committed `meta.json` and re-exports only nodes that moved; auto-detecting. Both touch the same code paths.

**Shape of work:** Single ticket. CLI flag plumbing + emit-side node filter + skill-procedure update + at least one test fixture for the partial-refresh case. Probably half a day.

**Open questions:** Does the Figma REST API surface per-node `lastModified` reliably for every node type? If not, `--changed-since` degrades into a manifest-diff approach.

### 2026-05-13 — visual-fidelity-check accuracy: snapshot lacks `componentProperties` (REST API limit) + calibration pattern≠specific finding pattern

**Resolved 2026-06-03:** Epic [CREW-148](https://safturento.atlassian.net/browse/CREW-148) (render-frame-as-canonical-truth) shipped Done — children CREW-149 (skill moved to `.claude/skills/`), CREW-150 (enrichment captures nested-instance overrides incl. `componentProperties`/variant data), CREW-151 (skill content: render-frame Step 4 + live-DOM Step 5), CREW-152 (DS fixture refresh + gate validation vs PR #193). The structural data gap is closed by the enrichment pass; the LLM-hedge / specifically-wrong-fix pattern is addressed by the render-frame canonical-truth model + the chrome live-DOM Step 5 (CREW-146 / CREW-184). Both calibration findings resolved.

**What:** Two coupled gaps in the `visual-fidelity-check` workflow, both Epic CREW-148-tracked.

1. **Structural data gap.** The REST `/v1/files/{key}` endpoint returns the node tree but **does not expose `componentProperties` on `INSTANCE` nodes** (the props that tell you which variant the instance is using — e.g. `intensity: "mid"` on a Pill instance, `color: "waiting"`). Variable bindings on paint properties are similarly absent. That data is only available via the Figma Plugin API. The per-screen `<id>.json` emitted by the snapshot tells you "there's a Pill instance here" but not "it's the `mid/waiting` variant" — the caller-check step has to fall back to text-narrative inference instead of mechanical comparison.
2. **Calibration finding.** Two calibration runs of the skill against the CREW-135 fixture revealed a consistent pattern: the skill catches the _type_ of every visual regression but produces _specifically wrong_ fixes when the snapshot lacks per-instance `componentProperties`. Examples: skill recommended `lucide/arrow-up-right` for View PR (real Figma instance was `lucide/git-pull-request`); flagged New Run button as helper-level "wrong shade" when real bug was caller-side wrong color enum; twice downgraded a CSS-span-vs-lucide-circle mismatch to a "judgment call" despite iterated "icon findings are NEVER judgment calls" rule.

The first two examples resolve once the structural fix lands. The third is a skill-prompt + visual-diff capability question — even with perfect snapshot data, an LLM reading "code uses CSS span, Figma uses lucide/circle" without seeing the rendered result will likely keep hedging.

**Why noticed:** First calibration of the `visual-fidelity-check` skill against the CREW-135 fixture (run: `docs/superpowers/skill-fixtures/visual-fidelity-check/crew-135/runs/2026-05-12-run-01.md`) — verification gap surfaced. After CREW-139 merged with REST-based JSON emission, the JSON exists but lacks the field that would close the gap. Subsequent run-02/run-03 + user-in-the-loop review confirmed the pattern: type-correct findings, specifically-wrong fixes.

**Anchors:**

- `packages/cli/src/lib/figma-snapshot/emit.ts` — REST-based emitter
- `packages/cli/src/lib/figma-snapshot/client.ts` — REST client (file + images endpoints only)
- `~/.claude/skills/visual-fidelity-check/{SKILL.md,workflow.md,examples/}`
- `docs/superpowers/skill-fixtures/visual-fidelity-check/crew-135/` — fixture with corrected ground truth
- [PR #180](https://github.com/Safturento/crew/pull/180) — CREW-139 merge
- `docs/superpowers/specs/2026-05-12-agent-visual-verification-design.md` — "Dependency on Figma access" section
- Figma REST API docs: [files endpoint](https://www.figma.com/developers/api#get-files-endpoint) — `componentProperties` documented as Plugin-API-only

**What's been considered:**

- **Plugin-API-based emitter via Claude Code MCP bridge.** Shell out from `crew figma-snapshot` to a one-shot `claude` invocation that runs the Figma Plugin API. Adds process-orchestration but gives full data fidelity — `componentProperties`, `boundVariables`, computed paint resolution.
- **Hybrid: REST for screenshots + simple data, Plugin API for instance-level enrichment.** Two-stage. Smaller blast radius, more code paths.
- **Re-iterate the skill once Plugin-API snapshot lands.** Re-run calibration against the CREW-135 fixture (updated with ground truth). Verify specifics now resolve correctly.
- **Screenshot-vs-Figma ultimate test.** Calibration where the skill receives multiple screenshots of the CREW-135 rendered dashboard + the corresponding Figma references and enumerates **every** visible difference. Exercises Step 5 (visual check). Sharpening the visual-check section to a rigorous enumeration with vision-LLM-style observation listing. May surface gaps the structural+caller checks can't catch.

**Shape of work:** Three threads — (1) Plugin-API snapshot implementation (~1-day, decide full-replacement vs hybrid). (2) Re-iterate the skill once Plugin-API snapshot lands. (3) Author the screenshot-vs-Figma ultimate-test calibration once (1) lands. Update per-component JSON shape: add `instanceProperties` to instance nodes, add `tokenAlias` to paint entries.

**Open questions:**

- How aggressive should the LLM-hedge counter be in the skill prompt? May need automated visual-diff backing rather than prompt-only enforcement.
- Should the ultimate test fixture include rendered HTML/CSS in addition to screenshots, so structural assertions can be machine-verified alongside the visual enumeration?
- Is the Plugin-API path reliable enough to make default, or should it remain opt-in?
- Could we cache Plugin-API enrichment data (file-version keyed) to avoid the Claude shell-out on every dispatch?

### 2026-05-11 — Crew DS is partial vs Dashboard Screens; Timeline container + Bash event tags missing

**Resolved 2026-06-01:** Verified shipped. The Timeline-container composites this entry's open scope called for now exist in both Figma and code — `TimelineSection`, `TranscriptRow`, `TokenBarRow`, `TokensByTool`, and `DrawerHeader` (built in the 2026-05-21 drawer redesign) all have `.figma.tsx` Code Connect files, and the Screens drawer (`1:378`) + AgentPage (`1:1900`) were migrated to `AgentBody` instances under Epic **[CREW-177](https://safturento.atlassian.net/browse/CREW-177)**. The components this entry named were superseded by that redesign: `EventCard` → `TranscriptRow`, `FilterChips` → the Filters dropdown ([CREW-187](https://safturento.atlassian.net/browse/CREW-187) / [CREW-203](https://safturento.atlassian.net/browse/CREW-203)). The broader "Crew DS components are skeletons vs Screens" concern is likewise closed — `AgentRow` ([CREW-176](https://safturento.atlassian.net/browse/CREW-176)), `TopNav`, `ProjectRow`, `ProjectSection`, `ProjectHeader`, and `AgentBody` all now have real composites + `.figma.tsx`. The per-tool-color piece shipped earlier via CREW-192 (closed Epic CREW-189). Only sliver left — no standalone `.figma.tsx` for the `TimelineToolbar` sub-parts (Search / Live toggle / Filters) — is trivial Code-Connect housekeeping, not Epic-worthy.

**Original context:** Crew Dashboard Screens had an "agent activity timeline" composition (collapsible state-header + list of tool-call events) with no Crew DS counterpart; more broadly, several Crew DS components were simpler skeletons than the rich Screens equivalents (agent rows, top-nav, project rows). The leaf event-tag pills (`TimelineTag`, 7 tool variants) were realized 2026-05-12, before the 2026-05-21 redesign delivered the container composites.

### 2026-05-23 — TokensByTool Figma component lacks the Cost column shipped in CREW-195

**Resolved 2026-06-01:** Added the Cost column to the Crew DS `TokensByTool` component (`577:643`) and its `TokenBarRow` child (`555:449`) in Figma file `9FeJPriqdsdA4n9R5Xsrr8` — a new `cost` TEXT property + right-aligned per-row cost cell (Fira Code, foreground token), a `COST` header label, and a `totalCost` grand-total cell in the footer. The reference is now the 5-column layout matching CREW-195's shipped code (Tool / Tokens / Bar / Share / Cost). Committed snapshot `.crew/figma-snapshot/composites/577-643.{json,png}` + `555-449.{json,png}` refreshed in the same PR. Done in-session as part of the CREW-189 Epic close-out.

**What:** CREW-195 added a Cost column + grand-total cost cell to `TokensByTool`; the Figma reference at node `577:643` was still the 4-column pre-CREW-195 design (Tool / Tokens / Bar / Share), flagged by `visual-fidelity-check` as a verification gap (not a regression).

**Anchors:** `.crew/figma-snapshot/composites/577-643.{json,png}`, `packages/dashboard/src/components/TokensByTool.tsx`, `packages/dashboard/src/components/TokenBarRow.tsx`, `docs/visual-fidelity-reports/CREW-195.md`.

### 2026-05-23 — Drawer Timeline still rendering EventCard, not Figma-spec TranscriptRow

**What:** CREW-187 (PR #264) shipped the Timeline UX expansion (Filters dropdown, tool aliasing, Slim 5 categories) but explicitly left the per-event renderer alone — the drawer Timeline still rendered events via the old `EventCard` + `renderers/*Card` tree, which didn't match the Figma `2026-05-21` drawer redesign (one horizontal Tag · text · meta row per content block at node `553:445`).

**Why noticed:** Post-merge review of PR #264 on 2026-05-22 against Figma `220:246` (AgentBody) and `553:445` (TranscriptRow). The visible mismatch: EventCard's two-line stacked layout with its own pad+border framing vs. Figma's single-row Tag + truncated text + right-aligned meta. Ticketed as CREW-188 the same day.

**Anchors:**

- `packages/dashboard/src/components/Timeline/Timeline.tsx` — call site that swapped `<EventCard>` for `<TranscriptRow>`
- `packages/dashboard/src/components/Timeline/TranscriptRow.tsx` — new composite (created in this PR)
- Figma node `553:445` (TranscriptRow), captured in `.crew/figma-snapshot/composites/553-445.{json,png}`
- Predecessor: CREW-187 / PR #264 / commit `6a88075`

**Resolved 2026-05-23:** TranscriptRow composite shipped, drawer Timeline now matches Figma 553:445 spec. The old `EventCard` + `renderers/` directory was deleted wholesale — only call site was `Timeline.tsx`. Per-block iteration preserved (an assistant turn carrying text + thinking + tool_use still renders as three rows). Slim 5 categories drive Tag colour (conversation→running, tools→waiting, thinking→pr_open, hooks-and-skills→initializing, system→idle); error tones override on `tool_result.is_error`, `system/api_error`, and `hook_non_blocking_error`. Note: the original CREW-188 ticket cited `318:230` and `558:477` as the TranscriptRow / drawer node IDs — those actually point at `Input` and `TimelineToolbar`. Real node IDs are `553:445` (TranscriptRow) and `594:803` (DrawerHeader). Ticket body kept the misleading IDs; the implementation followed the snapshot.

### 2026-05-13 — Agent drawer / agent page search input missing leading magnifying-glass icon

**What:** The search input above the event timeline on Agent Drawer (`1:756`) + Agent full page (`1:1900`) Figma frames has a `Has Icon=true, Icon=lucide/search` leading-icon configuration. The dashboard code (`components/Timeline/SearchBar.tsx`) renders the same input as a bare `<input type="search">` with placeholder text only — no leading icon SVG. Once CREW-136 (T2 Form composites) lands the `leadingIcon` prop on `Input`, the caller needs to be updated to pass `leadingIcon={<Search />}`.

**Why noticed:** 2026-05-13 ultimate-test visual comparison. Verified 2026-05-21: `Timeline/SearchBar.tsx` is bare `<input>`, no icon.

**Anchors:**

- `packages/dashboard/src/components/Timeline/SearchBar.tsx` — current bare-input implementation
- CREW-136 (T2 Form composites) — adds the `leadingIcon` prop to `Input`
- Figma instance: search input field on agent drawer + agent page screens

**Resolved 2026-05-22:** CREW-187 added a `leadingIcon?: ReactNode` prop to the DS `Input` primitive (`packages/dashboard/src/components/ui/input.tsx`) and refactored `Timeline/SearchBar.tsx` onto it with `leadingIcon={<Search aria-hidden />}` — search input now matches Figma `558:477` / `318:230`.

### 2026-05-13 — Agent drawer Close button uses Unicode "✕" glyph instead of `lucide/x` SVG

**What:** The Close button at the top-right of the Agent Drawer declares `Icon=lucide/x` in its componentProperties — the polish-pass session on 2026-05-12 migrated the Figma side to use the proper SVG. The dashboard's drawer code (`routes/AgentDrawer.tsx:42`) still renders `Close ✕` (Unicode glyph) inline, not the lucide SVG. Same class of bug as the View PR / Open as page Unicode-arrow issue caught in CREW-135 F5, but on a different button.

**Why noticed:** 2026-05-13 ultimate-test visual comparison (screen 2 — agent drawer header). Verified 2026-05-21: `routes/AgentDrawer.tsx:42` still has `Close ✕`. Skill's calibration runs never surfaced this because the drawer Close button isn't in CREW-135's diff.

**Anchors:**

- `packages/dashboard/src/routes/AgentDrawer.tsx:42` — `Close ✕`
- Figma instance: `387:2566` on the agent-drawer screen — `componentProperties: { type: "button-icon-sm", color: "running", intensity: "ghost", Icon: { name: "lucide/x" } }`
- Polish-pass conversion: 2026-05-12 Figma DS polish session

**Shape of work:** Small — one or two file edits. Replace the inline `Close ✕` with `<X aria-hidden />` from `lucide-react`. The Button base class already sizes child SVGs to `size-4` for normal buttons / `size-3` for xs sizes.

**Open questions:** None. Drop-in fix.

**Resolved 2026-05-22:** Close moved into `DrawerHeader`'s `lucide/x` pill in CREW-179; the standalone `Close ✕` Unicode button on `AgentDrawer.tsx` was deleted as part of the drawer code migration Epic (CREW-177). E2e coverage on the new X pill ships in CREW-182's `agent-drawer-redesign.spec.ts`.

### 2026-05-08 — Wire `StateHistoryBar`, `TokenTable`, and Token-usage section into `AgentBody`

**What:** CREW-109 wired `<Timeline>` into `packages/dashboard/src/components/AgentBody.tsx` (replacing the `agent-body-placeholder` div) so the e2e timeline scenarios could pass. The original placeholder copy promised "Timeline, state history, and token table" — the latter two (`<StateHistoryBar>`, `<TokenTable>`) ship in CREW-104 but are still unmounted. The drawer is functional; the spec §5a/§5b composition isn't complete.

**2026-05-13 visual evidence (folded in from duplicate followup):** The Figma `1:1900` Agent full page reference shows a `Token usage` section between the page header and the event timeline — a table listing per-tool token consumption (Read 22.4k, Bash 5.1k, etc.). The rendered agent page does not display this section at all. Two possibilities: (a) hidden when empty but not reappearing when data is present — bug; (b) planned-but-not-yet-built. `TokenTable.tsx` exists (CREW-104), so the question is whether it's wired into AgentFullPage.tsx + AgentDrawer.tsx and what governs its visibility.

> **Update 2026-05-10:** CREW-117's ticket scope was expanded to a vertical-slice bundle (Crew DS composites + dashboard refactor + Figma frame migration + visual fidelity sweep). The Definition of Done no longer covers this composition — CREW-117 lands 4 Crew DS composites and the dashboard refactor, but does NOT mount StateHistoryBar/TokenTable in AgentBody (open questions still unresolved, and TokenTable's per-tool token data isn't exposed by the daemon today). Re-target this followup to a fresh ticket once open questions are settled.

**Why noticed:** While reading the slice 1c plan, noticed no plan task actually composes Tasks 20 (TokenTable) and 21 (StateHistoryBar) into AgentBody. The 2026-05-13 ultimate-test visual comparison surfaced the same gap from the user-facing side: Token usage section visibly missing.

**Anchors:**

- `packages/dashboard/src/components/AgentBody.tsx` — currently renders only `<Timeline>` under the header
- `packages/dashboard/src/components/StateHistoryBar.tsx`, `packages/dashboard/src/components/TokenTable.tsx` — built but unmounted
- `packages/dashboard/src/routes/AgentFullPage.tsx`, `routes/AgentDrawer.tsx` — host pages
- `docs/superpowers/specs/2026-05-05-slice-1c-agent-drawer-and-push-updates-design.md` §5a/§5b — composition contract
- Slice 1c Epic: [CREW-94](https://safturento.atlassian.net/browse/CREW-94)
- Figma reference: `1:1900` — Token usage section between header + event stream

**Shape of work:** One ticket under CREW-94. Expect two-pane layout (token-table sidebar + main timeline) plus a state-history strip above the timeline, with `StateHistoryBar.onScrollTo` wired into Timeline's virtualizer.

**Open questions:**

- Where does TokenTable sit on narrow drawer widths? (collapsible side panel vs always-stacked.)
- Does `onScrollTo(ts)` need new public Timeline API, or piggyback on an existing imperative handle?
- TokenTable's `rows: { tool, tokens }[]` data isn't exposed by the daemon — add a daemon endpoint or compute client-side from transcript events.
- Is the empty-state-hides-section behavior intentional UX, or accidental?

**Resolved 2026-05-22:** Resolved via the drawer code migration Epic (CREW-177). `StateHistoryBar` and `TokenTable` were both deleted in CREW-182. The Token-usage section now ships as the `TokensByTool` composite (CREW-180), wired into `AgentBody` between the header and Timeline (CREW-178 backend + CREW-180 frontend). State history is surfaced as state-grouped Timeline sections (CREW-181) instead of the standalone bar.

## Abandoned

### 2026-05-12 — Re-link 8 detached AgentRow tiles in modal-overlay screen backgrounds

**Abandoned 2026-05-21:** Modal-overlay screens (`18:2` Edit, `23:2` Delete) likely don't need standalone canvases — the design intent is "Project page + Modal X overlaid," which renders correctly without rebuilding the background AgentRow tiles. The 8 detached FRAMEs (named "AgentRow (detached)" during the 2026-05-12 polish pass) are inert documentation artifacts; converting them to instance overrides would require extracting per-tile agent data and isn't justified. If those modals ever ship as code overlays, the modal screens themselves go away (rendered on top of whatever route was previously visible).

### 2026-05-09 — Manual rename of Figma screens file to "Crew Dashboard Screens"

**Abandoned 2026-05-21:** Made moot by the 2026-05-12 DS consolidation — the screens file is now the single Crew file (`9FeJPriqdsdA4n9R5Xsrr8`) and its display slug is `Crew`, not `Document`. The original "Crew Dashboard Screens" name was scoped to a separate file that no longer exists. The plain `Crew` name is correct for the consolidated file.

### 2026-04-27 — Dashboard mobile responsive layout polish

**Abandoned 2026-05-21:** Superseded by post-CREW-176 dashboard direction. AgentRow is now a flex card (not a table grid) per the 2026-05-20 card redesign, so the original `<768px` collapse spec from UI design §4 no longer maps to the current layout. Mobile shape needs re-derivation from the current direction, not the original spec — file as a fresh followup when mobile becomes a real priority.
