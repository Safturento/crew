# Followups — Daemon, CLI & Dispatch

> Part of the crew followups queue. Index + format: [`../followups.md`](../followups.md). Entry template, ticketing protocol, and the Active/Resolved/Abandoned lifecycle live in the user-level `~/.claude/CLAUDE.md` "Followup detection" section.

(entries below, newest at top)


## 2026-07-02 — Dispatch-gate preflight failures never reach the agent timeline (all-green timeline on an error run)

**What:** When the late dispatch preflight fails (the `runPreflight` call at the
end of `prepareAgentEnvironment`), the agent lands in `error` but its timeline
shows every startup phase green and then just stops — the failure is invisible
in the drawer. Two compounding gaps:

1. **No `failed` startup event is written.** `runPreflight` and
   `installPlaywrightBrowsers` (`packages/cli/src/lib/run/agent-environment.ts:133-146`)
   are the only pre-spawn steps *not* wrapped in `bracketStartupPhase`, so a
   throw there emits no `failed` phase to `~/.crew/startup/<key>.jsonl` /
   `startup_events`. Every bracketed sibling (docker, npm_install, worktree,
   early preflight) records its own failure; these two die silently.
2. **The timeline never merges run-level failures.** The structured diagnosis
   *is* captured — `runTrackedPreflight` → `reportFailedStart` → `runs` row
   `failure_check/headline/remediation/output` — and the Runner page's
   "Failed to start" section renders it. But `TimelineService.getTimeline`
   (`packages/daemon/src/services/TimelineService.ts:44`) concatenates only
   `startup_events` + transcript JSONL, so the drawer/timeline has no path to
   the failure fields.

**Why noticed:** KAN-48 dispatch (2026-07-02) failed the `excluded-commands`
check (Recipes' settings.json had un-globbed entries; fixed in
Safturento/Recipes#55). The dashboard showed the agent in `error` with an
all-green timeline; the actual diagnosis was only reachable via
`GET /api/runner/page`.

**Anchors:** `packages/cli/src/lib/run/agent-environment.ts` (unbracketed
tail), `packages/cli/src/lib/run/preflight-tracking.ts` (`runTrackedPreflight`),
`packages/daemon/src/services/RunFailureService.ts` (`recordFailedStart`),
`packages/daemon/src/services/TimelineService.ts` (`getTimeline`),
`packages/daemon/src/services/RunnerPageService.ts` (the surface that *does*
show it).

**What's been considered:** Fix 1 (bracket the dispatch preflight + playwright
install with `bracketStartupPhase`, e.g. a `crew_startup_dispatch_preflight`
subtype) is the minimal change and makes the timeline self-explanatory — the
failed phase carries the rendered `PreflightError`. Fix 2 (TimelineService
merges `failed-start` run failures as a synthetic terminal event) covers *all*
unbracketed death paths, not just this one, but adds a second event source to
the timeline contract. They compose; Fix 1 alone would have surfaced KAN-48.

**Shape of work:** small — Fix 1 is a CLI-only change in
`agent-environment.ts` + a `event-labels.ts` label; Fix 2 is a daemon-side
TimelineService/schema touch. One ticket either way.

**Open questions:** Should the drawer also link to the Runner page's
failed-start card when one exists for the key, instead of (or in addition to)
merging into the timeline?


## 2026-07-02 — Dequeue apply + orphaned-lifecycle producers are missing (Epic CREW-306 gap)

**What:** The runner-rework dashboard (CREW-311) surfaces Dequeue on queued
rows and Reap on orphaned rows, but neither verb completes end-to-end:

1. **Dequeue is a no-op.** It enqueues a `runner_commands` row, and the host
   runner's `applyCommand` reports `dequeue` → `failed` "not yet supported"
   (`packages/cli/src/lib/runner/commands.ts:78`) — it needs a daemon
   action-drop route (mark the pending `action_requests` row cancelled +
   settle the `queued` agent row). The Runner page's Queued-actions section
   has the same dead path; the dashboard shows no error because nothing
   listens on `runner.command_changed`.
2. **Nothing produces `run_orphaned`.** The reducer edge `running → orphaned`
   (CREW-307) and the shared event type exist, but no daemon or CLI code
   emits the event — orphaned rows can currently only arise via manual state
   override. The runner's liveness sweep (CREW-288) knows exactly when a pid
   dies without a terminal remove; it's the natural producer.
3. **Reap doesn't settle the state.** The host apply only does
   `registry.remove()`; no transition is written, so a reaped `orphaned`
   agent stays amber forever.

**Why noticed:** CREW-311 self-review (code-reviewer subagent). The dashboard
wiring is correct-per-plan; the 12-task runner-rework plan simply has no task
for these producers, so at Epic close the chip badge + Dequeue/Reap would be
dead UI without them.

**Anchors:** `packages/cli/src/lib/runner/commands.ts` (`applyCommand`),
`packages/cli/src/lib/runner/liveness.ts` / `registry.reapDead`,
`packages/daemon/src/services/RunnerCommandsService.ts`,
`packages/daemon/src/services/state-reduce.ts` (`run_orphaned` edge),
`packages/dashboard/src/components/AgentRow.tsx` (queued/orphaned cases).

**Shape of work:** likely one Epic child — a daemon action-drop route +
`dequeue` apply, a `run_orphaned` emit from the liveness sweep, and a settle
transition on `reap` apply (an `idle`-or-`error` decision to make).

**Open questions:** Should reap settle to `idle` (resumable worktree remains)
or `error` (something died)? Should dequeue cancel the action row or delete
it (history vs cleanliness)?


## 2026-06-30 — Re-running a terminal agent leaves IngestService's state cache stale (birth transition ignored)

**What:** `IngestService` keeps an in-memory `agentStateCache` (`packages/daemon/src/services/IngestService.ts:85`) that `reduceState` reads as `previous` for each concrete state event. The cache is only ever populated (never invalidated) per key for the daemon's lifetime, and `getCachedAgentState` reads the DB *only on a cache miss*. So when a **terminal** agent (`finished`/`pr_merged`) is re-run in the same long-lived daemon, the cache still holds the old terminal state, and the new run's first `run_started` event reduces `reduceState('finished','run_started') → null` (terminal guard) — **no `running` transition is written**, and the agent can stick. This predates CREW-307 (nothing invalidated the cache on re-run before either), but CREW-307 makes row-at-initiation / re-run a first-class flow, so it's now worth fixing. `RunFailureService.birthQueued`/`recordInitializing` write the birth transition to the DB + publish SSE but deliberately do **not** touch the cache (see the `writeBirthTransition` docstring), which is coherent for a fresh key but not for a cached re-run.

**Why noticed:** CREW-307 code review (2026-06-30). The reviewer flagged the `writeBirthTransition` docstring as claiming a cache-coherence property that doesn't hold for a re-run of an already-cached key. Docstring corrected to state the real (pre-existing) limitation and point here.

**Anchors:** `packages/daemon/src/services/IngestService.ts` (`agentStateCache`, `getCachedAgentState:746`, `announceTransition:733`, `recordStateOverride:629` — the one path that *does* advance the cache); `packages/daemon/src/services/RunFailureService.ts` (`birthQueued`/`recordInitializing`/`writeBirthTransition`); `packages/daemon/src/services/state-reduce.ts:35` (terminal guard).

**What's been considered:** The clean fix is to invalidate (or advance) the cache entry when a birth transition lands — either inject `IngestService` into `RunFailureService` and call a new public `invalidateStateCache(key)` (delete → next event re-reads the birth row from the DB, reducing correctly), or route birth transitions *through* `IngestService` so the single writer owns both the row and the cache. A cache *delete* is the lowest-risk form (worst case one redundant DB read). Deferred from CREW-307 to keep the spine ticket scoped and because the underlying stuck-on-terminal-rerun is pre-existing, not introduced there.

**Shape of work:** small daemon change — a public cache-invalidation method on `IngestService` + a dependency edge from `RunFailureService`, or a modest refactor moving birth writes into `IngestService`. Add an integration test: re-run a `finished` key → birth → `run_started` → agent reduces to `running` (not stuck).

## 2026-06-30 — `deriveState` × `orphaned` × a completed run flips the badge to `error`, not `orphaned`

**What:** `AgentsService.deriveState` (`packages/daemon/src/services/AgentsService.ts:682`) returns `orphaned` only while `completedAt === null`. Its terminal guards run first: once the reap/orphan-detection flow (a later runner-rework ticket) stamps `completed_at` + a non-zero `exit_code` on an orphaned run, the `exitCode !== 0 → 'error'` guard (line ~702) fires **before** the `currentState` projection, so the badge flips to `error` rather than staying `orphaned`. Arguably fine (an orphan that also crashed is an error), but it's an unexercised interaction the orphan-detection ticket must design against — e.g. whether `orphaned` should be a sticky guard like `pr_merged`.

**Why noticed:** CREW-307 code review (2026-06-30, Minor). CREW-307's tests only cover `currentStateFromTransitions` for the new states, not the full `deriveState` × completed-run matrix.

**Anchors:** `packages/daemon/src/services/AgentsService.ts` (`deriveState` terminal-guard ordering); the later orphan-detection/reap ticket under Epic CREW-306; spec `docs/superpowers/specs/2026-06-30-runner-page-rework-design.md` §2 (orphaned = amber, non-terminal).

