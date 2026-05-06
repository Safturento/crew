# CREW-97 — EventBus pub/sub + GET /api/events SSE firehose

Jira: https://safturento.atlassian.net/browse/CREW-97

Plan: [docs/superpowers/plans/2026-05-05-slice-1c-agent-drawer-and-push-updates.md](../superpowers/plans/2026-05-05-slice-1c-agent-drawer-and-push-updates.md)
— this ticket lands plan tasks 5 and 6.

## Goal

Daemon-side push channel. In-process `EventBus` singleton with a
~1000-event ring buffer for last-event-id replay, exposed at
`GET /api/events` as standard SSE (no `fastify-sse` plugin — write
through `reply.raw`).

## Relevant files

- `packages/daemon/src/services/EventBus.ts` — pub/sub + ring buffer.
- `packages/daemon/src/services/EventBus.test.ts` — unit coverage.
- `packages/daemon/src/container.ts` — registers `EventBus` as an
  Awilix singleton. Must be a singleton: every SSE connection
  resolves the same instance, every publisher writes into the same
  ring.
- `packages/daemon/src/routes/events.ts` — SSE handler; `reply.hijack()`
  before writing the preamble so Fastify doesn't double-respond.
- `packages/daemon/src/routes/events.test.ts` — boots a real Fastify
  listener (`app.listen({ port: 0 })`) and reads the stream off
  `fetch().body` because `app.inject` doesn't surface streaming
  bodies.
- `bruno/endpoints/events/get-stream.bru` — endpoint reference card,
  not in `flows/main-smoke.bru` (Bruno's SSE handling holds the
  connection open).

## Decisions

- **`reply.hijack()` is required.** Without it Fastify still tries to
  send a framework-level response after the handler returns and breaks
  the stream. `reply.raw.flushHeaders?.()` so the client's `fetch`
  resolves with status + headers before the first frame lands.
- **Query param wins over header.** Browser `EventSource` cannot set
  headers, so the dashboard reconnects via `?last_event_id=`. Header
  is still accepted for native EventSource reconnects and CLI smokes;
  if both arrive, the explicit reconnect URL is the stronger signal.
- **`X-Accel-Buffering: no`** is sent so any nginx (or similar) sitting
  between dashboard and daemon doesn't buffer frames. Costs nothing
  when there's no proxy.
- **`cache.miss` is delivered before joining the live fanout.** The
  subscriber's callback runs synchronously inside `subscribe()` for
  the replay/miss path, then is added to the live set. That ordering
  guarantees clients never see a buffered (or `cache.miss`) event
  _after_ a live one.

## Out of scope (will land in later slice-1c tickets)

- No publishers wired in yet — IngestService doesn't call
  `eventBus.publish` for this ticket. That's plan task 8/9 territory.
- No CrewEventStream client wrapper or React hooks — plan tasks
  10–12.
- No state-history / timeline endpoints — separate tickets.

## Notes

- The 1000-event default is plenty for the dashboard's reconnect
  window. A noisy ingest run produces ~50 events/min, so the ring
  covers ~20 minutes of disconnect; the dashboard pings on visibility
  change anyway.
- Tests use real fetch against a real listener rather than `app.inject`
  — `inject` waits for the response to end before returning, which
  doesn't happen for SSE.
