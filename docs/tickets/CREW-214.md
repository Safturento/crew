# CREW-214 — T2: Daemon action queue (action_requests + routes + SSE)

Jira: https://safturento.atlassian.net/browse/CREW-214

Part of Epic **CREW-208** (dashboard-triggered agent actions). Implements **Task T2** of
`docs/superpowers/plans/2026-06-03-dashboard-agent-actions.md`. Builds on T1's shared
contracts (`crew-shared` `actions/`, merged in CREW-213).

## Goal

A daemon-owned action queue: the dashboard enqueues a `run`/`fix_pr`/`finish` request, the
host runner long-polls and atomically claims it, then reports the launch outcome — with an
`action.changed` SSE event on every transition and Bruno coverage of all three routes.

## Relevant files

- `packages/daemon/src/migrations/0006_action_requests.ts` — the `action_requests` table
  (kind/status CHECK constraints mirror the `crew-shared` tuples; index on `status`).
- `packages/daemon/src/db.ts` — `ActionRequestsTable` added to `DaemonDatabase`.
- `packages/daemon/src/services/ActionService.ts` — `enqueue` / `claimNextPending` (atomic) /
  `report`; publishes `action.changed` on each transition.
- `packages/daemon/src/services/EventBus.ts` — `action.changed` SSE variant; `SseEvent` is now
  a discriminated union so `type` narrows `data`.
- `packages/daemon/src/routes/actions.ts` — `POST /api/actions`, `GET /api/actions/pending`
  (long-poll), `POST /api/actions/:id/result`. Wired in `container.ts` + `app.ts`.
- `bruno/endpoints/actions/{post-enqueue,get-pending,post-result}.bru` + `package.json` smoke list.

## Decisions

- **`SseEvent` → discriminated union (`{ id } & SsePayload`).** The old `{ type; data }` shape
  had independent unions, so a `type` check didn't narrow `data` — `event.data.status` wouldn't
  typecheck. The prior `.data.key` accesses only compiled by accident (cache.miss's
  `Record<string,never>` index signature). The union fixes narrowing for this and future SSE
  variants (T3's `runner.status_changed` / `finish_step.changed`). Only collateral: `events.test.ts`
  `parseFrame` casts (wire frames carry no static type↔data correlation).
- **`GET /api/actions/pending` returns 200 with a nullable body, not 204 on timeout.** Keeps the
  runner client a single `ActionRequest | null` shape with no status-code branching, and avoids
  fighting the zod response-schema typing for an empty 204.
- **Atomic claim via transaction + `WHERE status='pending'` re-assertion on the UPDATE.** The
  losing racer's update matches zero rows → `null`, so no row is ever double-claimed.
- **Enqueue validates the target project is registered** (`ProjectsService.getBySlug` → 404 on
  miss). The daemon won't queue work against a project it can't resolve a repo path for.

## Notes

Backend-only ticket — no dashboard/DOM changes (the `action.changed` consumer is T5), so
visual-fidelity-check and Playwright e2e don't apply. Verified via daemon unit tests + Bruno smoke.