**Shape of work:** design decision + a targeted `deriveState` test matrix, folded into whichever CREW-306 child implements orphan detection / the Reap action.

## 2026-06-28 — Orphaned/stale runner workers heartbeat forever; no single-instance reconcile or code-version guard

**What:** The host runner has two unmanaged failure modes that let a dead-but-heartbeating worker pollute the Runner tab indefinitely, and the management commands can't clean it up:

1. **A worker can outlive its supervisor and keep heartbeating.** The supervisor (`crew runner __supervise`) spawns one worker (`crew runner __worker`); if the supervisor dies (crash, the daemon-connectivity blip seen at `02:21` in `runner.log`, a `kill` that missed it) the worker is reparented (to a subreaper / init) and keeps POSTing `/api/runner/heartbeat` with its stale in-memory `Registry`. Nothing detects "a worker with no supervisor." The pidfile (`~/.config/crew/runner.pid`) only ever records the *supervisor* pid, so `crew runner stop`/`restart` — which read that one pid — are blind to an orphan worker. Net: the orphan's snapshot keeps overwriting the daemon's live-process list.

2. **A long-lived worker runs stale code with no version signal.** The runner runs from source via `tsx` (`node_modules/.bin/tsx packages/cli/src/index.ts runner __worker`), so a worker started before a code change keeps the *old* logic loaded in memory forever — there's no watch/reload. The orphan we hit had been up `4d19h` and predated the `reapDead` liveness sweep (CREW-288), so it never pruned its own dead children — exactly the bug CREW-288 "fixed", still live in an old process. There is no way to ask "is the active runner on latest code?" short of reading `etime` and correlating against git history by hand.

3. **`crew runner restart` doesn't reconcile duplicates.** `restart` = `stop` (SIGTERM the pidfile pid) + `start` (spawn a fresh supervisor). When the pidfile is stale/missing the `stop` is a silent no-op and `start` adds a *second* live runner alongside the survivor → two workers heartbeating one daemon, and the Runner tab flip-flops between their snapshots every ~5s (each worker's own heartbeat cadence). There is no "is more than one worker heartbeating this daemon?" check and no all-instances reset.

**Why noticed:** 2026-06-28 cleanup session. The Runner tab showed 26 phantom "Live processes" (actions back to 2026-06-24, including `finish` commands "running" for 4 days). Root cause: an orphaned `4d19h`-old worker (pid `30556`, reparented to ppid `1222`, no supervisor) running pre-`reapDead` code, endlessly re-pushing its 26-entry registry. The user's `crew runner restart` didn't fix it — it spawned a healthy second runner (pid `607619`, empty registry) next to the orphan, producing a 26↔0 flicker. Fix was manual: find the orphan by process listing on the distinctive `__worker`/`__supervise` tokens (a `crew runner` grep misses the `node …/index.ts runner __worker` cmdline), `kill 30556 30572`, leaving the one healthy runner. Diagnosis was done entirely through `GET /api/runner/status` because the Bash sandbox is in its own PID namespace (`--unshare-pid`) — `kill -0 <hostpid>` and `ps` can't see host runner processes from inside, only the pidfile + `runner.log` (host files) are readable.

