import { randomUUID } from 'node:crypto';
import type { ActionKind, ActionStatus, LiveProcess, RunnerCommandStatus } from 'crew-shared';

/**
 * The hybrid event vocabulary the daemon emits over SSE:
 *
 * - Typed deltas (`agent.state_changed`, `run.completed`) carry the new
 *   state inline so low-frequency changes don't force a refetch.
 * - Invalidation pings (`tool_calls.changed`) carry only the agent key;
 *   the dashboard refetches the timeline. High-frequency tool-call bursts
 *   stay cheap because the payload is one identifier, not the row.
 * - `cache.miss` is a synthetic event the bus emits when a subscriber's
 *   `lastEventId` has fallen out of the ring buffer. The client treats it
 *   as "drop your local cache and reload from the API."
 */
export type SsePayload =
  | {
      type: 'agent.state_changed';
      data: { key: string; from: string | null; to: string; ts: number };
    }
  | { type: 'tool_calls.changed'; data: { key: string } }
  | { type: 'startup_events.changed'; data: { key: string } }
  | { type: 'run.completed'; data: { key: string; ts: number } }
  // CREW-215: runner heartbeat edge — `online` flips on the rising/falling
  // staleness edge; `lastSeen` is the last heartbeat epoch-ms (null before
  // the first heartbeat). Carries state inline so the dashboard's runner
  // health chip updates without a refetch.
  | { type: 'runner.status_changed'; data: { online: boolean; lastSeen: number | null } }
  // CREW-235: the live-process snapshot the host runner pushes on each
  // heartbeat that carries one. Distinct from the edge-only
  // `runner.status_changed` (online/offline) so the health chip's edge
  // stream stays untouched while the Runner page gets a per-heartbeat
  // snapshot feed for the live-process list.
  | { type: 'runner.snapshot_changed'; data: { processes: LiveProcess[] } }
  // CREW-215: invalidation ping for a `crew finish` step — the dashboard
  // refetches `GET /api/agents/:key/finish-steps` for the named agent.
  | { type: 'finish_step.changed'; data: { key: string } }
  // CREW-214: a queued action changed status. `key` is the ticket key the
  // request targets (the agent-to-be); the dashboard uses it to toast the
  // originating QuickAction. Emitted on every lifecycle transition.
  | {
      type: 'action.changed';
      data: { id: number; kind: ActionKind; key: string; status: ActionStatus };
    }
  // CREW-241: a queued runner command changed status. The dashboard uses it
  // to reflect a control action's progress (cancel/dequeue/...) without
  // polling. Emitted on every lifecycle transition.
  | { type: 'runner.command_changed'; data: { id: number; status: RunnerCommandStatus } }
  | { type: 'cache.miss'; data: Record<string, never> };

/**
 * A published event: an `SsePayload` member stamped with an `id`. Defined
 * as `SsePayload & { id }` (not a flat `{ id; type; data }` interface) so
 * `type` and `data` stay correlated — narrowing on `event.type` narrows
 * `event.data` to that variant's shape, which a decorrelated interface
 * could not (a variant without a `key` would otherwise widen every
 * `event.data.key` access to an error).
 */
export type SseEvent = SsePayload & { id: string };

export interface SubscribeOpts {
  /**
   * Opaque event id the client last saw. When provided, the bus delivers
   * every buffered event strictly *after* that id before adding the
   * subscriber to the live fanout. If the id has been evicted from (or
   * was never in) the ring, a single synthetic `cache.miss` event is
   * emitted instead.
   */
  lastEventId?: string;
  onEvent: (event: SseEvent) => void;
}

export type Unsubscribe = () => void;

export interface EventBusOpts {
  /** Max events retained for `lastEventId` replay. Default: 1000. */
  bufferSize?: number;
}

/**
 * In-process pub/sub with a ring-buffer for last-event-id replay.
 *
 * Single Awilix-registered singleton; subscribe-side ordering matters:
 * any replay (or synthetic `cache.miss`) is delivered to the new
 * subscriber's callback *before* it joins the live fanout, so a
 * client never sees a buffered event after a live one.
 */
export class EventBus {
  private buffer: SseEvent[] = [];
  private readonly subs = new Set<(event: SseEvent) => void>();
  private readonly bufferSize: number;

  constructor(opts: EventBusOpts = {}) {
    this.bufferSize = opts.bufferSize ?? 1000;
  }

  publish(payload: SsePayload): SseEvent {
    // Spread the payload (rather than copying `type`/`data` field-by-field)
    // so the correlated union is preserved — a manual copy decorrelates them.
    const event: SseEvent = { id: randomUUID(), ...payload };
    this.buffer.push(event);
    if (this.buffer.length > this.bufferSize) this.buffer.shift();
    for (const fn of this.subs) fn(event);
    return event;
  }

  subscribe({ lastEventId, onEvent }: SubscribeOpts): Unsubscribe {
    if (lastEventId !== undefined) {
      const idx = this.buffer.findIndex((e) => e.id === lastEventId);
      if (idx === -1) {
        onEvent({ id: randomUUID(), type: 'cache.miss', data: {} });
      } else {
        for (const e of this.buffer.slice(idx + 1)) onEvent(e);
      }
    }
    this.subs.add(onEvent);
    return () => {
      this.subs.delete(onEvent);
    };
  }
}
