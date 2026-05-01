# Followups

A queue between "noticed it" and "decided what to do about it." Items might become Jira tickets, get fixed inline during related work, or be explicitly abandoned. Triage periodically.

Format: see the user-level `~/.claude/CLAUDE.md` "Followup detection" section.

## Contents

- [Active](#active)
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
  - [2026-04-28 — Flesh out `docs/plans/project-resolution.md` stub](#2026-04-28--flesh-out-docsplansproject-resolutionmd-stub)
  - [2026-04-28 — Dashboard agent detail drawer + full-page route](#2026-04-28--dashboard-agent-detail-drawer--full-page-route)
  - [2026-04-28 — Dashboard New Run modal + projects route view](#2026-04-28--dashboard-new-run-modal--projects-route-view)
  - [2026-04-28 — `useAttention.clear()` snapshot semantic isn't directly tested](#2026-04-28--useattentionclear-snapshot-semantic-isnt-directly-tested)
  - [2026-04-27 — Dashboard mobile responsive layout polish](#2026-04-27--dashboard-mobile-responsive-layout-polish)
  - [2026-04-26 — Architecture doc open questions still unresolved](#2026-04-26--architecture-doc-open-questions-still-unresolved)
- [Resolved](#resolved)
- [Abandoned](#abandoned)

## Active

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

**Why noticed:** Surfaced repeatedly: §10.4 of the Playwright integration design spec, CREW-57's open questions ("Should crew's own `.claude/settings.json` enable the sandbox so future autonomous CREW-\* runs can themselves observe sandbox-policy-level behavior?"), and architecture.md's open questions list ("Sandbox config drift").

**Anchors:**

- `docs/superpowers/specs/2026-04-29-playwright-integration-design.md` §10.4
- `docs/tickets/CREW-57.md` open question
- `docs/plans/architecture.md` "Open questions" — Sandbox config drift bullet
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

- **New project**: walk through writing the TOML, run `npm install -D @playwright/test` if Playwright is opted in, scaffold `playwright.config.ts` + `tests/e2e/` skeleton, scaffold Bruno collection skeleton if opted in.
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

### 2026-04-28 — Flesh out `docs/plans/project-resolution.md` stub

**What:** The plan at `docs/plans/project-resolution.md` is explicitly marked stub. Three sections are placeholder TODOs (Recommendation by context, Chosen approach, Implementation outline, Verification). The triggering incident — `crew run <KAN-ticket>` from inside the `crew` repo failing with a wrong-project error — is still real today. CLI partial workaround: `--project <name>` flag exists on `crew list` and `crew status` but not on `crew run` / `crew fix-pr` / `crew finish` / `crew resume` etc.

**Why noticed:** The doc itself opens with `**Status:** Stub`. PR [#21](https://github.com/Safturento/crew/pull/21) merged it in Apr 28 with the explicit intent "needs fleshing out before this drives any code." Five months of subsequent work on the daemon + dashboard sharpens the need: the dashboard's write endpoints (entry above) will land project-by-name from a non-CLI surface.

**Anchors:**

- `docs/plans/project-resolution.md` — the stub
- [PR #21](https://github.com/Safturento/crew/pull/21) — original landing
- `packages/cli/src/commands/list.ts:105`, `packages/cli/src/commands/status.ts:91` — partial `--project` flag implementation
- `packages/shared/src/config/loader.ts` — `loadProjectConfigByName` exists but no key-prefix resolver

**What's been considered:** Four options (A: ticket-key prefix, B: explicit `--project`, C: per-user default, D: hybrid precedence). Initial leaning is D (hybrid) per the doc's last paragraph.

**Shape of work:** Brainstorm → spec → implementation plan. Likely one ticket lands the shared resolver (`packages/shared/src/config/resolveProject.ts`), then a sweep migrating each command. Dashboard endpoints (above) should consume the same resolver from day one, not roll their own.

### 2026-04-28 — Dashboard agent detail drawer + full-page route

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

**What:** Three of the five "Open questions" in `docs/plans/architecture.md` are still genuinely open:

1. **Distribution past Phase 1.** Phase 1 ships via local `npm link` (then via `install.sh` symlinking from a checkout). Past that: `npm publish` is the easy default; Node SEA single-binary is fancier but ergonomic for shipping to multiple machines without a Node install.
2. **Auth secrets storage.** Where do gh-token, jira-token, anthropic-api-key live? Currently per-repo `.claude/secrets/`. Architecture doc proposes per-user `~/.config/crew/secrets.toml` with project-scoped fallbacks, but no spec/implementation.
3. **MCP tools or REST?** The agent uses MCP for Jira; the daemon will use REST for transitions outside the agent context. Some duplication acknowledged. Worth deciding before the daemon grows more Jira-touching code.

The other two open questions (sandbox config drift, Phase 2 + Phase 3 separation) are subsumed by other followups and shipped slices respectively.

**Why noticed:** `docs/plans/architecture.md` "Open questions" section, line 239+.

**Anchors:**

- `docs/plans/architecture.md:239–245` — the open questions list
- For #1: `scripts/install.sh`, README's Install section
- For #2: `~/.config/crew/.secrets.env` (current location per CREW-33's debug notes), `packages/cli/src/commands/finish.ts` `readJiraSecrets`, daemon's eventual JIRA client
- For #3: agent's MCP Jira config (in `~/.config/crew/projects/<name>.toml` `[sandbox]` allowlist), `packages/cli/src/lib/jira/client.ts` (REST), the daemon will need REST too

**Shape of work:** Each is independent. #1 punts until "we want to install crew on a machine that doesn't already have it." #2 is design-spec-then-implementation, gated on the secrets-file location decision. #3 likely doesn't need its own ticket — accept the duplication since both clients are small — but worth a one-paragraph decision note in the architecture doc.

## Resolved

(items move here when ticketed and shipped, or fixed inline — keep for historical context, prune when the file gets long)

## Abandoned

(items move here when explicitly decided against — note the reason in a one-line addendum so the decision is recoverable)
