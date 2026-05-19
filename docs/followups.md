# Followups

A queue between "noticed it" and "decided what to do about it." Items might become Jira tickets, get fixed inline during related work, or be explicitly abandoned. Triage periodically.

Format: see the user-level `~/.claude/CLAUDE.md` "Followup detection" section.

## Contents

- [Active](#active)
  - [2026-05-18 — Daemon has no reaper for orphaned runs stuck in `running`](#2026-05-18--daemon-has-no-reaper-for-orphaned-runs-stuck-in-running)
  - [2026-05-18 — `index.css` falls outside every `.agents/*.md` `covers` glob](#2026-05-18--indexcss-falls-outside-every-agentsmd-covers-glob)
  - [2026-05-18 — `.agents/design-system.md` frontmatter URLs stale after Crew DS consolidation](#2026-05-18--agentsdesign-systemmd-frontmatter-urls-stale-after-crew-ds-consolidation)
  - [2026-05-18 — visual-fidelity-check: per-fixture snapshot copy vs committed artifact, plus Step 4 path-vocab drift](#2026-05-18--visual-fidelity-check-per-fixture-snapshot-copy-vs-committed-artifact-plus-step-4-path-vocab-drift)
  - [2026-05-17 — figma-snapshot `index.json` `screenshotPath` can point at a PNG that was never written](#2026-05-17--figma-snapshot-indexjson-screenshotpath-can-point-at-a-png-that-was-never-written)
  - [2026-05-16 — figma-snapshot `resolvedStylesFor` text-color heuristic picks the first TEXT descendant](#2026-05-16--figma-snapshot-resolvedstylesfor-text-color-heuristic-picks-the-first-text-descendant)
  - [2026-05-15 — `crew fix-pr` does not refresh `.mcp.json` — `[visual_fidelity]` chrome wiring goes stale on resume](#2026-05-15--crew-fix-pr-does-not-refresh-mcpjson--visual_fidelity-chrome-wiring-goes-stale-on-resume)
  - [2026-05-15 — `.agents/` topic-doc system vs native `.claude/rules/` and agents.md alignment](#2026-05-15--agents-topic-doc-system-vs-native-clauderules-and-agentsmd-alignment)
  - [2026-05-15 — `parity_violations` metric is recorded end-to-end but never computed (always null)](#2026-05-15--parity_violations-metric-is-recorded-end-to-end-but-never-computed-always-null)
  - [2026-05-14 — Per-turn metric series so cache size can be graphed over a run](#2026-05-14--per-turn-metric-series-so-cache-size-can-be-graphed-over-a-run)
  - [2026-05-13 — Agent rows: code renders as table; Figma designs as cards (architectural layout drift, affects 3 screens)](#2026-05-13--agent-rows-code-renders-as-table-figma-designs-as-cards-architectural-layout-drift-affects-3-screens)
  - [2026-05-13 — Agent drawer Close button uses Unicode "X" glyph instead of `lucide/x` SVG](#2026-05-13--agent-drawer-close-button-uses-unicode-x-glyph-instead-of-lucidex-svg)
  - [2026-05-13 — Agent drawer / agent page search input missing leading magnifying-glass icon](#2026-05-13--agent-drawer--agent-page-search-input-missing-leading-magnifying-glass-icon)
  - [2026-05-13 — TopNav BrandMark renders a different glyph than the Figma "crew" mark](#2026-05-13--topnav-brandmark-renders-a-different-glyph-than-the-figma-crew-mark)
  - [2026-05-13 — Agent page "Token usage" section absent in rendered output (empty-state behavior or missing feature?)](#2026-05-13--agent-page-token-usage-section-absent-in-rendered-output-empty-state-behavior-or-missing-feature)
  - [2026-05-13 — "Hide finished" toggle on Agents List has no Figma reference (scope drift either way — reconcile)](#2026-05-13--hide-finished-toggle-on-agents-list-has-no-figma-reference-scope-drift-either-way--reconcile)
  - [2026-05-13 — visual-fidelity-check calibration: pattern accuracy ≠ specific accuracy + planned screenshot-vs-Figma ultimate test](#2026-05-13--visual-fidelity-check-calibration-pattern-accuracy--specific-accuracy--planned-screenshot-vs-figma-ultimate-test)
  - [2026-05-13 — figma-snapshot omits instance `componentProperties` (REST API limitation) — needed for caller-check accuracy](#2026-05-13--figma-snapshot-omits-instance-componentproperties-rest-api-limitation--needed-for-caller-check-accuracy)
  - [2026-05-12 — Cap or filter `raw` subtree size in figma-snapshot per-component JSON](#2026-05-12--cap-or-filter-raw-subtree-size-in-figma-snapshot-per-component-json)
  - [2026-05-12 — Move figma-snapshot `PAGE_DIR_MAP` into project config](#2026-05-12--move-figma-snapshot-page_dir_map-into-project-config)
  - [2026-05-12 — Rethink followup-tracking system (priority tier + Jira backlog sync)](#2026-05-12--rethink-followup-tracking-system-priority-tier--jira-backlog-sync)
  - [2026-05-12 — Pill needs trailing-icon support (Filters chevron-down)](#2026-05-12--pill-needs-trailing-icon-support-filters-chevron-down)
  - [2026-05-12 — CodeChip composite for mono-font URL/path display (docker URL, worktree path)](#2026-05-12--codechip-composite-for-mono-font-urlpath-display-docker-url-worktree-path)
  - [2026-05-12 — Re-link 8 detached AgentRow tiles in modal-overlay screen backgrounds](#2026-05-12--re-link-8-detached-agentrow-tiles-in-modal-overlay-screen-backgrounds)
  - [2026-05-12 — Explore intensity-axis for Button (parallels StateBadge muted/mid/loud)](#2026-05-12--explore-intensity-axis-for-button-parallels-statebadge-mutedmidloud)
  - [2026-05-11 — Crew DS components are partials of Dashboard Screens equivalents](#2026-05-11--crew-ds-components-are-partials-of-dashboard-screens-equivalents)
  - [2026-05-11 — Agent activity timeline + Bash event-tag components missing from Crew DS](#2026-05-11--agent-activity-timeline--bash-event-tag-components-missing-from-crew-ds)
  - [2026-05-11 — `idle` and `waiting` agent states not reachable from daemon fixtures](#2026-05-11--idle-and-waiting-agent-states-not-reachable-from-daemon-fixtures)
  - [2026-05-10 — Wire dashboard QuickAction buttons (Resume / Finish / Inspect / Provide input) to daemon endpoints](#2026-05-10--wire-dashboard-quickaction-buttons-resume--finish--inspect--provide-input-to-daemon-endpoints)
  - [2026-05-10 — Polish the CREW-119/CREW-117 Crew DS composites (skeleton-fidelity → pixel-fidelity)](#2026-05-10--polish-the-crew-119crew-117-crew-ds-composites-skeleton-fidelity--pixel-fidelity)
  - [2026-05-09 — Crew Dashboard Screens — bind hardcoded fills to Crew DS semantic variables](#2026-05-09--crew-dashboard-screens--bind-hardcoded-fills-to-crew-ds-semantic-variables)
  - [2026-05-09 — Crew Dashboard Screens — rebuild ad-hoc modals + detached primitives as Crew DS instances](#2026-05-09--crew-dashboard-screens--rebuild-ad-hoc-modals--detached-primitives-as-crew-ds-instances)
  - [2026-05-09 — Manual rename of Figma screens file to "Crew Dashboard Screens"](#2026-05-09--manual-rename-of-figma-screens-file-to-crew-dashboard-screens)
  - [2026-05-08 — Tool-name filtering in the timeline Filters dropdown](#2026-05-08--tool-name-filtering-in-the-timeline-filters-dropdown)
  - [2026-05-08 — Slice 1c shipped without citing the design hand-off (visual drift)](#2026-05-08--slice-1c-shipped-without-citing-the-design-hand-off-visual-drift)
  - [2026-05-08 — Surface `crew finish` step results in the dashboard](#2026-05-08--surface-crew-finish-step-results-in-the-dashboard)
  - [2026-05-08 — Wire `StateHistoryBar` and `TokenTable` into `AgentBody` alongside the timeline](#2026-05-08--wire-statehistorybar-and-tokentable-into-agentbody-alongside-the-timeline)
  - [2026-05-07 — Port allocator detects collisions only at `docker compose up` time, not at allocation time](#2026-05-07--port-allocator-detects-collisions-only-at-docker-compose-up-time-not-at-allocation-time)
  - [2026-05-05 — Per-ticket model selection (use Sonnet for trivial work to save tokens)](#2026-05-05--per-ticket-model-selection-use-sonnet-for-trivial-work-to-save-tokens)
  - [2026-05-05 — Dashboard silently drops agents whose project isn't in `/api/projects`](#2026-05-05--dashboard-silently-drops-agents-whose-project-isnt-in-apiprojects)
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
  - [2026-04-30 — Crew owns `.claude/settings.json` per worktree](#2026-04-30--crew-owns-claudesettingsjson-per-worktree)
  - [2026-04-30 — Empirically validate `bwrap`/`socat` are load-bearing](#2026-04-30--empirically-validate-bwrapsocat-are-load-bearing)
  - [2026-04-30 — Project config rationalization](#2026-04-30--project-config-rationalization)
  - [2026-04-30 — Unified `crew init` / `crew doctor` onboarding helper](#2026-04-30--unified-crew-init--crew-doctor-onboarding-helper)
  - [2026-04-30 — Per-config-block reference docs](#2026-04-30--per-config-block-reference-docs)
  - [2026-04-30 — CI integration of authored Playwright runs](#2026-04-30--ci-integration-of-authored-playwright-runs)
  - [2026-04-29 — Promote `resolveAppUrl` to shared `lib/url-substitution/`](#2026-04-29--promote-resolveappurl-to-shared-liburl-substitution)
  - [2026-04-29 — Slice 1c agents continuation work](#2026-04-29--slice-1c-agents-continuation-work)
  - [2026-04-29 — CREW-25 cva-refactor cleanup leftovers](#2026-04-29--crew-25-cva-refactor-cleanup-leftovers)
  - [2026-04-28 — Dashboard write/action endpoint surfaces](#2026-04-28--dashboard-writeaction-endpoint-surfaces)
  - [2026-04-28 — Flesh out the project-resolution design](#2026-04-28--flesh-out-the-project-resolution-design)
  - [2026-04-28 — Dashboard agent detail drawer + full-page route](#2026-04-28--dashboard-agent-detail-drawer--full-page-route)
  - [2026-04-28 — Dashboard New Run modal + projects route view](#2026-04-28--dashboard-new-run-modal--projects-route-view)
  - [2026-04-28 — `useAttention.clear()` snapshot semantic isn't directly tested](#2026-04-28--useattentionclear-snapshot-semantic-isnt-directly-tested)
  - [2026-04-27 — Dashboard mobile responsive layout polish](#2026-04-27--dashboard-mobile-responsive-layout-polish)
  - [2026-04-26 — Architecture doc open questions still unresolved](#2026-04-26--architecture-doc-open-questions-still-unresolved)
- [Resolved](#resolved)
  - [2026-05-18 — StateBadge / CountBadge `.figma.tsx` still point at the archived DS file (Pill consolidation has no name-match)](#2026-05-18--statebadge--countbadge-figmatsx-still-point-at-the-archived-ds-file-pill-consolidation-has-no-name-match)
  - [2026-05-12 — Update `.figma.tsx` Code Connect files after Crew DS consolidation](#2026-05-12--update-figmatsx-code-connect-files-after-crew-ds-consolidation)
  - [2026-05-12 — New Run modal list rows need a proper component (project / ticket rows lost metadata during bulk Button swap)](#2026-05-12--new-run-modal-list-rows-need-a-proper-component-project--ticket-rows-lost-metadata-during-bulk-button-swap)
  - [2026-05-10 — Build a `TimelineTag` component in Crew DS for tool-name pills](#2026-05-10--build-a-timelinetag-component-in-crew-ds-for-tool-name-pills-1)
  - [2026-05-12 — Migrate main agents list project headers to ProjectHeader composite](#2026-05-12--migrate-main-agents-list-project-headers-to-projectheader-composite)
  - [2026-05-10 — Polish CREW-131 Projects view composites (instance swaps + real Button instances)](#2026-05-10--polish-crew-131-projects-view-composites-instance-swaps--real-button-instances-1)
  - [2026-05-10 — Migrate the agents-related Figma frames (Agents List, Drawer Open, Agent Page full) to Crew DS instances + semantic-token bindings](#2026-05-10--migrate-the-agents-related-figma-frames-agents-list-drawer-open-agent-page-full-to-crew-ds-instances--semantic-token-bindings)
  - [2026-05-07 — `sandbox-network-note.md` recommends `crew restart --hard` for docker recovery, but `--hard` nukes the worktree](#2026-05-07--sandbox-network-notemd-recommends-crew-restart---hard-for-docker-recovery-but---hard-nukes-the-worktree)
  - [2026-05-05 — Dashboard Dockerfile doesn't copy `tsconfig.base.json`, breaks vite at runtime with TSCONFIG_ERROR](#2026-05-05--dashboard-dockerfile-doesnt-copy-tsconfigbasejson-breaks-vite-at-runtime-with-tsconfig_error)
  - [2026-05-05 — Worktree env-injection of `CREW_SEED_FIXTURES=1` not wired](#2026-05-05--worktree-env-injection-of-crew_seed_fixtures1-not-wired)
  - [2026-05-05 — Dashboard e2e tests expect mock-client project names that don't match the daemon fixtures](#2026-05-05--dashboard-e2e-tests-expect-mock-client-project-names-that-dont-match-the-daemon-fixtures)
  - [2026-05-04 — Crew sandbox/preflight self-opt-in (slot into first dashboard plan that adds e2e coverage)](#2026-05-04--crew-sandboxpreflight-self-opt-in-slot-into-first-dashboard-plan-that-adds-e2e-coverage)
  - [2026-05-03 — `@playwright/mcp` ignores crew's `--executable-path` override](#2026-05-03--playwrightmcp-ignores-crews---executable-path-override)
  - [2026-05-03 — `crew resume` / `crew fix-pr` env-spec parity for `${VAR}` syntax](#2026-05-03--crew-resume--crew-fix-pr-env-spec-parity-for-var-syntax)
- [Abandoned](#abandoned)

## Active

### 2026-05-18 — Daemon has no reaper for orphaned runs stuck in `running`

**What:** A crew run can finish its real-world work — PR opened and merged, Jira ticket Done — while the daemon's run record stays stuck in `running` indefinitely. The daemon marks a run complete only when the CLI delivers `POST /api/agents/runs/:id/complete` on Claude exit. If that call never lands (CLI crash, daemon down at exit, killed process), the run sits in `running` forever — `completed_at` null, metrics null, no PR URL — and the dashboard shows the agent as perpetually active. Nothing detects or reaps these.

**Why noticed:** CREW-158's daemon run (run 23, started 2026-05-14) was found still `running` 4 days later, even though its work had shipped via merged PR #208 and the ticket is `Done`. We recovered it manually this session with `POST /api/agents/runs/23/complete` `exitCode 137` — which lands the agent in `error`, because the daemon derives `error` from any non-zero exit and only `exitCode 0` yields a clean completion. So orphaned runs are both invisible (no detection) and unrecoverable to a clean state (manual completion can only produce `error`).

**Anchors:** `packages/daemon/src/routes/runs.ts` (register + `:runId/complete` endpoints); `packages/daemon/src/services/AgentsService.ts`, `IngestService.ts` (run state); `packages/cli/src/lib/preflight/run-resume-preflight.ts` (existing orphan-detection on the resume path); CREW-158 / daemon run 23 / PR #208.

**What's been considered:** Two angles, possibly both — (1) **detection / reaping:** a daemon-side sweep that flags runs `running` past a threshold (e.g. no transcript activity for N hours) and either auto-completes them or surfaces them in the dashboard for manual recovery; (2) **durable exit signalling:** make the CLI's completion POST survive a crash (retry / on-disk intent), or a daemon-side fallback that notices the ingested transcript tail going idle. The CLI already has orphan-detection in `run-resume-preflight.ts` for the *resume* path — a daemon reaper would generalize that to runs nobody resumes.

**Open questions:** What's the right "stuck" threshold? And the right terminal state for a reaped run — `error` (honest: it never completed cleanly) or a distinct `abandoned` / `stale` state so it's visually separable from runs that genuinely crashed? CREW-158 showed conflating the two is misleading: a reaped orphan and a real failure both read `error` today.

### 2026-05-18 — `index.css` falls outside every `.agents/*.md` `covers` glob

**What:** `packages/dashboard/src/index.css` holds the Tailwind v4 `@theme` token block, the `:root`/`.dark` semantic-color palette, custom dark-tinted color shades, radii, and the global base styles — core design-system infrastructure — yet no `.agents/<topic>.md` `covers` glob includes it. `design-system.md` covers only `packages/dashboard/src/components/**`; `architecture.md` covers `packages/*/src/**/*.ts` (not `.css`). So a change to the design system's actual token/base layer carries **zero** `agents-doc-parity-check` obligation.

**Why noticed:** Surfaced running the doc-parity audit for PR #243, which dropped a `font-size: 14px` root override that was warping the entire Tailwind rem scale (every `h-*`/`p-*`/`gap-*`/`text-*` rendered at 0.875× nominal). The audit correctly reported "no `.agents/` doc covers `index.css`" — which is itself the gap: a change that materially shifts every component's rendered sizing app-wide had no doc-parity gate at all.

**Anchors:** `.agents/design-system.md` `covers:` frontmatter (lines 5–8); `packages/dashboard/src/index.css`; PR #243 (merged); `agents-doc-parity-check` skill.

**What's been considered:** Add `packages/dashboard/src/index.css` to `design-system.md`'s `covers` list — it's the natural owner: the doc's "Extending the palette" and "Fonts" sections already reference `index.css` by name and document the `@theme` block. One-line frontmatter addition, low risk.

**Shape of work:** One-line `covers` addition to `.agents/design-system.md`. Optionally a wider sweep for other DS-relevant infra files that fall through the same crack (`main.tsx` sets `<html class="dark">` at boot; `vite.config.ts`) — but the `index.css` gap is the concrete known one; the broader sweep can be its own judgment call.

**Open questions:** None blocking — fold into any future dashboard-touching PR.

### 2026-05-18 — `.agents/design-system.md` frontmatter URLs stale after Crew DS consolidation

**What:** `.agents/design-system.md`'s `project_library_url` frontmatter still points at the archived `DsA7QuEa2WthDATkksd1Bq` ("Crew-Design-System") file. After the 2026-05-12 consolidation the Crew DS lives as the `Composites` page inside `9FeJPriqdsdA4n9R5Xsrr8` — the same file as `screens_file_url` (which itself carries a stale `/Untitled` slug). The doc body still describes "three files (Core, Crew DS, Crew Dashboard Screens)" — really two now (Core + the consolidated Crew file). The `design-with-figma` skill reads this frontmatter for URLs.

**Why noticed:** Flagged as explicitly out-of-scope in CREW-175 ("fold in if trivial, else leave as a separate followup"). Not folded in: it's not a pure URL swap — `project_library_url` collapsing into `screens_file_url`'s file changes the doc's "three files" mental model, so the prose needs a pass too.

**Anchors:**

- `.agents/design-system.md` lines 9–12 (frontmatter URLs) and line 22 ("three files" prose)
- Live file: `9FeJPriqdsdA4n9R5Xsrr8` (slug `Crew`); DS on its `Composites` page, screens on `Dashboard Screens`

**Shape of work:** Small doc-only edit — update `project_library_url`, fix the `/Untitled` slug on `screens_file_url`, and rework the "three files" sentence to "two files". Decide whether `project_library_url` and `screens_file_url` should remain two frontmatter keys pointing at the same file or collapse to one.

### 2026-05-18 — visual-fidelity-check: per-fixture snapshot copy vs committed artifact, plus Step 4 path-vocab drift

**What:** Two coupled gaps in the `visual-fidelity-check` skill-fixture model, surfaced while reconciling render-frame Phase 4 against CREW-173.

1. The skill-fixture system (`docs/superpowers/skill-fixtures/visual-fidelity-check/<case>/`) gives each calibration case its own frozen `snapshot/composites/`. CREW-173 made `.crew/figma-snapshot/` a committed, git-tracked artifact — so a per-fixture snapshot copy now duplicates data git already versions (a calibration replay can pin the commit whose snapshot it wants). Decide: keep the per-fixture `snapshot/` copy, or have calibration runs read the committed `.crew/figma-snapshot/` directly and drop the copy.
2. The merged skill content (`workflow.md` Step 4, `SKILL.md` "Before authoring specs" section) locates composites at `<fixture-root>/snapshot/composites/<safe-id>.json`. But Step 0 records `snapshotPath` (not `fixture-root`), and Steps 2/5 use `<snapshotPath>`. In a normal (non-calibration) gate run there is no fixture — composites live at `<snapshotPath>/composites/`. Step 4's path is therefore wrong for the common case; the two coincide only inside a calibration run.

**Why noticed:** Reconciling render-frame Phase 4 / CREW-152 against CREW-173's committed-artifact model. Task 4.1 copies the snapshot into `crew-135/snapshot/composites/` — that copy step raised "is the per-fixture snapshot still needed?", and grepping the skill for the path then surfaced the `<fixture-root>` vs `<snapshotPath>` inconsistency.

**Anchors:** `.claude/skills/visual-fidelity-check/workflow.md` (Step 0 config keys; Step 4 ~line 74); `.claude/skills/visual-fidelity-check/SKILL.md` ("Before authoring specs" section); `docs/superpowers/skill-fixtures/visual-fidelity-check/` (`_template/`, `crew-135/`); render-frame plan Task 4.1; CREW-173.

**What's been considered:** The Phase 4 reconciliation deliberately kept the per-fixture snapshot copy — minimal change to make CREW-152 dispatchable, not a fixture-model redesign. The two gaps are coupled: if calibration runs read the committed `.crew/figma-snapshot/` directly, the skill collapses to one path vocabulary (`<snapshotPath>`), `<fixture-root>` disappears entirely, and Phase 4 Task 4.1's copy step also drops.

**Shape of work:** One design pass on the fixture model, then a small interactive skill-content edit unifying `workflow.md` Step 4 + `SKILL.md` on `<snapshotPath>`. Not a `crew run` (edits `.claude/skills/`).

**Open questions:** Does any calibration case need a snapshot *different* from crew's current committed one (a historical snapshot, or a non-crew project's)? If yes, the per-fixture copy stays justified; if every case just wants "crew's snapshot at commit X", git already provides that.

### 2026-05-17 — figma-snapshot `index.json` `screenshotPath` can point at a PNG that was never written

**What:** `emitSnapshot` writes an `index.json` entry with a `screenshotPath` for every exported node, but the PNG at that path may not exist — when the node's image URL is `null`, when the image download fails, or (after CREW-171) when the whole image pass fails non-fatally. `screenshotPath` is a *claimed* path, not a guarantee.

**Why noticed:** Raised in CREW-171 code review. CREW-171 made the image pass non-fatal (metadata is written before images, image failures warn and skip the PNG), which widens how often a `screenshotPath` entry can lack its file. The reviewer flagged that `index.json` consumers could trip on this. Investigated: the sole consumer is the `visual-fidelity-check` skill (`.claude/skills/visual-fidelity-check/workflow.md`), which is agent-followed Markdown, not brittle code — a missing screenshot just becomes an observed gap the agent flags ("snapshot is incomplete for this component"). So no crash today, and the unconditional `screenshotPath` predates CREW-171 (it was already emitted for `null`-image nodes). Not a CREW-171 regression; logged rather than fixed in that PR.

**Anchors:** `packages/cli/src/lib/figma-snapshot/emit.ts` (`IndexEntry`, the metadata-write loop ~line 78), `.claude/skills/visual-fidelity-check/workflow.md` Step 2 ("Look up the node ID in `index.json`"), CREW-171.

**What's been considered:** Two options surfaced. (a) Make `screenshotPath` honest — write `index.json` *after* the image pass with the field omitted/null for nodes whose PNG didn't land. Downside: reintroduces the "index lost when images fail" problem CREW-171 deliberately fixed unless the index is written twice. (b) Leave `index.json` as-is and add an explicit per-entry `hasScreenshot: boolean` (or `screenshotPath: string | null`) populated after the image pass, so consumers can branch without an `existsSync` probe. (b) keeps the metadata-first guarantee and is the leaning recommendation.

**Shape of work:** Small change in `emit.ts` — restructure so the image pass back-fills a screenshot-present flag into the already-written index, then rewrites `index.json` once at the end. Touches the `IndexEntry` shape, so the `visual-fidelity-check` skill doc + any snapshot-schema notes need a matching update. One ticket.

**Open questions:** Should `index.json` be written once (at the end, after images) or twice (once early as the metadata guarantee, once after images with screenshot flags)? Writing once at the end is simpler but means a crash *between* metadata JSON writes and the final index write loses the index — though the per-node JSON files would still be on disk. Decide before ticketing.

### 2026-05-16 — figma-snapshot `resolvedStylesFor` text-color heuristic picks the first TEXT descendant

**What:** The nested-instance enrichment walk added in CREW-150 resolves each instance's `resolvedStyles.textColor` via `node.findOne((n) => n.type === 'TEXT')` — the first text node in document order anywhere in the subtree. For a single-label primitive (a Pill) that is the right node. For a composite instance with multiple text descendants it may grab the wrong glyph's color, and the skill's Step 4 `resolvedStyles.textColor` diff would then silently compare the caller against the wrong text run.

**Why noticed:** Code review of CREW-150 (Phase 2 of the render-frame-anchor plan). The enrichment script's embedded comment ("single primary text child") already acknowledges the assumption; the reviewer flagged that Phase 4's fixture refresh and future multi-text composites could expose it.

**Anchors:** `resolvedStylesFor` in `packages/cli/src/lib/figma-snapshot/enrichment-prompt.ts` (the `node.findOne` text-node lookup); CREW-150; CREW-152 (Phase 4, consumes this data shape); `docs/superpowers/plans/2026-05-13-visual-fidelity-render-frame-anchor.md` §1.

**What's been considered:** Acceptable for the current Pill-centric fixture — every fixture instance touched today has at most one text child. A more robust heuristic would prefer the text node bound to the instance's `Label` component property, or the largest/topmost text run, rather than document-order-first.

**Shape of work:** Small — a targeted change to the `resolvedStylesFor` text-node selection inside the embedded enrichment script, plus a fixture case with a multi-text composite to lock the behavior. Best sized once Phase 4 surfaces a real multi-text composite.

**Open questions:** Should text-color resolution be tied to the `Label` INSTANCE/TEXT property specifically (deterministic, but skips decorative text), or stay structural with a better tie-breaker?

### 2026-05-15 — `crew fix-pr` does not refresh `.mcp.json` — `[visual_fidelity]` chrome wiring goes stale on resume

**What:** `crew fix-pr` resumes an agent into an existing worktree but never (re)writes `.mcp.json` or re-runs `runSkillInjection`. After CREW-146 PR A, `crew run` and `crew resume` write a `chrome` MCP server entry (and inject the `browsing` skill) for `[visual_fidelity]` projects, but `fix-pr` does not. A `fix-pr` on a `[visual_fidelity]` project whose original `crew run` predated CREW-146 dispatches an agent into a worktree with no `chrome` entry — silently losing visual-fidelity Step 5's live-DOM capability.

**Why noticed:** Code review of CREW-146 PR A. The re-plan **spec** (Change 4) names three files for the widened `.mcp.json` write gate — `run.ts`, `resume.ts`, **and `fix-pr.ts`** — with the rationale "chrome survives a feedback-driven resume of a `[visual_fidelity]` project." The **plan** (Task 4) scoped the gate to only `run.ts` + `resume.ts`. PR A followed the plan (the authoritative driver), so `fix-pr.ts` was left untouched. `fix-pr.ts` writes no `.mcp.json` at all today, so wiring it is genuinely new scope rather than a one-line gate widening.

**Anchors:** `packages/cli/src/commands/fix-pr.ts`; the write-gate block in `packages/cli/src/commands/resume.ts` (the shape to mirror); `docs/superpowers/specs/2026-05-15-crew-146-chrome-integration-replan.md` Change 4; `docs/superpowers/plans/2026-05-15-crew-146-chrome-integration.md` Task 4; `docs/tickets/CREW-146.md` (Decisions section records this divergence).

**What's been considered:** Two paths. (a) Add the `resume.ts`-style write-gate block to `fix-pr.ts` before `spawnClaudeResume` — also consider re-running `runSkillInjection` there, since `browsing` has the same staleness exposure. (b) Decide `fix-pr` deliberately never refreshes `.mcp.json` and reconcile the spec to match. The "stale `.mcp.json` is a real footgun" comment in `resume.ts` argues for (a). Note `fix-pr.ts` also already skips `runSkillInjection`, so today the two omissions are at least self-consistent.

**Shape of work:** Small — one write-gate block plus possibly one `runSkillInjection` call in `fix-pr.ts`, mirroring `resume.ts`; or a doc-only spec reconciliation. Either way, fold a command-layer test asserting a `[visual_fidelity]` `fix-pr` produces the `chrome` entry.

**Open questions:** Does `fix-pr` resume into a worktree fresh enough that re-asserting `.mcp.json` is always safe (it is for `resume.ts`)? Should `browsing` skill re-injection ride along, or is the worktree's existing copy trusted on resume?

### 2026-05-15 — `.agents/` topic-doc system vs native `.claude/rules/` and agents.md alignment

**What:** crew's `.agents/<topic>.md` system — per-topic docs with `covers:` path globs, indexed from `AGENTS.md`'s "When you need it" table — is a hand-rolled equivalent of Claude Code's native `.claude/rules/` feature: topic `.md` files with `paths:` frontmatter that lazy-load when Claude touches matching files. Decide whether to migrate `.agents/` onto `.claude/rules/`, keep `.agents/` as-is (now that its load path is fixed), or run both.

**Why noticed:** While brainstorming the skill-storage consolidation spec + the `AGENTS.md` auto-load fix, empirical testing showed Claude Code does **not** auto-load `AGENTS.md` — only `CLAUDE.md`. The CREW-153 spec's risk table had dismissed this exact risk with a fabricated "Verified by research: Claude Code reads AGENTS.md natively." Reading the official memory docs to confirm the fix surfaced `.claude/rules/`, which delivers path-scoped lazy topic docs natively — crew built a custom version of a native feature, and the custom version's load mechanism never worked.

**Anchors:** `.agents/` (9 topic docs + `README.md`); `packages/cli/scripts/hooks/doc-parity-gate.sh` (CREW-163, keyed on `covers:`); `scripts/validate-agents-frontmatter.ts`; `~/.claude/skills/agents-doc-parity-check` (the `covers:`-overlap audit skill); CREW-153 spec/plan at `docs/superpowers/{specs,plans}/2026-05-13-agent-progressive-disclosure-system.md` (see the risk table, line ~344). Claude Code `.claude/rules/` reference: https://code.claude.com/docs/en/memory.

**What's been considered:** The decision hinges on **cross-agent portability** — the user wants this agent-context setup to work with agents *beyond* Claude Code, which is the original reason `AGENTS.md` (a cross-tool convention) was chosen over `CLAUDE.md`. A straight migration to `.claude/rules/` is Claude-only and would sacrifice that. So the real question: once the auto-load fix lands, does `.agents/` genuinely serve the cross-agent goal — and does crew's implementation match how the `AGENTS.md` ecosystem actually intends the system to work?

**Shape of work:** Its own brainstorm → spec. **Must** begin with a thorough read of the full https://agents.md/ spec (not just the homepage) to understand the intended cross-agent `AGENTS.md` model, then reconcile crew's `.agents/` + `covers:` implementation against it. Then decide: keep `.agents/`, migrate to `.claude/rules/`, or run both. Whatever survives, the doc-parity hook (CREW-163), the frontmatter validator, and `agents-doc-parity-check` are downstream and may need rework.

**Open questions:** Once a `CLAUDE.md` → `@AGENTS.md` shim exists, what does `.agents/` + `covers:` buy over `.claude/rules/` + `paths:` for the Claude-Code case? Which non-Claude agents are actually in scope (Codex, Cursor, Gemini, …), and do they read nested/topic-scoped docs at all? Does the agents.md spec even define a topic-doc/lazy-load layer, or is that purely a crew invention layered on a flat `AGENTS.md`?

### 2026-05-15 — `parity_violations` metric is recorded end-to-end but never computed (always null)

**What:** CREW-164's `computeRunMetrics` derives three of the four Layer-1 metrics from a run's transcript (`cleanlinessPass`, `prClaimInputTokens`, `docLoadCoveragePct`). The fourth, `parityViolations`, is hard-wired to `null` — there is no transcript-only signal for `.agents/` doc-parity violations. The `runs.parity_violations` column, the `MetricsService` aggregate (`parityViolationRate`), the `/api/metrics` payload, and the dashboard widgets all carry the metric end-to-end; only the _capture_ is a stub.

**Why noticed:** Building the metrics pipeline for CREW-164. Plan Step 26 ("compute the four metrics") gave no formula for parity. The Phase 3 commit/PR hook (CREW-160) is the component that detects `.agents/` parity violations, but at run-completion time it leaves nothing the daemon can read.

**Anchors:** `packages/daemon/src/services/computeRunMetrics.ts` (the `parityViolations: null` line + its doc comment); `packages/daemon/src/services/MetricsService.ts` `aggregate()` → `parityViolationRate`; CREW-160 (Phase 3 hook); CREW-164.

**What's been considered:** The metric is null-safe everywhere — `MetricsService.aggregate` filters nulls out of `parityViolationRate`, so a null parity column never skews the cohort. The honest stub (`null`) was chosen over a fabricated `0`.

**Shape of work:** Depends on what signal the Phase 3 hook leaves behind. If the hook writes a violation count into the transcript (a `system`/`attachment` event) or a worktree sidecar file, `computeRunMetrics` gains a small extractor. If it only annotates the PR, capture moves out of the transcript path entirely. Small once the signal source exists; blocked until then.

**Open questions:**

- Where does the Phase 3 hook record violation counts — transcript event, worktree file, or PR comment only?
- Is "violations introduced on this run" or "violations outstanding at run end" the right semantic?

### 2026-05-14 — Per-turn metric series so cache size can be graphed over a run

**What:** Today `baseline_metrics` (and Phase 4's planned `run_metrics`) record one row per run — only the final-turn snapshot. To graph cache size over time of a run, or cache size per turn, we need a per-turn time series: one row per turn carrying `turn_index`, `uncached_tokens`, `cache_read_tokens`, `cache_creation_tokens`, `total_tokens`, plus the bash/tool counts that occurred on that turn. A second table (`run_turn_metrics` keyed by `(run_id, turn_index)`) is the natural shape. The single-row aggregate stays useful as the headline; the per-turn table powers shape diagnostics (does context climb linearly through the run? does it spike at PR-claim time? do cleanliness-check turns drag a huge cache read?).

**Why noticed:** 2026-05-14 conversation closing out CREW-154's baseline-metrics fix. While discussing component-split (uncached / cache_read / cache_creation) the user observed: "in the future we might even be able to graph data about cache size over the time of a run and cache size over turns — that's definitely out of scope and a separate enhancement though." Recording so it doesn't evaporate when the Phase 4 metrics pipeline is being designed.

**Anchors:**

- `scripts/baseline-metrics-capture.ts` — current one-row-per-run shape; `countTurns` / `lastPrClaimTokens` already iterate the per-turn data, they just collapse it.
- Phase 4 ticket `CREW-164` — where this naturally lands (the `0003_run_metrics` migration + MetricsService work). Doesn't fit baseline; baseline is meant to be a single point-in-time snapshot.
- Transcript JSONL events at `~/.claude/projects/<slug>/<session_id>.jsonl` — each assistant message's `message.usage` is one turn's data point.

**What's been considered:** The per-turn table is additive — it doesn't replace the per-run aggregate, just complements it. A view (`run_summary`) over `run_turn_metrics` can derive the per-run aggregate, so we don't need to double-write. Pulling cost is a single pass over events the script already loads.

**Shape of work:** Single ticket, lands in Phase 4 / CREW-164's scope. Add `run_turn_metrics` table to the `0003_run_metrics` migration; extend `MetricsService` to emit per-turn rows on transcript ingest; expose `/api/metrics/run/:id/turns` for the future dashboard widget. Dashboard charts (sparkline per agent row, full series on agent page) are a downstream enhancement, not part of this entry.

**Open questions:**

- Sample rate: every turn, or every N tokens? Every turn is fine to start — a 100-turn run is 100 rows; cheap.
- Retention: keep forever, or expire alongside transcripts? Probably tied to transcript lifetime since that's the source of truth.

### 2026-05-13 — Agent rows: code renders as table; Figma designs as cards (architectural layout drift, affects 3 screens)

**What:** The agent rows on Agents List (`packages/dashboard/src/routes/AgentsListPage.tsx` + `components/AgentRow.tsx`), Agent full page (`AgentFullPage.tsx` agents sub-section), and Project detail (`ProjectDetailPage.tsx` agents sub-section) currently render as a **columnar table** (`STATE | ID | RUNTIME | TOKENS | TITLE | actions`). The Figma reference on every one of those screens uses a **card layout**: full-width row with a left-edge state-colored stroke, state pill top-left, title as the primary content, meta (`# KAN-31 · ⌚ 33m 04s · ✦ 38.1k`) inline below the title, action buttons right-aligned within the card. The table-vs-card mismatch is the single largest visual difference between code and Figma — bigger than any individual component-level bug.

**Why noticed:** 2026-05-13 ultimate-test visual-comparison session. The visual-fidelity-check skill's structural+caller checks across three calibration runs (run-01 / run-02 / run-03) never flagged this because they operate per-component, not per-layout. The diff only surfaces when comparing rendered-page screenshots to Figma frame screenshots side-by-side.

**Anchors:**

- `packages/dashboard/src/routes/AgentsListPage.tsx` — table renderer
- `packages/dashboard/src/components/AgentRow.tsx` — row composite (currently styled for table cells, would need substantial rewrite for card shape)
- `packages/dashboard/src/routes/AgentFullPage.tsx` — uses AgentsListPage's table rendering for the "agents" tab
- `packages/dashboard/src/routes/ProjectDetailPage.tsx` — uses the same row pattern under the project's TOML block
- Figma references: `1:2` (Agents List), `1:1900` (Agent full page), `1:2443` (Project detail) — all three Figma frames render cards
- Code Connect: `AgentRow.figma.tsx` — currently maps the table-row component to whatever Figma node was on the legacy DS file; needs updating to point at the card-shape Figma component if/when it exists in `9FeJPriqdsdA4n9R5Xsrr8`
- Spec doc covering originally-shipped agents-list slice: `docs/superpowers/specs/2026-05-05-slice-1c-agent-drawer-and-push-updates-design.md` — predates the Figma card refresh

**What's been considered:**

- **Out-of-scope deferral:** the row layout shipped during the original agents-list slice (CREW-102 / CREW-103). The current Figma design represents a later DS iteration. The drift accumulated as Figma evolved and code didn't follow. This is a design-system catch-up effort, not a CREW-135 regression.
- **Effort scope:** AgentRow.tsx is a substantial composite — would need rewriting to switch from table-cell layout to card-layout, including how the meta fields render (icons inline vs columnar), how quick-actions position within the card, how the left-edge state stroke gets applied (probably via a `border-l-4` color matching state). The supporting parent table (header row, column-width logic) goes away entirely.
- **Verify the Figma is canonical:** before committing to the rewrite, confirm with the design owner that the card layout is actually the intended end-state (not an in-progress concept that got merged to main Figma by accident). Once confirmed, plan as its own ticket.

**Shape of work:**

- ~1-day brainstorm + spec covering the layout migration + reconciling the meta-row icon set (clock for runtime, diamond for tokens, etc. — Figma uses lucide icons there; code currently uses plain text columns).
- ~2-3 days implementation: rewrite AgentRow.tsx as a card, drop the table header row, migrate three pages (Agents List, Agent full page, Project detail) to use the card-shape consumer.
- Tests: existing `AgentRow.test.tsx` is column-oriented; needs rewrite to match card affordances.
- Visual smoke + Plugin-API-snapshot-driven `visual-fidelity-check` to verify the result matches Figma. (Ironically, this would be a great fixture for the future "ultimate test" capability — known-bad input + known-good Figma reference + measurable progress.)

**Open questions:**

- Is the card layout actually the design intent, or did Figma drift? Confirm before scoping.
- Does the table-row layout have any current usability advantage worth keeping? (e.g., sortable columns — Figma's card layout doesn't expose this affordance.)
- What's the right ordering vs other DS catch-up work? This is likely the biggest single visual-fidelity win, but also the biggest implementation cost.

### 2026-05-13 — Agent drawer Close button uses Unicode "X" glyph instead of `lucide/x` SVG

**What:** The Close button at the top-right of the Agent Drawer (visible in `1:756` and on `1:378` agents-list-with-drawer-open Figma frames) declares `Icon=lucide/x` in its componentProperties — the polish-pass session on 2026-05-12 migrated the Figma side to use the proper SVG. The dashboard's drawer code (probably `AgentDrawer.tsx`'s header) still renders a font-glyph "X" / "✕" character inline, not the lucide SVG. Same class of bug as the View PR / Open as page Unicode-arrow issue caught in CREW-135 (visual-fidelity-check F5), but on a different button.

**Why noticed:** 2026-05-13 ultimate-test visual comparison (screen 2 — agent drawer header). The skill's calibration runs never surfaced this because the drawer Close button isn't in CREW-135's diff (CREW-135 was the Pill primitives migration; the Close button is a caller of Button that wasn't touched).

**Anchors:**

- `packages/dashboard/src/components/AgentDrawer.tsx` (or wherever the drawer header lives) — the Close button JSX. Grep `aria-label="Close"` or similar.
- Figma instance: `387:2566` on the agent-drawer screen (and equivalent on other screens) — `componentProperties: { type: "button-icon-sm", color: "running", intensity: "ghost", Icon: { name: "lucide/x" } }`
- Polish-pass conversion: occurred during the 2026-05-12 Figma DS polish session — the raw `Button - Close` FRAME was converted to a Pill instance with `Icon=lucide/x`.

**Shape of work:** Small — one or two file edits. Replace the inline `<span>✕</span>` (or similar) with `<X aria-hidden />` from `lucide-react`. The Button base class already sizes child SVGs to `size-4` for normal buttons / `size-3` for xs sizes via `[&_svg:not([class*='size-'])]`.

**Open questions:** None. Drop-in fix.

### 2026-05-13 — Agent drawer / agent page search input missing leading magnifying-glass icon

**What:** The search input above the event timeline on Agent Drawer (`1:756`) + Agent full page (`1:1900`) Figma frames has a `Has Icon=true, Icon=lucide/search` leading-icon configuration. The dashboard code renders the same input as a plain `<Input placeholder="Search events..." />` with no leading icon. Once CREW-136 (T2 Form composites) lands the `leadingIcon` prop on `Input`, the caller needs to be updated to pass `leadingIcon={<Search />}`.

**Why noticed:** 2026-05-13 ultimate-test visual comparison (screen 2 + screen 3). The skill's run-03 didn't surface this because the search-input wasn't on CREW-135's touched-files list.

**Anchors:**

- `packages/dashboard/src/components/Timeline/EventFilters.tsx` (or wherever the timeline filter row + search input live) — caller of Input
- CREW-136 (T2 Form composites) — adds the `leadingIcon` prop to `Input`. This followup is the **caller-side change** that consumes the new prop.
- Figma instance: search input field on agent drawer + agent page screens.

**Shape of work:** Small — one or two file edits. Blocked on CREW-136 landing.

**Open questions:**

- Anywhere else in the dashboard with a search input that should also use the leading icon? (Worth a grep when the leadingIcon prop ships.)

### 2026-05-13 — TopNav BrandMark renders a different glyph than the Figma "crew" mark

**What:** The `BrandMark` component at the top-left of the TopNav (visible on every page) renders what looks like a dark checkbox-styled glyph in code, while the Figma reference shows a squarish-dotted "crew" mark (looks like a small grid / four-dot logo). The Figma BrandMark component is at `220:211` in the Composites page (referenced in [[project_crew_ds_consolidated_into_dashboard_file]]). The code's BrandMark.tsx renders an SVG that doesn't match.

**Why noticed:** 2026-05-13 ultimate-test visual comparison. Visible on all 5 captured screens — the dark-checkbox glyph appears identically rendered in code, the squarish-dot mark appears identically in Figma.

**Anchors:**

- `packages/dashboard/src/components/BrandMark.tsx` — current implementation
- `packages/dashboard/src/components/BrandMark.figma.tsx` — Code Connect mapping
- Figma component: `220:211` (BrandMark on Composites page)
- Note: this is a pre-existing drift, not a CREW-135 regression. The brand mark may have been redesigned in Figma after the initial dashboard implementation.

**Shape of work:** Small — refresh BrandMark.tsx's SVG path to match the Figma reference. Compare the Figma node's SVG content to the code's SVG, update path data accordingly.

**Open questions:**

- Is the Figma BrandMark the canonical brand intent, or did Figma drift from a previously-agreed mark? Confirm with design owner before changing.

### 2026-05-13 — Agent page "Token usage" section absent in rendered output (empty-state behavior or missing feature?)

**What:** The Figma `1:1900` Agent full page reference shows a `Token usage` section between the page header and the event timeline — a table listing per-tool token consumption (Read 22.4k, Bash 5.1k, etc.). The rendered agent page does not display this section at all (verified during 2026-05-13 ultimate test against an agent with `3.5k` token usage). Two possibilities: (a) the section is hidden when the agent has no events / no token data, but isn't reappearing when data is present — this would be a bug; (b) the section is a planned-but-not-yet-built feature.

**Why noticed:** 2026-05-13 ultimate-test visual comparison (screen 3 — agent full page). The rendered screenshot shows the agent header → filter chips → "No timeline events yet." Nothing about token usage breakdown.

**Anchors:**

- `packages/dashboard/src/components/TokenTable.tsx` exists — built during CREW-104. So the component exists; the question is whether it's wired into AgentFullPage.tsx + AgentDrawer.tsx and what governs its visibility.
- `packages/dashboard/src/routes/AgentFullPage.tsx` — check whether TokenTable is rendered + under what conditions
- Figma reference: `1:1900` — Token usage section between header + event stream
- Related followup: 2026-05-08 "Wire StateHistoryBar and TokenTable into AgentBody alongside the timeline" — covers this gap; this entry is the duplicate-visibility / supersedes-pointer for it.

**Shape of work:**

- ~30min investigation: open AgentFullPage.tsx, find whether TokenTable is rendered, identify the visibility gate. Probably `if (tokens.length > 0)` or similar.
- If the gate is too restrictive → small fix.
- If TokenTable isn't wired in at all → small feature add + tests.
- **Likely a duplicate / overlapping concern with the existing 2026-05-08 followup.** Resolve by merging the two entries on next triage.

**Open questions:**

- Is the empty-state-hides-section behavior intentional UX, or accidental?
- Same question for AgentDrawer (drawer also lacks the section in the rendered output).

### 2026-05-13 — "Hide finished" toggle on Agents List has no Figma reference (scope drift either way — reconcile)

**What:** The Agents List rendered output shows a `Hide finished` toggle (outlined pill, top-right of the agent list area). No Figma frame captured during the 2026-05-13 ultimate test surfaces this control — the Figma `1:2` Agents List reference has no equivalent toggle. Either the Figma is stale (control was added in code post-Figma-design) or the code over-shipped (control is unnecessary). Reconcile.

**Why noticed:** 2026-05-13 ultimate-test visual comparison (screen 1 — Agents List).

**Anchors:**

- `packages/dashboard/src/routes/AgentsListPage.tsx` — toggle implementation
- Source of the feature: CREW-107 (PR #142, "Hide finished toggle on AgentsList"). So it's a code-side feature that shipped without Figma alignment.
- Figma reference: `1:2` — no Hide finished toggle visible

**What's been considered:**

- **Code-first feature:** the toggle was a real UX request that shipped without going through Figma first. Solution: add it to the Figma design retroactively.
- **Over-shipped feature:** the toggle isn't actually wanted; remove from code.
- **Design owner unilaterally chose not to include it in Figma:** also requires reconciliation.

**Shape of work:**

- ~15min: confirm with design owner whether the toggle stays in code (add to Figma) or comes out of code (remove). Easy decision once asked.

**Open questions:**

- Which way does the user want to reconcile?

### 2026-05-13 — visual-fidelity-check calibration: pattern accuracy ≠ specific accuracy + planned screenshot-vs-Figma ultimate test

**Ticket:** [CREW-148](https://safturento.atlassian.net/browse/CREW-148) — resolution gated on Epic CREW-148 completion.

**What:** Two calibration runs of the `visual-fidelity-check` skill against the CREW-135 fixture (`docs/superpowers/skill-fixtures/visual-fidelity-check/crew-135/runs/`) plus user-in-the-loop review revealed a consistent pattern: the skill catches the _type_ of every visual regression (caller-side intensity choice, wrong helper shade, icon primitive mismatch) but produces _specifically wrong_ fixes when the snapshot lacks per-instance `componentProperties`. Three concrete examples from CREW-135:

- **View PR icon.** Skill recommended `lucide/arrow-up-right`. Real Figma instance: `lucide/git-pull-request`. (Open as page genuinely uses arrow-up-right — different icon per surface; skill couldn't distinguish without per-instance data.)
- **New Run button color.** Skill flagged the New Run button as a helper-level "wrong shade" bug (`bg-neutral-200` vs `zinc/50`). Real bug: caller-side wrong color enum (`color="white"` where Figma uses `color="idle"`). The helper is fine; the caller picked the wrong color.
- **State badge dot.** Skill twice downgraded the CSS-span-vs-lucide-circle mismatch to a "judgment call" despite the skill's iterated "icon findings are NEVER judgment calls" rule. User screenshot confirmed visually distinct shapes (filled dot vs outlined ring). LLM hedging on icon-similarity persists in the absence of an actual visual diff.

The structural fix for the first two is the Plugin-API snapshot work captured in the sibling [followup](#2026-05-13--figma-snapshot-omits-instance-componentproperties-rest-api-limitation--needed-for-caller-check-accuracy). The third is a skill-prompt + visual-diff capability question — even with perfect snapshot data, an LLM reading "code uses CSS span, Figma uses lucide/circle" without seeing the rendered result will likely keep hedging.

**Why noticed:** Today's user-in-the-loop visual review of the run-02 report. The user provided side-by-side Error-badge screenshots (`docs/superpowers/skill-fixtures/visual-fidelity-check/crew-135/runs/` referenced in conversation) and direct corrections on icon names + the New Run color. Pre-pause from active skill development.

**Anchors:**

- `~/.claude/skills/visual-fidelity-check/{SKILL.md,workflow.md,examples/}`
- `docs/superpowers/skill-fixtures/visual-fidelity-check/crew-135/` — fixture with corrected ground truth
- Sibling structural followup (#2026-05-13 entry below)
- PR #182 (the structural-gap followup) — already merged
- PR #183 (CREW-140 dispatch integration) — pending merge

**Shape of work — three threads:**

1. **Wait for Plugin-API snapshot.** Sibling structural followup must land first. Without per-instance `componentProperties`, no amount of skill-prompt tuning will produce specifically-correct fixes for icon/color findings.
2. **Re-iterate the skill once Plugin-API snapshot lands.** Re-run calibration against the CREW-135 fixture (updated with ground truth). Verify the specifics now resolve correctly (lucide/git-pull-request for View PR, idle/loud for New Run). Update expected/findings.md if needed.
3. **Planned: screenshot-vs-Figma ultimate test.** User requested a calibration where the skill receives **multiple screenshots of the CREW-135 rendered dashboard** + the corresponding Figma references and enumerates **every** visible difference. This exercises the skill's Step 5 (visual check), which is currently lightly-spec'd as "screenshot + eyeball." Probably requires sharpening the visual-check section to be a rigorous enumeration with vision-LLM-style observation listing. Worth doing as the final hardening pass after Plugin-API snapshot lands. May surface gaps the structural+caller checks can't catch (e.g., font-rendering, anti-aliasing, micro-spacing).

**Open questions:**

- How aggressive should the LLM-hedge counter be in the skill prompt? Today's iteration added "NEVER judgment calls" + "anti-loophole" callouts; run-02 hedged anyway. May need automated visual-diff backing rather than prompt-only enforcement.
- Should the ultimate test fixture include rendered HTML/CSS in addition to screenshots, so structural assertions can be machine-verified alongside the visual enumeration?
- Does Figma's `lucide/circle` set-level default actually render as "outlined ring" or "filled circle"? The screenshot confirmed outlined-ring in this case but the lucide library has multiple circle variants (`circle`, `circle-dot`, `circle-fill`?) — verify before recommending the import.

### 2026-05-13 — figma-snapshot omits instance `componentProperties` (REST API limitation) — needed for caller-check accuracy

**Ticket:** [CREW-148](https://safturento.atlassian.net/browse/CREW-148) — resolution gated on Epic CREW-148 completion.

**What:** The `crew figma-snapshot` CLI shipped in CREW-139 (PR #180) uses the Figma REST API. The REST `/v1/files/{key}` endpoint returns the node tree but **does not expose `componentProperties` on `INSTANCE` nodes** (the props that tell you which variant of the parent component the instance is using — e.g. `intensity: "mid"` on a Pill instance, `color: "waiting"`). Variable bindings on paint properties are similarly absent. That data is only available via the Figma Plugin API. As a result, the per-screen `<id>.json` emitted by the snapshot tells you "there's a Pill instance here" but not "it's the `mid/waiting` variant" — the agent's caller-check step (per `visual-fidelity-check` workflow.md Step 4) has to fall back to text-narrative inference instead of mechanical comparison.

**Why noticed:** During the first calibration of the `visual-fidelity-check` skill against the CREW-135 fixture (run: `docs/superpowers/skill-fixtures/visual-fidelity-check/crew-135/runs/2026-05-12-run-01.md`). The subagent surfaced "no screen-level JSON for the agent-drawer screen" as a verification gap. After CREW-139 merged with REST-based JSON emission, the JSON exists but lacks the field that would close the gap (`componentProperties` on instance nodes). Sample finding F1 (state badges should use `intensity=mid`, not `muted`) was provable only because the fixture's narrative description said so — the snapshot data alone couldn't confirm what intensity the Figma agent-drawer screen's badge instance is meant to use.

**Anchors:**

- `packages/cli/src/lib/figma-snapshot/emit.ts` — current REST-based emitter
- `packages/cli/src/lib/figma-snapshot/client.ts` — REST client (file + images endpoints only)
- [PR #180](https://github.com/Safturento/crew/pull/180) — CREW-139 merge
- `docs/superpowers/specs/2026-05-12-agent-visual-verification-design.md` — "Dependency on Figma access" section already names this as a future need
- `docs/superpowers/skill-fixtures/visual-fidelity-check/crew-135/runs/2026-05-12-run-01.md` — calibration run with the verification gap surfaced
- Figma REST API docs: [files endpoint](https://www.figma.com/developers/api#get-files-endpoint) — `componentProperties` is documented as available only via Plugin API

**What's been considered:**

- **Plugin-API-based emitter via Claude Code MCP bridge.** Shell out from `crew figma-snapshot` to a one-shot `claude` invocation with a prompt that runs the Figma Plugin API (the user already has it set up locally; this session uses it). Adds a process-orchestration layer but gives full data fidelity — `componentProperties`, `boundVariables`, computed paint resolution.
- **Hybrid: REST for screenshots + simple data, Plugin API for instance-level enrichment.** Two-stage: keep the current REST emitter for the bulk export, run a second pass via Plugin API just to populate `componentProperties` on instance nodes and `boundVariables` on key paint properties. Smaller blast radius but more code paths.
- **Maintain instance properties manually.** Out — they change every time a Figma instance is reconfigured. Doesn't scale.

**Shape of work:** ~1-day implementation. Decide between full-replacement vs. hybrid. Author the Plugin-API runner (probably a Node script invoked via Claude harness with the right MCP allowed). Wire into `crew figma-snapshot` behind a flag (REST-only by default; Plugin-API-augmented when flag present + Claude Code available on host). Update the per-component JSON shape: add `instanceProperties` to instance nodes, add `tokenAlias` to paint entries.

**Open questions:**

- Is the Plugin-API path reliable enough to make default, or should it remain opt-in? Reliability depends on Claude Code being available on the dispatching host.
- Does the Figma Pro tier limit Plugin-API access in any way relevant to crew? (Pro supports plugins and the Plugin API in the editor, but programmatic-headless usage is via the `use_figma` MCP we already have.)
- Could we cache Plugin-API enrichment data (file-version keyed) to avoid the Claude shell-out on every dispatch? Pairs with the "snapshot caching" long-tail followup in the spec.

### 2026-05-12 — Cap or filter `raw` subtree size in figma-snapshot per-component JSON

**What:** `emitSnapshot` writes `{ id, name, type, page, raw: t.node }` for every exported node — and `raw: t.node` is the entire Figma subtree, recursively. For a large component set like Pill (~192 variants) this could be megabytes per file. The agent's visual-fidelity-check skill probably only needs paint/text bindings + a shallow geometry summary; the deep subtree is dead weight.

**Why noticed:** Self-review of CREW-139 flagged it as an Important issue. The plan literally specifies emitting `raw: t.node` and the consuming skill doesn't exist yet (Phase A), so the right shape isn't knowable today — but the cost is real once Pill-sized component sets land in `.crew/figma-snapshot/`.

**Anchors:**

- `packages/cli/src/lib/figma-snapshot/emit.ts` (the `raw` field)
- `docs/superpowers/plans/2026-05-12-agent-visual-verification.md` (the "per-component JSON shape" example that hardcoded `raw`)
- `docs/superpowers/specs/2026-05-12-agent-visual-verification-design.md` (the original spec)
- Epic: [CREW-138](https://safturento.atlassian.net/browse/CREW-138) — gating Epic for visual-fidelity work
- PR for the snapshot generator: CREW-139

**Shape of work:** Small refactor in `emit.ts` once Phase A reveals what the skill actually consumes. Either depth-cap the `raw` tree, project a flat resolvedStyles + geometry summary, or move the heavy data behind an opt-in flag. Likely folds into the Plugin-API snapshot migration if that lands first (the Plugin API gives variable bindings, which makes most of `raw` redundant anyway).

**Open questions:**

- What does the skill actually need? Settle in Phase A.
- Do we want a per-file size budget for `.crew/figma-snapshot/`? Currently unbounded.

### 2026-05-12 — Move figma-snapshot `PAGE_DIR_MAP` into project config

**What:** `emit.ts` hardcodes `Composites → composites/` and `Dashboard Screens → screens/` in a module-level map. Any other page name falls through to a sanitized slug. This is crew-dashboard-specific knowledge living in a generic CLI helper — violates AGENTS.md's "Don't hardcode project-specific knowledge" rule (originally written for `Recipes-App`, same principle applies here).

**Why noticed:** Self-review of CREW-139. The map matches the spec's example output structure exactly, but only because the spec was written for crew. A second project adopting the snapshot would either need to use one of these names or accept the kebab-cased fallback (e.g. "Components" → `components/`, fine; "Foundations" → `foundations/`, fine; but losing the hand-tuned mapping for nuanced layouts).

**Anchors:**

- `packages/cli/src/lib/figma-snapshot/emit.ts` (the `PAGE_DIR_MAP` const)
- `packages/shared/src/config/schema.ts` (`visualFidelitySchema` — where the map could live)
- CREW-139 PR / self-review notes

**Shape of work:** Add an optional `page_dir_map = { "Composites" = "composites", … }` field to `visualFidelitySchema`; in `emit.ts`, look up `opts.pageDirMap?.[name]` first, fall back to slug. Either drop the in-code default (force projects to opt-in to non-slug naming) or leave the current map as a documented default for backwards compat. ~30 line change + tests.

**Open questions:**

- Worth doing before a second project adopts the snapshot, or is YAGNI?

### 2026-05-12 — Rethink followup-tracking system (priority tier + Jira backlog sync)

**What:** The current `docs/followups.md` convention captures items well at the "noticed it" moment but has two gaps. (a) **No priority tier** — entries are chronological within `## Active` with no signal for what's near-term vs long-tail. The user has to skim the whole list to figure out what matters next. (b) **Single surface** — followups live in a versioned markdown file, but Jira is where the rest of the user's work is prioritized, tracked, and resolved. The current "graduate the followup → file a Jira ticket → manually move to Resolved when the ticket ships" loop is manual and easy to forget; the Resolved/Active state can drift from reality.

**Why noticed:** During the 2026-05-12 brainstorm for the agent visual-verification skill, two near-term followups were about to be filed (Playwright e2e chromium binary fix, superpowers-chrome eval). User asked whether priority tiering and Jira-backlog sync would solve the underlying visibility/management problem. The trigger was: "these need to be close follows — how do I express that in the existing convention?"

**Anchors:**

- `~/.claude/CLAUDE.md` — current convention lives in the "Followup detection" section
- `docs/followups.md` — the file format under discussion
- Memory: `feedback_autonomous_doc_prs.md` (autonomous PR-creation pattern for followups)
- Jira project: `CREW` — but note the convention is user-level, not project-specific (Recipes has its own `docs/followups.md`)

**What's been considered:**

- **Add a `**Priority:** near-term | someday` line to the entry template.** Cheap. Doesn't solve the second concern (single surface), and "near-term" entries still bury in the chronological list without grouping.
- **Sub-section split**: add `## Near-term` and `## Long-tail` under `## Active`. Avoids new fields. Still doesn't integrate with Jira's prioritization.
- **One-way sync to Jira backlogs**: a `crew followups sync` CLI that reads `docs/followups.md`, creates Jira tickets for each `## Active` entry that doesn't already have a `**Ticket:**` link, parks them in the project's backlog. Followups still author in markdown (low friction); prioritization and resolution happen in Jira (high visibility). When a Jira ticket transitions to Done, the followup auto-moves to Resolved on next sync.
- **Followup-first vs ticket-first capture**: the value of the markdown file is the _thin-bullet capture moment_ — no auth, no project selection, no ADF authoring. Switching wholesale to "file a Jira ticket directly" loses that ergonomics. So the markdown stays as the capture surface; sync is what bridges to Jira.
- **Multi-repo concern**: a Crew-side observation about Recipes shouldn't auto-create a Jira ticket in CREW. Sync needs a per-entry "target project" hint (default = the repo's primary project). Adds a small field to the entry template.

**Shape of work:**

- ~1-2 hour design pass: settle the sync semantics (one-way? two-way? what's authoritative when they conflict?), the entry-template additions (priority, target project), the CLI surface.
- ~half-day implementation: `crew followups sync` command in `packages/cli/`, parser for `docs/followups.md`, Jira create/link via existing Rovo MCP path, dry-run mode, an update pass for `~/.claude/CLAUDE.md` to teach the new convention.
- ~half-day rollout: backfill existing `## Active` entries with priority + target project, do a first sync, validate the loop works on a sample item.

**Open questions:**

- Does the sync run automatically (cron, pre-`crew run` hook) or stay manual (`crew followups sync` on demand)? Manual is simpler but easy to forget; auto is invisible but rigs the workflow.
- When a Jira ticket is created from a followup, does the markdown entry stay in `## Active` (with a `**Ticket:**` line) until the Jira ticket resolves, or does it move to a new `## In Jira` section? The former matches current convention; the latter makes the sync state visible.
- What about followups in repos without a Jira project (e.g., user-level `~/.claude/` work)? Sync skips them, keeps them markdown-only.
- Should priority on the markdown side map directly to Jira priority field, or is it a separate "near-term-vs-not" signal that lives only in the followup convention?

### 2026-05-12 — Pill needs trailing-icon support (Filters chevron-down)

**What:** The `Pill` component set supports a leading `Icon` (BOOLEAN `Has Icon` + INSTANCE_SWAP `Icon`) but not a trailing icon. Two patterns in the current Crew screens use leading + trailing icons together: the "Filters" dropdown button (`lucide/filter` + `lucide/chevron-down`) and the docker URL chip (`docker` glyph + `lucide/arrow-up-right`). During the 2026-05-12 polish pass these were left as raw FRAMEs named "Filters (raw — pending trailing-icon Pill support)" and "CodeChip (raw — ...)" rather than being migrated to Pill instances.

**Why noticed:** Polish-pass audit of Dashboard Screens found 4 raw frames (2× Filters + 2× docker URL) that couldn't migrate. "Open as page" (single label + leading arrow) and "View PR" (label + arrow) were migrate-able by using a leading arrow icon — that convention worked. But a leading-icon-only Pill can't represent "filter dropdown" (where the chevron is the affordance for the dropdown, not decorative).

**Anchors:** Pill set node ID `272:120` in Figma file `9FeJPriqdsdA4n9R5Xsrr8`. Affected raw frames: `1:944` / `1:2115` (Filters), `1:807` / `1:1978` (docker URL — also blocked on mono font, see sibling followup).

**What's been considered:**

- Adding `Has Trailing Icon` (BOOLEAN) + `Trailing Icon` (INSTANCE_SWAP) to all 320 Pill variants. Cheap-ish but doubles the icon-related property surface.
- Building a separate `DropdownButton` composite that wraps Pill with a fixed trailing chevron. Cleaner role-based composite, but adds DS surface.

**Shape of work:** ~1 hour Figma plugin work to add 2 properties across 320 variants + add hidden trailing icon nodes. Or: ~30min to build DropdownButton wrapping Pill. The former generalizes better but the latter has clearer semantic intent.

**Open questions:** Is the trailing-icon use case ONLY dropdown chevrons, or do we want general-purpose trailing icons? If only chevrons, DropdownButton is right.

### 2026-05-12 — CodeChip composite for mono-font URL/path display (docker URL, worktree path)

**What:** The agent drawer + agent page show two "code-style" chips in the header — `~/code/kanban-api/.worktrees/KAN-23` (worktree path with a folder icon + git-branch suffix) and `docker http://localhost:7421` (URL with external-link icon). Both use **Fira Code mono font**, neither fits `Pill` (which is Hanken Grotesk Medium 14). The path chip also has a trailing git-branch icon, the docker chip has a trailing external icon — so both also hit the trailing-icon limitation (sibling followup).

**Why noticed:** Polish pass found `1:807` / `1:1978` (docker) as raw frames named "Link"; the worktree-path version (`1:822`-ish, didn't audit specifically) is similar shape. Renamed to "CodeChip (raw — pending mono-font Pill support)" so they're not flagged as Button.

**Anchors:** Frames `1:807`, `1:1978` in Figma file `9FeJPriqdsdA4n9R5Xsrr8`.

**What's been considered:**

- Add a `type=code-chip` variant to Pill with Fira Code Medium. Inconsistent — Pill is otherwise Hanken Grotesk.
- Build separate `CodeChip` composite with Fira Code + leading icon (Has Icon) + trailing icon (Has Trailing Icon). Mirrors the trailing-icon problem from the sibling followup.

**Shape of work:** Small — one composite, 4 variants (color × intensity, or just two for monochrome use). Pair with the trailing-icon work.

**Open questions:** Is mono treatment used anywhere else in the dashboard, or just these two header chips? Sample size of 2 is borderline for justifying its own composite.

### 2026-05-12 — Re-link 8 detached AgentRow tiles in modal-overlay screen backgrounds

**What:** The Project Page Delete/Edit modal-overlay screens (frames `18:2` and `23:2` in Figma file `9FeJPriqdsdA4n9R5Xsrr8`) show the project page in the background with the modal centered on top. The 4 AgentRow tiles in the background of each screen (8 total) are detached FRAMEs rather than `AgentRow` instances — likely a remnant of when those screens were duplicated from the live project page. Renamed to "AgentRow (detached)" during the 2026-05-12 polish pass so they're not flagged as raw "Button" frames in future audits.

**Why noticed:** Polish-pass audit flagged 8 frames of size `940×65` named "Button". On inspection they're agent-row tiles with the right structure (Background+Shadow + 4 Containers) but as detached FRAMEs. Converting them properly would require extracting per-tile agent data (name, state, meta) and applying as instance overrides — non-trivial.

**Anchors:** Tile IDs `18:62`, `18:98`, `18:139`, `18:174` (Delete modal screen) and `23:62`, `23:98`, `23:139`, `23:174` (Edit modal screen). AgentRow component set at `212:910`.

**What's been considered:** Just leaving them as detached frames is fine if those screens are only used as context-showing previews and never as live UI. If we ever code-implement these as overlay states, we'd want to delete the duplicated background entirely (the modal overlay screen would just be the modal itself, rendered on top of whatever route was previously visible — no background-rebuild needed).

**Shape of work:** Likely abandon — the modal-overlay screens may not need to exist as their own canvases at all if the design intent is just "Project page + Modal X overlaid". Worth a 5-min conversation before doing the conversion.

**Open questions:** Do these modal-overlay screens have downstream consumers (designer specs, prototyping flows) that depend on them existing as standalone frames? If not, prefer deleting them over fixing the backgrounds.

### 2026-05-12 — Explore intensity-axis for Button (parallels StateBadge muted/mid/loud)

**What:** Crew DS Button has 8 variants (default, destructive, danger, outline, secondary, ghost, link, warning) but each is a single visual treatment. StateBadge by contrast has an `intensity` VARIANT axis with 3 values (muted/mid/loud). User noticed that `warning` might benefit from an outline-style sibling treatment — same way `destructive` has its loud-solid version and `danger` is its quieter tinted+stroke counterpart. The pattern would extend: every "loud" colored button might want a "tinted" or "outline" sibling, mirroring StateBadge.

**Why noticed:** Mid-session during Phase 1 of the Button rollout Epic on 2026-05-12. After seeing the new `warning` variant rendered (golden yellow solid bg), user said "I wonder if we should have an outline version for that as well like error vs destructive — we might just end up with the same variants as we have for the pills in the end." Discussion explicitly deferred to keep the in-session Epic bounded.

**Anchors:**

- Crew DS Button COMPONENT_SET: `204:50` in file `DsA7QuEa2WthDATkksd1Bq`
- StateBadge intensity pattern: see [`project_crew_ds_palette_strategy`](https://github.com/Safturento/crew/) memory — muted/mid/loud × 7 states = 21 variants; canonical opacities are bg 10% + border 30% for `mid`
- The current pair pattern: `destructive` (loud solid red) ↔ `danger` (quiet tinted red with stroke)

**What's been considered:**

- **Per-variant pairs** (existing pattern). Repeat what we did for destructive/danger: add a `warning-quiet` (or similar) for every "loud" variant that needs a tinted sibling. Pro: matches what already exists. Con: variant count balloons (one new variant × 4 sizes per "loud" color).
- **Explicit `intensity` VARIANT axis** (StateBadge parallel). Single new axis on Button: `intensity = solid / tinted / outline`. Composable — every color gets every intensity. Con: naive expansion = 8 colors × 3 intensities × 4 sizes = 96 components (vs current 32). Better candidate for "only apply intensity to colored variants, not default/outline/ghost/link."
- **Only certain colors get sibling treatments.** Maybe `warning` is the only one that needs an outline sibling and the answer is just `warning-outline` as a one-off, like we did for destructive/danger.

**Shape of work:** Conversation first — settle which colors need intensity siblings and whether to refactor to a unified `intensity` axis. ~30–60 min spec discussion + 1–2 hours implementation depending on scope. Includes a possible token-naming alignment decision (do we adopt `state/X` semantic tokens to match StateBadge, or keep the `button/X-bg` namespace?).

**Open questions:**

- [ ] Unified `intensity` axis or stay with per-variant pairs?
- [ ] If pairs: which colors need siblings? (`warning` for sure; `secondary`/`ghost` don't seem to need it; `default` is already neutral.)
- [ ] Naming convention for siblings if going pairs-based.
- [ ] Whether to backport to the existing `destructive` ↔ `danger` (e.g., would they become `error-solid` / `error-outline` under a unified naming scheme?). Probably not worth the rename churn but worth flagging.

### 2026-05-11 — Crew DS components are partials of Dashboard Screens equivalents

**What:** Several Crew DS components are simpler skeletons than the rich equivalents drawn freehand in Crew Dashboard Screens. The Screens file currently renders agent rows, top-nav, project rows, etc. as hand-built compositions rather than instances of the DS components. The DS doesn't reflect what designers actually use on the page.

**Why noticed:** During the 2026-05-11 state-color migration cleanup, after publishing Crew DS updates and re-checking Screens. Specifically caught comparing DS `AgentRow` (`21:9` — 6 plain text columns) against the richer agent rows in Screens — they don't match in structure.

**Anchors:**

- Crew DS: `DsA7QuEa2WthDATkksd1Bq` — AgentRow `21:9`, TopNav `21:2`, ProjectRow `79:14`, AgentBody `24:2`, ProjectHeader `82:15`
- Crew Dashboard Screens: `9FeJPriqdsdA4n9R5Xsrr8` Page 1 — freehand compositions of the above

**What's been considered:** Two paths surfaced:

- **(a) DS as source of truth** — upgrade each partial DS component to match the rich Screens version, then replace each Screens hand-built composition with an instance. Cleanest long-term; bigger lift.
- **(b) Per-slice migration** — leave Screens freehand for now, convert specific compositions to DS instances when they're about to ship. Cheaper short-term, DS stays partial.

User picked **(a)**, to be tackled as a two-step process: phase 1 brings DS up to spec, phase 2 replaces Screens content with DS instances after republish.

**Shape of work:** Per component: inspect freehand Screens version → update DS component to match (auto-layout adjustments + child structure + new variant axes where the DS doesn't yet cover them) → republish DS → swap Screens content to instances. Start with the most-diverged component (AgentRow) and work down. Likely 4–6 separate component passes.

**Open questions:**

- Variant axes that don't yet exist in DS (e.g. AgentRow expanded vs collapsed) — decide as we encounter them.

### 2026-05-11 — Agent activity timeline + Bash event-tag components missing from Crew DS

**Re-audited 2026-05-13 (CREW-147):** Confirmed via `mcp__plugin_figma_figma__get_metadata` + `search_design_system` against `9FeJPriqdsdA4n9R5Xsrr8` that the Composites page (the only page in the file today) still has no `Timeline`, `EventCard`, `FilterChips`, `LiveModeToggle`, or `SearchBar` component. The CREW-147 spec called for `.figma.tsx` gap-fills on these five — they cannot be authored against a non-existent counterpart, so the gap-fill blocks on this followup. Same audit found no counterparts for `ColumnHeaderRow` / `ProjectsTable` either; those weren't expected to exist per the spec's audit-rather-than-author treatment.

**2026-05-16 (visual-fidelity close-out):** CREW-147 closed; its Timeline `.figma.tsx` criterion was retired as a false premise (no Timeline composites exist). When this followup's design work builds the Timeline composites, it must also author the `.figma.tsx` Code Connect files for each — that authoring is part of *this* followup's scope, not a separate ticket. Until then, `visual-fidelity-check` correctly degrades to "no Code Connect mapping" for Timeline components, which does not block the visual-fidelity workstream.

**Partially resolved 2026-05-12:** The **leaf event-tag pills** are now real components — the `TimelineTag` COMPONENT_SET (7 tool variants) was built in the Composites page of the consolidated Crew file and all 22 detached timeline pills swapped to instances. The **timeline container itself** (collapsible state-header + list-of-events composition wrapping each event row) remains a freehand structure on Dashboard Screens with no Crew DS counterpart — that part of the followup is still active. State-color bindings on the pills are now correctly routed through the localized `state/X` + `{color}-1050` vars; no orphaned references remain. See the now-resolved leaf-tag followup below for component details.

**What:** Crew Dashboard Screens has an "agent activity timeline" composition (collapsible state-header + list of tool-call events, each with a `Bash`-style event-type tag + command text + timestamp + token count) with no counterpart in Crew DS. The tag pills inside still reference the now-deleted `state/waiting` alias variable, leaving orphaned bindings that resolve to a fallback color but won't react to DS-level changes.

**Why noticed:** During the 2026-05-11 state-color migration audit, after deleting the `state/*` aliases. A grep for remaining references found the timeline's event-tag pills (e.g. `Bash` tag at nodes `1:982`/`1:996` in Screens) still bind to `state/waiting`. The `StateBadge` instance in the same section was already migrated; the inline tags were not. Points at a structural absence: the tags should be a DS component but aren't.

**Anchors:**

- Crew Dashboard Screens: `9FeJPriqdsdA4n9R5Xsrr8` — `VerticalBorder` timeline at `1:964`; event-tag rects at `1:982`/`1:983` and `1:996`/`1:997`
- Related: the 2026-05-10 followup "Build a `TimelineTag` component in Crew DS for tool-name pills" already flagged the leaf tag; this entry adds the container

**What's been considered:** The leaf-tag followup (2026-05-10) overlaps. New dimension is that the entire timeline container is also missing, not just the leaf. Both should be designed together so the tag's variants (Bash / Edit / Read / etc.) align with the container's use.

**Shape of work:** Design pass on timeline composition + leaf tag → add both to Crew DS (with tool-name variants on the tag) → migrate orphaned `state/waiting` bindings in Screens to the new tag's appropriate variant. Pairs with the partials-of-Screens followup above.

**Open questions:**

- Is the tag's color tied to "tool category" (Bash = warning amber, Read = neutral, Edit = info) or some other axis?
- Does the timeline container have intensity tiers (e.g. compact vs expanded)?

### 2026-05-11 — `idle` and `waiting` agent states not reachable from daemon fixtures

**What:** The dashboard's `AgentState` union has 7 values; `StateBadge` + `STATE_CLASSES` cover all 7. But the daemon's `deriveState` only produces 5 of them (`initializing`, `running`, `pr_open`, `error`, `finished`) from runs + tool_calls. `idle` and `waiting` come from explicit `state_transitions` rows that the dev seed never writes. Result: those two badges are typed and styled but can't be visually exercised in dev.

**Why noticed:** During the 2026-05-11 state-color migration verification, after extending `packages/daemon/seeds/dev.ts` to cover all daemon-producible states. The dashboard renders 5 states cleanly; the migration's correctness for `idle`/`waiting` is verified only via code paths, not visually.

**Anchors:**

- `packages/daemon/src/services/AgentsService.ts:328-336` — `deriveState` function returning the 5-state union
- `packages/daemon/src/services/AgentsService.ts:45-52` — `StateTransitionState` union that types all 7
- `packages/dashboard/src/data/state-meta.ts` — `STATE_CLASSES` covers all 7
- `packages/dashboard/src/components/StateBadge.tsx` — renders all 7

**What's been considered:** Two paths:

- **Showcase route** — `#/dev/badges` (or similar) renders all 21 StateBadge variants × intensities + CountBadge × 7 + AgentRow attention-tint examples statically. Independent of daemon state, gives fast visual QA. ~30 min.
- **Seed-level fix** — extend `dev.ts` to insert agents whose state arrives via `state_transitions` rows instead of being derived. Needs daemon-side understanding of when `idle`/`waiting` are emitted in prod. Larger scope.

Showcase route is the smaller, more honest scope; the seed path requires daemon-design clarity we don't have yet.

**Shape of work:** Either ~30 lines for the showcase route + a small `BadgeShowcase.tsx`, OR a daemon-side investigation + seed extension.

**Open questions:**

- Are `idle` and `waiting` ever expected to be the _current_ state of an agent (visible in the agents list) or only intermediate transitions visible in `StateHistoryBar`? If only transitions, the showcase route is sufficient.

### 2026-05-10 — Wire dashboard QuickAction buttons (Resume / Finish / Inspect / Provide input) to daemon endpoints

**What:** CREW-119 landed the v2 quick-action buttons in the agents list (`Resume + Finish` for `idle`, `Provide input` for `waiting`, `View PR + Finish` for `pr_open`, `Inspect` for `error`). The buttons fire an `onAction(kind, agent)` callback up through `AgentRow → ProjectSection → AgentsList`, but `App.tsx` currently does **not** mount a handler — clicks no-op. The visual contract is shipped; the functional contract is not. Each action needs a daemon endpoint and a mutation hook that the App-level handler dispatches.

**Why noticed:** CREW-119 autonomous run on 2026-05-10. The original CREW-119 ticket scope was "visual fidelity sweep" — landing functional behavior for brand-new actions like `Resume` was out of scope (the daemon has no resume endpoint today), but landing the buttons visually wasn't. Splitting this off keeps the two concerns reviewable separately.

**Anchors:**

- `packages/dashboard/src/components/AgentRow.tsx` — exports `QuickActionKind` (`resume | finish | view-pr | provide-input | inspect`)
- `packages/dashboard/src/App.tsx` — `<AgentsList … />` mount; add an `onAgentAction` prop that dispatches via `client.<verb>(agentKey)` for each kind
- `packages/daemon/src/routes/` — needs new endpoints (`POST /agents/:key/resume`, `/finish`, `/inspect`, `/answer`) before the dashboard handler can land
- `bruno/endpoints/agents/` — would gain four new `.bru` files

**What's been considered:**

- **Wire up incrementally as endpoints land.** Start with `finish` (closest to existing transcript completion), then `provide-input` (already partially supported by the answer flow), then `resume` and `inspect` (new daemon work).
- **Single `POST /agents/:key/action { kind }` endpoint** vs verb-per-action. Verb-per-action mirrors REST norms and pairs cleanly with the existing `/agents/:key/finish` path; a single dispatcher would centralize permissions but loses semantic clarity in logs.
- **Route through `useMutation` from TanStack Query** rather than imperative client calls so optimistic updates + invalidation are uniform with the existing list query.

**Visual styling consistency note (added 2026-05-10):** the `Inspect` button on the latency row in frame `1:2` currently renders as a solid red bg with dark text — html.to.design captured it as a destructive-tinted action button but the styling drifted from the canonical pill pattern during the migration. When this ticket lands the dashboard handler, also pick a button styling pattern that's consistent with the StateBadge tinted-bg approach (tinted error bg + bright error text/border) OR explicitly decide it should be a solid destructive shadcn `Button` variant. The current state is neither.

**Shape of work:** Likely two tickets — one daemon-side (add the four endpoints + matching `.bru` files) and one dashboard-side (mount `onAgentAction` in `App.tsx`, wire each kind through TanStack `useMutation`, surface success/error toasts). Both can run in parallel after the endpoint contracts are settled.

**Open questions:**

- [ ] Does `inspect` need its own daemon-side action or is "open the agent drawer focused on the error transcript" enough? The v2 design hand-off doesn't specify.
- [ ] Should `resume` from `idle` reuse the `crew run` codepath or be a separate "rehydrate" verb?

### 2026-05-10 — Polish the CREW-119/CREW-117 Crew DS composites (skeleton-fidelity → pixel-fidelity)

**What:** CREW-119 + CREW-117 built ten Crew DS composites on the Composites page in `DsA7QuEa2WthDATkksd1Bq` at **skeleton fidelity** — names, semantic-token bindings (where applicable), and slot structure are correct, but the visual treatment is intentionally minimal. `BrandMark` and `StateBadge` are now pixel-fidel after the 2026-05-10 frame migration polish (StateBadge canonical pattern documented in `docs/plans/design-system.md`). The other composites are placeholder boxes with sample text. They need a designer pass — type ramps tightened, padding/gap bound to Core `tw/space`, hover/focus states added (where applicable), variant axes grown (`AgentRow.state`, `TopNav.route`, `ProjectSection.expanded`).

**Specific known defect — AgentBody embeds a hardcoded state pill:** during the 2026-05-10 frame-migration session the user noticed `AgentBody` (`24:2`) renders its state pill as a solid color block even after StateBadge was polished. Root cause: AgentBody was built with a hand-rolled ellipse + text rather than composing a real `StateBadge` instance, so it can't pick up StateBadge's future updates. Fix during the polish pass: rebuild AgentBody's pill slot as an actual `StateBadge` instance (matching whichever state the embedded sample uses). **Sub-issue resolved 2026-05-12:** verified during the in-session DS consolidation that AgentBody's metadata row's pill node (now `220:233` in file `9FeJPriqdsdA4n9R5Xsrr8`) is a real `StateBadge` INSTANCE, not a hand-rolled ellipse — the broader composite polish (Timeline placeholder buildout, action-row buttons) remains active under this followup.

**Why noticed:** CREW-119 + CREW-117 autonomous runs on 2026-05-10 — the Crew DS build-out was descoped from pixel-perfect to skeleton fidelity to keep the runs' scopes reasonable (the original tickets' goals were the visual fidelity sweep on the dashboard side, which landed in code). The AgentBody-specific defect surfaced 2026-05-10 mid-day during the manual frame-migration session that resolved the migration followup below this one.

**Anchors:**

- Crew DS file: `https://www.figma.com/design/DsA7QuEa2WthDATkksd1Bq` — `Composites` page
- Component node IDs: `BrandMark=19:3`, `StateBadge=20:23`, `TopNav=21:2`, `AgentRow=21:9`, `ProjectSection=21:21`, `AgentsList=21:25`, `AgentBody=24:2`, `StateHistoryBar=25:4`, `TokenTable=26:4`, `ViewportFrame=27:4`
- Dashboard CVA configs (the source of truth for variant axes): `packages/dashboard/src/components/{AgentRow,StateBadge,TopNav,ProjectSection,AgentBody,StateHistoryBar,TokenTable,ViewportFrame}.tsx`
- `docs/plans/design-system.md` — Component inventory + new "StateBadge visual pattern (canonical)" section describing the tinted-bg + bright-border-text-dot pattern other composites should mirror

**What's been considered:**

- **Build-out continues during the next fidelity ticket** that touches one of these surfaces — same vertical-slice strategy. Probably the right move: the Crew DS gets components polished only when there's a real demand, avoiding speculative design work.
- **One-shot designer pass** to polish all six at once. Good-faith effort but loses the just-in-time signal that drives the rest of Phase 4.

**Shape of work:** Likely folded into individual fidelity tickets as they arise (e.g. a future "Projects List fidelity" ticket would polish `TopNav` because that surface uses it). No standalone ticket needed unless the user wants to schedule a dedicated polish pass.

### 2026-05-09 — Crew Dashboard Screens — bind hardcoded fills to Crew DS semantic variables

**What:** All 11 frames in the Crew Dashboard Screens file (`9FeJPriqdsdA4n9R5Xsrr8`) currently render with hardcoded hex fills/strokes — zero existing variable bindings on any of the ~3,810 nodes. To make canvas-level mode toggling work and to let downstream design fidelity tickets cite specific tokens, every fill/stroke/effect color needs to be bound to the corresponding `Crew / Semantic Colors` variable.

**Why noticed:** CREW-126 autonomous run on 2026-05-09. The Phase 3 plan asked an agent to script color bindings via use_figma, but inspection found 2,400+ fill-bearing nodes (FRAMEs + RECTANGLEs) with hundreds of unique hex colors. Mapping hex → semantic token (`Crew/background` vs `Crew/card` vs `Crew/border` vs etc.) requires designer judgment per element — heuristic classification by lightness/hue would either over-merge (collapse intentionally-different shades into one token) or mis-classify (e.g. read a gray border as `muted-foreground` text). Doing this in an autonomous run risks visually-broken screens. Deferred to designer-led work.

**Anchors:**

- [CREW-126](https://safturento.atlassian.net/browse/CREW-126) — the ticket where this scope reduction was decided
- Figma screens file: `https://www.figma.com/design/9FeJPriqdsdA4n9R5Xsrr8`
- `docs/plans/design-system.md` — `Crew / Semantic Colors` collection lists the 36 COLOR + 12 FLOAT tokens to bind to
- The 11 top-level frame node IDs are listed in the CREW-126 ticket file (`docs/tickets/CREW-126.md`)

**What's been considered:**

- **Heuristic auto-binding** by OKLCH lightness + hue. Rejected for an autonomous run — the dashboard's dark theme uses many close shades of slate (slate-900, slate-950, slate-800, etc.) that map to _different_ semantic tokens (`background` vs `card` vs `popover`), and a heuristic can't tell them apart from the hex alone.
- **Per-frame designer pass.** Open each frame in Figma desktop, walk the layer tree, manually bind each fill via the picker. Slow but correct. Likely 1-2h per frame × 11 frames.
- **Hybrid: agent-prepared candidate map + designer review.** Agent reports unique hex values per frame and proposes a binding for each (high-confidence ones get auto-applied, ambiguous ones flagged for human review). Cuts manual work but still needs a human in the loop.

**Shape of work:** One ticket per frame (11 tickets), or one ticket per logical group (e.g. "list pages — Agents / Projects" / "detail pages — Agent / Project" / "modals"). Designer-led; agent assists with bulk binding scripts once the hex→token map is decided. Should be sequenced after the composite-rebuild followup below so the bindings flow through the new instances.

**Open questions:**

- [ ] Decide grouping (per-frame vs per-section tickets).
- [ ] Define a hex→token map for the dashboard's actual palette (probably 15-25 unique tokens once consolidated).
- [ ] Decide whether to also bind padding/gap/radius FLOAT variables in the same pass, or defer those to a separate ticket. The Crew DS only exposes `radius-*`, `stroke-width`, and `border-width` from the Core `mode` collection — most spacing values stay hardcoded for now.

### 2026-05-09 — Crew Dashboard Screens — rebuild ad-hoc modals + detached primitives as Crew DS instances

**Partially resolved 2026-05-12:** The detached-primitive portion in the Projects view (`1:2334`) and Project detail (`1:2443`) frames was completed during the in-session Button rollout Epic. Specifically: project rows → `ProjectRow` instances; count badges → `CountBadge` instances; project header + config block → `ProjectHeader` + `ProjectConfigBlock` instances; the 4 detached agent rows in `1:2443` → `AgentRow` instances with state + text overrides; redundant agents-section header removed. **What remains:** the 3 ad-hoc modals (`9:2`, `18:2`, `23:2`) still need to be rebuilt, and that work is blocked on a Crew DS `Modal`/`Dialog` composite which doesn't exist yet (the Modal composite is a separate forward-path Epic per `docs/superpowers/specs/2026-05-11-button-system-rollout-design.md`).

**What:** The 3 ad-hoc modals (`New Run modal - 3. Confirm`, `Project Page - Edit project modal`, `Project Page - Delete confirmation modal`) plus all detached primitive structures across the other 8 imported frames (e.g. `Background+Border+Shadow` frames acting as buttons, `Container+Border` frames acting as cards) need to be replaced with real component instances. The CREW-126 plan called for "Crew DS Modal/Dialog/Form" instances, but Crew DS currently has zero composite components — Phase 4 of the design system epic adds those incrementally.

**Why noticed:** CREW-126 autonomous run on 2026-05-09. The plan assumed Crew DS composites existed by Phase 3, but `docs/plans/design-system.md` confirms Crew DS is a "thin override layer over Core … one variable collection and zero components." Core's shadcn-kit components (Button, Dialog, Alert dialog) are searchable from the screens file but Core is not formally added as a library to the screens file — only Crew DS is — so Core component instantiation may not work even if attempted, and even if it did, the Phase 4 plan calls for _Crew DS_ composites (with Crew branding) not raw Core primitives.

**Anchors:**

- [CREW-126](https://safturento.atlassian.net/browse/CREW-126), [CREW-120](https://safturento.atlassian.net/browse/CREW-120) (Epic) — original scope
- `docs/plans/design-system.md` — confirms Crew DS has zero composites and the Phase 4 plan
- `docs/superpowers/plans/2026-05-09-design-system-bootstrap-phases-1-3.md` — Tasks 3.2-3.10 describe the swap work
- 3 ad-hoc modal frame IDs: `9:2`, `18:2`, `23:2` (in screens file `9FeJPriqdsdA4n9R5Xsrr8`)

**What's been considered:**

- **Wait for Phase 4.** Crew DS gets composites (AgentRow, ProjectSection, Modal/Dialog/Form wrappers, etc.) in Phase 4 fidelity tickets. Easiest correctness story: build the composites first, then swap.
- **Use Core's shadcn primitives directly.** Add `Core Design System` as a library to the screens file (manual step in Figma desktop), then swap to raw Core components. Lower fidelity (no Crew branding) but unblocks earlier.
- **Mixed approach.** Use Core primitives for the obvious atomic swaps (Button, Input, Badge), defer composites (Modal/Dialog/Form layouts) to Phase 4.

**Shape of work:** Almost certainly multiple tickets — one per frame is too granular; one for "all modals" + one per page-screen group (lists / details / forms) is probably right. Sequence after Phase 4 starts shipping composites unless the team picks the "use Core directly" option.

**Open questions:**

- [ ] Pick approach (wait for Phase 4 / use Core / mixed).
- [ ] If using Core: who adds it as a library to the screens file, and when?
- [ ] How are the 3 ad-hoc modals' content layouts captured before deletion (they were built ad-hoc in an earlier session — screenshots exist on the canvas but not in the repo)?

### 2026-05-09 — Manual rename of Figma screens file to "Crew Dashboard Screens"

**What:** The Figma screens file (`9FeJPriqdsdA4n9R5Xsrr8`) is currently named "Document". Phase 3 calls for renaming it to "Crew Dashboard Screens" so it's identifiable in the file browser and matches the convention set by Core/Crew Design System. The Figma Plugin API does not expose a setter for `figma.root.name` — `set_name` returns "Setting the document name is currently not supported" — so this can only be done through the Figma desktop UI by clicking the title at the top of the file.

**Why noticed:** CREW-126 autonomous run on 2026-05-09. The agent attempted the rename via Plugin API and confirmed the API rejects it; the file URL slug ("Untitled") and current display name ("Document") both differ from the target.

**Anchors:**

- Figma screens file: `https://www.figma.com/design/9FeJPriqdsdA4n9R5Xsrr8`
- `docs/plans/design-system.md` — `screens_file_url` frontmatter (slug-portion of URL doesn't change with rename, so the URL stays valid)

**Shape of work:** One-time manual action by user. Open the file in Figma desktop, click the title at the top-left, type "Crew Dashboard Screens", press Enter. No code or ticket needed; just close this followup once done.

### 2026-05-08 — Tool-name filtering in the timeline Filters dropdown

**What:** Today's drawer timeline lets users filter by event _type_ (Tool calls / Assistant prose / Thinking / System / Hooks & skills / Other). It doesn't let them filter by _tool name_ (Bash / Read / Grep / Edit / etc.). Once a long-running agent racks up 800+ tool calls, "show me only the Bash invocations" becomes a useful triage gesture. Add a tool-name section inside the Filters dropdown built by CREW-118.

**Why noticed:** 2026-05-08 triage of the chip→dropdown redesign. We agreed to keep the initial dropdown scoped to event-type filtering only — tool-name filtering has its own UX problems (long, dynamic list of tools per agent; needs ordering / search inside the popover; user might want to filter by "fewest" vs "most" used) that deserve a designer pass of their own. Captured here so it doesn't evaporate.

**Anchors:**

- [CREW-118](https://safturento.atlassian.net/browse/CREW-118) — the dropdown ticket this would extend
- `docs/designs/design_handoff_crew_dashboard/` — design hand-off; would need an additional update for this layer
- `packages/dashboard/src/components/FilterChips.tsx` (today) / Filters dropdown (post-CREW-118) — host component
- The set of tool names is dynamic (varies per-agent based on what the agent actually invoked) — needs to read from the timeline event stream rather than a hardcoded list

**What's been considered:**

- **Sub-section in the same dropdown.** Type checkboxes on top, tool-name checkboxes below, separated by a divider. Densifies the popover but keeps everything in one place. Risk: long tool lists (12+ entries on a busy agent) make the popover scroll.
- **Separate "Tools" dropdown.** Two buttons in the row: `[Filters ▾]  [Tools ▾]`. Cleaner per-section UX, but eats more horizontal space — fights the original motivation for consolidating the chip row.
- **Search-inside-the-popover.** Type checkboxes always visible at top; tool-name section below with a small filter input that narrows the visible checkboxes. Scales to long lists.

Lean toward search-inside-popover when this iteration ships. Worth re-asking the designer at design time.

**Shape of work:** One ticket, dependent on CREW-118 landing first. Designer hand-off update for the new section, then implementation extends the dropdown's checkbox model with a tool-name list source (derived from the agent's timeline events). Persistence shape extends the same localStorage key.

**Open questions:**

- Should tool-name filters compose with type filters (AND), or be an alternative axis (OR)? Probably AND — `Filters {Tool calls} ∩ Tools {Bash}` reads as "only Bash tool-call cards." User can verify when it lands.
- Are there tool aliases worth normalizing (e.g. `mcp__atlassian__jira_get_issue` → `Jira: get_issue`)? Or do we surface raw tool names? Raw is simplest; readability worsens.
- Does the count next to each tool name want to be live-updating as new events stream in, or fixed at popover-open time? Fixed is much cheaper — recompute on each open.

### 2026-05-08 — Slice 1c shipped without citing the design hand-off (visual drift)

**What:** Slice 1c (CREW-94) shipped without citing the visual hand-off at `docs/designs/design_handoff_crew_dashboard/`. The dashboard _foundation_ plan (CREW-15-era) had correctly established the convention — README.md is the visual contract, `source/*.jsx` is reference-only and not for verbatim copy — but the slice-1c spec, plan, and per-component tickets (CREW-104, CREW-105, CREW-106, CREW-109) made no reference to either. Result: TokenTable + StateHistoryBar built but unmounted, Timeline rendered as a flat tool-call list rather than the state-segment-grouped event cards the hand-off specifies, and the drawer header used a different information layout than the design. CREW-117 is the fidelity-sweep ticket closing the gap; this followup preserves the lesson so the next planner sees it before authoring the next slice.

**Why noticed:** 2026-05-08 conversation comparing live dashboard screenshots against the claude.ai/design output that informed the hand-off folder. User's framing: "the implementation is way off from the design spec visually... maybe we didn't include the design spec as a part of the planning in a rigorous enough way." A grep across the slice-1c spec/plan/tickets confirmed zero references to `design_handoff_crew_dashboard/` — the visual contract was never in scope.

**Anchors:**

- `docs/designs/design_handoff_crew_dashboard/README.md` — visual contract that was overlooked
- `docs/designs/design_handoff_crew_dashboard/source/agent-drawer.jsx` — reference implementation
- `docs/superpowers/specs/2026-05-05-slice-1c-agent-drawer-and-push-updates-design.md` — slice spec (zero hand-off references)
- `docs/superpowers/plans/2026-05-05-slice-1c-agent-drawer-and-push-updates.md` — slice plan (zero hand-off references)
- `docs/superpowers/plans/2026-04-26-dashboard-foundation-and-agents-list.md` — foundation plan that DID cite the hand-off correctly (the convention to mirror)
- [CREW-117](https://safturento.atlassian.net/browse/CREW-117) — fidelity-sweep ticket
- `~/.claude/conventions/documentation.md` — user-level convention updated 2026-05-08 to require hand-off citations

**What's been considered:** The lesson translates into two complementary actions, both happening alongside CREW-117:

- **Convention update** at `~/.claude/conventions/documentation.md` — when a `docs/designs/<topic>/` folder exists with a README + reference source, plans for surfaces it covers MUST cite it inline; per-component implementation tickets MUST link to the relevant section. Reference source is "ground truth, not verbatim."
- **Project followup** (this entry) — captures the project-scoped record of where the drift happened, which slices/tickets contained the gap, and what was done about it. The convention update prevents recurrence generically; this followup is the recoverable record for crew specifically.

**Shape of work:** No code work — process artifact. The convention update lands at user level; this followup is the project-scoped index entry. Resolution gated on CREW-117 landing AND the convention edit being durable in `~/.claude/conventions/documentation.md`.

**Open questions:**

- Does the design hand-off itself need a refresh? The README is dated 2026-04-26; data-model details (e.g. state names, runs schema, attention semantics) may have drifted relative to the dashboard's current shape. Worth a quick audit when CREW-117 starts so the implementer doesn't faithfully replicate something stale.
- Should the convention also require generic spec→plan→ticket citation chains? Probably overkill — the hand-off case is specific because it's a _visual contract_ that's easy to silently miss in textual specs; other cross-doc citations are already covered by existing planning skills.

### 2026-05-08 — Surface `crew finish` step results in the dashboard

**What:** `crew finish` from the CLI prints a structured checklist as it runs — `step()` (`packages/cli/src/commands/finish.ts:120-132`) wraps each cleanup operation (docker compose down, worktree remove, branch delete, fetch prune, jira transition, /tmp log cleanup) and emits a green ✓ on success or yellow ! on skip/warn. None of this flows to the daemon. Once finish lands, the dashboard's only signal is the agent's terminal state — there's no record of which steps succeeded, which were skipped (e.g. "worktree not registered"), or what failed and why. The drawer should expose a per-step checklist with the same success/skip/error semantics, so the dashboard is sufficient for reviewing a finish run end-to-end without falling back to terminal scrollback.

**Why noticed:** 2026-05-08 conversation triaging finish-related bugs in CREW-94. While walking through the comment "finish runs have no transcript by design" (see CREW-116's root cause #3), the user pointed out that finish _does_ have an observable surface — the CLI's structured output — it just isn't piped through the daemon. Pairs with CREW-116: that ticket fixes "the finished state shows up correctly," this followup is "the finish step _results_ show up correctly, including any errors."

**Anchors:**

- `packages/cli/src/commands/finish.ts:120-132` — `step()` helper, the natural emit point for per-step events
- `packages/cli/src/commands/finish.ts:226-235, 301-315` — current daemon parity (registerRun + completeRun only)
- `packages/daemon/src/services/EventBus.ts` — natural place to publish per-step events on the SSE firehose
- `packages/dashboard/src/components/AgentBody.tsx` — where step results would render in the drawer
- `packages/shared/src/transcripts/` — schema would land here if finish steps are modeled as a new event type
- [CREW-116](https://safturento.atlassian.net/browse/CREW-116) — prerequisite bug-fix ticket (finish runs need to be correctly modeled in state derivation before adding more surface to them)

**What's been considered:**

- **Per-step SSE events.** New `finish-step` event type in `crew-shared` with `{ runId, step, status, message? }`. CLI emits via the existing daemon HTTP client (new `daemonClient.recordFinishStep(runId, ...)` method); daemon publishes to EventBus → dashboard subscribes via slice-1c's `CrewEventStream`. Live-updating checklist as finish runs. Most consistent with the rest of slice 1c.
- **Per-step rows in a new `finish_steps` table.** CLI POSTs each step result to a new endpoint; daemon writes a row; drawer queries at open time. Simpler — no new event type, no SSE work. Doesn't stream live, but finish completes in tens of seconds so this is probably acceptable.
- **Bundled completion payload.** CLI accumulates results, sends all at once when calling `completeRun`. Cheapest. Live-progress experience is lost; if finish hangs mid-step (e.g. `git push origin --delete` waits on auth), the dashboard sees nothing until completion or timeout.

The SSE shape feels right — it matches slice 1c's "live updates" feel and gives the user real-time visibility into a process that _can_ fail mid-way (auth hangs, jira 403s, docker daemon errors).

**Shape of work:** One ticket, depends on CREW-116 so finish runs are correctly modeled before adding more surface. Author the new event type in `crew-shared`, add a daemon endpoint for per-step submission (or extend the existing run-update endpoint), emit from `finish.ts`'s `step()` helper, render in the drawer alongside (or above) the timeline. Producer/consumer are tightly coupled, so single ticket.

**Open questions:**

- Drawer layout: inline (between StateHistoryBar and Timeline) vs dedicated panel? Inline matches "everything important in the drawer's central column"; finish has at most ~6 steps so length isn't a problem.
- Pre-existing finish runs in the DB will have no step data. Backfill is impossible (the CLI output is gone). Drawer should render nothing rather than an empty state.
- Distinguish skip vs error in the schema. The CLI uses `warn()` for both ("worktree not registered" = benign skip; "docker compose down: connection refused" = error). The daemon-side schema should have three states (success/skip/error) even though the CLI today only emits two — lets the producer side tighten up later without a schema migration.

### 2026-05-08 — Wire `StateHistoryBar` and `TokenTable` into `AgentBody` alongside the timeline

**What:** CREW-109 wired `<Timeline>` into `packages/dashboard/src/components/AgentBody.tsx` (replacing the `agent-body-placeholder` div) so the e2e timeline scenarios could pass. The original placeholder copy promised "Timeline, state history, and token table" — the latter two (`<StateHistoryBar>`, `<TokenTable>`) ship in CREW-104 but are still unmounted. The drawer is functional today, but the spec §5a/§5b composition isn't complete.

> **Update 2026-05-10:** CREW-117's ticket scope was expanded to a vertical-slice bundle (Crew DS composites + dashboard refactor + Figma frame migration + visual fidelity sweep) per `docs/superpowers/specs/2026-05-10-fidelity-vertical-slices-design.md`. The Definition of Done in the Jira ticket no longer covers this composition — CREW-117's autonomous run lands the 4 Crew DS composites (`AgentBody`, `StateHistoryBar`, `TokenTable`, `ViewportFrame`) and the dashboard refactor, but does NOT mount StateHistoryBar/TokenTable in AgentBody (the open questions below are still unresolved, and TokenTable's per-tool token data isn't exposed by the daemon today). Re-target this followup to a fresh ticket once the open questions are settled.

**Why noticed:** While reading the slice 1c plan (`docs/superpowers/plans/2026-05-05-slice-1c-agent-drawer-and-push-updates.md`), I noticed that no plan task actually composes Tasks 20 (TokenTable) and 21 (StateHistoryBar) into AgentBody — the plan jumped straight from building the components (Tasks 20–28) to the E2E scenarios (Task 30) that test only the timeline portion. CREW-J / CREW-104's ticket file likewise mentions integration as deliberately out of scope.

**Anchors:**

- `packages/dashboard/src/components/AgentBody.tsx` — currently renders only `<Timeline>` under the header
- `packages/dashboard/src/components/StateHistoryBar.tsx`, `packages/dashboard/src/components/TokenTable.tsx` — built but unmounted
- `docs/superpowers/specs/2026-05-05-slice-1c-agent-drawer-and-push-updates-design.md` §5a/§5b — composition contract
- Slice 1c Epic: [CREW-94](https://safturento.atlassian.net/browse/CREW-94)

**What's been considered:** Doing the full integration inside CREW-109 would have grown a "test ticket" into a layout/composition decision touching token-table sort + state-history scroll-to-timestamp wiring (StateHistoryBar's `onScrollTo(ts)` needs a Timeline scroll target). Keeping CREW-109 narrow ships the e2e coverage that gates the rest of the slice without locking in a layout that hasn't been visually reviewed.

**Shape of work:** One ticket under CREW-94. Expect two-pane layout (token-table sidebar + main timeline) plus a state-history strip above the timeline, with `StateHistoryBar.onScrollTo` wired into Timeline's virtualizer (`scrollToIndex` by ts → event index lookup). Add a unit test asserting the new composition; existing AgentDrawer/AgentFullPage unit tests will need their `getTimeline` mocks extended with `getStateHistory` + token data.

**Open questions:**

- Where does TokenTable sit on narrow drawer widths? (collapsible side panel vs always-stacked.)
- Does `onScrollTo(ts)` need new public Timeline API, or piggyback on an existing imperative handle?
- TokenTable's `rows: { tool, tokens }[]` data isn't exposed by the daemon — the `AgentDetailTokens` shape only has `total/input/output/cache_read/cache_creation` (no per-tool aggregation). Either add a daemon endpoint or compute client-side from transcript events.

### 2026-05-07 — Port allocator detects collisions only at `docker compose up` time, not at allocation time

**What:** `allocatePort(basename, varName)` (`packages/cli/src/lib/env-spec/allocate-port.ts:19`) is a deterministic `md5(basename::varName) % 16383` mapping into `[16384, 32767]`. There's no collision detection — the function returns a port whether or not it's free on the host or already claimed by another worktree's `.env`. Failures surface only when `docker compose up --wait` tries to bind the port and gets `EADDRINUSE`. Hash collisions are rare per project (~1/32k per varName pair) but real; cross-worktree collisions on the same host are the more common case (two worktrees of the same project will trivially share ports because basename + varName matches). Host-service collisions (e.g., a local Postgres on 5432-mapped port) are also caught only at compose-up time.

**Why noticed:** Surfaced 2026-05-07 during the failure-mode walkthrough for the "defer fix-pr env prep to the agent" spec ([`docs/superpowers/specs/2026-05-07-fix-pr-defer-env-prep-to-agent-design.md`](superpowers/specs/2026-05-07-fix-pr-defer-env-prep-to-agent-design.md), §4). After that change ships, port-collision failures move from the wrapper's pre-spawn `ensureStackRunning` into the agent's Step 0.5 `docker compose up --build --wait`. The agent will abort + document per the new preamble, but that's a wasted session round-trip when the collision is detectable at port-allocation time (i.e., before the agent even spawns).

**Anchors:**

- `packages/cli/src/lib/env-spec/allocate-port.ts:19-23` — the no-detection allocator
- `packages/cli/src/lib/env-spec/materialize.ts` — the writer that calls `allocatePort` and lays the result into `.env`
- `packages/cli/src/lib/docker/ensure-stack-running.ts` — where `EADDRINUSE` actually surfaces today
- `packages/cli/src/commands/docker-env.ts` — the `crew docker-env` command that materializes `.env`

**What's been considered:**

- **Allocate-time host-port probe.** After computing the candidate port, attempt a `net.createServer().listen(port)` on `127.0.0.1`; if it binds, the port is free; close and persist. If it fails with `EADDRINUSE`, fall through to a deterministic-rehash strategy (`md5(basename::varName::saltN)` for increasing N). Pro: catches all real-world cases, including unrelated host services. Con: introduces non-determinism in the port number when the original collides — `.env` is no longer a pure function of (basename, varName). Acceptable because the `.env` is per-worktree and committed only locally.
- **Cross-worktree allocation registry.** A user-level file (e.g., `~/.crew/port-registry.toml`) that records `(basename, varName) → port` and detects allocations against it. Pro: catches cross-worktree collisions even when neither stack is running. Con: more state to manage; needs cleanup on worktree removal.
- **Drop-in solution: a small `find-free-port` library** (`get-port`, `portfinder`). Loses determinism entirely — port is whatever's free at allocation time. Probably overkill given the deterministic-rehash variant exists.

Lean toward the allocate-time probe + deterministic-rehash. The registry adds operational complexity without much marginal value once the probe catches the immediate collision.

**Shape of work:** One ticket. ~50 lines + tests in `allocate-port.ts`. Materialize call site stays the same shape. Worth verifying behavior on macOS / WSL where loopback semantics differ slightly (test the probe against `127.0.0.1` not `0.0.0.0` to match docker's per-port binding pattern).

**Open questions:**

- Should the rehash salt be persisted (so subsequent `crew docker-env` runs reproduce the same port even if the original is briefly free), or recomputed each time? Persistence keeps `.env` stable across re-materializations; recomputation simplifies the algorithm. Probably persist — `.env` regeneration shouldn't churn ports.

### 2026-05-05 — Per-ticket model selection (use Sonnet for trivial work to save tokens)

**What:** `crew run` / `fix-pr` / `finish` invoke `claude` without a `--model` flag (`packages/cli/src/lib/claude/spawn.ts:34,67`), so every dispatched agent inherits the user's local Claude Code default — currently Opus 4.7. There's no per-ticket, per-command, or per-project mechanism to downshift to Sonnet for tasks where Opus's reasoning depth is overkill (typo fixes, mechanical refactors, dependency bumps, doc-only edits, follow-up cleanup tickets). At single-agent scale this doesn't matter; at parallel-dispatch scale (multiple agents in flight simultaneously across a Max plan's 5-hour window), Opus-for-everything will be the dominant cost driver.

**Why noticed:** User on the Claude Max 20x plan, watching CREW-95 burn 1.5M tokens on its own. Has not yet hit the plan ceiling (peak observed: ~60% of the 5-hour window) but flagged that as parallelism scales the optimization becomes worthwhile. Surfaced 2026-05-05 during slice 1c brainstorming.

**Anchors:**

- `packages/cli/src/lib/claude/spawn.ts:34,67` — `spawnClaudeResume` and `spawnClaudeFresh`, both pass a fixed args array with no `--model`
- `packages/cli/src/commands/run.ts`, `fix-pr.ts`, `finish.ts` — the three dispatch sites
- `packages/shared/src/projects/` (or wherever the project TOML schema lives) — natural home for a `default_model` config knob
- Anthropic model IDs as of 2026-05: `claude-opus-4-7`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`

**What's been considered:**

- **CLI flag:** `crew run --model sonnet KAN-1`. Lowest-friction; single addition to argv parsing + spawn args. Fully manual — user has to know in advance the task is trivial.
- **Project-config knob:** `default_model = "sonnet"` in the project TOML. Useful when a whole project's tickets skew trivial (e.g., a docs site).
- **Jira label-driven:** dispatch reads the ticket's labels; if `model:sonnet` (or a `chore`/`trivial` label), downshifts. More automation, more inference.
- **Auto-classification by Claude:** ask Sonnet to read the ticket and decide. Self-fulfilling token cost — defeats the optimization unless cached.

The CLI flag + project-config knob feel like the right v1 — both manual, both surfaceable. Jira-label-driven is a nice v2 once the v1 dial exists. Auto-classification probably never earns its keep.

**Shape of work:** Two small PRs.

- (1) `--model <name>` flag on `crew run` / `fix-pr` / `finish`. Threads through to spawn args. Validates against a known list. ~30 lines + tests.
- (2) `default_model` in project TOML, read by the same threading. Resolution order: CLI flag → project config → built-in default (Opus).

**Open questions:**

- Should the dashboard surface which model an agent ran under? (Likely yes — relevant for cost analysis. Trivial ticket since the daemon already records token totals; just persist the model name on `runs` and render it in the agent header.)
- Does crew also need to pass `--model` to subagent dispatches the parent agent makes (Task tool)? Probably not — that's Claude's internal call. But worth verifying.
- When does Haiku 4.5 enter the picture? Possibly for the most trivial work (docs-only PRs, lint-fix tickets) once model-selection plumbing exists.

### 2026-05-05 — Dashboard silently drops agents whose project isn't in `/api/projects`

**What:** `packages/dashboard/src/components/AgentsList.tsx:21-22` filters projects by `byProject.has(p.name)` and only renders sections for projects returned by `/api/projects`. An agent whose `projectName` field doesn't match any registered project disappears from the UI entirely — no warning, no fallback bucket, no clue why nothing rendered. The companion compose-mount bug (the daemon container had no bind-mount for `~/.config/crew/projects/`, so `/api/projects` returned `[]` even though TOMLs existed on the host) made this manifest as "every agent is invisible." That mount is fixed in PR (this followup's parent), but the silent-drop UX is still wrong.

**Why noticed:** User dispatched `crew run CREW-95`, agent registered fine (`/api/agents` showed it with 1.5M tokens, state running), but the dashboard at `localhost:5173` was empty. Took a code-trace + curl + container env audit to find that `/api/projects` was returning `[]` because the host's `~/.config/crew/projects/*.toml` wasn't mounted into the daemon container. Even after fixing the mount, the underlying UX gap remains: any project name mismatch (typo in TOML, project deregistered while agents are still active, etc.) re-creates the same silent failure.

**Anchors:**

- `packages/dashboard/src/components/AgentsList.tsx:21-22` — the filter that drops everything
- `packages/dashboard/src/data/types.ts` — `Agent.projectName` field shape
- `packages/daemon/src/services/ProjectsService.ts:28` — silently returns `[]` when configDir is missing
- `docker-compose.yml` — daemon volume list (mount fix landed in fix/daemon-projects-mount)

**What's been considered:**

- Render orphan agents under a synthetic `Unregistered` section with a banner "this agent's project isn't registered — register it via `crew register` to see it grouped properly."
- Daemon-side: include orphan agents in `/api/agents` with a synthetic project entry so the dashboard doesn't have to special-case.
- Show a top-level toast when `/api/agents` has rows that no `/api/projects` row matches.

The "synthetic Unregistered section" feels right — it's a single render path, no extra API surface, and the affordance to fix it (register the project) is one click away.

**Shape of work:** Single small dashboard PR. Add an `Unregistered` group key when an agent's projectName has no match in `projects[]`, render a `ProjectSection` for it with a banner. Update `AgentsList.test.tsx` to cover the orphan path. ~30 min, no daemon changes.

**Open questions:**

- Should the `Unregistered` section sort first (most urgent — something's broken) or last (least relevant — fix later)? Lean: first.
- Does the slice 1c "Hide finished" toggle interact with this? Probably independent.

### 2026-05-05 — Daemon container's `~/.claude/projects` mount is broader than crew's transcript ingest needs

**What:** `docker-compose.yml` mounts `${HOME}/.claude/projects:/root/.claude/projects:ro` so the daemon's IngestService can tail real-agent JSONL transcripts. The mount is read-only, but it covers _every_ project's transcripts plus MCP server settings/oauth tokens and memory files for all of the user's projects — not just crew. A daemon vulnerability (or a future feature that surfaces transcript content) could read material that has nothing to do with crew.

**Why noticed:** Surfaced during code review of CREW-87 (foundation ticket A of the dockerization Epic CREW-86). The plan called the breadth out as canonical scope, but the reviewer flagged it as worth narrowing or filtering before the dockerized daemon ships beyond the local-only canonical use case.

**Anchors:** `docker-compose.yml` (the `${HOME}/.claude/projects:/root/.claude/projects:ro` line), `packages/daemon/src/services/IngestService.ts` (the consumer), CREW-87, CREW-86 Epic.

**What's been considered:** Two narrowing approaches were sketched — (a) mount only the specific per-project subdirs the IngestService is configured to ingest; (b) keep the broad mount but filter at the IngestService layer so only configured projects' transcripts are ever opened. (a) is tighter at the docker layer; (b) is more flexible if the set of ingested projects changes at runtime. Both warrant exploration.

**Shape of work:** Small. One ticket — modify the compose mount to a project-aware list (likely materialized through env.toml so worktree mode and canonical mode share the resolution path), or add the IngestService-side filter. Likely overlaps with the transcript-watcher dep work in `chokidar` followup (2026-05-03).

**Open questions:** Should the canonical compose continue mounting broadly while worktree compose narrows? (Worktree daemons only need the dispatched agent's transcript stream, which is ~1 project.) Would consolidating around a single per-project pattern simplify both modes?

### 2026-05-04 — Generalize the hardcoded `db-clone-from-main.sh` post-bringup hook into a configurable TOML-registered startup script

**What:** `packages/cli/src/lib/docker/start-bringup.ts:51-79` hardcodes a single post-bringup hook: it looks for `<repo>/scripts/db-clone-from-main.sh`, runs it if executable, otherwise silently skips. The hardcoded name and path are inflexible: a project that wants a differently-named startup script (or multiple steps, or a non-script invocation like `npm run seed`) has no way to register it. Generalize by adding an optional field to the `[docker]` block in the project TOML — e.g. `post_bringup_command = "scripts/db-clone-from-main.sh"` (or `["scripts/db-clone-from-main.sh"]` for an array of sequential steps), defaulting to the current literal for backward compat so Recipes' existing TOML keeps working unchanged. Treats the hook as an "entrypoint script" registered by the project rather than convention-named by crew.

**Why noticed:** 2026-05-04 conversation while planning the crew dockerization Epic. Surfaced two ways: (1) user realized that Recipes' user-profile data hasn't been propagating to worktrees and likely the `scripts/db-clone-from-main.sh` was accidentally removed during the cleanup that ported scripts into crew (separate tech-debt ticket on the Recipes side will re-add it); (2) when sketching crew's own bringup, it became clear that crew's "post-bringup mock-data seed" lives best inside the daemon container's entrypoint rather than as a host-side script — but if a future project wants different host-side behavior, the hook needs to be configurable.

**Anchors:**

- `packages/cli/src/lib/docker/start-bringup.ts:51-79` — the hardcoded lookup + invocation.
- `packages/cli/src/lib/docker/start-bringup.test.ts` — covers the existing hook; will need updates.
- `packages/shared/src/config/schema.ts` — `[docker]` block (currently has `canonical_worktree`, `http_port_base`, `https_port_base`, `postgres_port_base`); the new field lands here.
- `~/.config/crew/projects/recipes.toml` — reference TOML; will gain `post_bringup_command` if we make it explicit, OR keep relying on the back-compat default.

**What's been considered:**

- **Single string** vs **array of steps**. Single string is simplest; array is more honest about projects that want multiple sequential steps (clone data + warm cache + seed). Lean: array, with a single-string-also-accepted shorthand.
- **Just renaming the convention path** vs **fully configurable**. Could drop `db-clone-from-main.sh` and rename to `scripts/post-bringup.sh` as a more generic convention without TOML config. Lean: fully configurable. Convention-only naming gets you "use a different name" but not "use multiple commands" or "use an npm script."
- **Where the script runs.** Today the hardcoded one runs in the host shell, with `cwd = worktree`. Should that semantic stay? Probably yes — host-shell-with-worktree-cwd is what works for "talk to the docker stack from outside" use cases. If a project wants in-container behavior, the container's own entrypoint handles it.
- **Exit-code handling.** Today: if the hook fails, the script logs `! data clone failed` but doesn't propagate failure to the caller. Should that change? Lean: keep current behavior (data-clone failures shouldn't abort agent dispatch), but consider adding a `fail_dispatch_on_error: bool` flag if a project ever wants stricter semantics.

**Shape of work:** One ticket. Schema field addition + start-bringup.ts read-and-execute generalization + test fixture + recipes.toml update (optional, only if we want to make the entry explicit rather than rely on the back-compat default). ~1–2 hours.

**Open questions:**

- Field name. `post_bringup_command` (action-oriented), `bringup_hook` (entrypoint-style), `startup_script` (path-oriented)? Lean: `post_bringup_command` since the hook fires _after_ `compose up --wait` succeeds, before the optional `compose stop`.
- Should the TOML field accept inline shell, or only a path-to-script? Inline is more flexible (`post_bringup_command = "npm run seed"`), path-only is more auditable. Lean: accept either — if it starts with `./` or contains `/`, treat as a path; otherwise treat as a shell command.

### 2026-05-03 — `crew run` post-stream "waiting up to 120s for docker bringup" log is misleading after CREW-83

**What:** `packages/cli/src/commands/run.ts:451-469` waits up to 120s on `dockerProcess` after the agent finishes streaming, then reads its `exitCode` to set `dockerFailed`. CREW-83 made `prepareAgentEnvironment`'s `fresh` mode block on bringup and throw on non-zero exit, so by the time we reach this post-stream block `dockerProcess` is always already-resolved with `exitCode === 0`. The 120s race becomes a guaranteed-fast no-op, but the user still sees `→ waiting up to 120s for docker bringup…` printed (followed by an immediate finish). Cosmetically noisy and could mislead someone reading the logs.

**Why noticed:** Self-review of CREW-83 PR. The plan acknowledged `result.dockerProcess` would be an already-resolved promise after the change, and chose to leave it for backwards-compat with the post-stream wait. Tightening the post-stream code (drop the wait + the log line, just read `dockerProcess.then(r => r.exitCode)` directly, or drop the field entirely now that `prepareAgentEnvironment` throws on rc!=0) is out of scope for the scaffold ticket but worth tracking.

**Anchors:**

- `packages/cli/src/commands/run.ts:451-469` — the post-stream wait loop.
- `packages/cli/src/lib/run/agent-environment.ts:51-68` — where the await + throw landed.
- `docs/superpowers/plans/2026-05-03-agent-dispatch-preflight.md` Task 3 — plan note explicitly preserves `result.dockerProcess` for compat.

**Shape of work:** Small. Either delete the wait/log block (since `dockerFailed` is now always whatever `dockerUnavailable` was set to pre-bringup), or tighten it to a one-liner that reads the resolved exit code without the misleading wait message. ~10 lines either way; no test churn beyond agent-environment's existing coverage.

### 2026-05-03 — `chokidar` dep added to daemon but no code imports it

**What:** CREW-50 added `chokidar ^4.0.3` to `packages/daemon/package.json` per the slice 1b plan + ticket acceptance criteria. The shipped `IngestService` (and the `tailTranscript` helper it uses) still polls via `fs.open`/`stat` every 200ms — chokidar isn't actually imported anywhere in the daemon. Either the migration to fs-event watching needs to happen in a follow-up slice, or the dep should be dropped to keep the dep graph honest.

**Why noticed:** Code-reviewer flagged it during CREW-50 self-review. The plan called for the dep up front so the slice would be "ticket-correct," but no later task in the slice 1b plan uses it either; if slice 1c also doesn't pick it up, it stays a dead dep.

**Anchors:**

- `packages/daemon/package.json:28` — the `chokidar ^4.0.3` entry.
- `packages/daemon/src/services/IngestService.ts` — the would-be consumer; only imports `tailTranscript`.
- `packages/shared/src/transcripts/tail.ts:23-72` — the polling tail loop that chokidar would replace.
- `docs/superpowers/plans/2026-04-29-agents-data-end-to-end.md:498-510` — the plan step that mandates the dep.

**Shape of work:** Two paths. (a) Migrate `tailTranscript` to chokidar-driven (cheaper to react to writes; more moving parts in tests). (b) Drop the dep + amend the plan note. Whichever way, single small PR.

**Open questions:** Does the polling tail's 200ms latency matter for the dashboard slice? If not, (b) is the right call.

### 2026-05-03 — `crew run` swallows background-task failures into `/tmp` logs

**What:** `crew run` kicks off docker bringup and Playwright/Chromium install as background processes, prints `→ docker bringup running in background (log: /tmp/crew-docker-<KEY>.log)` once, and never surfaces failures back to the user once the foreground transcript stream begins. If the background task fails, the user only finds out by tailing the `/tmp` log themselves — and typically only after watching the agent flail for several minutes against missing infrastructure (no DB → integration tests fail; no docker stack → bruno smoke / verify-after-run can't run).

**Why noticed:** Recipes KAN-12 was started on 2026-05-03. The docker bringup failed immediately (`invalid project name "recipes-KAN-12": must consist only of lowercase alphanumeric characters...` — the underlying bug is the materialize() lowercase fix landing in this branch). The user watched the agent stream for ~5 minutes assuming the env had been set up correctly because `crew run`'s output had moved on to streaming the agent. Diagnosis required jumping to `/tmp/crew-docker-KAN-12.log` and reading the compose error directly. The Playwright background install has a similar shape: `chromium: <unresolved> — MCP will fall back to system chrome channel` is at least surfaced (good), but only as a one-line note buried between other startup messages, with no separate signal that the install itself succeeded vs. fell back.

**Anchors:**

- `packages/cli/src/lib/docker/start-bringup.ts` — the background-task launcher.
- `packages/cli/src/commands/run.ts` — call site, plus the foreground transcript-stream loop that runs concurrently.
- `/tmp/crew-docker-<KEY>.log`, `/tmp/crew-playwright-<KEY>.log` — where the output goes.
- The conversation that surfaced this: 2026-05-03 chat where the user asked "why didn't docker spin up?" after seeing the env materialize but no containers in `docker ps`.

**What's been considered:**

- **Pre-flight wait + fail-fast:** Block the `→ launching claude in headless mode` step on docker bringup completion. If bringup failed, abort `crew run` with a clear error before the agent ever spawns. Tradeoff: longer wall-clock before the agent starts (docker `--wait` can take 30-60s on a cold start). Probably worth it — running the agent against a broken stack is a net loss.
- **Streaming background-task status into the foreground:** Concurrent watcher that tees the `/tmp` log into the user's stream once a failure is detected, with a clear `! docker bringup FAILED — see /tmp/...` banner. Doesn't block the agent but at least the user knows.
- **Surface in the agent prompt:** The agent's startup prompt already mentions `docker_unavailable` when the daemon probe fails. Extend the same shape to "docker stack failed to come up" so the agent's first action is to read the log and either fix or abort gracefully.
- Combination: pre-flight wait for the docker case (most common dependency), streaming watcher for Playwright (less critical, MCP falls back).

**Shape of work:** One ticket. Probably two commits — the docker pre-flight wait is straightforward (await the bringup promise + check exit code before spawning claude); the Playwright surfacing is more about formatting / structured logging. Tests would mock `start-bringup` to return failure and assert `crew run` aborts with the expected message before any agent spawn.

**Open questions:**

- For docker bringup: do we wait for `docker compose up --wait` to finish before launching the agent (slower happy path, faster failure path), or only fail-fast on the validation step that rejected the project name (lets the heavy `up --build` keep running in parallel)?
- Should the agent's prompt receive a `docker_failed` disclosure for graceful-degrade behavior, or is hard-aborting `crew run` better UX?

### 2026-05-03 — Transcript line printer truncates tool-call inputs mid-string

**What:** `summarizeInput` in the shared transcript parser slices Bash command summaries to 140 chars and all other tool inputs to 120 chars. As a result, `crew run`'s live transcript stream regularly shows lines that end mid-string (`[TodoWrite][622 tok] {"todos":[{"content":"Read KAN-12 context","status":"in_progress","activeForm":` — cut off). The user can't tell what the agent is actually doing for inputs longer than the cap.

**Why noticed:** Same conversation as the bringup-visibility followup above (2026-05-03 chat about KAN-12). The user explicitly called out the truncated `[TodoWrite]` line and said "we should be printing full lines."

**Anchors:**

- `packages/shared/src/transcripts/parser.ts:95-112` — `summarizeInput` (`.slice(0, 120)` default, `.slice(0, 140)` for Bash).
- `packages/shared/src/transcripts/parser.ts:72,82-93` — `ASSISTANT_TEXT_MAX_LEN = 120` + `formatAssistantText`. Same constant pattern; question is whether assistant-text snippets and tool-input summaries should share or diverge from this rule.
- `packages/cli/src/lib/run/stream-transcript.ts` — call site that writes formatted lines to `process.stdout`.

**What's been considered:**

- **Print full lines, no truncation.** Simplest. Risk: a 50KB Edit input or Write content blows up the terminal scrollback. Mitigation: TodoWrite/Edit/Write printers should still summarize structurally (e.g. "TodoWrite: 4 todos, 1 in_progress" instead of dumping the JSON), but for everything that's already a short identifier, drop the slice.
- **Per-tool truncation policy.** Bash → full command. TodoWrite → structured summary (count + active form). Edit/Write → file path only (already does this). Read → file path only (already does this). Default JSON dump → either full or smart-summarized via tool-name allowlist, never blind slice.
- **Terminal-width awareness.** `process.stdout.columns` could cap to 1-2 lines wrapped. Tradeoff: makes copy/paste-into-issue behavior weirder and re-introduces the same "where did the content go" problem.

The right answer is per-tool policy, not a global constant. Default-blind slicing is the bug; the cure isn't "longer constant" but "smarter summarizers."

**Shape of work:** One ticket. A `summarizeInput` rewrite that dispatches per tool name (TodoWrite, MultiEdit, NotebookEdit get structured summaries; everything else gets full content with a soft-cap that's only hit when the input itself is unreasonably long, e.g. > 4KB). New tests in `packages/shared/src/transcripts/parser.test.ts` for each summarizer branch.

**Open questions:**

- Does `formatAssistantText`'s `ASSISTANT_TEXT_MAX_LEN = 120` get the same treatment, or stay capped (it's a multi-line preamble, different shape)?
- Is there a max-line config knob users will want (`CREW_TRANSCRIPT_MAX_LINE_CHARS`)? Probably no — start with sensible defaults; add when someone asks.

### 2026-05-02 — `crew restart --hard` should not silently bail when a PR exists

**What:** `crew restart --hard` is the "blow away local state and redo this ticket from scratch" command. When the ticket already has an open PR, restart bails (presumably steering the user toward `crew fix-pr` instead). That's the wrong default when the user has _materially changed the ticket scope_ mid-flight — added a new task to the Jira description, swapped the design, etc. The user's intent is "redo against the new scope," not "patch the existing branch with one more diff." `fix-pr` is for incremental review-comment application, not for a fresh start.

**Why noticed:** During Recipes [KAN-45](https://safturento.atlassian.net/browse/KAN-45) (env.toml migration), a runtime bug surfaced post-merge — Better Auth's `signUpEmail` rejected `bruno-smoke@local` because `z.email()` requires a TLD. The bug was preexisting from KAN-37 but only surfaced when KAN-45 first ran the seed end-to-end. The Jira description was updated mid-flight with a new Task 10 covering the fix. The user tried `crew restart --hard KAN-45` to re-run the agent against the now-expanded scope; crew bailed because the PR existed. Forced fallback to `crew fix-pr` — which doesn't read the Jira description at all (only PR review comments), so Task 10 was never picked up.

**Anchors:**

- crew's restart command implementation (likely under `packages/cli/src/commands/restart.ts` or wherever the PR-existence check lives).
- `crew fix-pr` command — the fallback path that picked up nothing useful in this case.
- KAN-45 (Recipes [#42](https://github.com/Safturento/Recipes/pull/42)) — the ticket that surfaced the gap.
- Companion debugging transcript at `~/.claude/projects/-home-safturento-Repos-Recipes-KAN-45/acbbad62-77cf-4afa-a6ce-a83d4d564806.jsonl`.

**What's been considered:**

- **Bail with steering message** (current). Too restrictive when scope has actually changed.
- **Allow restart with `--force-overwrite-pr` flag.** Explicit opt-in; the user proves they meant it.
- **Auto-detect Jira-vs-PR drift.** If the Jira description's `updated` timestamp is newer than the PR's `created`, restart's overwrite is probably what the user wants — surface the drift in the bail message ("Jira ticket was edited 2 hours after PR opened — proceed with `--force` to redo against new scope?").
- **Always proceed and force-push.** Most permissive; risks accidental work loss.

The auto-detect option is the most user-friendly. The flag option is the cheapest first step.

**Shape of work:** Small command-flag addition + decision on default behavior. If the auto-detect path is chosen, needs a Jira API call (`getJiraIssue` for `updated`) plus a GitHub API call (`gh pr view --json createdAt`) inside restart's pre-flight check.

**Open questions:**

- Is the bail driven by branch protection rules on the remote, or crew's own pre-flight logic? Determines where the fix lives.
- Should restart auto-detect Jira-vs-PR drift and surface it before deciding, or just expose a flag and let the user judge?

### 2026-05-02 — `crew fix-pr` skips env materialization and full verification

**What:** `crew fix-pr` dispatches an agent with a prompt that names `superpowers:verification-before-completion` as required, but the dispatched agent applies review-comment changes and exits without running the project's verify cycle (docker bringup, db setup, smoke tests). Two related gaps surface together:

1. **Env materialization is skipped before agent dispatch.** Generated files like `.env.docker-backend` (from `[contexts.docker-backend]` in env.toml) are missing on the worktree if a previous restart wiped local state. The agent inherits a worktree where `docker compose up` would fail immediately — but never tries it.
2. **Verification is skipped after agent edits.** A successfully-applied 6-line change ships without proving the broader stack still works. The verification skill named in the prompt is documented but not invoked.

**Why noticed:** During Recipes [KAN-45](https://safturento.atlassian.net/browse/KAN-45) the user fell back to `crew fix-pr` after restart-hard bailed (paired followup above). The agent applied a small test-regex tightening per PR review feedback, pushed `db04c38`, reported the PR URL, and exited. No `docker:up`, no `db:setup`, no `bruno:smoke` in the entire transcript. When the user then ran `npm run docker:up` themselves, it failed: `env file .env.docker-backend not found`. That's a generated context file the new env-spec pipeline produces — `crew env init` (or `bringUpWorktreeEnv` in the run path) is what materializes it. fix-pr never called either.

**Anchors:**

- `crew fix-pr` command (`packages/cli/src/commands/fix-pr.ts` or similar).
- `superpowers:verification-before-completion` skill — named in the prompt, not invoked by the agent.
- The env-materialization integration from CREW-79 / `bringUpWorktreeEnv` — works in `crew run`'s worktree-bringup path; appears not to be wired into fix-pr's pre-dispatch step.
- Transcript at `~/.claude/projects/-home-safturento-Repos-Recipes-KAN-45/acbbad62-77cf-4afa-a6ce-a83d4d564806.jsonl` (search for "docker" — zero hits).
- KAN-45 (Recipes [#42](https://github.com/Safturento/Recipes/pull/42)).

**What's been considered:**

- For (1): fix-pr should call `bringUpWorktreeEnv` (or equivalent `crew env init`) before agent dispatch, mirroring `crew run`'s behavior. The current assumption that the worktree's local state is correct is wrong after restart-hard wipes — and probably wrong in other cases too.
- For (2): two options — make the verification skill more forceful in the prompt (best-effort, prompt-compliance is unreliable), or add an explicit "always run the project's verify command after agent exits" step to fix-pr's wrapper (reliable, doesn't depend on agent compliance). The latter pairs well with the auto-detect failure-and-loop behavior under the dispatch contract followup (2026-05-01 — Structured final-report contract).

**Shape of work:** Two related changes in fix-pr:

- Add env-bringup step before agent dispatch.
- Add post-agent verify step. On failure, either auto-trigger a follow-up agent loop (with the failure as input) or surface to the user for manual intervention — a real design decision since "loop on verify-fail" can mask repeat agent flailing.

**Open questions:**

- Should fix-pr's verify failure automatically trigger another agent iteration, or surface to the user for a manual decision?
- Is "the project's verify command" already implicit in crew's project config (e.g. derived from `[playwright]`/`[bruno_smoke]`), or does it need a new TOML option?
- Does the same gap affect `crew resume`?

### 2026-05-01 — Structured final-report contract for agent dispatches (dashboard prerequisite)

**What:** Define a machine-readable "final report" that every `crew run` / `resume` / `restart` / `fix-pr` dispatch emits as its last action — at minimum: status (success/failure), PR URL (or "no PR opened" with reason), notable warnings, follow-up flags. Crew parses it and renders a real footer; the dashboard later reads it for run outcomes, success-rate metrics, attention queues. Today there's no contract — wrap-up shape is whatever the agent decides, which is exactly the gap CREW-72 (render `assistant.text`) and the tight-scope companion ticket (mandate a final `echo '→ PR <url>'` in the prompt) are working around.

**Why noticed:** during diagnosis of the "tail goes silent at end of run" complaint (KAN-40 session `18dc92c6-0c16-4c85-b864-c734abea5ecd`, 2026-05-01). Two scopes surfaced: tight (just make the prompt mandate a one-line echo so the tail catches a final tool call) and broad (define a structured contract for downstream consumers). User picked the tight scope for now and explicitly parked the broader one as "definitely important for reporting in the dashboard later." This entry exists so we don't lose that conversation.

**Anchors:**

- `packages/cli/src/lib/prompts/templates/ticket.md` (Step 10 "Push and PR"), `templates/resume.md`, `templates/fix-pr.md` — the three places the contract has to be authored on the producer side.
- `packages/cli/src/lib/run/stream-transcript.ts` — the consumer-side surface that today only renders tool calls; the parser for the final-report event would land here or in `crew-shared`.
- `packages/dashboard/` — the eventual downstream consumer; today has no notion of run outcome beyond exit code.
- CREW-72 — companion ticket for rendering `assistant.text` inline (covers the prose-during-wrap-up half of the same UX gap).
- The yet-to-be-filed tight-scope ticket — mandates a `Bash echo '→ PR <url>'` final action; this followup is the proper structural successor.

**What's been considered:**

- Two shapes for the report payload. **Inline echo:** agent ends with `echo '→ PR <url>'` (or `echo '✗ aborted: <reason>'`). Cheap, parseable by simple regex, no schema. Doesn't extend cleanly past PR URL. **Structured JSON line:** agent ends with `echo 'CREW_REPORT={"status":"success","pr":{"number":34,"url":"..."},"warnings":[...],"followups":[...]}'`. Crew parses, validates, renders. Extensible, but the prompt has to spec the schema and the agent has to assemble the JSON.
- Tradeoff: inline echo is what we're shipping in the tight-scope ticket. Structured JSON is what the dashboard needs. Bridging them later means: (a) widen the prompt contract, (b) add a parser in `stream-transcript.ts` (or a new `parseFinalReport` in `crew-shared`), (c) add a consumer in the dashboard once the daemon API surfaces the parsed payload.
- A third option — have crew assemble the report itself from existing signals (exit code, `pr-link` event, transcript scan) rather than asking the agent to emit one — is attractive because it doesn't depend on the agent doing the right thing. But it can't capture agent-judgment fields (warnings, follow-up flags) that the dashboard will likely want. Probably a hybrid: crew assembles the objective fields, agent contributes the judgment fields via the structured echo.

**Shape of work:** design pass first, before any code.

1. Spec doc (`docs/superpowers/specs/<date>-final-report-contract.md`) covering: payload schema, who's authoritative for which field (crew vs. agent), how partial / failed runs report, how a non-PR-opening dispatch (epic-guard exit, ticket-already-shipped exit) reports.
2. Plan doc decomposing into tickets — likely 3-ish: prompt contract (touches the three templates), parser + footer renderer (touches `stream-transcript.ts` + `crew-shared`), daemon API surface (`/runs/:id/report` or similar).
3. Don't start until the dashboard work needs it — premature without a concrete consumer. Signal: dashboard ticket asks for "show last run outcome per ticket" or "filter by status" and there's no field to back it.

**Open questions:**

- JSON line vs. multi-line key-value vs. a dedicated tool-call shape (e.g. a fake "ReportFinalStatus" tool the agent invokes). The fake-tool variant pipes through the existing tool-call rendering for free.
- Where does the warnings/follow-ups contract come from? `docs/followups.md` is project-scoped, lives in the repo — the agent can append directly. So the structured report's "follow-ups" field might just be "did you append to followups.md? path:lineno of new entries." Same question for warnings — could live in the PR description's known sections rather than the report.
- Backwards-compat: how do older crew agents (running an older prompt that doesn't know to emit a report) interact with a parser that expects one? Probably "absent report" → "status: unknown, no data" rather than an error.

### 2026-05-01 — Render assistant.text preamble alongside same-event tool calls

**What:** `streamTranscript` parses each assistant event with `parseToolCall` first and short-circuits on a hit, so the common Claude Code shape `[TextContent("Let me read the file."), ToolUseContent(...)]` only renders the tool-call line — the preamble text is dropped. CREW-72 added `assistant.text` rendering for _standalone_ text events (the wrap-up prose case), but mixed-content events still drop the text half.

**Why noticed:** Surfaced during CREW-72 self-review by superpowers:code-reviewer. The reviewer's read: ticket framing ("agent's wrap-up phase") implies you'd probably want the preamble too, but it's strictly out-of-scope for the silent-tail bug. Source conversation: CREW-72 implementation, 2026-05-01.

**Anchors:**

- `packages/cli/src/lib/run/stream-transcript.ts:92-105` — the if/continue chain that short-circuits on the tool-call branch.
- `packages/shared/src/transcripts/parser.ts` — `parseToolCall` and `parseAssistantText` both look at `message.content` but the streaming loop only takes one verdict per event.

**What's been considered:**

- Two text snippets per event (preamble line + tool-call line) is the natural rendering. Same `· ` prefix the standalone-text branch already uses; same time prefix for both lines so they read as a pair.
- Alternative: collapse the preamble into the tool-call line (`21:49:56  · Let me read the file.  [Read][42 tok] /tmp/foo.ts`). Denser but mixes two visual prefixes per line; rejected on legibility.

**Shape of work:** small. Drop the early `continue` after the tool-call branch and let the same event also hit the text branch — `parseAssistantText` already returns a non-null result for these events. One added test in `stream-transcript.test.ts`.

**Open questions:**

- Should the preamble line precede or follow the tool-call line? Transcript order is text-then-tool_use, so preamble first is faithful, but for terminal-tail readability it might be nicer to keep tool calls visually aligned (tool-call line first, text-prefix below).

### 2026-05-01 — Crew owns DB replication end-to-end (off per-project shim scripts)

**What:** Crew's per-worktree DB replication today is split awkwardly between crew and the project. The bringup script (`buildDockerBringupScript` in `start-bringup.ts`) calls a project-side shim — `<repo>/scripts/db-clone-from-main.sh` — which in turn calls `crew db-clone <branch>`. Meanwhile the project's own backend container runs migrations + seed via its `entrypoint.sh`, on the same database, with no coordination. The result is a brittle three-way handshake between (a) the project's docker-compose entrypoint, (b) crew's bringup orchestration, and (c) crew's `runDbClone` primitive. Generalize this so crew owns the whole DB lifecycle for a worktree dispatch and the project just declares the contract via config (the existing `[db_clone]` block, possibly extended).

**Why noticed:** filed CREW-68 to fix the immediate race between db*clone and backend seed (concurrent TRUNCATE and INSERT on the same tables corrupts the worktree DB and exits the backend container). The fix lands as a quick-win — wait-for-healthcheck + better log on clone failure — but the underlying brittleness is structural, not local. The user's framing: *"this feels like a symptom of being in this middle state where crew is still relying on some scripts that are a part of recipe's infrastructure."\_ Source conversation: 2026-05-01 session debugging KAN-40's failed dispatch under CREW-61's playwright manual gate.

**Anchors:**

- `packages/cli/src/lib/docker/start-bringup.ts` — `buildDockerBringupScript`, the orchestration that races today.
- `packages/cli/src/lib/db-clone/clone.ts` — `runDbClone`, the primitive crew already owns.
- `packages/cli/src/commands/db-clone.ts` — the CLI surface the project's shim invokes.
- `<recipes>/scripts/db-clone-from-main.sh` — the per-project shim. One-liner that re-enters `crew db-clone`. Indicative of the awkward split.
- `<recipes>/packages/backend/entrypoint.sh` — runs migrations + seed unconditionally on every container start; no awareness of whether crew is about to clone over the result.
- CREW-68 — the immediate-fix ticket; this followup is the proper architectural successor.

**What's been considered:**

- Two near-term fixes were on the table for CREW-68. **Path A (chosen):** add a backend healthcheck, have crew's bringup `--wait` for it before running clone. Project still owns seed; crew sequences. **Path B:** crew sets `CREW_SKIP_SEED=1` env on the backend container when db_clone is configured; the project's entrypoint honors it. Avoids the wasted seed-then-truncate-then-restore work but couples the project's entrypoint to crew's contract.
- Both are bandages. Path A leaves the project running its own seed/migrate that crew then overwrites. Path B introduces a secret handshake the project has to opt into. Neither lets a future project just declare `[db_clone]` and have crew do the right thing.
- The deeper move — what this followup is really about — is to invert ownership: crew brings the DB up (postgres-only first), runs migrations, runs the clone (or seed, depending on dispatch type), THEN brings up the rest of the stack. The project's `entrypoint.sh` becomes purely "run the dev server" with no DB lifecycle. The contract surface is the `[db_clone]` config block plus (likely) one or two new fields naming the migration/seed commands.

**Shape of work:** design pass first — this is a contract change touching every project that uses `[db_clone]` (today: just Recipes, but the whole point of generalizing is to enable more). Likely sequence:

1. Spec doc (`docs/superpowers/specs/<date>-crew-owns-db-lifecycle.md`) covering: what crew brings up vs. what the project brings up, where migrations run, where seed lives (canonical-only? optional? gated?), how a project without a canonical worktree handles fresh setup.
2. Plan doc decomposing into tickets — likely a small Epic. At minimum: contract definition + crew-side orchestration + Recipes-side migration off `entrypoint.sh`.
3. Watch for second adopters before generalizing — if Recipes is still the only consumer, the abstraction will be premature. The signal to do this is when a second project hits the same brittleness.

**Open questions:**

- Does crew's bringup need to run migrations directly (via psql or by spawning a one-shot migration container), or does it stay in the project's hands? Migrations are toolchain-specific (kysely vs. typeorm vs. alembic vs. flyway) — pushing them into crew means a pluggable layer.
- Where does seed live? Three plausible answers: (a) on canonical only, never on dispatched worktrees (clone is the source of truth); (b) opt-in via config (`[db_clone] seed_after_clone = true`); (c) seed on canonical, optional incremental seed on worktrees. (a) is simplest; (b) handles \"I want a deterministic synthetic dataset, not a copy of dev.\"
- What about projects with no canonical worktree (brand-new setups, CI environments)? Probably falls back to project-side seed. The contract has to handle this gracefully.
- Should crew take over `docker compose up` orchestration entirely (split into postgres-up → migrate → clone → rest-up phases), or stay declarative via healthchecks and `--wait`? The first is more invasive but eliminates the race class entirely; the second keeps docker-compose's behavior intact and just sequences correctly.
- Is the project config currently expressive enough? The `[db_clone]` block names tables but doesn't name the migration command or the dev-server boot command — those would need to be added.

### 2026-05-01 — Generic `--git-common-dir` helper in `crew-shared` (third-caller trigger)

**What:** `appendExcludeLine` in `packages/cli/src/lib/playwright/write-mcp-file.ts` resolves the worktree-aware path to `.git/info/exclude` by shelling out to `git rev-parse --git-common-dir` and joining (handling the relative-vs-absolute return). It's the only caller today. If a second or third call site needs the same resolution, factor a small helper into `crew-shared` rather than duplicating the execa + isAbsolute pattern.

**Why noticed:** explicitly carved out of CREW-67's scope as "worth considering if a third call site needs `--git-common-dir`, but YAGNI for one." Source: CREW-67 ticket "## Out of scope" section.

**Anchors:**

- `packages/cli/src/lib/playwright/write-mcp-file.ts` — current sole caller of `git rev-parse --git-common-dir`.
- CREW-67 — origin ticket; out-of-scope section.

**Shape of work:** small refactor. Once a second/third caller appears, lift the resolution into `crew-shared` (e.g. `git/common-dir.ts` exporting `resolveGitCommonDir(worktreePath)`) and migrate both call sites in the same PR.

### 2026-05-01 — `crew run`/`resume`/`restart` against an already-shipped ticket has no safety net

**What:** None of the agent-spawning commands check whether the target ticket has already been shipped (PR merged, ticket Done). Running `crew run CREW-X` against a ticket whose work is already on `main` produces non-deterministic agent behavior — best case the agent reads the ticket, sees AC ticked off, and reports "no work to do"; worst case it makes confused no-op edits or tries to re-implement and produces a junk PR. `crew resume` against the same key either resumes a stale session in a confused post-completion state (if the worktree exists) or errors with "no worktree." `crew restart` (default) and `crew restart --hard` would happily proceed and inherit the same problem.

**Why noticed:** during the CREW-66 follow-up to CREW-65, the user asked: _"if I run `crew run CREW-65` or `crew resume CREW-65`, will it pick up the new work and establish a new PR or will it just break in a weird, new way?"_ Walking through the code paths, it became clear there's no defensive check — the commands trust the user to know whether a ticket is dispatch-appropriate. Source conversation: 2026-05-01 session diagnosing the CREW-65/CREW-66 cleanup-worktree bugs.

**Anchors:**

- `packages/cli/src/commands/run.ts` — `runRun`. Calls `requireWorktreeAvailable` and `git worktree add -b` without consulting Jira state.
- `packages/cli/src/commands/resume.ts` — `runResume`.
- `packages/cli/src/commands/restart.ts` — `runRestart`.
- `mcp__atlassian__jira_get_issue` — already used in the agent's first prompt step ("Pull the ticket"). Could be lifted into crew-side preflight so the check happens before worktree creation.

**What's been considered:** nothing yet beyond surfacing the gap. Flagged in conversation, deferred to plan later.

**Shape of work:** likely one ticket. Add a Jira preflight at the top of `run` / `resume` / `restart`:

1. Fetch the ticket via Jira API (using the same MCP path the agent uses).
2. If `status.statusCategory.key === "done"`, refuse with a useful error suggesting `crew fix-pr <KEY>` (for fixing post-merge feedback) or `--force` (for genuine re-runs against a Done ticket).
3. Bonus: detect "in review" with an open PR and surface that too — point users at `crew fix-pr` rather than `crew run`.

The check adds one Jira round-trip per dispatch; probably fine but worth measuring.

**Open questions:**

- Opt-out (`--force` to bypass) vs. opt-in? Defaulting to enforcement matches the user's "no surprises" preference but blocks legitimate re-run cases (e.g. running a known-shipped ticket to test a new command, exactly the case that surfaced this followup).
- What states qualify as "already shipped"? `Done` is unambiguous; `In Review` (PR open, work not landed) is more nuanced — the right action there is `crew fix-pr`, not `crew run`.
- Project-specific terminal status names vary across Jira projects. `status.statusCategory.key === "done"` is more portable than hardcoding `Done` as a status name.
- Should the check live in `runRun` and be re-used by `runResume` / `runRestart`, or in `prepareAgentEnvironment`? `prepareAgentEnvironment` already runs early in all three; might be the natural seam.

### 2026-05-01 — Playwright integration self-review cleanups

**What:** Three small cleanups noted in CREW-58's self-review but explicitly bundled out of that PR's scope. Each is independently small but hasn't been picked up by a follow-on ticket.

1. **Ubuntu 24.04+ apt names.** `scripts/install.sh`'s hardcoded apt list (`libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libdbus-1-3 libxcb1 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2 libatspi2.0-0`) targets Ubuntu 22.04 / Debian 12 names. Ubuntu 24.04+ renamed several to `t64` (e.g. `libasound2t64`, `libatk1.0-0t64`, `libcups2t64`) for the time_t ABI transition. Tweak when the first 24.04+ install fails.
2. **Test casts.** `packages/cli/src/lib/playwright/install-browsers.test.ts` uses `as unknown as ReturnType<typeof execa>` (3 sites). Could likely use `ResultPromise` from execa directly.
3. **`[playwright.smoke] enabled = false` UX.** The schema declares `enabled: z.literal(true)`, so writing `enabled = false` produces a literal-mismatch validation error rather than a clean no-op. A `.refine` or schema reshape would let users toggle the block off without commenting it out.

**Why noticed:** [PR #53](https://github.com/Safturento/crew/pull/53) (CREW-58) — "Follow-ups noted in self-review" section.

**Anchors:**

- `scripts/install.sh` — apt list (lines 30–35)
- `packages/cli/src/lib/playwright/install-browsers.test.ts:40,58,69` — execa casts
- `packages/shared/src/config/schema.ts:5–7` — `playwrightSmokeSchema` literal
- [CREW-58](https://safturento.atlassian.net/browse/CREW-58)

**Shape of work:** Three independent micro-tickets (or one bundled cleanup ticket). Each is a single-file change. Item 1 needs an Ubuntu 24.04+ box to validate the new package names; items 2 and 3 land standalone.

### 2026-04-30 — Surface subagent activity in transcript outputs

**What:** crew's transcript views don't distinguish subagent (Task tool) events from top-level activity. The `.jsonl` session files DO contain them — verified empirically: CREW-62's session file has 293 `isSidechain: true` lines. The data layer captures the events; the rendering layers (`packages/shared/src/transcripts/parser.ts`, `tail.ts`, and the dashboard agent view) don't carry the marker forward or label sidechain activity differently.

**Why noticed:** while filing CREW-63 (the resume / restart spec) the user asked whether subagent executions were tracked in transcript logs. Empirical check showed the data is recorded but not surfaced. Becomes painful for runs that dispatch subagents heavily — a `crew run` agent that uses Task to spin off Explore subagents shows the user only "Task invoked" in the parent's view, no visibility into what the subagent actually did. Source conversation: 2026-04-30 brainstorm session that produced CREW-63.

**Anchors:**

- `packages/shared/src/transcripts/parser.ts` — no `isSidechain` field on parsed event types
- `packages/shared/src/transcripts/tail.ts` — no filtering or labeling around sidechain events
- `packages/shared/src/transcripts/types.ts` — event-type definitions to extend
- Daemon: `tool_calls` table from CREW-49 migration. Verify whether it currently captures sidechain calls or only top-level
- Dashboard agent view (path TBD; verify whether it currently renders subagent activity at all)
- Empirical data: `~/.claude/projects/-home-safturento-Repos-crew-CREW-62/` — 293 `isSidechain` lines, useful as a reference session for testing rendering decisions

**What's been considered:** nothing yet beyond confirming the data is there. Flagged in conversation, deferred to plan later.

**Shape of work:** likely two tickets.

1. Extend transcript types + parser to carry sidechain markers. Decide CLI rendering strategy in `tailTranscript`: indented-under-parent, separate stream, or both.
2. Dashboard agent view subagent timeline: sub-row beneath the parent's tool call, collapsible panel, or sidebar tree.

Worth verifying whether the daemon's `tool_calls` table already captures sidechain calls before scoping the second ticket — if not, that becomes a sub-step.

**Open questions:**

- Are subagent events always in the parent's JSONL, or sometimes in their own session file? The 293 sidechain lines in CREW-62's session file suggests parent's, but verify before committing to a render strategy — affects whether `tail.ts` needs to multiplex multiple files or just label rows.
- Dashboard UX shape: timeline interleave, collapsible-per-task, or sidebar tree? Affects how much state the agent view component manages.
- Should the CLI's live tail collapse-by-default or expand-by-default for sidechain rows? (Verbose runs could become unreadable expanded; collapsed risks the original "invisible activity" complaint.)

### 2026-04-30 — `crew resume` deferred follow-ups

**What:** Four deferred concerns from the `crew resume / restart / reset` design that the implementation in CREW-63 explicitly punted on:

1. **Multi-session resume picker.** `findLatestSession` returns the most-recently-modified `.jsonl`. If a worktree accumulates many sessions and the user wants an older one, an interactive picker would help.
2. **`crew resume --new-session` flag.** Force fresh claude even when a session exists — useful when wanting to inspect the old session while spawning a new one. Today `crew restart` covers the wipe-and-restart case but not the preserve-old-and-fork case.
3. **Telemetry on resume/restart events.** The daemon's run-state model (CREW-49) doesn't track "this run was resumed N times." Surfacing in the dashboard is a separate concern — spec it when run-state grows that vocabulary.
4. **`-m` interaction with future `crew init`.** A future onboarding wizard might want to seed `-m` with a "first-run" template. Decide alongside `crew init` proper.

**Why noticed:** Design spec for CREW-63 captured these in §8. The PR ([#58](https://github.com/Safturento/crew/pull/58)) shipped without addressing any of the four.

**Anchors:**

- `docs/superpowers/specs/2026-04-30-crew-resume-design.md` §8 — out-of-scope follow-ups
- [CREW-63](https://safturento.atlassian.net/browse/CREW-63) — implementation ticket
- [PR #58](https://github.com/Safturento/crew/pull/58)
- `packages/cli/src/lib/run/find-latest-session.ts` (or wherever `findLatestSession` lives) — would gain the picker

**Shape of work:** Each is its own ticket when the need surfaces. None are urgent today (single-session-per-worktree is the common case; `crew restart` covers the wipe path). Item 4 is bundled into the `crew init` follow-up below.

### 2026-04-30 — Crew owns `.claude/settings.json` per worktree

**What:** Today the project's `.claude/settings.json` (committed in-tree) and the crew TOML's `[sandbox]` block (per-project crew config) are two hand-maintained sources for the same truth — sandbox allowlist, allowWrite paths, etc. They drift. A spec should decide whether crew writes a generated `.claude/settings.json` per worktree using the "tag header + refuse to clobber" pattern from `docker-env.sh`, and what to do when the project's committed `settings.json` differs from what crew would generate.

**`sandbox.excludedCommands` MUST list the project's smoke / e2e commands when the project has a docker stack the agent will exercise** (any project with `[docker]` configured + `[playwright]` or `[bruno_smoke]` enabled). KAN-12 (Recipes, 2026-05-03) burned ~45 min of debugging on this — first ~15 min on the unrelated lowercase compose-name bug, then ~30 min misdiagnosing the agent's `ECONNREFUSED` on `https://localhost:28905`. Initial fix attempt (PR #45 in Recipes, since reverted) added `localhost` + `127.0.0.1` to `sandbox.network.allowedDomains`. That changed nothing — `allowedDomains` is an HTTPS egress filter, while the sandbox actually wraps the agent in `bwrap --unshare-net`, giving it its own loopback distinct from the host's. Empirical test confirmed: `excludedCommands: ["npm run bruno:smoke", "npm run test:e2e"]` runs the listed commands (and their child processes) un-sandboxed, exposing the host netns to the smoke/e2e workflow. The generator should derive the right entries from the project's configured smoke/e2e commands (`[bruno_smoke]` enables npm bruno:smoke; `[playwright].authored.test_command` names the e2e command). Drift detection should flag a project whose committed `settings.json` is missing those commands while configuring a localhost-bound app URL.

**`excludedCommands` is necessary but not sufficient — the dev server has to start in the same netns the runner uses.** KAN-17 (Recipes, [PR #49](https://github.com/Safturento/Recipes/pull/49), 2026-05-03) shipped with both `npm run bruno:smoke` and `npm run test:e2e` already in `excludedCommands`, and `npm run test:e2e` _still_ got `ECONNREFUSED` on `https://localhost:17253`. Likely failure mode: the dev server (or docker-app port-forward) is bound to the **host** loopback, but if the agent ever started/restarted the server itself via a sandboxed Bash call (e.g. plain `npm run dev`), it bound to the agent's bwrap loopback — then the un-sandboxed `npm run test:e2e` runs in the host netns and sees nothing on 17253. The agent's PR claim "Bruno succeeds against the same URL" is almost certainly a misread: `npm run bruno:smoke` targets the daemon's port, not the worktree's app port, so it isn't actually hitting 17253. The mitigations the doctor / generator should enforce: (a) Playwright config owns dev-server lifecycle via a `webServer` block so an un-sandboxed `npm run test:e2e` brings up its own server in the same (host) netns; _or_ (b) any dev-server-start command (`npm run dev`, project-specific equivalents) is also in `excludedCommands` so it inherits the host netns; _and_ (c) the run-time prompt to the agent calls out that ad-hoc `curl` against the app URL from sandboxed Bash will always `ECONNREFUSED` — the agent should treat the un-sandboxed e2e/smoke commands as the only valid path to the docker stack and not interpret a sandboxed-curl failure as evidence the stack is down.

**Why noticed:** Surfaced repeatedly: §10.4 of the Playwright integration design spec, CREW-57's open questions ("Should crew's own `.claude/settings.json` enable the sandbox so future autonomous CREW-\* runs can themselves observe sandbox-policy-level behavior?"), and architecture.md's open questions list ("Sandbox config drift").

**Anchors:**

- `docs/superpowers/specs/2026-04-29-playwright-integration-design.md` §10.4
- `docs/tickets/CREW-57.md` open question
- `docs/rationale/architecture.md` "Settled questions" — Sandbox config drift bullet (settled in favour of the `# generated by crew` tag-header pattern; retained for context)
- Reference for the tag-header pattern: `packages/cli/src/lib/docker/env.ts` (write `# generated by crew` header, refuse to clobber files without it)

**Shape of work:** A design spec first. Likely deliverables:

1. Decision tree: when does crew clobber? When does it warn-and-skip? What's the migration path for existing committed `settings.json`?
2. Generator that reads the TOML's `[sandbox]` and emits a tagged `.claude/settings.json` per worktree.
3. Drift-detection at `crew run` startup so changes to one source surface a warning before the agent spawns.

**Open questions:**

- Should the project's committed `.claude/settings.json` become source-of-truth and the TOML auto-syncs? Or vice versa? Or is the TOML a strict superset and the file is fully crew-owned?

### 2026-04-30 — Empirically validate `bwrap`/`socat` are load-bearing

**What:** Crew preflights `bwrap` (and `install.sh` installs `socat`), but neither is invoked from crew's TS source — verified by grep, `bwrap` only appears as a preflight string in `packages/cli/src/commands/run.ts:84`. Hypothesis: Claude Code's built-in sandbox uses them transitively. If it silently runs un-sandboxed when they're missing, that's a finding that affects every other sandbox-related decision and warrants its own ticket — including the "crew owns settings.json" spec above.

**Why noticed:** Spec §10.5 of the Playwright integration design.

**Anchors:**

- `docs/superpowers/specs/2026-04-29-playwright-integration-design.md` §10.5
- `packages/cli/src/commands/run.ts:84` — bwrap preflight string
- `scripts/install.sh:25–27` — bubblewrap + socat install
- Claude Code source / docs — verify which binaries the harness shells out to

**Shape of work:** One-shot empirical test: uninstall `bwrap` on a test machine, run a sandboxed agent, observe. Document what fails, what runs un-sandboxed silently, what surfaces an error. Result feeds back into the §10.4 follow-up above.

### 2026-04-30 — Project config rationalization

**What:** The `[sandbox]` / `[docker]` / `[playwright]` / `[bruno_smoke]` / `[db_clone]` blocks have grown organically and now duplicate URL/port concepts across multiple sub-blocks. A future spec should consolidate where it makes sense — likely a top-level `[app] url = ...` shared across modes, with per-block URLs (`bruno_smoke.base_url`, `playwright.app_url`) preserved as overrides for projects whose frontend and backend live at different URLs (e.g. not routed through a single Caddy instance).

**Why noticed:** Spec §10.1 of the Playwright integration design. CREW-56's out-of-scope list calls it out as a separate spec.

**Anchors:**

- `docs/superpowers/specs/2026-04-29-playwright-integration-design.md` §10.1
- `packages/shared/src/config/schema.ts` — current config shape with `playwright.app_url`, `bruno_smoke.base_url`, etc.
- [CREW-56](https://safturento.atlassian.net/browse/CREW-56) out-of-scope list

**What's been considered:** Per-block URLs preserved as overrides (so split-stack projects still work). Top-level `[app] url` becomes the default when sub-blocks omit theirs.

**Shape of work:** Design spec → schema migration plan → write codemod or migration helper for existing TOMLs (today only `recipes.toml` and `crew.toml` exist). Coordinate with the unified onboarding helper (next entry) so `crew init` writes the new shape.

### 2026-04-30 — Unified `crew init` / `crew doctor` onboarding helper

**What:** A single subcommand for project setup, both new and existing:

- **New project**: walk through writing the TOML, **scaffold an `env.toml` at the project repo root** (prompt for orchestration ports, app vars, contexts; populate sensible defaults). The scaffolded project TOML at `~/.config/crew/projects/<name>.toml` MUST use `${VAR}`-style references (e.g. `app_url = "${APP_URL}"`) for `[playwright].app_url` and `[bruno_smoke].base_url`, never the legacy `{httpsPort}` placeholders — `${VAR}` is the only correct syntax for env.toml projects, even though crew still accepts legacy `{httpsPort}` for projects without env.toml. Run `npm install -D @playwright/test` if Playwright is opted in, scaffold `playwright.config.ts` + `tests/e2e/` skeleton, scaffold Bruno collection skeleton if opted in. **Scaffold `<repo>/.claude/settings.json` when one is absent**, and when the project has a docker stack populate `sandbox.excludedCommands` with the project's configured smoke / e2e commands (`npm run bruno:smoke` from `[bruno_smoke]`; `[playwright].authored.test_command` for e2e) — without those, the dispatched agent's network calls against the docker stack hit `ECONNREFUSED` because Claude Code's sandbox runs each agent in a `bwrap --unshare-net` namespace with its own loopback (KAN-12, 2026-05-03). The naive fix of adding `localhost` to `network.allowedDomains` does nothing — that key controls HTTPS egress filtering, not the loopback isolation. For existing projects with a hand-authored `.claude/settings.json`, **doctor mode should diagnose missing-smoke/e2e-in-`excludedCommands`** and offer a one-command fix.
- **Existing project**: modify the TOML in place (toggle blocks, change URLs), run machine-wide health checks (apt deps present, Chromium installed for every configured project, docker socket reachable).

The two halves can ship as one subcommand (single pane of glass) rather than splitting into `crew init` + `crew doctor`.

**Why noticed:** Spec §10.2 of the Playwright integration design. CREW-56's out-of-scope list calls it out as a separate spec.

**Anchors:**

- `docs/superpowers/specs/2026-04-29-playwright-integration-design.md` §10.2
- `packages/cli/src/commands/` — destination for the new subcommand
- `~/.config/crew/projects/<name>.toml` — files this writes/edits

**Shape of work:** Design spec covering the wizard's question tree and the diagnostic rules → implementation plan with TDD steps for each option (new vs existing, each opt-in block, each diagnostic check). Pairs with the per-config-block reference docs (next entry) so wizard prompts point at canonical documentation.

**Open questions:**

- One subcommand with a mode flag (`crew init --check`?) vs. two thin commands sharing a library? Spec should pick.

### 2026-04-30 — Per-config-block reference docs

**What:** Every TOML option documented with its purpose, defaults, validation rules, and required project-side setup. Lives in `docs/config-reference.md` or similar. Pairs with the unified onboarding helper as the static counterpart.

**Why noticed:** Spec §10.3 of the Playwright integration design. CREW-56's out-of-scope list.

**Anchors:**

- `docs/superpowers/specs/2026-04-29-playwright-integration-design.md` §10.3
- `packages/shared/src/config/schema.ts` — source of truth for shape; reference docs derive from this
- README's current per-feature subsections (Visual testing, Bruno smoke tests, Playwright) — partial coverage, scattered

**Shape of work:** One-shot writing pass after the config rationalization spec lands (so the docs reflect the consolidated shape, not the legacy one). Could potentially auto-generate from the zod schema's `.describe()` calls, but that's a tangential infra question.

### 2026-04-30 — CI integration of authored Playwright runs

**What:** Run authored Playwright tests as a GitHub Action in the project's CI on PR push, in addition to the agent-side `npm run test:e2e` gate. Today there's no CI workflow at all in this repo, so this followup spans two concerns: (1) introduce a baseline GitHub Actions workflow file; (2) add Playwright e2e to it.

**Why noticed:** Spec §1 (out-of-scope) of the Bruno smoke design and the Playwright integration spec both call out CI integration as a future epic. CREW-22's ticket explicitly notes "no GitHub Actions workflow exists yet for this repo; adding one is a separate ticket."

**Anchors:**

- `docs/tickets/CREW-22.md` "Out of scope" — CI integration call-out
- `docs/superpowers/specs/2026-04-29-bruno-smoke-tests-design.md` §1 out-of-scope
- `docs/superpowers/specs/2026-04-29-playwright-integration-design.md` out-of-scope list
- `packages/dashboard/playwright.config.ts` (and any future `tests/e2e/`) — what CI runs against
- `.github/workflows/` — currently empty (no workflows committed)

**Shape of work:** Two tickets:

1. **Baseline CI workflow** — typecheck/lint/test:run on push to PR branches. No e2e yet. Probably 50 lines.
2. **Authored Playwright in CI** — extends the workflow with `npx playwright install --with-deps chromium` + `npm run test:e2e --workspace=crew-dashboard`. Decide whether CI also runs the Bruno smoke flow (needs the daemon up — unlike Playwright which starts its own dev server).

**Open questions:**

- Self-hosted runner or GitHub-hosted? GitHub-hosted means re-installing chromium per run; cache helps but adds 30s+. Probably fine for a personal repo.

### 2026-04-29 — Promote `resolveAppUrl` to shared `lib/url-substitution/`

**What:** `resolveAppUrl` lives at `packages/cli/src/lib/playwright/resolve-app-url.ts` but now has three callers (CLI run/fix-pr/agent-environment for both `playwright.app_url` and `bruno_smoke.base_url`). The Bruno smoke design spec explicitly prescribed promoting it to a shared module if a third caller emerged. That threshold has been crossed.

**Why noticed:** Spec §13 ("Open questions / things to revisit") of the Bruno smoke design captured the rule: "If a third caller emerges (e.g. a future smoke-test mechanism), promote the helper into a `lib/url-substitution/` module shared by all three." Verified the call sites (3 active callers) and confirmed the helper still lives under the playwright/ subdirectory after the visual-testing → playwright rename in CREW-58.

**Anchors:**

- `packages/cli/src/lib/playwright/resolve-app-url.ts` — current home
- `packages/cli/src/lib/playwright/resolve-app-url.test.ts` — tests move alongside
- Callers: `packages/cli/src/commands/run.ts:156,167`, `packages/cli/src/commands/fix-pr.ts:160`, `packages/cli/src/lib/run/agent-environment.ts:47`
- `docs/superpowers/specs/2026-04-29-bruno-smoke-tests-design.md` §13

**Shape of work:** Single small refactor PR. `git mv` to `packages/cli/src/lib/url-substitution/`, update callers' imports, leave a re-export in `lib/playwright/index.ts` if the playwright module still wants the surface, or just update everyone. Tests come along unchanged.

### 2026-04-29 — Slice 1c agents continuation work

**Ticket:** [CREW-94](https://safturento.atlassian.net/browse/CREW-94) (Epic) — resolution gated on Epic completion per the user-level CLAUDE.md "Epic exception" convention. This followup and the dashboard agent detail drawer entry below both fold into this Epic.

**What:** Slice 1b (CREW-47) deliberately punted seven concerns into a future "slice 1c" that has not been Epic'd yet:

1. **SSE / `GET /events`** — push-based dashboard updates. Polling via TanStack Query covers slice 1b.
2. **`crew finish` daemon integration** — register a "finish" run on the daemon. Pairs with a dashboard "archive" gesture.
3. **`idle` / `waiting` state derivation** — needs explicit signaling from the JSONL or a heuristic. Drawer state-history makes them visible.
4. **`GET /api/agents/:key`** — single agent + transcript. Drawer prerequisite.
5. **`GET /api/agents/:key/state-history`** — state transitions. Drawer state segmentation prerequisite.
6. **Drawer/timeline endpoints** — whatever else the agent-detail drawer needs once shape is locked.
7. **PR URL extraction from JSONL** — `runs.pr_url` column stays NULL in slice 1b; state still flips to `pr_open` based on tool-call detection alone.

**Why noticed:** [CREW-47](https://safturento.atlassian.net/browse/CREW-47) "Out of scope" list and [CREW-49](https://safturento.atlassian.net/browse/CREW-49) "Out of scope" (mentions slice 1c will likely add a `state_transitions` table for drawer state history).

**Anchors:**

- [CREW-47](https://safturento.atlassian.net/browse/CREW-47) — slice 1b epic, owns the out-of-scope bullets
- `docs/superpowers/plans/2026-04-29-agents-data-end-to-end.md` — slice 1b plan
- `packages/daemon/src/migrations/0001_agents_runs_tool_calls.ts` — `pr_url` column already declared, NULL in slice 1b
- `packages/daemon/src/services/IngestService.*` (path TBD post-slice-1b) — adds PR URL extraction in 1c

**Shape of work:** Becomes a new Epic ("Slice 1c: agents drawer + push updates") with child tickets. Likely:

- `state_transitions` table migration
- Single-agent + state-history endpoints
- SSE endpoint + dashboard subscription
- Agent detail drawer (pairs with the dashboard drawer follow-up below)
- `crew finish` daemon registration + dashboard archive gesture
- Idle/waiting state derivation (probably a heuristic over tool-call gaps)

Don't open this epic until slice 1b (CREW-47) closes.

### 2026-04-29 — CREW-25 cva-refactor cleanup leftovers

**What:** Three small TD items surfaced in CREW-25's PR description as "Follow-ups (not in this PR)" and never picked up:

1. **`STATE_META.colorVar` is unused.** `STATE_CLASSES` is now the single source of truth for state→Tailwind-class mapping. Verified: `colorVar` is still defined for all 7 states in `state-meta.ts:5,11–22` but no production code reads it.
2. **`@source inline(...)` directives are redundant.** All state classes are now literal in source, so Tailwind's JIT sees them without the safelist. Verified: 6 `@source inline(` directives still present in `index.css:79,82,85,88,91,94`.
3. **`ALL_STATES` and `ACTIVE_STATES` are duplicated across files.** `ALL_STATES` exists in both `StateBadge.tsx:15` and `state-meta.test.ts:56`. `ACTIVE_STATES` exists in both `AgentRow.tsx:16` and `StateBadge.tsx:80`. Lift to `state-meta.ts`.

**Why noticed:** [PR #35](https://github.com/Safturento/crew/pull/35) (CREW-25) description "Follow-ups (not in this PR)" section.

**Anchors:**

- `packages/dashboard/src/data/state-meta.ts:5,11–22` — `colorVar` field
- `packages/dashboard/src/index.css:79–94` — `@source inline` directives
- `packages/dashboard/src/components/StateBadge.tsx:15,80`, `packages/dashboard/src/components/AgentRow.tsx:16` — duplicated constants
- `packages/dashboard/src/data/state-meta.test.ts:56` — test-side duplicate

**Shape of work:** One small cleanup ticket touching 5 files. Drop `colorVar`, drop `@source inline` directives (with build-output verification that tokens still emit), lift the two `Set<AgentState>` constants. Bundle into the next dashboard refactor that touches these files if one comes up first.

### 2026-04-28 — Dashboard write/action endpoint surfaces

**What:** §10 of the dashboard UI design lists daemon API additions the UI depends on for write/action surfaces. None of these exist yet, and most are NOT covered by the slice-1b/1c read-side endpoints. Specifically:

- `POST /jobs/run` — start `crew run` (project + ticket key)
- `POST /jobs/fix-pr` — start `crew fix-pr` (agent key + source flag)
- `POST /jobs/finish` — start `crew finish` (agent key)
- `GET /jira/:project/tickets` — proxy to Jira for the ticket picker (cached)
- `POST /projects` / `PATCH /projects/:name` / `DELETE /projects/:name` — projects CRUD writing TOML files
- `POST /attention/clear` — clear all sticky favicon badges from anywhere

**Why noticed:** `docs/superpowers/specs/2026-04-26-dashboard-ui-design.md` §10. The spec calls these out as prerequisites for the New Run modal, the Projects route, and the cross-tab clear-attention surface. Verified none of `/jobs/`, `/api/projects/:`, `state-history`, `attention/clear`, or `jira` endpoints exist anywhere under `packages/daemon/`.

**Anchors:**

- `docs/superpowers/specs/2026-04-26-dashboard-ui-design.md` §10
- `packages/daemon/src/routes/` — destination for these handlers
- `packages/cli/src/commands/run.ts`, `fix-pr.ts`, `finish.ts` — the daemon endpoints have to dispatch to the same code paths the CLI uses (or a shared library)
- `packages/shared/src/config/loader.ts` — projects CRUD writes TOML files; reuse the parser

**Shape of work:** Probably its own Epic ("Daemon write surfaces"), parallel-able with Slice 1c. Each `POST /jobs/*` endpoint needs to spawn the same orchestration the CLI does — argues for hoisting `runRun`/`runFixPr`/`runFinish` into a callable library if they aren't already. Projects CRUD touches the TOML loader's write-path, which doesn't exist today (loader is read-only).

**Open questions:**

- Authentication: this is localhost-only, but a `POST /jobs/run` invoked by accident could spawn an agent against the wrong ticket. Probably needs a confirmation token or an idempotency key. Resolve in spec.
- Should `/jobs/` endpoints be sync (return when the agent exits) or async (return immediately, observe via SSE)? Async is the natural fit given runs are long-lived.

### 2026-04-28 — Flesh out the project-resolution design

**What:** The design exploration at `docs/rationale/project-resolution.md` is explicitly marked pre-implementation notes — "Initial leaning", "Sketched implementation outline", with no chosen approach locked in. The triggering incident — `crew run <KAN-ticket>` from inside the `crew` repo failing with a wrong-project error — is still real today. CLI partial workaround: `--project <name>` flag exists on `crew list` and `crew status` but not on `crew run` / `crew fix-pr` / `crew finish` / `crew resume` etc.

**Why noticed:** The doc itself opens with `**Status:** Pre-implementation design notes`. PR [#21](https://github.com/Safturento/crew/pull/21) merged it in Apr 28 (then as `docs/plans/project-resolution.md`) with the explicit intent "needs fleshing out before this drives any code." Five months of subsequent work on the daemon + dashboard sharpens the need: the dashboard's write endpoints (entry above) will land project-by-name from a non-CLI surface. CREW-156 migrated the stub to `docs/rationale/` and documented the current cwd-only behavior in `.agents/local-dev.md`; the followup itself still applies because nothing's been implemented yet.

**Anchors:**

- `docs/rationale/project-resolution.md` — the design exploration (was `docs/plans/project-resolution.md` before CREW-156)
- `.agents/local-dev.md` — current cwd-only behavior + pointer to this followup
- [PR #21](https://github.com/Safturento/crew/pull/21) — original landing
- `packages/cli/src/commands/list.ts:105`, `packages/cli/src/commands/status.ts:91` — partial `--project` flag implementation
- `packages/cli/src/lib/discover-project-config.ts` — current cwd-only resolver
- `packages/shared/src/config/loader.ts` — `loadProjectConfigByName` exists but no key-prefix resolver

**What's been considered:** Four options (A: ticket-key prefix, B: explicit `--project`, C: per-user default, D: hybrid precedence). Initial leaning is D (hybrid) per the doc's last paragraph.

**Shape of work:** Brainstorm → spec → implementation plan. Likely one ticket lands the shared resolver (`packages/shared/src/config/resolveProject.ts`), then a sweep migrating each command. Dashboard endpoints (above) should consume the same resolver from day one, not roll their own.

### 2026-04-28 — Dashboard agent detail drawer + full-page route

**Ticket:** [CREW-94](https://safturento.atlassian.net/browse/CREW-94) (Epic) — folded into the Slice 1c Epic alongside the agents-continuation followup above. In hindsight these could have been two Epics, but they share enough scope that one Epic covers both. Resolution gated on Epic completion per the user-level CLAUDE.md "Epic exception" convention.

**What:** The `AgentDetailPlaceholder` component currently renders "The agent detail drawer ships in a follow-up plan." That follow-up plan does not exist yet. The drawer is the dashboard's primary drill-down surface (per UI design spec §5) — without it, `/agents/:key` is a dead end. The full-page variant (`/agent/:key/full`) is also unbuilt.

**Why noticed:** [PR #20](https://github.com/Safturento/crew/pull/20) (CREW-17) called the drawer "future epic" in non-goals. The dashboard foundation plan (`docs/superpowers/plans/2026-04-26-dashboard-foundation-and-agents-list.md`) explicitly listed it under "Out of scope (will be subsequent plans)." No subsequent plan filed yet.

**Anchors:**

- `packages/dashboard/src/components/AgentDetailPlaceholder.tsx` — the placeholder to replace
- `packages/dashboard/src/App.tsx` — where the drawer mounts (today routes to the placeholder)
- `docs/superpowers/specs/2026-04-26-dashboard-ui-design.md` §5 — the design spec for the drawer
- `docs/designs/design_handoff_crew_dashboard/` — visual reference for the drawer (timeline, token table, state-history)
- Slice 1c read endpoints (entry above) — backend prerequisites

**Shape of work:** Becomes a child of the slice-1c epic (entry above) since it depends on `GET /api/agents/:key` and state-history. Phase A: drawer component + route wiring against fixtures. Phase B: wire to real endpoints once they ship. Phase C: full-page variant (mostly route + layout).

### 2026-04-28 — Dashboard New Run modal + projects route view

**What:** Two more frontend surfaces deferred from the foundation plan:

1. **New Run modal** — project picker → ticket picker → confirm. Exposed by the top nav's `+ New Run` button (currently a no-op handler). Depends on `POST /jobs/run` and the `GET /jira/:project/tickets` endpoint (entry above).
2. **Projects route view** — list of registered projects, TOML viewer, edit/register form. Currently `#/projects` renders a "ships in a follow-up plan" placeholder. Depends on projects CRUD endpoints (entry above).

**Why noticed:** Dashboard foundation plan explicitly listed both under "Out of scope (will be subsequent plans)." No subsequent plan filed yet.

**Anchors:**

- `packages/dashboard/src/App.tsx` — "+ New Run" handler is a no-op; `/projects` route renders placeholder
- `docs/superpowers/specs/2026-04-26-dashboard-ui-design.md` §6 (New Run modal), §7 (Projects route)
- `docs/superpowers/plans/2026-04-26-dashboard-foundation-and-agents-list.md` Out-of-scope list

**Shape of work:** Frontend tickets paired with the dashboard write-endpoint epic above. Each modal/view is its own ticket. The projects route also needs a TOML formatter for display — pairs with the per-config-block reference docs entry above.

### 2026-04-28 — `useAttention.clear()` snapshot semantic isn't directly tested

**What:** `useAttention.clear()` is documented in the foundation plan as having a "snapshot" semantic — calling clear adds _currently-attention_ keys to `dismissed`, but newly-attention agents that arrive later still bubble up. The behavior is exercised through `App.test.tsx`'s end-to-end flow but not directly unit-tested. PR description called it "Worth a small follow-up."

**Why noticed:** [PR #20](https://github.com/Safturento/crew/pull/20) (CREW-17) "Known coverage gaps" section.

**Anchors:**

- `packages/dashboard/src/attention/useAttention.ts` — `clear()` implementation
- `packages/dashboard/src/attention/attention.test.ts` — test file with no `clear()` cases
- `packages/dashboard/src/App.test.tsx:60` — only existing test that hits `clear()` indirectly

**Shape of work:** Tiny cleanup. Add 2–3 RTL test cases: clear-when-no-attention is no-op, clear-then-new-attention bubbles, clear-twice-without-new-attention is idempotent. Bundle into the cva-cleanup ticket above or stand alone.

### 2026-04-27 — Dashboard mobile responsive layout polish

**What:** The dashboard's home view (agent list + project sections) was built desktop-first with a mention in CREW-15's non-goals: "Mobile responsive layout polish — out of scope for this push; covered in the spec but deferred." The UI design spec §4 spells out the responsive contract: "On narrow widths (mobile, vertical monitor below the drawer-min-width), each row collapses to a card layout: top line = state badge + key + truncated title; bottom line = runtime + tokens + action button. No horizontal scroll at any width." That collapse hasn't been implemented yet.

**Why noticed:** CREW-15 ticket "Non-goals" section + dashboard UI design §4 (responsive behavior) + §9 (breakpoints). PR [#17](https://github.com/Safturento/crew/pull/17) shipped without it.

**Anchors:**

- `packages/dashboard/src/components/AgentRow.tsx` — desktop-only grid layout today
- `packages/dashboard/src/components/ProjectSection.tsx` — section header layout, also desktop-only
- `packages/dashboard/src/components/AgentsList.tsx` — desktop max-width container
- `docs/superpowers/specs/2026-04-26-dashboard-ui-design.md` §4 + §9 — responsive contract + breakpoints
- [CREW-15](https://safturento.atlassian.net/browse/CREW-15) "Non-goals"

**Shape of work:** Single ticket. Add Tailwind breakpoint classes (≥768 / <768 per spec §9). Card-style fallback for `<768px`. Manual smoke on a phone viewport. Pairs with the drawer follow-up's mobile sheet (drawer becomes a full-screen sheet at <768px per spec §5).

### 2026-04-26 — Architecture doc open questions still unresolved

**What:** Three of the five original architecture "Open questions" are still genuinely open (the open ones now live in `.agents/architecture.md` under "Currently open architectural questions"; the settled ones are recorded in `docs/rationale/architecture.md`):

1. **Distribution past Phase 1.** Phase 1 ships via local `npm link` (then via `install.sh` symlinking from a checkout). Past that: `npm publish` is the easy default; Node SEA single-binary is fancier but ergonomic for shipping to multiple machines without a Node install.
2. **Auth secrets storage.** Where do gh-token, jira-token, anthropic-api-key live? Currently per-repo `.claude/secrets/`. Architecture doc proposes per-user `~/.config/crew/secrets.toml` with project-scoped fallbacks, but no spec/implementation.
3. **MCP tools or REST?** The agent uses MCP for Jira; the daemon will use REST for transitions outside the agent context. Some duplication acknowledged. Worth deciding before the daemon grows more Jira-touching code.

The other two open questions (sandbox config drift, Phase 2 + Phase 3 separation) are subsumed by other followups and shipped slices respectively.

**Why noticed:** original architecture plan's "Open questions" section (in `docs/plans/architecture.md` before that doc was retired during CREW-155).

**Anchors:**

- `.agents/architecture.md` "Currently open architectural questions" — distribution + auth secrets bullets
- `docs/rationale/architecture.md` "Settled questions" — sandbox-config-drift, Phase 2/3 separation, MCP-vs-REST resolutions
- For #1: `scripts/install.sh`, README's Install section
- For #2: `~/.config/crew/.secrets.env` (current location per CREW-33's debug notes), `packages/cli/src/commands/finish.ts` `readJiraSecrets`, daemon's eventual JIRA client
- For #3: agent's MCP Jira config (in `~/.config/crew/projects/<name>.toml` `[sandbox]` allowlist), `packages/cli/src/lib/jira/client.ts` (REST), the daemon will need REST too

**Shape of work:** Each is independent. #1 punts until "we want to install crew on a machine that doesn't already have it." #2 is design-spec-then-implementation, gated on the secrets-file location decision. #3 likely doesn't need its own ticket — accept the duplication since both clients are small — but worth a one-paragraph decision note in the architecture doc.

## Resolved

(items move here when ticketed and shipped, or fixed inline — keep for historical context, prune when the file gets long)

### 2026-05-18 — StateBadge / CountBadge `.figma.tsx` still point at the archived DS file (Pill consolidation has no name-match)

**What:** `StateBadge.figma.tsx` and `CountBadge.figma.tsx` still `figma.connect(...)` to the archived `DsA7QuEa2WthDATkksd1Bq` file (nodes `20-23` / `77-28`). CREW-175 re-aimed the other 12 dashboard `.figma.tsx` files at the live `9FeJPriqdsdA4n9R5Xsrr8`, but skipped these two: both components were consolidated into the unified `Pill` set, so the committed `.crew/figma-snapshot/index.json` has no node named `StateBadge` or `CountBadge` to mechanically resolve against, and CREW-175's scope forbade guessing.

**Why noticed:** Out-of-scope item from CREW-175 — see that PR's description. The ticket explicitly routed the no-snapshot-match cases to manual follow-up.

**Anchors:**

- `packages/dashboard/src/components/StateBadge.figma.tsx`, `packages/dashboard/src/components/CountBadge.figma.tsx`
- `Pill` set is node `272:120` in `9FeJPriqdsdA4n9R5Xsrr8` (`.crew/figma-snapshot/index.json`)
- [[project_crew_ds_pill_unified]] covers the Pill consolidation

**Resolved 2026-05-18 (CREW-135):** Made moot by retirement, not re-mapping. CREW-135 (T1 Pill primitives) deleted `StateBadge.tsx` / `CountBadge.tsx` and their `.figma.tsx` files — every state pill and count pill is now a `Badge` (`ui/badge.tsx`). `badge.figma.tsx` maps `Badge` to the `Pill` set `272:120` with `variant: { type: 'pill' }`, so the consolidated-file mapping the followup asked for now exists on `Badge` itself. No orphaned `.figma.tsx` files remain to re-aim.

### 2026-05-12 — Update `.figma.tsx` Code Connect files after Crew DS consolidation

**What:** All 21 `.figma.tsx` files under `packages/dashboard/src/components/` reference the **archived** standalone Crew DS file URL (`DsA7QuEa2WthDATkksd1Bq`) and node IDs that no longer exist after the 2026-05-12 consolidation. The Crew DS now lives inside the dashboard file at `9FeJPriqdsdA4n9R5Xsrr8`, and many components (Button, StateBadge, CountBadge, TimelineTag) were consolidated into `Pill`. Other new composites (`Modal`, `AlertModal`, `ModalSelectionRow`, `FormField`, `Input`, `Switch`, `Stepper`) have no `.figma.tsx` mappings yet.

**Why noticed:** During the 2026-05-12 design session, after building the new composites. Files are intentionally not published per [[project_code_connect_skipped]] (Pro tier limitation), so they're inert docs — but they're docs that the future `design-with-figma` skill will read to translate Figma instances → React code. Stale URLs / removed component references mean wrong or missing translations.

**Update 2026-05-18 (CREW-152 validation run):** the staleness now has a sharper, load-bearing impact. The render-frame-anchored `visual-fidelity-check` workflow Step 4.1 resolves a caller's render composite via its `.figma.tsx` `figma.connect(...)` URL. With `TopNav.figma.tsx` / `AgentRow.figma.tsx` still pointed at `DsA7QuEa2WthDATkksd1Bq` skeleton nodes `21-2` / `21-9`, a strictly-mechanical Step 4 resolves to `composites/21-2.json` (absent) and surfaces HIGH missing-data instead of the real encoding error. The CREW-152 validation run worked around it by resolving the composite by component name via the fixture's `snapshot/index.json` (`"TopNav"` → `245:133`). Re-aiming these pointers at the live composites (`9FeJPriqdsdA4n9R5Xsrr8` `245:133` / `212:910`) removes the need for the name-fallback.

**Resolved 2026-05-18 (CREW-175):** Re-aimed all 12 `.figma.tsx` files whose `figma.connect(...)` URL had a matching node in the committed `.crew/figma-snapshot/index.json` from the archived `DsA7QuEa2WthDATkksd1Bq` to the live `9FeJPriqdsdA4n9R5Xsrr8` (`TopNav` → `245-133`, `AgentRow` → `212-910`, and the ten remaining composites). `StateBadge.figma.tsx` and `CountBadge.figma.tsx` were left on their archived URLs — both components were consolidated into the unified `Pill` set, so the committed snapshot has no node named `StateBadge`/`CountBadge` to mechanically resolve against; re-mapping them needs a design decision (multiple variant-scoped `figma.connect()` calls against `Pill` `272:120`) and is filed as the new followup below. The `ui/*.figma.tsx` shadcn primitives target the Core DS file, never the archived Crew DS, so they were untouched. The new-composite mappings (`Modal`, `AlertModal`, etc.) remain unbuilt — out of scope for CREW-175, which only re-aimed existing files.

### 2026-05-12 — New Run modal list rows need a proper component (project / ticket rows lost metadata during bulk Button swap)

**What:** Frame `1:2980` "New Run modal - 1. Select Project" originally rendered each project as a wide list row (h=42-43): project name on the left, repo path next to it, Jira key + active count on the right. Similarly modal step 2 "Select Ticket" rendered ticket rows with key + title + age + tokens. During the 2026-05-12 bulk Button swap, these 9 rows (4 project rows in step 1, 5 ticket rows in step 2) were misclassified as detached Buttons (because the imported frame name was "Button") and swapped to `variant=secondary, size=lg` Button instances — which only carried the leading text label across, dropping all the right-side metadata.

**Why noticed:** During the 2026-05-12 in-session bulk Button swap pass, after seeing the rendered New Run modal — the projects collapsed to small pill-shaped buttons instead of full-width rows.

**Resolved 2026-05-12:** Built a dedicated `ModalSelectionRow` composite (single component, not project/ticket-specific) that supports both contexts. Properties: `Primary` (TEXT, name/key), `Secondary` (TEXT, repo path / ticket title — Fira Code), `Meta` (TEXT, jira key / age — Fira Code right-aligned), `Show Badge` (BOOLEAN), plus an inner Pill (`type=tag, color=running, intensity=muted`) for the badge label. All 9 rows swapped: 4 project rows in step 1 with full metadata (kanban-api / ~/code/... / KAN / 4 active badge, etc.) and 5 ticket rows in step 2 with placeholder ticket metadata (KAN-31 / Drag-and-drop... / 8d / 38.1k badge, etc.). The original ticket metadata couldn't be recovered (lost in the bulk Button swap), so plausible placeholders were used — designers can override per-instance when real data lands. An earlier interim attempt mapped these to `Pill type=button-lg` which lost the metadata; that approach was discarded in favor of the dedicated composite after seeing the user's reference screenshot showing rich rows.

### 2026-05-10 — Build a `TimelineTag` component in Crew DS for tool-name pills

**What:** The 22 timeline event tag pills (Bash / Read / Edit / Grep / Question across the timeline section in frames `1:378` + `1:1900` of the Crew Dashboard Screens file) currently live as detached structures — each pill is a manually-built frame with bg + stroke + text, styled to the canonical mid intensity (bg 10% + stroke 30% + text 100%) bound to a state color. They're not real component instances. To get a designer-friendly "brackets on/off" toggle (like the claude.ai tweaks-menu pattern) and to remove the per-pill maintenance burden, build a real `TimelineTag` component in Crew DS.

**Why noticed:** During the CREW-130 visual fixes session on 2026-05-10, the user asked whether brackets on the timeline pills could be a Figma toggle (vs editing all 22 in place). Yes — Figma supports boolean variant properties exactly for this use case. We removed brackets in place to unblock the session, but the underlying component gap remains.

**Resolved 2026-05-12:** Built `TimelineTag` COMPONENT_SET (`263:134` in file `9FeJPriqdsdA4n9R5Xsrr8`) with 7 `tool` variants — Bash/Read/Edit/Grep/Question/Write/Glob — each styled with the canonical mid-intensity pattern: bg bound to `{color}-1050` (Crew/Tailwind Extensions premixed dark, matching StateBadge), stroke + text bound to the corresponding `state/X` semantic var. Mapping: Bash/Question→state/waiting (amber), Read/Glob→state/initializing (blue), Edit→state/finished (emerald), Grep→state/pr-open (violet), Write→destructive (red). Swapped all 22 detached Overlay pills inside timeline rows to TimelineTag instances, zero errors. **Deferred from original scope:** the `Brackets` BOOLEAN property (current dashboard doesn't render brackets, so default-off; can add when needed) and the muted/loud intensity tiers (only mid is in current use). Per-variant label hardcoding replaces the proposed set-level `Label` TEXT property since Figma TEXT properties can't have per-variant defaults — users still get per-instance text override via direct text edit.

### 2026-05-12 — Migrate main agents list project headers to ProjectHeader composite

**What:** The Crew Dashboard Screens file's main agents-list frames have per-project section headers (e.g. "kanban-api · 3 active · 4 total" headers above each project's agent group). These are currently hand-built compositions, not `ProjectHeader` composite instances. Should swap them to instances so future ProjectHeader updates flow through.

**Why noticed:** During the 2026-05-12 in-session Button rollout Epic, while finishing Phase 3 (frame `1:2443` swap to ProjectHeader instance). User noted: "we'll want to update the project headers for each project on the main agents list to use the composite after this as well, though we need to update the composite to match first." Deferred so the Epic stayed bounded.

**Resolved 2026-05-12:** Decided on **(b) new composite** — built the existing `ProjectSection` composite (220:224) up to match the dashboard rendering (chevron + name + ghost ExternalLink button + count + right-aligned mono repo path), with TEXT properties for projectName/countSummary/repoPath and BOOLEAN for showing the open button. Swapped all 22 detached section `Header` frames on Dashboard Screens to `ProjectSection` instances with per-section text overrides. Visual fidelity verified on `1:2` (Agents List) and `1:378` (Drawer Open). `ProjectHeader` composite (220:315) remained as the project-detail page header — separate concern. Folder icon between chevron and name (present in `ProjectSection.tsx`) intentionally skipped in the composite; can be added later if the design adopts it.

### 2026-05-10 — Polish CREW-131 Projects view composites (instance swaps + real Button instances)

**Resolved 2026-05-12:** Done as part of the in-session Button rollout Epic (spec: `docs/superpowers/specs/2026-05-11-button-system-rollout-design.md`). All three sub-items addressed:

1. **Frame `1:2334` count badges + project rows** → 4 `ProjectRow` instances with per-row text overrides (kanban-api / crew / lighthouse / mailer-svc) + 3 `CountBadge` instances (`state=running` with count text overrides; mailer-svc's count slot hidden via `visible=false`).
2. **Frame `1:2443` project header + config block** → `ProjectHeader` instance (with title + config-path text overrides) and `ProjectConfigBlock` instance (with TOML content override). Plus a bonus: the 4 detached AgentRow frames in `1:2443` were also swapped to `AgentRow` instances per state (waiting / pr-open / running / finished) with title/ticket/runtime/tokens overrides, and the redundant agents-section header was removed.
3. **`ProjectHeader` composite Edit/Remove buttons** → real `Button` instances (`variant=outline, size=sm, Label="Edit"` + `variant=danger, size=sm, Label="Remove"`). Per a naming decision made in the rollout, `destructive` now means "loud solid red" (used for terminal/irreversible CTAs like the modal Delete) and `danger` means "quieter tinted red with stroke" (used for non-terminal red CTAs like Remove-that-opens-a-confirmation).

The Crew DS composites were resized from 800w → 1052w in the same session to match the Screens content area, removing the original mismatch that would have made naive swaps look wrong.

**What:** The CREW-131 closeout interactive session built all 4 Projects-view composites (`CountBadge`, `ProjectRow`, `ProjectHeader`, `ProjectConfigBlock`) and migrated frames `1:2334` + `1:2443` to bound colors + StateBadge instances. Three structural-swap items were intentionally skipped to keep the session bounded:

1. **Frame `1:2334` count badges + project rows are still detached.** The 3 visible count badges had their bg fills color-fixed (forced opacity 0.18 per Trap 1) but were not swapped to `CountBadge` instances. The 4 project rows are still hand-built layouts, not `ProjectRow` instances. Visual is correct; semantic linkage to the composites isn't there yet.
2. **Frame `1:2443` project header is still detached.** The header section (back link + name + config path + Edit/Remove buttons) is hand-built, not a `ProjectHeader` instance. Same for the config block — not a `ProjectConfigBlock` instance.
3. **`ProjectHeader` composite uses inline-styled action buttons.** The Edit (outline) and Remove (destructive-mid) buttons inside the composite are hand-built frames matching the canonical mid intensity, not real shadcn `Button` instances from the Core library. Future updates to the Core Button (e.g. focus ring tweaks) won't flow through.

**Why noticed:** During the 2026-05-10 CREW-131 closeout. The composites + bindings + state-pill swaps got us to 99% bound + correctly-rendered frames; the structural swaps + Button inlining are polish that doesn't change visual fidelity but does affect design-system semantic linkage and future-update propagation.

### 2026-05-10 — Migrate the agents-related Figma frames (Agents List, Drawer Open, Agent Page full) to Crew DS instances + semantic-token bindings

**Resolved 2026-05-10:** Done in an interactive Figma-MCP session (no Jira ticket — manual designer work paired with the agent). Frames `1:2`, `1:378`, and `1:1900` in the Crew Dashboard Screens file (`9FeJPriqdsdA4n9R5Xsrr8`) all migrated: 258/267 + 183/186 + 267/267 fills bound to `Crew / Semantic Colors` tokens; 30 detached state-pill structures swapped for `StateBadge` instances; explicit `dark mode` set on both the Crew Semantic Colors and Core `mode` collections per frame. StateBadge component itself was repolished mid-session — text/dot/border bind to the matching `state/X` token at full opacity, bg fill drops to opacity 0.18 for the canonical tinted-pill look (now documented in `docs/plans/design-system.md` "StateBadge visual pattern (canonical)"). A new `state/foreground` token landed in Crew DS for fixed-dark contrast situations (currently unused but available). Lessons learned will land as a `figma-screen-migration` skill so future migrations don't relearn the gotchas (publish-cache invalidation, instance-override resetting, two-collection mode propagation, etc.).

**What:** The fidelity vertical slices plan (`docs/superpowers/plans/2026-05-10-fidelity-vertical-slices.md`) asked the two implementing tickets to migrate three frames in the Crew Dashboard Screens file (`9FeJPriqdsdA4n9R5Xsrr8`): bind hardcoded fills to Crew DS semantic + state tokens, and swap detached primitive structures (state pills, action buttons, agent rows, project section headers, drawer chrome, state-history chips, token table, viewport frame) for Crew DS instances.

- **Phase A (CREW-119, Tasks A.13 + A.14):** `Agents List (/)` — frame `1:2`
- **Phase B (CREW-117, Tasks B.8 + B.9):** `Agents List (/) - Agent Drawer Open` — frame `1:378`, and `Agent Page (/agent/XXX-123/full)` — frame `1:1900`

Both autonomous runs (CREW-119 on 2026-05-10 morning, CREW-117 on 2026-05-10 mid-day) deferred the migrations for the same reason: per-element semantic-role binding is designer judgment, not heuristic. The dashboard-side fidelity sweep (the user-facing ticket goal) and the Crew DS composite buildout landed in both tickets, but the Figma frames carried hardcoded fills + detached structures until the 2026-05-10 manual session resolved them.

### 2026-05-07 — `sandbox-network-note.md` recommends `crew restart --hard` for docker recovery, but `--hard` nukes the worktree

**Resolved 2026-05-08:** Replaced the destructive `crew restart --hard` recommendation with `docker compose up --build --wait` as part of [CREW-115](https://safturento.atlassian.net/browse/CREW-115) (which also closed three other linked gaps in agent-shell e2e reliability). Snapshot and explicit-text test assertions updated together.

**What:** The Playwright sandbox-network-note in the dispatched agent's prompt tells the agent: "If `npm run test:e2e` fails with `ECONNREFUSED`… consider `crew restart {{key}} --hard`." But `crew restart --hard` calls `runReset({hard: true})` which removes the worktree + branch (full clean slate via `crew run`). That's wildly destructive for the situation the note describes — it'll wipe in-progress agent work to recover from a transient docker bringup hiccup. The right escape hatch is `docker compose up --build --wait` from the worktree.

**Why noticed:** Surfaced during the CREW-110 (move-rebase-into-agent) Mumen design discussion on 2026-05-07. While picking the right docker-recovery instruction for the new rebase-preamble, we cross-checked what `--hard` actually does and realized the existing note has been quietly recommending a destructive operation.

**Anchors:**

- `packages/cli/src/lib/prompts/templates/sandbox-network-note.md` — the misleading line
- `packages/cli/src/lib/prompts/__snapshots__/builders.test.ts.snap` — same string baked into the snapshots
- `packages/cli/src/commands/restart.ts` and `packages/cli/src/commands/reset.ts` — confirm `--hard` removes worktree + branch
- The new `rebase-preamble.md` from CREW-110 will already prefer `docker compose up --build --wait`; this is the same fix in the sibling template

**What's been considered:** Two reasonable wordings for the replacement: (a) `docker compose up --build --wait` from the worktree, or (b) `docker compose down && docker compose up --build --wait`. (a) is sufficient when the stack is just unhealthy (compose handles diff); (b) is needed if there's actual container corruption. Lean (a) — it's what fixes 99% of cases and the agent can escalate to (b) on its own.

**Shape of work:** Trivial template + snapshot update. One commit.

**Open questions:** None.

### 2026-05-05 — Dashboard Dockerfile doesn't copy `tsconfig.base.json`, breaks vite at runtime with TSCONFIG_ERROR

**Resolved 2026-05-07:** Shipped via [PR #111](https://github.com/Safturento/crew/pull/111) (commit `adf26c9`). Both `packages/daemon/Dockerfile` and `packages/dashboard/Dockerfile` now `COPY package.json package-lock.json tsconfig.base.json ./` before copying their workspace, mirroring the shared-root pattern. No Jira ticket — chore-style fix. Move to Resolved was a catch-up edit on 2026-05-07, not atomic with the implementing PR (predates the "Ticketing a followup" convention).

**What:** `packages/dashboard/Dockerfile` copies only `packages/dashboard/` into the image, but `packages/dashboard/tsconfig.json` extends `../../tsconfig.base.json` from the repo root. Inside the container at `/app/packages/dashboard/`, the parent `tsconfig.base.json` is missing, so vite-oxc fails on every request with `[TSCONFIG_ERROR] Failed to load tsconfig for 'src/main.tsx': Tsconfig not found` and renders only the vite error overlay. End-to-end visible: dashboard at the host port (canonical 5173 or worktree-hashed) shows the overlay, no app HTML, all e2e tests fail with "element not found."

**Why noticed:** Surfaced during CREW-91 verification (Playwright env-aware baseURL). With `CREW_APP_URL=http://localhost:18228 npm run test:e2e` the env routing successfully reached the worktree dashboard, but every test failed because the page was just the vite overlay. Same failure mode hitting the canonical port. The playwright config change itself is correct; the dashboard container is the breaking change.

**Anchors:** `packages/dashboard/Dockerfile`, `packages/dashboard/tsconfig.json` (the `extends: "../../tsconfig.base.json"` line), `tsconfig.base.json` at repo root, CREW-88 (the dashboard-Dockerfile ticket that introduced the image).

**What's been considered:** Add `COPY tsconfig.base.json ./` (or copy the whole repo root tsconfig graph) before `COPY packages/dashboard ./packages/dashboard`. Mirrors how the daemon Dockerfile handles shared root files. Likely a one-line Dockerfile fix.

**Shape of work:** Small — one Dockerfile edit + a rebuild verification (`docker compose --profile dev up -d --build --wait`, then `npm run test:e2e`).

### 2026-05-05 — Worktree env-injection of `CREW_SEED_FIXTURES=1` not wired

**Resolved 2026-05-07:** Shipped via CREW-111 alongside its two coupled siblings (project TOML seeding + e2e selector rewrite). Took option 2 from the considered list: hardcoded the var in the bringup-side materializer for non-canonical worktrees (`materialize()` injects `CREW_SEED_FIXTURES=1` into `result.base` when `!opts.isCanonical`). The per-mode env-spec generalization (option 1) is deferred until a second var needs the same shape. Canonical worktrees keep the docker-compose default of `0` — option-question 1 ("opt-in for canonical?") was answered "no for v1."

**What:** CREW-90 lands the daemon-side seed mechanism — `seedFixtures()` and the `serve.ts` branch that runs it when `CREW_SEED_FIXTURES === '1'`. The other half of the contract (the worktree's auto-generated `.env` actually setting that var) is not in place. Both `env.toml` and the bringup-side env materializer have no entry for `CREW_SEED_FIXTURES`, so worktree compose stacks come up with the docker-compose default of `0` and the seed branch is a no-op. Until this lands, crew run dispatches don't deliver the fixture-seeded UX the dockerization Epic targets.

**Why noticed:** Surfaced while implementing CREW-90. The plan (`docs/superpowers/plans/2026-05-05-crew-dockerization.md`) and spec (`docs/superpowers/specs/2026-05-04-crew-dockerization-design.md`) both describe the worktree `.env` as setting `CREW_SEED_FIXTURES=1`, but neither the CREW-87 env.toml nor any bringup-side code injects it — the gap is silent. The CREW-90 unit tests cover the daemon-side branch end to end, so the daemon is ready; only the producer side is missing.

**Anchors:**

- `env.toml` — currently declares only `COMPOSE_PROJECT_NAME`, `CREW_PORT`, `CREW_VITE_PORT`, `APP_URL`, `DAEMON_URL`, `COMPOSE_PROFILES`. The new entry would land here.
- `packages/cli/src/lib/env-spec/materialize.ts` — the materializer that turns `env.toml` into a worktree `.env` file. Whether it can express "set this var only in non-canonical worktrees" determines whether env.toml or the materializer needs the extra logic.
- `packages/cli/src/lib/docker/start-bringup.ts` — bringup orchestration. Could also inject the var directly when invoking compose for a worktree.
- `packages/daemon/src/serve.ts` — the consumer (CREW-90).
- `docker-compose.yml` — has `- CREW_SEED_FIXTURES=${CREW_SEED_FIXTURES:-0}` already; the producer side is the gap.
- CREW-90 (lands daemon side); CREW-86 Epic.

**What's been considered:**

- **Add a new env-spec kind to `env.toml`** that lets a key declare different values for canonical-vs-worktree mode (e.g. `kind = "mode-static"` with `canonical = "0"` and `worktree = "1"` fields). Most general; lets future per-mode env vars reuse the pattern. Bigger surface to design and test.
- **Hardcode the var in the bringup-side materializer** for non-canonical worktrees. Smaller change; matches the way `COMPOSE_PROFILES = "dev"` is already a template default that crew expects every worktree to have. Less generic.
- **Set it in `docker-compose.yml` directly under a worktree-specific override file**. Compose supports `docker-compose.override.yml` and worktree-only overrides, but crew currently uses a single compose file driven by env, not multiple files. Adopting overrides would change the architecture.

**Shape of work:** One small ticket. Likely the bringup-side approach (option 2) — least architectural disruption, ships the seed UX to worktrees immediately. Defer the per-mode env-spec generalization until a second var needs it.

**Open questions:**

- Should canonical worktrees also be able to opt into seeding (e.g. for screenshot/demo runs)? If yes, the gate isn't "non-canonical" but "explicit override" — a knob the user can flip. If no, "non-canonical worktree → seed=1" is sufficient.
- Does the materializer have a notion of "current worktree is the canonical one" available at materialize time? `[docker].canonical_worktree` in the project config has the answer; the materializer would need to consult it.

### 2026-05-05 — Dashboard e2e tests expect mock-client project names that don't match the daemon fixtures

**Resolved 2026-05-07:** Shipped via CREW-111. Took path (a) from the considered list — name-agnostic shape rewrite. The list-projects test now asserts ≥2 `Toggle <name>` buttons; the collapse/expand test scopes to the first `<section>` so the agent-row visibility check tracks that section's collapse state. Required the two coupled producer-side fixes (CREW_SEED_FIXTURES injection + project TOML seeding) to land in the same PR so seeded fixtures actually populate `/api/projects`.

**What:** The 4 tests in `packages/dashboard/tests/e2e/dashboard.spec.ts` time out against the worktree stack — they look for `Toggle kanban-api` / `Toggle recipes-app` buttons (legacy mock-client project names) but the seeded fixtures in `packages/daemon/seeds/dev.ts` populate projects named `crew` and `recipes`. The dashboard now talks to the real daemon via `HttpDaemonClient`, so these tests have been silently broken since the mock client was retired.

**Why noticed:** Surfaced during CREW-92 verification (Documentation + memory cleanup, Epic closer). `npm run test:e2e` against the worktree stack at `http://localhost:23323` returned 4 failures, all timeouts waiting on selectors that don't exist in the rendered DOM. Confirmed the failure is environmental — `git diff origin/main -- packages/dashboard/tests/e2e/dashboard.spec.ts` is empty, so the divergence pre-dates this branch.

**Anchors:**

- `packages/dashboard/tests/e2e/dashboard.spec.ts` — selectors `Toggle kanban-api`, `Toggle recipes-app`.
- `packages/daemon/seeds/dev.ts` — actual fixture project names `crew` and `recipes`.
- `packages/dashboard/src/data/HttpDaemonClient.ts` — the real client the dashboard wires up via `defaultClient`. Replaces the mock client the tests were authored against.

**What's been considered:** Two paths — (a) update the e2e test selectors to the seeded names, or (b) update the seed fixtures to add `kanban-api` / `recipes-app` projects. Path (a) is closer to the test's intent (they assert the dashboard groups agents by project, not specific project names), so a name-agnostic rewrite (e.g., assert at least two `Toggle <name>` buttons appear) is probably cleanest.

**Shape of work:** Small — one ticket, single-file change in the test, plus a verification run. No production code change needed.

### 2026-05-04 — Crew sandbox/preflight self-opt-in (slot into first dashboard plan that adds e2e coverage)

**Resolved 2026-05-07:** Shipped via [CREW-89](https://safturento.atlassian.net/browse/CREW-89) (commit `a3e6a65`, [PR #106](https://github.com/Safturento/crew/pull/106)). All four asks landed: `<repo>/.claude/settings.json` exists with `excludedCommands` listing `npm run bruno:smoke` + `npm run test:e2e` and the sandbox baseline; `[playwright]` / `[playwright.smoke]` / `[playwright.authored]` / `[bruno_smoke]` blocks are present in `~/.config/crew/projects/crew.toml`; root-level `test:e2e` npm script delegates to the dashboard workspace; bruno collection in place. Slotted into the dockerization Epic rather than a dashboard-coverage plan as the followup originally proposed — needed on the dockerization path anyway. Move to Resolved was a catch-up edit on 2026-05-07, not atomic with the implementing PR (predates the "Ticketing a followup" convention).

**What:** Opt the crew project into the preflight machinery CREW-82 introduced (`<repo>/.claude/settings.json` with sandbox baseline + `excludedCommands`, `[playwright]` / `[bruno_smoke]` enabled in `~/.config/crew/projects/crew.toml`, and a root-level `test:e2e` npm script that delegates to the dashboard workspace). Today crew dispatches itself via `crew run CREW-*` against a TOML that has neither `[playwright]` nor `[bruno_smoke]` enabled, so the preflight no-ops and crew agents run with no committed sandbox baseline (allowed-domains, allowWrite paths, etc.). Once the dashboard e2e suite has enough coverage that gating on it carries weight, flipping the opt-in turns crew into its own dogfood for the preflight + sandbox machinery and starts exercising dashboard tests on every CREW-\* dispatch.

**Why noticed:** 2026-05-04 conversation about CREW-82 (agent dispatch preflight) — surfaced that crew has every prerequisite in place (`packages/dashboard/playwright.config.ts` + a `tests/e2e/dashboard.spec.ts` exists per CREW-22, the bruno collection exists with a smoke flow) but `[playwright].authored` isn't enabled in the project TOML, so none of it is wired in. Decision was to defer the opt-in rather than land it ahead of value: dashboard e2e is one spec today, and turning on the gate now would just add ceremony without catching real regressions. The deliberate plan was to pair the opt-in with the first dashboard plan that adds enough e2e coverage to make the gate meaningful — that path was overtaken by the dockerization Epic, which needed the preflight wiring on its critical path.

**Anchors:**

- `<repo>/.claude/settings.json` — created by CREW-89.
- `~/.config/crew/projects/crew.toml` — has `[playwright]` / `[playwright.smoke]` / `[playwright.authored]` / `[bruno_smoke]` blocks.
- `<repo>/package.json` `scripts.test:e2e` — delegates to crew-dashboard workspace.
- CREW-22 (Done) — set up `@playwright/test` in dashboard package.
- CREW-82 / CREW-83 / CREW-84 / CREW-85 — the preflight Epic + child tickets that introduced the machinery being opted into.
- CREW-89 — the ticket that ultimately did the opt-in.

### 2026-05-03 — `@playwright/mcp` ignores crew's `--executable-path` override

**Resolved 2026-05-07:** Fixed shape A via host-repo resolve. `writeMcpFile` now takes `resolverCwd: config.repo_path`, so `require('@playwright/test').chromium.executablePath()` runs against the host repo's `node_modules` (where the package is always installed) instead of the bare `git worktree add` checkout (which has no `node_modules` and silently returned `null`, dropping `--executable-path` from the MCP args). The chromium binary in `~/.cache/ms-playwright/` is shared between host and worktree, so the resolved path is identical. Shape B (MCP ignoring an already-passed `--executable-path`) wasn't empirically validated in this PR — the existing dispatch's `.mcp.json` was generated by pre-fix crew, so the override never actually flowed through. If a fresh dispatch on post-fix crew still fails with `/opt/google/chrome/chrome`, file a follow-on ticket per the original entry's "Pair `--executable-path` with `--browser chromium`" / "preflight `npx @playwright/mcp@latest install`" / "pin MCP version" mitigations.

**What:** `crew run` installs Playwright's bundled chromium (`~/.cache/ms-playwright/chromium-1217/...`) and writes a `.mcp.json` that passes `--executable-path <chromium-1217 path>` to `npx -y @playwright/mcp@latest`. The intent (per `build-mcp-config.ts:14-21`) is to override `@playwright/mcp`'s default `chrome` channel and use the playwright-bundled chromium crew already installed. **The MCP doesn't honor it.** Agents on the dispatched session see `mcp__playwright__browser_*` calls fail with `Chromium distribution 'chrome' is not found at /opt/google/chrome/chrome`, and `~/.cache/ms-playwright/mcp-chrome-<hash>/` contains its own (sometimes empty) bundle the MCP tried to set up separately. The repo-side `playwright` runner (driven by `npm run test:e2e`) works fine because it uses `chromium-1217` directly, but the MCP tool is unusable for any agent step that wants live-browser interaction.

**Why noticed:** Recipes KAN-14 ([PR #47](https://github.com/Safturento/Recipes/pull/47), 2026-05-03) shipped with a "Crew-setup notes" section in the PR body flagging this. Agent worked around it by using the repo's own Playwright fixture for `tests/e2e/meal-plan-day.spec.ts` (which is fine for authored tests) but couldn't drive the MCP tool for ad-hoc browser exploration during ticket work. Same shape was implicit in earlier KAN-\* runs that listed `chromium: <unresolved>` even when the install log showed success.

**Anchors:**

- `packages/cli/src/lib/playwright/build-mcp-config.ts:23-37` — where `--executable-path` gets appended to the MCP args.
- `packages/cli/src/lib/playwright/write-mcp-file.ts` — caller, resolves the chromium path before invoking buildMcpConfig.
- Reference `.mcp.json` shape generated for any KAN-\* worktree: `cat ~/Repos/Recipes-KAN-12/.mcp.json` (when the worktree exists).
- `~/.cache/ms-playwright/` — `chromium-1217/` (crew install), `mcp-chrome-0306d4e/` + `mcp-chrome-8449268/` (MCP's own bundles, separate hashes).
- KAN-14 PR body "Crew-setup notes" — quoted incident.
- `@playwright/mcp` repo / npm — for the actual flag semantics. Worth checking `npx -y @playwright/mcp@latest --help` and the upstream changelog to see if `--executable-path` was renamed, deprecated, or made conditional on `--browser chromium`.

**What's been considered:**

- **Pair `--executable-path` with `--browser chromium`.** Hypothesis: `--executable-path` only applies when `--browser` is explicitly set to chromium; otherwise the MCP keeps its default chrome-channel semantics. Cheapest experiment: add `'--browser', 'chromium'` to the args in `build-mcp-config.ts` and re-run.
- **Use the MCP's own bundle path.** `mcp-chrome-<hash>/` directories are populated when the MCP downloads its own Chrome on first run. We could let it own the bundle (don't pass `--executable-path` at all, just preflight `npx @playwright/mcp@latest install` once) and accept the disk duplication.
- **Pin `@playwright/mcp` to a version we know respects the flag.** Currently we pull `@latest` on every spawn — vulnerable to upstream behavior drift. Pinning would also let us write a `crew --version`-style preflight that warns when a newer MCP version's flag semantics changed.

**Shape of work:** One ticket. First commit is the empirical: try the four shapes (`--executable-path` alone / `+ --browser chromium` / no `--executable-path` + preflight install / pin version) and pick the one that actually drives the bundled chromium. Once known: code change is small (`build-mcp-config.ts` + maybe one preflight in `prepareAgentEnvironment`). Tests assert the resulting MCP args.

**Open questions:**

- Should crew preflight `npx @playwright/mcp@latest install` once at machine setup so the `mcp-chrome-<hash>/` bundle is always populated, regardless of which override path we end up choosing?
- Worth pinning the MCP package version in the project config (`[playwright].mcp_version`?) so upstream drift doesn't silently break agent flows?

### 2026-05-03 — `crew resume` / `crew fix-pr` env-spec parity for `${VAR}` syntax

**Resolved 2026-05-03:** Fast-tracked as a non-trivial-but-small fix on `fix/env-spec-parity-resume-fix-pr`. Added `readEnvBaseMap(worktree)` helper (read-only — no re-materialize / port re-allocation), threaded `envVars` through `resume.ts` (3 call sites), `fix-pr.ts` (2 call sites), and `brunoSmokeOptionsFor` (new optional 4th param). The "readOnly bringUpWorktreeEnv" alternative was rejected — it'd also re-run `source = "generate"` commands, which is not what we want during a resume.

**What:** CREW-81 wired the materialized `env.toml` base map through `crew run`'s `resolveAppUrl` callsites so projects can use `${VAR}` placeholders in `[playwright].app_url` / `[bruno_smoke].base_url`. The resume / fix-pr code paths were left out of scope. They still go through `readDockerPortsFromEnvFile` (which only knows the legacy fixed-shape `CADDY_HTTP_PORT` / `CADDY_HTTPS_PORT` / `POSTGRES_PORT` keys) and pass `envVars: undefined` to `resolveAppUrl`. Result: on an env.toml project with `${APP_URL}` in its project TOML, `crew resume KEY` and `crew fix-pr KEY` will throw `${APP_URL} used but env vars were not provided`.

**Why noticed:** Self-review of CREW-81 surfaced this. Pre-CREW-81 these paths were already broken on env.toml projects (the legacy `{httpsPort}` placeholder hit `readDockerPortsFromEnvFile`, which fails to find `CADDY_HTTPS_PORT` in an env-spec `.env` file unless the project happened to declare it under that exact name). So it's not a new regression — it's a parity gap CREW-81 didn't close. The error message is now actionable ("use `${VAR}` syntax"), but the user-side fix is "wait for this followup," not "edit the TOML."

**Anchors:**

- `packages/cli/src/commands/resume.ts:69-71,89` — calls `readDockerPortsFromEnvFile` then `resolveAppUrl(..., dockerPorts)` with no envVars.
- `packages/cli/src/lib/run/agent-options.ts:69-88` (`brunoSmokeOptionsFor`) — same shape, used by resume + fix-pr.
- `packages/cli/src/commands/run.ts` (CREW-81 baseline) — the model: `bringUpWorktreeEnv` returns the materialized base map, runRun threads it through.
- `docs/superpowers/plans/2026-05-02-env-toml-app-url-resolution.md` — explicitly scoped to runRun.

**What's been considered:** The shape is fairly mechanical: rerun `bringUpWorktreeEnv` (or read `.env` and reconstruct `Record<string, string>`) at resume/fix-pr entry, then thread `envVars` through `prepareAgentEnvironment` (already accepts it from CREW-81), `playwrightFixPrOptsFor`, `playwrightTicketOptsFor`, and `brunoSmokeOptionsFor`. The wrinkle: resume MUST NOT re-run port allocation (allocator is non-idempotent across worktrees) — read-only materialization is required, which CREW-81's `bringUpWorktreeEnv` doesn't currently support. So either add a `bringUpWorktreeEnv({ readOnly: true })` mode that skips writes, or parse the existing `.env` file into a base map directly.

**Shape of work:** One ticket. ~3 small commits. Likely `readEnvBaseMap(worktree): Record<string, string>` helper alongside `readDockerPortsFromEnvFile`, then update `resume.ts`, `fix-pr.ts`, and `agent-options.ts:brunoSmokeOptionsFor` to call it for env-spec projects (detect via env.toml presence at the worktree root). Tests mirror CREW-81's `run.test.ts` integration tests but for the resume entry point.

**Open questions:**

- ~~New helper `readEnvBaseMap` vs. add a `readOnly` flag to `bringUpWorktreeEnv`?~~ Resolved: separate helper. The readOnly flag would still re-run `source = "generate"` commands.
- For env-spec projects, do we want resume to detect `env.toml` mtime newer than `.env` and refuse / warn / refresh? Out-of-band — deferred. Not part of this fix.

## Abandoned

(items move here when explicitly decided against — note the reason in a one-line addendum so the decision is recoverable)