**Anchors:** `packages/cli/src/commands/runner.ts` (`startAction`/`stopAction`/`restart`/`spawnSupervisor`/`superviseAction`/`workerAction`; pidfile read at `readPidFile`); `packages/cli/src/lib/runner/paths.ts` (pidfile = `~/.config/crew/runner.pid`, log dir = `~/.crew/runner`); `packages/cli/src/lib/runner/loop.ts` (`startHeartbeat`→`reapDead`); `packages/cli/src/lib/runner/registry.ts`; daemon `RunnerStatusService` (`status()` / heartbeat staleness window) + `GET /api/runner/status`. Related shipped work: Resolved [[#2026-06-25--runner-never-reaps-dead-processes-phantom-running-entries-linger-and-early-death-runs-never-settle-to-error]] (CREW-288 reapDead — only helps *inside* a current-code worker; orthogonal to orphan/stale-code detection).

**What's been considered:**
- **Single-instance enforcement at the daemon.** The heartbeat already carries enough to stamp each worker with an identity (worker pid / a boot-time nonce). The daemon could reject or flag a heartbeat from a *second* worker id and expose "N workers heartbeating" so the dashboard can warn — turning the silent flip-flop into a visible "duplicate runner" state with a one-click "stop the stale one".
- **Worker→supervisor liveness.** A worker could probe its own parent (`process.ppid` / `isProcessAlive(supervisorPid)`) each heartbeat and self-exit when orphaned, so a dead supervisor takes its worker with it instead of leaving a zombie. (Mirror of the existing supervisor→worker probe in `supervisor.ts`.)
- **Code-version stamp.** Stamp the worker at boot with the repo `HEAD` sha (and/or dirty flag) and surface it in `GET /api/runner/status` + the supervisor drawer, so "is the active runner on latest code?" is answerable at a glance and a stale runner is obvious. `crew runner status` could warn when the running sha ≠ current `HEAD`.
- **A real reset command.** `crew runner restart --force` (or a `reap`/`nuke` verb) that finds *all* `__worker`/`__supervise` processes (token match, not pidfile), kills them, clears the pidfile, and starts exactly one — codifying the manual recovery so the next operator doesn't have to hand-craft the `ps … grep '__worker|__supervise'` + `pkill`.

**Shape of work:** Two-to-three tickets, likely an Epic. (1) worker self-orphan detection + version stamp (CLI `runner/` lib + worker boot) — small/medium; (2) daemon single-instance identity + duplicate-runner surfacing in status/SSE + dashboard warning — medium, touches `RunnerStatusService`, the heartbeat schema in `crew-shared`, and the Runner page; (3) `crew runner restart --force`/reset verb — small. (1) and (3) are independent of the daemon work and can land first.

**Open questions:** When a duplicate worker is detected, who wins — newest boot nonce, or refuse the newcomer? Should an orphaned worker self-exit immediately, or first drain/settle so in-flight (genuinely live) children aren't abandoned? Is `process.ppid`-based orphan detection robust under WSL subreaping (the orphan here reparented to `1222`, not `1`)? Should the version stamp gate anything (e.g. refuse to claim new actions when stale) or be purely advisory?

## 2026-06-27 — Auto-rebase open PRs on upstream merge via the new webhook (no manual fix-pr)

**What:** Now that the daemon receives GitHub `pull_request` events (CREW-303), a merge to `main` can trigger an automatic reaction: re-check every *other* open crew PR for conflicts against the new `main`, and for each one that's now conflicted, auto-dispatch a `fix-pr`-style agent to rebase + resolve — instead of the operator noticing the red "conflicts" badge and manually running `crew fix-pr`.

**Why noticed:** Raised during the CREW-303 live verification (2026-06-27), immediately after the `pr_merged` webhook flip was confirmed working end-to-end. The realization: the webhook receiver isn't just for merge-detection — it's a general "the daemon now hears about GitHub events" capability, and the highest-value first use is killing the manual-rebase toil when one merge invalidates sibling PRs. Context: crew dispatches multiple parallel ticket branches off `main`; merging one routinely conflicts the others, and today each needs a hand-run `fix-pr`.

**Anchors:** `packages/daemon/src/services/GithubWebhookService.ts` (the receiver — would branch on the `closed`/merged action beyond the current `markMerged`); `packages/daemon/src/services/github/github-client.ts` (the Octokit client — would query other open PRs' `mergeable_state`); the existing `crew fix-pr` dispatch path (the agent that does the rebase). The merge event already carries the base branch.

**What's been considered:** Mergeability has a GitHub quirk — `mergeable_state` is recomputed *asynchronously* after a push to base, so the handler can't read it synchronously on the merge event; it'd need to poll/recompute (short delay) or attempt a trial rebase. Auto-dispatching agents off a webhook also needs guardrails: scope (only crew-tracked agents in `pr_open`?), a concurrency cap, and avoiding a dispatch storm when many PRs conflict at once. The `fix-pr` machinery already exists, so the work is mostly the trigger + scoping/safety, not the rebase itself.

**Shape of work:** Likely its own Epic. Roughly: (1) extend the receiver to fire on merge with the base branch; (2) a daemon service that lists crew-tracked open PRs against that base and classifies the conflicted ones (Octokit `mergeable_state`, handling the async recompute); (3) an auto-dispatch path reusing `fix-pr`, gated by scope + concurrency policy; (4) operator controls (opt-in per project / a dashboard toggle).

**Open questions:** Opt-in vs. automatic? Scope to crew-tracked `pr_open` agents only, or any open PR on the repo? How to handle the `mergeable_state` async-compute race? Concurrency cap on auto-dispatched rebases? Escalation path when the auto-rebase can't cleanly resolve?

## 2026-06-27 — GitHub webhook receiver returns 500 (not a clean 4xx) on an unsigned/empty POST

**What:** `POST /api/webhooks/github` with no `X-Hub-Signature-256` header and an empty body returns `500 {"error":"internal_error"}` rather than a clean `401`/`400`. The signature-verification path appears to throw on the missing header instead of short-circuiting to an authentication failure. Behaviour is identical whether the request hits the daemon directly or is proxied through the new Caddy front door (CREW-302) — so this is a receiver-side gap, not a proxy artifact.

**Why noticed:** Surfaced while running the CREW-302 Caddy allow-list boundary check. The plan's Task C1 Step 3 expected the proxied POST to yield a daemon `401` (bad signature); it yielded `500`. The boundary itself is correct (the request _was_ proxied, proving the allow-list works), but the receiver's error contract is sloppier than expected. Once this port is funnelled to the public internet, unauthenticated/malformed probes will get 500s (and whatever a 500 leaks) instead of a tidy 401 — worth tightening.

**Anchors:** `packages/daemon/src/routes/webhooks.ts:27` (the route); `githubWebhookService.handle` (the verification + dispatch — likely where the missing-header throw originates); `packages/daemon/src/routes/webhooks.test.ts` (existing receiver tests — would gain a "missing signature header → 401, not 500" case). Reproduce: `docker compose exec -T daemon curl -s -w '%{http_code}' -X POST http://daemon:7773/api/webhooks/github`.

**What's been considered:** Out of scope for CREW-302 (the front door is purely the allow-list boundary; it must not interpret payloads). Pre-existing in the CREW-270 receiver, independent of the proxy. Fix is a guard in the webhook service: treat an absent/blank signature header as an auth failure (`401`) before any HMAC computation.

**Shape of work:** Small, daemon-only. Add the missing-header → 401 guard in `githubWebhookService.handle`, plus a regression test. One commit.

## 2026-06-25 — Third `isProcessAlive` copy in `commands/daemon.ts` not yet consolidated

**What:** CREW-288 factored the runner's `process.kill(pid, 0)` liveness probe out of `commands/runner.ts` into a canonical `packages/cli/src/lib/runner/liveness.ts`. A byte-identical third copy still lives in `packages/cli/src/commands/daemon.ts` (`isProcessAlive`, same EPERM-means-alive semantics). Now that a canonical home exists, that copy is the obvious next consolidation target.

**Why noticed:** Flagged as a Minor finding in the CREW-288 code review — out of scope for that ticket (which only touched the runner side).

**Anchors:** `packages/cli/src/commands/daemon.ts:51` (the duplicate); `packages/cli/src/lib/runner/liveness.ts` (the canonical probe); `packages/cli/src/commands/daemon.test.ts:42-47` (tests that would move/retarget). Note the daemon copy is imported by `daemon.test.ts`, so consolidating means re-pointing that import — a `commands → lib` import is fine for a command file.

**Shape of work:** Tiny. Delete the daemon copy, import from `lib/runner/liveness.ts` (or relocate the probe to a more neutral `lib/` home if `lib/runner/` feels wrong for a daemon-command import), retarget the test. One small commit.

## 2026-06-23 — Auto-batch sizing for snapshot-refresh round-trips (compaction half shipped)

**Compaction half — Resolved 2026-06-24 (CREW-283):** `enrichment-script.js` now emits a compact payload — null/empty fields omitted and the per-instance `path` dropped (and `visual-fidelity-check`'s tier-2 `path` disambiguation removed in favor of Label → Position). The worst node, `665:864`, dropped 20,329 → 15,234 bytes, clearing the ~20 KB `use_figma` cap with headroom. The remaining open half is **auto-batch sizing**, below.

**What (remaining):** A full snapshot refresh still has the agent eyeball batch sizes off the sizing probe. Auto-batch sizing would have the skill/CLI run the probe and compute batch boundaries automatically, instead of the agent guessing — fewer mistakes, no manual sizing step. (Compact output already shrank per-node payloads; this is the orthogonal "automate the batching" half, untouched by CREW-283.)

**Why noticed:** Originally the round-trip-count half of the `figma-snapshot-enrichment-friction` reminder, split out of Epic CREW-280. The compaction sub-half shipped under CREW-283 (2026-06-24); this auto-batch sub-half stays parked — it only pays off if round-trip count is still a real pain after compaction.

**Anchors:**

- `.claude/skills/figma-snapshot-refresh/enrichment-script.js` — the `JSON.stringify(enrichment).length` sizing-probe variant (the input an auto-batcher would consume).
- `.claude/skills/figma-snapshot-refresh/SKILL.md` step 4 — the manual "size with the probe" guidance auto-batching would replace.
- `docs/superpowers/specs/2026-06-24-figma-enrichment-compact-output-design.md` — the compaction half (shipped); its "Out of scope" names auto-batch.
- Reminder `figma-snapshot-enrichment-friction` (now resolved) — the originating friction; merge half = CREW-280, compaction half = CREW-283, this is the last (auto-batch) sliver.

**What's been considered:** Auto-batch sizing is low-risk — it only automates an existing manual step (run probe → group nodes under the cap). But it only pays off if round-trip count is still a real pain _after_ compaction shrank payloads. Measure during the next full refresh before investing; may not be worth a ticket at all.

**Shape of work:** Two independent small changes. Auto-batch = a CLI helper (or skill step) that runs the sizing probe and emits batch groupings; touches the skill + maybe a `figma-snapshot` flag. Compact output = a format change to `enrichment-script.js` + the `enrichment` field reader/validator (`mergeEnrichment`), so it ripples into the snapshot artifact. Likely two tickets if pursued.

**Open questions:** Is round-trip count still a real cost after the hand-merge is gone, or does the friction effectively disappear? If compact output changes the stored `enrichment` shape, does `visual-fidelity-check` (the consumer) need updating too?

## 2026-06-20 — `crew resume` emits `run_started` as source `cli-run`, blurring resume vs original-run in the audit trail

**What:** The resume-from-error lifecycle fix (CREW-275 follow-on) made `crew resume` emit its lifecycle events by reusing the existing helpers: `emitRunStarted` (source `cli-run`) before each spawn, and `emitDispatchExited(key, 'run', …)` (source `runner-exit`) on exit. Functionally correct — the daemon reducer doesn't branch on `source` — but it means a resume's `state_transitions` audit rows are indistinguishable from an original `crew run`'s. A dedicated `cli-resume` source would let a timeline/audit view tell "operator resumed this from error" apart from "this is how the run first started."

**Why noticed:** Scoping the resume lifecycle fix (`resume.ts` now emits start/exit/pause mirroring `run.ts`). Deliberately reused the existing helpers to keep the change scoped rather than touch the shared `EventSource` enum; flagged the audit-granularity tradeoff as a deferred nicety so it isn't lost.

**Anchors:**

- `packages/cli/src/commands/resume.ts` — `emitRunStarted(key)` before each spawn; `emitDispatchExited(key, 'run', …)` in `settleResumeState`.
- `packages/cli/src/lib/state-events/dispatch.ts` — `emitRunStarted` hardcodes `source: 'cli-run'`; a `cli-resume` variant (or a `source` param) would live here.
- `packages/shared/src/state-events/types.ts` — `STATE_EVENT_SOURCES` (`cli-run`/`cli-fixpr`/`cli-finish`/`runner-exit`/`hook-pr-create`); adding `cli-resume` ripples to the zod `stateEventSchema` + any exhaustive consumers.
- `.agents/dispatch.md` — per-command lifecycle list (now carries the `crew resume` entry).

**What's been considered:** Reuse `cli-run` (chosen — zero new surface, reducer-equivalent today) vs add `cli-resume` (clearer audit, touches the shared enum + schema + tests). Low urgency: nothing currently consumes `source` to discriminate resume from run, so this only bites once an audit/timeline surface wants the distinction.

**Shape of work:** Small. Add `cli-resume` to `STATE_EVENT_SOURCES`, add an `emitResumeStarted` helper (or a `source` param on `emitRunStarted`), swap `resume.ts`'s call, update tests. Optionally a resume-specific exit source too.

**Open questions:** Is a distinct _start_ source enough, or does the exit half (`run_exited` via `runner-exit`) also want a resume-specific source? Is there a planned audit/timeline view that actually needs this, or is it speculative until one exists?

## 2026-06-20 — Headless `crew run` silently cuts off an agent that backgrounds work and yields via `ScheduleWakeup`

**What:** A dispatched agent (CREW-272) finished implementing + committing (3 commits), then kicked off its daemon test suite as a **background task**, called **`ScheduleWakeup`**, and **ended its turn to wait for re-invocation** — expecting the harness to wake it when the wakeup fired / the task notified. In headless `claude -p` (`crew run`) mode there is **no** wakeup/background-task re-invocation (that's an interactive-harness affordance); ending the turn ends the run. The process exited **code 0** — so it looked like clean completion and the daemon did **not** flag it — leaving the 3 commits **unpushed with no PR** (the push+PR step had been queued for _after_ the never-arriving wakeup). The surface symptom was a later re-dispatch hitting the `crew run` "worktree already exists" preflight guard.

**Why noticed:** Investigating why CREW-272 "errored out." Root-caused from `~/.crew/state-events/CREW-272.jsonl` (`run_started` → `run_exited` `exitCode:0`, ~9s after a `ScheduleWakeup` turn-end) cross-read against the session transcript tail (the agent's final messages: "I've scheduled a check-in and the background task will also notify me. Ending this turn to wait…"). The agent's own unit tests had passed (runner units 30 green); the daemon-suite failures it was re-checking were parallel-contention noise (CLI-only change, daemon doesn't import CLI).

**Anchors:**

- `~/.claude/projects/-home-safturento-Repos-crew-CREW-272/e7768b98-…jsonl` — transcript end (the yield).
- `~/.crew/state-events/CREW-272.jsonl` — `run_exited` `exitCode:0` on an incomplete run.
- `packages/cli/src/commands/run.ts` — the headless run loop / exit; whether it should treat "turn ended with a pending `ScheduleWakeup` / live background task" as not-done.
- The dispatch prompt (`packages/cli/src/lib/prompts/**`, `.agents/dispatch.md`) — does it warn agents off backgrounding-and-yielding?

**What's been considered:** Two angles. (1) **Prompt guardrail (cheap first fix):** instruct dispatched agents to run long verification in the **foreground (blocking)** and never use `ScheduleWakeup` / background-and-yield — headless runs are not re-invoked. (2) **Harness-level:** make headless `crew run` detect a pending scheduled wakeup / live background task at turn-end and not treat it as completion (harder — fights `claude -p` semantics). Orthogonal but related: a run that ends with **unpushed commits + no PR** arguably should not report **exit 0 / clean** — a completion sanity-check (branch pushed? PR opened?) would have surfaced this instead of silently passing.

**Shape of work:** Prompt guardrail = small edit to the dispatch prompt + a line in `.agents/dispatch.md`. Completion sanity-check = small addition to `crew run`/finish. Harness wakeup-awareness = larger `run.ts` change. Start with the prompt guardrail + completion check.

**Open questions:** Should `crew run` re-invoke once on a pending wakeup, or strictly forbid the pattern via prompt? Where should the "did this run actually finish (pushed + PR)?" check live — `crew run`, `crew finish`, or the daemon reducer? Sibling: the [throw-between-`*_started`-and-`*_exited`](#2026-06-19--a-throw-between-_started-and-_exited-leaves-the-agent-stuck-running) entry is the _non-zero/throw_ version of "run ends without the expected terminal outcome"; this is the _clean-exit-0_ version.

## 2026-06-19 — Per-run worktree stacks leak anonymous `node_modules` volumes (Docker disk hit 210 GB; 182 GB reclaimed manually)

**What:** Every per-run worktree compose stack (`crew-crew-NNN`) mints a **fresh pair** of anonymous `node_modules` volumes — `docker-compose.yml` declares `- /app/node_modules` on **both** the `daemon` (line 12) and `dashboard` (line 69) services ("Anonymous volume preserves npm ci output from being clobbered"). Because each run is its own compose project, these never get reused; they accumulate one pair per run. They're only ever reclaimed by `crew finish`'s `docker compose down -v`, which has **three** leak vectors — so in practice almost none get cleaned up. On 2026-06-19 the Docker `docker_data.vhdx` had grown to **~210 GB**, of which **239 orphaned anonymous volumes ≈ 91.5 GB** (plus 41.6 GB stale build cache and 303 piled-up per-run images). Manual `docker volume prune` + `builder prune` + `image prune -a` reclaimed it to ~28 GB of live data — but the leak refills on every run.

**Why noticed:** User flagged the Docker storage file nearing its limit and asked how to prune safely without touching the good containers (audiobookshelf, recipes, the live crew stacks). Diagnosis (`docker system df`, `docker volume ls -f dangling=true`) traced the bulk to anonymous `node_modules` volumes from finished crew runs spanning run range **158→273**. Reading the teardown path (`packages/cli/src/commands/finish.ts`) revealed why they survive. Live corroboration: stacks `crew-crew-237` and `crew-crew-239` were sitting **unhealthy for 31h**, never torn down.

**Anchors:**

- `docker-compose.yml` lines 12 + 69 — the `- /app/node_modules` anonymous volume declarations (the source). Note the src bind-mounts are **subdir-only** (`/app/packages/*/src`), so whether this anon volume is still load-bearing vs **vestigial** needs verifying — if `/app/node_modules` is never actually shadowed, the volume (and the whole leak) could be deleted outright.
- `packages/cli/src/commands/finish.ts` — teardown block (`finish.ts:309`), the best-effort `step()` helper (`finish.ts:158`, catches + continues), and `worktreeRegistered` gate (`finish.ts:263`, `:328`).
- `packages/cli/src/commands/down.ts:20` — canonical `crew down` uses `docker compose down` **without** `-v` (and no `--rmi`), which is also why 303 per-run images piled up.
- `.agents/local-dev.md` — documents the compose/worktree/port-hashing lifecycle; any fix updates here.
- Sibling: [Daemon has no reaper for orphaned runs stuck in `running`](#2026-05-18--daemon-has-no-reaper-for-orphaned-runs-stuck-in-running) — same "no reaper for abandoned-run debris" shape, volume/stack edition.

**What's been considered:** Three leak vectors, each wanting a different fix.

1. **Swallowed-failure ordering (insidious — leaks even on a "successful" finish):** `step()` is best-effort — if `docker compose down -v` throws (docker busy, a stuck/unhealthy container, project can't resolve), it's caught + warned, and the **very next** step `git worktree remove` deletes the worktree dir anyway. Once that dir is gone the compose project context is gone and those anon volumes can **never** be reclaimed by `down -v` again — permanent orphan. Fix: run `down -v` with an explicit `-p <project>` (cwd-independent) and **gate `git worktree remove` on `down -v` actually succeeding**.
2. **Unregistered-worktree skip** (`finish.ts:328`): if the worktree isn't registered, `down -v` is skipped entirely — no volume cleanup.
3. **finish never runs:** abandoned / killed / crashed runs never reach teardown; whole stack + volumes leak.

Three fix directions (likely an Epic, not one ticket): (a) **kill the anon volume at the source** if vestigial — eliminates the leak class entirely, cheapest if it holds; (b) **robust teardown** — explicit `-p`, ordering gate, `--rmi local` so images don't pile up either; (c) **safety-net reaper** — a `crew prune` (or pre-dispatch reaper) that finds crew artifacts whose worktree/key no longer exists and removes their stacks + images + volumes (defense-in-depth for vectors 2 & 3, and the only thing that catches already-orphaned debris going forward).

**Shape of work:** Likely an Epic with three children mapping to (a)/(b)/(c). (a) is a small compose change gated on a verification spike (is the anon volume load-bearing?). (b) is a focused `finish.ts` change + tests. (c) is a new CLI subcommand + reaper logic + tests. (a) and (b) are independent; (c) is independent but most valuable shipped last (cleans up whatever (a)/(b) miss).

**Open questions:** Is the `/app/node_modules` anon volume still load-bearing given src-subdir-only bind-mounts, or vestigial (→ just delete it)? Should the reaper run automatically pre-dispatch, or be an explicit `crew prune` the user invokes? Should `crew down` also gain `-v`/`--rmi`, or stay conservative for the canonical stack? Does the canonical (non-worktree) stack share the same per-project anon-volume churn, or only worktree runs?

## 2026-06-19 — A throw between `*_started` and `*_exited` leaves the agent stuck `running`

**What:** CREW-255 emits a `run_started`/`fixpr_started` state event at dispatch and a paired `run_exited`/`fixpr_exited` at the command's exit. If the command throws _between_ those two points — `crew run` between `emitRunStarted` (after `registerRun`) and the final `process.exit` (`maybeRunE2eGate`, the 120s docker wait, `completeRun`), or `crew fix-pr` inside the `try { … } finally` that streams the transcript (the `finally` only de-registers signal handlers; it does not catch) — the exit event never lands. The daemon's reducer (plan Tasks 3/6) then has a dangling `running` state with no terminal event to move it off. The separate `completeRun(runId, …)` daemon call still fires for the run-row lifecycle, so the run isn't _lost_, but the reduced agent state would lie.

**Why noticed:** Code review of CREW-255 (plan Task 4, the CLI producer). Mirrors a known shape in the sibling startup-events producer (the early `process.exit` on a missing transcript has the same "no paired event" property) — flagged Minor/non-blocking by the reviewer since the consumer that would have to tolerate it isn't built yet.

**Anchors:**

- `packages/cli/src/commands/run.ts` — `emitRunStarted` (post-`registerRun`) … `emitDispatchExitedSync` (pre-`process.exit`); the gap is everything between.
- `packages/cli/src/commands/fix-pr.ts` — `emitFixprStarted` (dispatch) … `emitDispatchExited` (post-drain); the `try/finally` around `streamTranscript` doesn't catch.
- `packages/cli/src/lib/state-events/dispatch.ts` — the emit helpers.
- Plan Tasks 3/6 in `docs/superpowers/plans/2026-06-18-concrete-state-triggers.md` — the daemon reducer + `state_transitions` write path.

**What's been considered:** Cheapest is to make the daemon side tolerant rather than the producer airtight: the reducer/ingest already keys off `completeRun` for the run row, so a daemon reconciliation (e.g. on run completion, or a timeout sweep) could resolve a `running` agent whose run has terminated without a state event. Alternatively the CLI could wrap the dispatch body in a `try/finally` that always emits a terminal `*_exited` (with the caught error's code) — but that risks double-emits with the happy-path emit and complicates the sync/async split. The daemon-tolerance route is the recommended one and naturally folds into Tasks 3/6.

**Shape of work:** decided inside the daemon-ingestion tickets (Tasks 3/6) — either a reconciliation on `completeRun` or a stuck-`running` timeout sweep. No CLI change anticipated.

**Open questions:** Does `completeRun` already carry enough (exit code) for the daemon to synthesize the missing terminal transition, or does the reducer need an explicit "run row settled, no state event seen" signal?

## 2026-06-19 — `pr_created` hook regex misses env-var/command-prefixed `gh pr create`

**What:** The PostToolUse hook's command-boundary regex `(^|&&|;|\|)\s*gh pr create\b` (`hooks/state-events/pr-create-postuse.mjs`) only matches `gh` immediately after a separator (`^`, `&&`, `;`, `|`). It does **not** match an env-var prefix (`GH_TOKEN=x gh pr create`), a builtin prefix (`command gh pr create`), `sudo gh pr create`, or extra inner whitespace (`gh   pr   create`). Those forms silently drop the `pr_created` state event. The miss fails _closed_ (no false `pr_created`), and the daemon also learns PR state via `PrPoller`, so the agent's state still converges — but the in-session event (the fast path that flips `running → pr_open` immediately) is skipped for prefixed invocations.

**Why noticed:** Code review of CREW-256 (plan Task 5). The reviewer flagged it as Minor/non-blocking. The exact regex was specified verbatim in the Epic plan + ticket, so CREW-256 shipped it as-spec rather than widening it unilaterally. It's slightly ironic that the injection _itself_ templates an env-var prefix (`CREW_AGENT_KEY=<key> node …`) into the hook command — agents nearly always run a bare `gh pr create`, so impact is low in practice.

**Anchors:**

- `hooks/state-events/pr-create-postuse.mjs` — `PR_CREATE` regex
- `hooks/state-events/pr-create-postuse.test.mjs` — would gain prefixed-form + inner-whitespace cases
- `.agents/dispatch.md` § State-event hook injection — documents the boundary regex
- plan `docs/superpowers/plans/2026-06-18-concrete-state-triggers.md` Task 5

**Shape of work:** tiny regex widen — allow an optional run of `VAR=val ` / `command ` / `sudo ` tokens after the boundary, and tolerate inner whitespace (`gh\s+pr\s+create`). Add the missed-form tests alongside. Watch the decoy case (`echo "… gh pr create …"`) still fails — the widening must stay anchored to a command boundary, not match mid-string.

**Open questions:** worth doing at all? A missed best-effort event is recovered by `PrPoller` on its next tick, so the only cost is a brief state-flip latency. Decide whether the latency matters enough to widen, or whether the bare-form coverage is sufficient and this should be abandoned.

## 2026-06-17 — Host runner can't apply `dequeue` (no daemon "drop pending action" route)

**What:** CREW-243's `applyCommand` (`packages/cli/src/lib/runner/commands.ts`) handles `cancel_soft`/`cancel_hard`/`reap` host-side, but reports `dequeue` as `failed` "not yet supported by the host runner." `dequeue` is meant to drop a still-_pending_ `action_request` that hasn't spawned a process yet — but there is no daemon route to delete/cancel a pending action (`ActionService` exposes only `enqueue`/`claimNextPending`/`report`; the routes are `POST /api/actions`, `GET /api/actions/pending`, `POST /api/actions/:id/result`). So an operator who enqueues a `dequeue` command gets a `failed` result and the pending action stays in the queue until a runner claims + launches it. `pause`/`resume`/`message` are likewise unsupported, but those are explicitly designed-for the CREW-248 fast-follow; `dequeue` was scoped as v1 in the Epic plan, so it's the real gap.

**Why noticed:** Implementing CREW-243 (Epic CREW-235, Ticket C, host side). The Epic plan (Task 5, Step 5) specifies `dequeue` → "call the daemon to drop the pending action_request," but CREW-243 is explicitly host-side and the daemon routes were Ticket B (CREW-242), which didn't add an action-drop route. Adding one in C would overstep the ticket boundary, so the host runner reports `dequeue` as unsupported for now rather than silently no-op'ing it.

**Anchors:**

- `packages/cli/src/lib/runner/commands.ts` — `applyCommand` default branch (`'…' not yet supported`)
- `packages/daemon/src/services/ActionService.ts` — no `drop`/`cancel` method
- `packages/daemon/src/routes/actions.ts` — would host a `DELETE /api/actions/:id` (or `POST /api/actions/:id/cancel`)
- `packages/cli/src/lib/runner/commands.test.ts` — the `it.each(['dequeue','pause','resume','message'])` "not yet supported" assertion to flip once wired

**Shape of work:** small daemon addition — an `ActionService.cancelPending(id)` that transitions a `pending` row to a terminal/cancelled status (404/409 if already claimed), a thin route + Bruno endpoint, and a daemon-client `dequeueAction(id)` method. Then `applyCommand` grows a `dequeue` boundary the worker wires to it, and the "not yet supported" test for `dequeue` flips to an applied assertion.

**Open questions:** does `dequeue` carry the `action_request` id (it isn't on `RunnerCommand` today — only `agentKey`), or does the daemon resolve "the pending action for this agentKey"? The command's `agentKey` is the natural key, but multiple pending actions could share one key — decide the targeting before wiring.

## 2026-06-17 — `RunnerCommandsService.reportResult` silently 204s on an unknown command id (vs `ActionService.report`'s 404)

**What:** `RunnerCommandsService.reportResult` (`packages/daemon/src/services/RunnerCommandsService.ts`) does `if (!updated) return;` when the `UPDATE … RETURNING` matches no row — so reporting a result for an unknown/already-settled command id succeeds silently with a 204. Its sibling `ActionService.report` instead throws `NotFoundError` (→ 404), and the actions route doc explicitly advertises "404 on an unknown id." The asymmetry became newly _reachable over HTTP_ in CREW-242, which added `POST /api/runner/commands/:id/result` (`packages/daemon/src/routes/runner.ts`) as a thin wrapper over the unchanged CREW-241 service method.

**Why noticed:** Code-review of CREW-242 (Epic CREW-235, Ticket B). The reviewer flagged the convention divergence as Minor/non-blocking: the defect lives in CREW-241's shipped service code, outside CREW-242's diff, and CREW-242 deliberately kept its footprint off the shared service to avoid colliding with parallel CREW-243 (runner registry + signalling, which also touches the runner-command path). Deferred rather than fixed inline.

**Anchors:**

- `packages/daemon/src/services/RunnerCommandsService.ts` — `reportResult` (`if (!updated) return;`)
- `packages/daemon/src/services/ActionService.ts` — `report` (throws `NotFoundError` — the convention to match)
- `packages/daemon/src/routes/runner.ts` — `POST /api/runner/commands/:id/result` (the new HTTP surface)
- `bruno/endpoints/runner/post-command-result.bru` — doc string would advertise the 404 once aligned

**What's been considered:** One-line fix — change `if (!updated) return;` to `throw new NotFoundError(...)` mirroring `ActionService.report`, plus a service test asserting the throw and a Bruno unknown-id case. Caveat to weigh first: the runner-side caller (CREW-243's `applyCommand`/`drainCommands`) will need to tolerate a 404 on a result it reports for a command the daemon already pruned/superseded — confirm that path treats 404 as benign (never-throws client) before flipping the behavior, or the consistency fix could surface a spurious runner error.

**Open questions:** Is a silent 204 actually the safer contract for a fire-and-forget runner result report (the runner can't usefully act on a 404), making this doc-comment-and-Bruno alignment rather than a behavior change? Decide alongside CREW-243.

## 2026-06-17 — failed-start rows render as plain `error` agents in the main grid

**What:** CREW-244 makes a preflight death create a `runs` row with `status='failed-start'` (and a backing `agents` row). `AgentsService` derives the grid badge purely from `completed_at`/`exit_code`/transitions — it never reads the new `status` column — so a failed-start (`exit_code=1`) shows as a generic `error` agent and a `launching` placeholder as `initializing`. That's an acceptable interim ("make init failures visible"), but a pre-run failure isn't really an `error` agent, and an agent that only ever failed preflight now sits permanently in the main grid.

**Why noticed:** Code review of the CREW-244 PR (the register-before-preflight ticket). The reviewer flagged that the change has a non-obvious effect on the primary agents view; the author confirmed the interim `error` rendering is intentional and parked the dedicated home here.

**Anchors:**

- `packages/daemon/src/services/AgentsService.ts` — `list()` `latest` correlated subquery (`command IN ('run','fix-pr')`, no `status` filter) + `deriveState`
- `packages/daemon/src/services/RunFailureService.ts` — `recordFailedStart` upserts the `agents` row
- `docs/tickets/CREW-244.md` — "Failed-start agents surface as `error`" decision

**What's been considered:** Two options surfaced — (a) filter `status IN ('launching','failed-start')` out of the `latest`-run subqueries, or (b) give failed-starts a dedicated "Failed to start" Runner-page section and exclude them from the grid. (b) is the Epic's intended design and belongs to **CREW-245** (Runner page), which can decide grid exclusion holistically once it also has B's live-process snapshot. Filtering alone (a) isn't sufficient — the backing `agents` row still appears (as perpetual `initializing`), so the real fix is a grid-level exclusion of agents whose only runs are launching/failed-start.

**Shape of work:** Fold into CREW-245 when the Runner page lands — one query-level exclusion in `AgentsService.list()` (+ test) plus the "Failed to start" section that reads failed-start rows directly.

## 2026-06-17 — only `PreflightError` becomes a structured failed-start; docker/npm/playwright init failures don't

**What:** CREW-244's `runTrackedPreflight` converts the `launching` row into a structured `failed-start` **only** when `prepareAgentEnvironment` throws a `PreflightError` (the health-check gate). But that gate runs _last_ in `prepareAgentEnvironment`, after docker bringup, `npm install`, and the Chromium install — each of which throws a plain `Error`, not `PreflightError`. So the most common dispatch failure modes (docker stack won't come up, npm ci fails) fall through to the generic time-based reaper ~10 min later, surfacing as `failed-start` with the placeholder "Run never started" diagnosis instead of the real cause.

**Why noticed:** Code review of the CREW-244 PR. Consistent with CREW-244's stated scope (`PreflightError` → structured capture; runner-executor stdout capture deferred to CREW-243), but the gap means the headline goal ("missing remote, failed health check") is covered while docker/npm — statistically the bigger failure surface — is not.

**Anchors:**

- `packages/cli/src/lib/run/agent-environment.ts` — docker/npm/chromium steps (plain `Error`) run before `runPreflight`
- `packages/cli/src/lib/run/preflight-tracking.ts` — `runTrackedPreflight` only special-cases `instanceof PreflightError`
- `packages/cli/src/lib/run/index.ts`, `packages/daemon/src/services/RunFailureService.ts` (`reapStuckLaunching` generic failure)

**What's been considered:** Wrap the docker/npm/chromium throwers in a structured failure too — either widen `runTrackedPreflight` to catch any error and synthesize a `RunFailure` from the thrown message + the relevant `/tmp/crew-*-<KEY>.log` tail, or have each step throw a `PreflightError`-shaped error. The richer capture (reading the step's log tail for `failure_output`) overlaps CREW-243's per-run startup-log capture, so it's natural to wire when that executor work lands.

**Shape of work:** Small change in `preflight-tracking.ts` (broaden the catch + map non-preflight errors to a generic `RunFailure`), or fold into CREW-243's startup-capture work for the log-tail-as-output version.

## 2026-06-05 — `bruno-skeleton` fix() defaults the scaffolded port instead of deriving it from config

**What:** The `bruno-skeleton` health-check `fix()` (`packages/cli/src/lib/health/checks/bruno-skeleton.ts`) builds an `InitAnswers` from the loaded `ProjectConfig` but omits `ports`, so `scaffoldBruno` falls back to `DEFAULT_DAEMON_PORT` (7773) when it writes the `environments/local.bru` `baseUrl`. A project whose daemon runs on a different port gets a scaffolded bruno environment pointing at the wrong port. The config does carry `bruno_smoke.base_url`, but that's typically a `${DAEMON_URL}` template resolved per-worktree from `env.toml` — the port isn't statically knowable from the config alone, which is why the scaffolder takes an explicit `ports.daemon` instead.

**Why noticed:** Code review of CREW-227 (T4 health checks). Flagged Minor — the scaffold is a starting skeleton the user edits, and the doctor command that invokes `fix()` is a later ticket (CREW-228), so nothing consumes this path yet.

**Anchors:**

- `packages/cli/src/lib/health/checks/bruno-skeleton.ts` — `fix()` omits `ports` from `InitAnswers`
- `packages/cli/src/lib/init/scaffold-bruno.ts` — `DEFAULT_DAEMON_PORT = 7773` fallback; `ENV_CONTENTS(port)` writes `baseUrl`
- `packages/cli/src/lib/init/types.ts` — `InitAnswers.ports?: { daemon; dashboard }`

**What's been considered:** Parsing the port out of `bruno_smoke.base_url` works only when it's a literal; for the common `${DAEMON_URL}` template it would need the materialized env (the same `envVars` the `env-materialized` check already builds). Cleanest fix is probably to thread the resolved daemon port through the `HealthContext` (or have `fix()` read `ctx.envVars`) once CREW-228 wires the doctor command and decides how the context carries materialized env.

**Open questions:** Does the doctor `HealthContext` already carry a resolved daemon port / `DAEMON_URL` by the time `fix()` runs, or does the bruno fix need to materialize env itself?

## 2026-06-04 — `finish_steps` table accumulates across `crew finish` re-runs (no run scoping)

**What:** The daemon's `finish_steps` table (migration `0007`, CREW-215) has no `(agent_key, run_id)` discriminator and no unique constraint on `(agent_key, idx)`. `FinishStepsService.list(key)` returns _every_ row for the agent ordered by `id`. Meanwhile the CLI resets its per-step `index` to 0 at the start of each `crew finish` run (`makeStepReporter`, `packages/cli/src/commands/finish.ts`). So a second `crew finish` for the same key (a retry after a partial failure, or a manual re-run) appends a fresh `0,1,2,…` sequence — the agent's checklist becomes `[0,1,2,…,0,1,2,…]` and grows unbounded over the agent's lifetime. The drawer shows the concatenation of all runs with no visual run boundary.

**Why noticed:** Code review of CREW-220 (T8). The dashboard consumer (`FinishSteps.tsx`) originally keyed rows on `step.index`, which collides on the repeated indices — fixed in CREW-220 by keying on `${ts}-${index}`. But that's a band-aid over the daemon-side question: should the checklist be scoped to the latest run (or grouped per run) rather than an ever-growing concatenation?

**Anchors:**

- `packages/daemon/src/migrations/0007_finish_steps.ts` — table DDL (no run_id, no unique idx)
- `packages/daemon/src/services/FinishStepsService.ts:62-77` — `list()` returns all rows by `id`
- `packages/cli/src/commands/finish.ts` — `makeStepReporter` resets `index` per run
- `packages/dashboard/src/components/FinishSteps.tsx` — consumer; `${ts}-${index}` key works around the collision

**What's been considered:** Two shapes — (a) clear prior `finish_steps` for the agent at the start of each run (latest-run-only semantics, simplest, matches "the drawer shows the current cleanup"); (b) add a `run_id` and group/scope the checklist per run (keeps history, more UI work). (a) is likely enough — finish is terminal cleanup, history of prior failed attempts has low value.

**Shape of work:** small daemon change (clear-on-new-run or run_id column + migration) + a `FinishStepsService` tweak; optional dashboard grouping if (b). The CREW-220 key fix means there's no rendering bug in the meantime, just unbounded growth + concatenated display.

## 2026-06-04 — Runner pidfile has no liveness identity (recycled-PID false positive)

**What:** `crew runner` (CREW-216) tracks its supervisor by bare PID in `~/.config/crew/runner.pid`. `isProcessAlive(pid)` (`packages/cli/src/commands/runner.ts`) only asks "is _some_ process with this PID alive" via `process.kill(pid, 0)`. After a reboot or PID recycle, a stale pidfile can point at an unrelated live process, so `crew runner status` reports "running" and `crew runner start` no-ops (and `stop` would SIGTERM a stranger). Standard pidfile limitation; acceptable for v1 but a latent foot-gun on a long-lived host.

**Why noticed:** Code review of CREW-216 (this session) flagged it Minor — the runner is the first long-lived crew process, so it's the first place this classic pidfile gap bites.

**Anchors:** `packages/cli/src/commands/runner.ts` `isProcessAlive` / `readPidFile`; `packages/cli/src/lib/runner/supervisor.ts` `startRunner`/`stopRunner` (the pure liveness consumers).

**What's been considered:** stamp the pidfile with a start token (write `pid:starttoken`, where the token is e.g. the supervisor's start time) and compare on read; or verify `/proc/<pid>/cmdline` contains `crew runner __supervise` before trusting the pid. The `/proc` check is Linux-only (the runner is a Linux/WSL host process today, so acceptable), the start-token approach is portable but needs a way to fetch the live process's start time.

**Shape of work:** small, contained — one helper that validates pid identity, threaded through the `readPid`/`isAlive` boundaries already injected into `startRunner`/`stopRunner`/`runnerStatus`. The pure layer doesn't change; only the command's boundary wiring does.

## 2026-06-04 — `GET /api/runner/logs` reads the whole log file into memory

**What:** `tailLog` in `packages/daemon/src/routes/runner.ts` does `readFile(logPath, 'utf8')` then slices the last N lines. The `tail` _count_ is capped (≤2000), which bounds the response, but nothing bounds how much is read off disk — a long-lived host runner with an unrotated `~/.crew/runner/runner.log` makes the route allocate the entire file per request. It's a latent self-DoS on a long-running host once there's a real producer.

**Why noticed:** Code review of CREW-215 (this session) flagged it as the one non-cosmetic finding, but classified it as a followup rather than a blocker: it's inert until T4 (CREW-216, the host runner process) actually writes to that log. No producer exists at merge time.

**Anchors:** `packages/daemon/src/routes/runner.ts` `tailLog()` (the `readFile(... 'utf8')`); the `LogsQuerySchema` `tail` cap. Producer side lands in Task T4 of Epic CREW-208 (`docs/superpowers/plans/2026-06-03-dashboard-agent-actions.md`).

**What's been considered:** bounded trailing read (fs `stat` + a `read` of the last ~256KB, then split) avoids loading the whole file; alternatively, commit to a log-rotation story for `runner.log` and document a max size. The bounded-read is the smaller change and doesn't require a rotation policy.

**Shape of work:** small, contained — swap the full read for a trailing-chunk read in one function; existing route tests still apply. Best folded into T4 (CREW-216) when the producer ships, so the bound and the writer land together.

## 2026-06-03 — `getStackUrl` is orphaned + duplicated by `docker-list`'s port/URL helpers

**What:** `packages/cli/src/lib/docker/compose.ts:52` `getStackUrl(project)` has no production caller — only `compose.test.ts` references it (already true at `origin/main`, predating CREW-31). CREW-31's new `list-stacks.ts` re-implements its two concerns independently: `getHostPort` parses `docker port <id> <spec>` (last-colon segment), and `stackUrl` builds `https://localhost[:port]` with the `443`→no-suffix rule. So the repo now carries two copies of that port-parse + URL-build logic, one of them dead in production.

**Why noticed:** Flagged in the CREW-31 self-review (Senior Code Reviewer subagent). Left out of CREW-31's PR to keep scope tight — `getStackUrl` lives in an unrelated module and deleting/refactoring it would expand the diff into `compose.ts` + `compose.test.ts` for no behavioral gain on the ticket.

**Anchors:** `packages/cli/src/lib/docker/compose.ts:52` (`getStackUrl`), `packages/cli/src/lib/docker/compose.test.ts:44` (its only caller), `packages/cli/src/lib/docker/list-stacks.ts:38,81` (`getHostPort` + `stackUrl`).

**What's been considered:** Two clean resolutions — (a) delete `getStackUrl` + its test outright since it's dead, leaving `list-stacks.ts` as the single home; or (b) if a caller is still expected, have `getStackUrl` delegate to `getHostPort` + a shared URL builder so the parse/format logic lives once. (a) is simplest given there's no caller.

**Shape of work:** Tiny — one deletion (or one delegation refactor) plus test cleanup in the `docker/` lib subdir. Not worth a ticket on its own; fold into the next docker-lib touch.

## 2026-05-23 — GitHub webhook as a future PR-status detection mechanism (parking-lot)

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

## 2026-05-22 — CREW-183's `installNodeModules` fix doesn't extend to `crew fix-pr`

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

## 2026-05-18 — Daemon has no reaper for orphaned runs stuck in `running`

**Ticket:** [CREW-305](https://safturento.atlassian.net/browse/CREW-305) — standalone Task, Backlog (needs-planning). Carved out of Epic CREW-235 at its 2026-06-28 close: the epic shipped the *manual* Reap affordance plus the `launching`-only auto-reaper ([CREW-244](https://safturento.atlassian.net/browse/CREW-244)), but the automatic detection-and-settle of fully-`running` orphans (no live runner snapshot to diff against) was deferred to this ticket.

**What:** A crew run can finish its real-world work — PR opened and merged, Jira ticket Done — while the daemon's run record stays stuck in `running` indefinitely. The daemon marks a run complete only when the CLI delivers `POST /api/agents/runs/:id/complete` on Claude exit. If that call never lands (CLI crash, daemon down at exit, killed process), the run sits in `running` forever — `completed_at` null, metrics null, no PR URL — and the dashboard shows the agent as perpetually active. Nothing detects or reaps these.

**Why noticed:** CREW-158's daemon run (run 23, started 2026-05-14) was found still `running` 4 days later, even though its work had shipped via merged PR #208 and the ticket is `Done`. Manual recovery with `POST /api/agents/runs/23/complete` `exitCode 137` — which lands the agent in `error`, because the daemon derives `error` from any non-zero exit and only `exitCode 0` yields a clean completion. So orphaned runs are both invisible (no detection) and unrecoverable to a clean state (manual completion can only produce `error`).

**2026-06-05 update — recurred:** hard-resetting the four Dashboard-polish runs (CREW-231–234) from the CLI left all four stuck showing `running`, same mechanism (an out-of-band kill bypasses `completeRun`). This is the backstop half of a pair: the graceful half is the 2026-06-05 "Dashboard has no cancel action; CLI kill never notifies the daemon" followup (above), which would handle the _intentional_ stop cleanly; this reaper catches kills that bypass any graceful path. The terminal-state open question below is shared between the two — resolve together.

**Anchors:** `packages/daemon/src/routes/runs.ts` (register + `:runId/complete` endpoints); `packages/daemon/src/services/AgentsService.ts`, `IngestService.ts` (run state); `packages/cli/src/lib/preflight/run-resume-preflight.ts` (existing orphan-detection on the resume path); CREW-158 / daemon run 23 / PR #208.

**What's been considered:** Two angles, possibly both — (1) **detection / reaping:** daemon-side sweep that flags runs `running` past a threshold (e.g. no transcript activity for N hours) and either auto-completes them or surfaces them in the dashboard for manual recovery; (2) **durable exit signalling:** make the CLI's completion POST survive a crash (retry / on-disk intent), or a daemon-side fallback that notices the ingested transcript tail going idle. The CLI already has orphan-detection in `run-resume-preflight.ts` for the _resume_ path — a daemon reaper would generalize that to runs nobody resumes.

**Open questions:** What's the right "stuck" threshold? And the right terminal state for a reaped run — `error` (honest: it never completed cleanly) or a distinct `abandoned` / `stale` state so it's visually separable from runs that genuinely crashed? CREW-158 showed conflating the two is misleading.

## 2026-05-15 — `parity_violations` metric is recorded end-to-end but never computed (always null)

**What:** CREW-164's `computeRunMetrics` derives three of the four Layer-1 metrics from a run's transcript (`cleanlinessPass`, `prClaimInputTokens`, `docLoadCoveragePct`). The fourth, `parityViolations`, is hard-wired to `null` — there is no transcript-only signal for `.agents/` doc-parity violations. The `runs.parity_violations` column, the `MetricsService` aggregate (`parityViolationRate`), the `/api/metrics` payload, and the dashboard widgets all carry the metric end-to-end; only the _capture_ is a stub.

**Why noticed:** Building the metrics pipeline for CREW-164. Plan Step 26 ("compute the four metrics") gave no formula for parity. The Phase 3 commit/PR hook (CREW-160) is the component that detects `.agents/` parity violations, but at run-completion time it leaves nothing the daemon can read.

**Anchors:** `packages/daemon/src/services/computeRunMetrics.ts` (the `parityViolations: null` line + its doc comment); `packages/daemon/src/services/MetricsService.ts` `aggregate()` → `parityViolationRate`; CREW-160 (Phase 3 hook); CREW-164.

**What's been considered:** The metric is null-safe everywhere — `MetricsService.aggregate` filters nulls out of `parityViolationRate`, so a null parity column never skews the cohort. The honest stub (`null`) was chosen over a fabricated `0`.

**Shape of work:** Depends on what signal the Phase 3 hook leaves behind. If the hook writes a violation count into the transcript (a `system`/`attachment` event) or a worktree sidecar file, `computeRunMetrics` gains a small extractor. If it only annotates the PR, capture moves out of the transcript path entirely. Small once the signal source exists; blocked until then.

**Open questions:**

- Where does the Phase 3 hook record violation counts — transcript event, worktree file, or PR comment only?
- Is "violations introduced on this run" or "violations outstanding at run end" the right semantic?

## 2026-05-14 — Per-turn metric series so cache size can be graphed over a run

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

## 2026-05-07 — Port allocator detects collisions only at `docker compose up` time

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

## 2026-05-05 — Per-ticket model selection (use Sonnet for trivial work)

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

## 2026-05-05 — Daemon container's `~/.claude/projects` mount is broader than crew's transcript ingest needs

**What:** `docker-compose.yml` mounts `${HOME}/.claude/projects:/root/.claude/projects:ro` so the daemon's IngestService can tail real-agent JSONL transcripts. The mount is read-only, but it covers _every_ project's transcripts plus MCP server settings/oauth tokens and memory files for all of the user's projects — not just crew. A daemon vulnerability (or a future feature that surfaces transcript content) could read material that has nothing to do with crew.

**Why noticed:** Code review of CREW-87 (foundation ticket A of the dockerization Epic CREW-86). Reviewer flagged it as worth narrowing or filtering before the dockerized daemon ships beyond the local-only canonical use case.

**Anchors:** `docker-compose.yml` (the `${HOME}/.claude/projects:/root/.claude/projects:ro` line); `packages/daemon/src/services/IngestService.ts` (the consumer); CREW-87, CREW-86 Epic.

**What's been considered:** Two narrowing approaches — (a) mount only the specific per-project subdirs the IngestService is configured to ingest; (b) keep the broad mount but filter at the IngestService layer so only configured projects' transcripts are ever opened. (a) is tighter at the docker layer; (b) is more flexible if the set of ingested projects changes at runtime.

**Shape of work:** Small. One ticket — modify the compose mount to a project-aware list (likely materialized through env.toml), or add the IngestService-side filter.

**Open questions:** Should the canonical compose continue mounting broadly while worktree compose narrows?

## 2026-05-04 — Generalize the hardcoded `db-clone-from-main.sh` post-bringup hook into a configurable TOML-registered startup script

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

## 2026-05-03 — `crew run` post-stream "waiting up to 120s for docker bringup" log is misleading after CREW-83

**What:** `packages/cli/src/commands/run.ts:451-469` waits up to 120s on `dockerProcess` after the agent finishes streaming. CREW-83 made `prepareAgentEnvironment`'s `fresh` mode block on bringup and throw on non-zero exit, so by the time we reach this post-stream block `dockerProcess` is always already-resolved with `exitCode === 0`. The 120s race becomes a guaranteed-fast no-op, but the user still sees `→ waiting up to 120s for docker bringup…` printed. Cosmetically noisy.

**Why noticed:** Self-review of CREW-83 PR.

**Anchors:** `packages/cli/src/commands/run.ts:451-469`; `packages/cli/src/lib/run/agent-environment.ts:51-68`; `docs/superpowers/plans/2026-05-03-agent-dispatch-preflight.md` Task 3.

**Shape of work:** Small. Either delete the wait/log block or tighten it to a one-liner that reads the resolved exit code without the misleading wait message. ~10 lines.

## 2026-05-03 — `chokidar` dep added to daemon but no code imports it

**What:** CREW-50 added `chokidar ^4.0.3` to `packages/daemon/package.json` per the slice 1b plan + ticket acceptance criteria. The shipped `IngestService` (and the `tailTranscript` helper it uses) still polls via `fs.open`/`stat` every 200ms — chokidar isn't actually imported anywhere. Either the migration to fs-event watching needs to happen in a follow-up slice, or the dep should be dropped.

**Why noticed:** Code-reviewer flagged it during CREW-50 self-review.

**Anchors:** `packages/daemon/package.json:28`; `packages/daemon/src/services/IngestService.ts`; `packages/shared/src/transcripts/tail.ts:23-72`; `docs/superpowers/plans/2026-04-29-agents-data-end-to-end.md:498-510`.

**Shape of work:** Two paths. (a) Migrate `tailTranscript` to chokidar-driven (cheaper to react to writes; more moving parts in tests). (b) Drop the dep + amend the plan note.

**Open questions:** Does the polling tail's 200ms latency matter for the dashboard slice? If not, (b) is right.

## 2026-05-03 — `crew run` swallows background-task failures into `/tmp` logs

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

## 2026-05-03 — Transcript line printer truncates tool-call inputs mid-string

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

## 2026-05-02 — `crew restart --hard` should not silently bail when a PR exists

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

## 2026-05-02 — `crew fix-pr` skips env materialization and full verification

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

## 2026-05-01 — Structured final-report contract for agent dispatches (dashboard prerequisite)

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

## 2026-05-01 — Render assistant.text preamble alongside same-event tool calls

**What:** `streamTranscript` parses each assistant event with `parseToolCall` first and short-circuits on a hit, so the common Claude Code shape `[TextContent("Let me read the file."), ToolUseContent(...)]` only renders the tool-call line — the preamble text is dropped. CREW-72 added `assistant.text` rendering for _standalone_ text events, but mixed-content events still drop the text half.

**Why noticed:** CREW-72 self-review by superpowers:code-reviewer. Strictly out-of-scope for the silent-tail bug but worth tracking.

**Anchors:** `packages/cli/src/lib/run/stream-transcript.ts:92-105`; `packages/shared/src/transcripts/parser.ts`.

**What's been considered:** Two text snippets per event (preamble line + tool-call line) is the natural rendering. Alternative: collapse into one line (denser but mixes prefixes; rejected).

**Shape of work:** Small. Drop the early `continue` after the tool-call branch. One added test.

**Open questions:** Should the preamble line precede or follow the tool-call line?

## 2026-05-01 — Crew owns DB replication end-to-end (off per-project shim scripts)

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

## 2026-05-01 — Generic `--git-common-dir` helper in `crew-shared` (third-caller trigger)

**What:** `appendExcludeLine` in `packages/cli/src/lib/playwright/write-mcp-file.ts` resolves the worktree-aware path to `.git/info/exclude` by shelling out to `git rev-parse --git-common-dir`. It's the only caller today. If a second or third call site needs the same resolution, factor a small helper into `crew-shared`.

**Why noticed:** Explicitly carved out of CREW-67's scope as "worth considering if a third call site needs `--git-common-dir`, but YAGNI for one."

**Anchors:** `packages/cli/src/lib/playwright/write-mcp-file.ts`; CREW-67.

**Shape of work:** Small refactor. Once a second/third caller appears, lift into `crew-shared` (`git/common-dir.ts` exporting `resolveGitCommonDir(worktreePath)`) and migrate call sites.

## 2026-05-01 — `crew run`/`resume`/`restart` against an already-shipped ticket has no safety net

**What:** None of the agent-spawning commands check whether the target ticket has already been shipped (PR merged, ticket Done). Running `crew run CREW-X` against a ticket whose work is already on `main` produces non-deterministic agent behavior — best case "no work to do"; worst case junk PR.

**Why noticed:** During CREW-66 follow-up to CREW-65: _"if I run `crew run CREW-65` or `crew resume CREW-65`, will it pick up the new work or just break in a weird, new way?"_ No defensive check.

**Anchors:** `packages/cli/src/commands/run.ts` — `runRun`; `packages/cli/src/commands/resume.ts`; `packages/cli/src/commands/restart.ts`; `mcp__atlassian__jira_get_issue` — already used in the agent's first prompt step.

**Shape of work:** One ticket. Add Jira preflight at the top of `run` / `resume` / `restart`: fetch ticket; if `status.statusCategory.key === "done"`, refuse with useful error suggesting `crew fix-pr` or `--force`. Bonus: detect "in review" with open PR.

**Open questions:**

- Opt-out (`--force` to bypass) vs opt-in?
- What states qualify as "already shipped"? `Done` unambiguous; `In Review` more nuanced.
- Project-specific terminal status names vary.
- Live in `runRun` reused by others, or in `prepareAgentEnvironment`?

## 2026-05-01 — Playwright integration self-review cleanups

**What:** Three small cleanups noted in CREW-58's self-review but explicitly bundled out:

1. **Ubuntu 24.04+ apt names.** `scripts/install.sh`'s hardcoded apt list targets Ubuntu 22.04 / Debian 12 names. Ubuntu 24.04+ renamed several to `t64` (e.g. `libasound2t64`).
2. **Test casts.** `packages/cli/src/lib/playwright/install-browsers.test.ts` uses `as unknown as ReturnType<typeof execa>` (3 sites). Could use `ResultPromise` from execa directly.
3. **`[playwright.smoke] enabled = false` UX.** The schema declares `enabled: z.literal(true)`, so writing `enabled = false` produces a literal-mismatch validation error rather than a clean no-op.

**Why noticed:** [PR #53](https://github.com/Safturento/crew/pull/53) (CREW-58) self-review section.

**Anchors:** `scripts/install.sh` (lines 30–35); `packages/cli/src/lib/playwright/install-browsers.test.ts:40,58,69`; `packages/shared/src/config/schema.ts:5–7`; [CREW-58](https://safturento.atlassian.net/browse/CREW-58).

**Shape of work:** Three independent micro-tickets (or one bundled cleanup). Item 1 needs Ubuntu 24.04+ to validate; items 2 and 3 land standalone.

## 2026-04-30 — Surface subagent activity in transcript outputs

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

## 2026-04-30 — `crew resume` deferred follow-ups

**What:** Four deferred concerns from the `crew resume / restart / reset` design:

1. **Multi-session resume picker.** Interactive picker for older `.jsonl` sessions.
2. **`crew resume --new-session` flag.** Force fresh claude even when a session exists — preserve old + fork.
3. **Telemetry on resume/restart events.** Daemon's run-state model doesn't track "this run was resumed N times."
4. **`-m` interaction with future `crew init`.** Onboarding wizard might seed `-m` with a "first-run" template.

**Why noticed:** Design spec for CREW-63 §8. PR [#58](https://github.com/Safturento/crew/pull/58) shipped without addressing.

**Anchors:** `docs/superpowers/specs/2026-04-30-crew-resume-design.md` §8; [CREW-63](https://safturento.atlassian.net/browse/CREW-63); `packages/cli/src/lib/run/find-latest-session.ts`.

**Shape of work:** Each is its own ticket when needed. None urgent today.

## 2026-04-29 — Promote `resolveAppUrl` to shared `lib/url-substitution/`

**What:** `resolveAppUrl` lives at `packages/cli/src/lib/playwright/resolve-app-url.ts` but has three callers (CLI run/fix-pr/agent-environment for `playwright.app_url` and `bruno_smoke.base_url`). The Bruno smoke design spec prescribed promoting if a third caller emerged. That threshold has been crossed.

**Why noticed:** Spec §13 of Bruno smoke design. Verified 3 active callers post-CREW-58 rename.

**Anchors:**

- `packages/cli/src/lib/playwright/resolve-app-url.ts` + test
- Callers: `packages/cli/src/commands/run.ts:156,167`, `packages/cli/src/commands/fix-pr.ts:160`, `packages/cli/src/lib/run/agent-environment.ts:47`
- `docs/superpowers/specs/2026-04-29-bruno-smoke-tests-design.md` §13

**Shape of work:** Single small refactor PR. `git mv` to `packages/cli/src/lib/url-substitution/`, update callers' imports, leave a re-export in `lib/playwright/index.ts` or update everyone. Tests unchanged.

