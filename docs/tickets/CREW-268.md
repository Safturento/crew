# CREW-268 — Shared PrTransitionService + poller backstop demotion

Jira: https://safturento.atlassian.net/browse/CREW-268
Epic: [CREW-267](https://safturento.atlassian.net/browse/CREW-267) · Plan tasks 1–2 in `docs/superpowers/plans/2026-06-19-github-webhook-pr-merge.md`

## Goal

Extract the `pr_open → pr_merged` transition (previously inlined in `PrPoller.checkOneInternal`) into a shared, idempotent `PrTransitionService`, route `PrPoller` through it, and demote the poller to a 30-minute correctness backstop. This is the foundation the webhook fast path (child C) will share so webhook, poller, and the drawer's manual refresh all collapse to one transition.

## Relevant files

- `packages/daemon/src/services/PrTransitionService.ts` — new shared service: `normalizePrUrl`, `markMerged`, `resolveOpenPrAgentByUrl`.
- `packages/daemon/src/services/PrPoller.ts` — now delegates the transition to the service; default interval 5 min → 30 min; `eventBus` dep dropped (the service owns publishing).
- `packages/daemon/src/container.ts` — registers `prTransitionService` (singleton); injects it into `prPoller`.

## Decisions

- **`markMerged(agentKey, { source })`** — the plan's signature was `markMerged(agentKey)`, but the existing PrPoller test asserts the transition's `source` column is `'poller'` (CREW-259 provenance, migration 0012 nullable). Added an optional `source` param so the poller passes `'poller'` and the future webhook (child C) will pass `'webhook'`. Omitted ⇒ null source. Keeps poller behavior unchanged.
- **Dropped `eventBus` from `PrPoller`** — once the insert+publish moves into `markMerged`, the poller no longer publishes anything. Removed the now-dead dependency rather than carrying it unused; the `PrTransitionService` holds the bus. Container injects `prTransitionService` only.
- **`prTransitionService` is a singleton** — parity with `prPoller` and the merge-path services it serves; it holds no state.
- **Idempotency = the `latest === 'pr_open'` precondition** — no dedup ledger. `markMerged` re-reads the precondition authoritatively; the poller keeps its own precondition read only to gate the `gh pr view` shell-out.
- **`pr_merged` stays terminal and outside `reduceState`/`STATE_EVENT_KINDS`** — this is the dedicated daemon-side path, per the Epic's reconciliation note. No merge event kind added.
- **No migration** — reuses `state_transitions` + `agents.pr_url`.

## Open questions

- (none — Tasks 1–2 are self-contained; webhook/route/config/`.agents` parity are later Epic children C/D.)

## Ruled out

- Following the plan's `markMerged(agentKey)` signature verbatim — would have silently dropped the `source='poller'` provenance the poller test pins. See Decisions.

## Notes

- `.agents/` doc parity: only `architecture.md` (`covers: packages/*/src/**/*.ts`) is in scope. Its `source='poller'` description ("`PrPoller`'s `pr_merged` flip") stays accurate — the poller still produces that flip, now via the shared service. The 5-min cadence is not documented anywhere, and the doc keeps no exhaustive service list, so no edit was needed. Full `.agents/` webhook documentation is Plan Task 13 (child C), not this ticket.
- Backend-only change: no HTTP route, no UI, no schema change. Bruno smoke + full test sweep green; no `.bru` updates required.
- Two daemon tests in the full suite (migration 0012, AgentsService, TimelineService) intermittently time out at ~5s under concurrent-run load; they pass cleanly in isolation and in the one-shot `npm run test:run` sweep (exit 0). Not introduced by this change.
