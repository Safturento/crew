# Followups

A queue between "noticed it" and "decided what to do about it." Items might become Jira tickets, get fixed inline during related work, or be explicitly abandoned. Triage periodically.

Format: see the user-level `~/.claude/CLAUDE.md` "Followup detection" section.

## Contents

- [Active](#active)
  - [2026-05-07 — `sandbox-network-note.md` recommends `crew restart --hard` for docker recovery, but `--hard` nukes the worktree](#2026-05-07--sandbox-network-notemd-recommends-crew-restart---hard-for-docker-recovery-but---hard-nukes-the-worktree)
  - [2026-05-05 — Per-ticket model selection (use Sonnet for trivial work to save tokens)](#2026-05-05--per-ticket-model-selection-use-sonnet-for-trivial-work-to-save-tokens)
  - [2026-05-05 — Dashboard silently drops agents whose project isn't in `/api/projects`](#2026-05-05--dashboard-silently-drops-agents-whose-project-isnt-in-apiprojects)
  - [2026-05-05 — Dashboard e2e tests expect mock-client project names that don't match the daemon fixtures](#2026-05-05--dashboard-e2e-tests-expect-mock-client-project-names-that-dont-match-the-daemon-fixtures)
  - [2026-05-05 — Worktree env-injection of `CREW_SEED_FIXTURES=1` not wired](#2026-05-05--worktree-env-injection-of-crew_seed_fixtures1-not-wired)
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
  - [2026-04-28 — Flesh out `docs/plans/project-resolution.md` stub](#2026-04-28--flesh-out-docsplansproject-resolutionmd-stub)
  - [2026-04-28 — Dashboard agent detail drawer + full-page route](#2026-04-28--dashboard-agent-detail-drawer--full-page-route)
  - [2026-04-28 — Dashboard New Run modal + projects route view](#2026-04-28--dashboard-new-run-modal--projects-route-view)
  - [2026-04-28 — `useAttention.clear()` snapshot semantic isn't directly tested](#2026-04-28--useattentionclear-snapshot-semantic-isnt-directly-tested)
  - [2026-04-27 — Dashboard mobile responsive layout polish](#2026-04-27--dashboard-mobile-responsive-layout-polish)
  - [2026-04-26 — Architecture doc open questions still unresolved](#2026-04-26--architecture-doc-open-questions-still-unresolved)
- [Resolved](#resolved)
  - [2026-05-05 — Dashboard Dockerfile doesn't copy `tsconfig.base.json`, breaks vite at runtime with TSCONFIG_ERROR](#2026-05-05--dashboard-dockerfile-doesnt-copy-tsconfigbasejson-breaks-vite-at-runtime-with-tsconfig_error)
  - [2026-05-04 — Crew sandbox/preflight self-opt-in (slot into first dashboard plan that adds e2e coverage)](#2026-05-04--crew-sandboxpreflight-self-opt-in-slot-into-first-dashboard-plan-that-adds-e2e-coverage)
  - [2026-05-03 — `@playwright/mcp` ignores crew's `--executable-path` override](#2026-05-03--playwrightmcp-ignores-crews---executable-path-override)
  - [2026-05-03 — `crew resume` / `crew fix-pr` env-spec parity for `${VAR}` syntax](#2026-05-03--crew-resume--crew-fix-pr-env-spec-parity-for-var-syntax)
- [Abandoned](#abandoned)

## Active

### 2026-05-07 — `sandbox-network-note.md` recommends `crew restart --hard` for docker recovery, but `--hard` nukes the worktree

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

### 2026-05-05 — Dashboard e2e tests expect mock-client project names that don't match the daemon fixtures

**What:** The 4 tests in `packages/dashboard/tests/e2e/dashboard.spec.ts` time out against the worktree stack — they look for `Toggle kanban-api` / `Toggle recipes-app` buttons (legacy mock-client project names) but the seeded fixtures in `packages/daemon/seeds/dev.ts` populate projects named `crew` and `recipes`. The dashboard now talks to the real daemon via `HttpDaemonClient`, so these tests have been silently broken since the mock client was retired.

**Why noticed:** Surfaced during CREW-92 verification (Documentation + memory cleanup, Epic closer). `npm run test:e2e` against the worktree stack at `http://localhost:23323` returned 4 failures, all timeouts waiting on selectors that don't exist in the rendered DOM. Confirmed the failure is environmental — `git diff origin/main -- packages/dashboard/tests/e2e/dashboard.spec.ts` is empty, so the divergence pre-dates this branch.

**Anchors:**

- `packages/dashboard/tests/e2e/dashboard.spec.ts` — selectors `Toggle kanban-api`, `Toggle recipes-app`.
- `packages/daemon/seeds/dev.ts` — actual fixture project names `crew` and `recipes`.
- `packages/dashboard/src/data/HttpDaemonClient.ts` — the real client the dashboard wires up via `defaultClient`. Replaces the mock client the tests were authored against.

**What's been considered:** Two paths — (a) update the e2e test selectors to the seeded names, or (b) update the seed fixtures to add `kanban-api` / `recipes-app` projects. Path (a) is closer to the test's intent (they assert the dashboard groups agents by project, not specific project names), so a name-agnostic rewrite (e.g., assert at least two `Toggle <name>` buttons appear) is probably cleanest.

**Shape of work:** Small — one ticket, single-file change in the test, plus a verification run. No production code change needed.

### 2026-05-05 — Worktree env-injection of `CREW_SEED_FIXTURES=1` not wired

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

**Why noticed:** filed CREW-68 to fix the immediate race between db_clone and backend seed (concurrent TRUNCATE and INSERT on the same tables corrupts the worktree DB and exits the backend container). The fix lands as a quick-win — wait-for-healthcheck + better log on clone failure — but the underlying brittleness is structural, not local. The user's framing: _"this feels like a symptom of being in this middle state where crew is still relying on some scripts that are a part of recipe's infrastructure."_ Source conversation: 2026-05-01 session debugging KAN-40's failed dispatch under CREW-61's playwright manual gate.

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

### 2026-05-05 — Dashboard Dockerfile doesn't copy `tsconfig.base.json`, breaks vite at runtime with TSCONFIG_ERROR

**Resolved 2026-05-07:** Shipped via [PR #111](https://github.com/Safturento/crew/pull/111) (commit `adf26c9`). Both `packages/daemon/Dockerfile` and `packages/dashboard/Dockerfile` now `COPY package.json package-lock.json tsconfig.base.json ./` before copying their workspace, mirroring the shared-root pattern. No Jira ticket — chore-style fix. Move to Resolved was a catch-up edit on 2026-05-07, not atomic with the implementing PR (predates the "Ticketing a followup" convention).

**What:** `packages/dashboard/Dockerfile` copies only `packages/dashboard/` into the image, but `packages/dashboard/tsconfig.json` extends `../../tsconfig.base.json` from the repo root. Inside the container at `/app/packages/dashboard/`, the parent `tsconfig.base.json` is missing, so vite-oxc fails on every request with `[TSCONFIG_ERROR] Failed to load tsconfig for 'src/main.tsx': Tsconfig not found` and renders only the vite error overlay. End-to-end visible: dashboard at the host port (canonical 5173 or worktree-hashed) shows the overlay, no app HTML, all e2e tests fail with "element not found."

**Why noticed:** Surfaced during CREW-91 verification (Playwright env-aware baseURL). With `CREW_APP_URL=http://localhost:18228 npm run test:e2e` the env routing successfully reached the worktree dashboard, but every test failed because the page was just the vite overlay. Same failure mode hitting the canonical port. The playwright config change itself is correct; the dashboard container is the breaking change.

**Anchors:** `packages/dashboard/Dockerfile`, `packages/dashboard/tsconfig.json` (the `extends: "../../tsconfig.base.json"` line), `tsconfig.base.json` at repo root, CREW-88 (the dashboard-Dockerfile ticket that introduced the image).

**What's been considered:** Add `COPY tsconfig.base.json ./` (or copy the whole repo root tsconfig graph) before `COPY packages/dashboard ./packages/dashboard`. Mirrors how the daemon Dockerfile handles shared root files. Likely a one-line Dockerfile fix.

**Shape of work:** Small — one Dockerfile edit + a rebuild verification (`docker compose --profile dev up -d --build --wait`, then `npm run test:e2e`).

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
