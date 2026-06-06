# CREW-234 — Dashboard polish D: Lifecycle state & timeline (fix-pr)

Jira: https://safturento.atlassian.net/browse/CREW-234

Implements plan Tasks 6–8 in `docs/superpowers/plans/2026-06-05-dashboard-polish.md`
(item #8 of the Dashboard polish batch, Epic CREW-230).

## Goal

The agent-state badge must follow the `state_transitions` log that `IngestService`
already maintains, rather than the divergent `gh pr create` SQL-flag recompute in
`AgentsService.deriveState`. That divergence is the root of both lifecycle symptoms:

- **Stuck PR Open:** an in-flight `crew fix-pr` keeps showing PR Open instead of Running.
- **False Finished:** CREW-226/227 read as Finished when they should read PR Open,
  in both the list and the drawer.

## Relevant files

- `packages/daemon/src/services/state-derivation.ts` — new pure helper
  `currentStateFromTransitions()` (latest `to_state` → `AgentState`).
- `packages/daemon/src/services/AgentsService.ts` — `list()` + `getByKey()` now source
  the `initializing`/`running`/`pr_open` distinction from the transition log.
- `packages/daemon/src/services/IngestService.ts` — writes the log (the source of
  truth). **Not modified** — only consumed.

## Task 6 — Investigation spike findings

### Spike constraint (recorded honestly)

The plan's Step 2 asks for a live `sqlite3` query of `state_transitions` for CREW-226
and CREW-227. **That query is not runnable from this dispatch:** those agents live on
the **canonical** daemon stack (DB in the `crew-state` Docker named volume, unreachable
from the sandbox), while this worktree's daemon runs a **seeded dev DB** that does not
contain them. The decision gate is therefore resolved by **code + existing-test
evidence**; the contingent backfill is deferred behind post-deploy verification rather
than shipped on speculation.

### H1 — `deriveState` divergence is the root cause (confirmed, high confidence)

`IngestService.computeNextState` (`IngestService.ts:686`) writes `state_transitions`
using the shared `hasPrCreateInvocation` helper (`packages/shared/.../parser.ts:192`),
which splits on `\n`/`⏎` and matches `gh pr create` at the start of any line — so a
`cd <worktree> ⏎ gh pr create …` summary is matched.

`AgentsService.deriveState` ignored that log and recomputed from SQL flags:
- `list()` (`:179`): a `MAX(… LIKE 'gh pr create%' OR LIKE '%⏎ gh pr create%')` — ⏎-aware.
- `getByKey()` (`:311`): a cruder `MAX(… LIKE 'gh pr create%')` — **not** ⏎-aware.

Two consequences, matching the two symptoms:
1. `has_pr_create` is **forever-true** once `gh pr create` ran — it can never represent
   the `pr_open → running` cycle of an in-flight fix-pr. → **Stuck PR Open.**
2. `list()` and `getByKey()` use different detection SQL, so they can disagree for one
   agent (list ⏎-aware, detail not), and the `return 'finished'` fallback fires when
   detection misses. → list/drawer mismatch + **False Finished.**

### L1 — the fix-pr re-flip is NOT missing (confirmed by existing tests)

The transition log already captures the full `running → pr_open → running` cycle, and
the daemon-restart-mid-fix-pr priming case, green under
`IngestService.test.ts › fix-pr cycle (CREW-198)`. → **No 8b re-flip fix needed.**

### L2 — distinct-session multi-file aggregation: NOT in scope

`fix-pr` resumes the **same session id**; events append to the original JSONL and
`groupEventsByState` slices that one file by the transition log. → `resolveAllRunTranscripts`
out of scope.

## Deviation from the plan: hybrid, not a raw projection

The plan's Task 7 sketch projects the badge **purely** from
`currentStateFromTransitions(latest to_state)` and retires `deriveState` wholesale.
Code reading surfaced a regression that pure projection would introduce, so the
implementation **keeps the authoritative terminal guards** and uses the log only for
the non-terminal `initializing`/`running`/`pr_open` distinction (which is the actual
bug surface).

**Why:** the CREW-96 backfill (`migrations/0002_state_transitions.ts`) only emits
`init`/`running`/`pr_open` — it never wrote `finished`, `error`, or `pr_merged`. Those
transitions are written **only live**, by IngestService (`finished` since CREW-116,
`error`/`pr_open` since CREW-100, `pr_merged` since CREW-202). So any agent that reached
a terminal state **before** those live paths shipped has a backfilled log that ends at
`pr_open`/`running`. A raw `latest to_state` projection would regress those historical
agents (e.g. a long-finished agent would flip from Finished back to PR Open).

The hybrid `deriveState` therefore:
1. honors `finishCompletedOk` (a completed `crew finish` run) → `finished`;
2. honors a non-zero exit on the latest meaningful run → `error`;
3. honors `pr_merged` (PrPoller);
4. otherwise takes the non-terminal state from `currentStateFromTransitions()`,
   falling back to the prior tool-call heuristic only when the agent has **no**
   transitions at all (pre-0002 agents).

This fixes **both** faces (the fix-pr cycle and the false-Finished detection miss come
from the non-terminal branch) without regressing historical terminal agents. The
`has_pr_create` SQL flags — including the cruder `getByKey` variant — are removed, which
also resolves the list/detail disagreement.

## False-Finished backfill (8b): contingent, deferred

If CREW-226/227's logs already hold a `pr_open` row (expected, since the shared helper
writes it for any ingested `gh pr create`), this change fixes their display with no
re-run. If they still read non-PR-Open against the canonical stack after the daemon
picks up this change, that is a genuine upstream miss (daemon down during PR creation,
or a `gh pr create` that never landed as a Bash tool_call) and warrants a follow-up
backfill migration — tracked as a contingency, **not** shipped speculatively (no
empirical evidence of the gap from this sandbox).

## Decisions

- **Log-sourced non-terminal state + retained terminal guards** (see deviation above).
- **No speculative backfill migration.** Deferred behind post-deploy verification.
- `deriveStateFromToolCalls` is left untouched (migration backfill + IngestService use it).

## Notes

Merge note: touches `AgentsService.ts` (overlaps CREW-233) and the daemon state tests.
Merge-serialize; rebase as needed.

> **Recovery note (2026-06-05):** the original CREW-234 worktree + branch were deleted
> externally mid-run (an FS removal, not a git/test action of this dispatch). The work
> was reconstructed on a fresh worktree off `origin/main` (which by then included the
> merged plan/spec, PR #328). Commits are pushed early for durability.
