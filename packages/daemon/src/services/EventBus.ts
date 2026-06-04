import { randomUUID } from 'node:crypto';
import type { ActionKind, ActionStatus } from 'crew-shared';

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
  // CREW-214: a queued action changed status. `key` is the ticket key the
  // request targets (the agent-to-be); the dashboard uses it to toast the
  // originating QuickAction. Emitted on every lifecycle transition.
  | {
      type: 'action.changed';
      data: { id: number; kind: ActionKind; key: string; status: ActionStatus };
    }
  | { type: 'cache.miss'; data: Record<string, never> };

/**
 * A published event: an `SsePayload` stamped with a buffer id. Kept as a
 * discriminated union (rather than `{ type; data }` with independent unions)
 * so a `type` check narrows `data` to the matching variant at call sites —
 * `if (e.type === 'action.changed') e.data.status` is then type-safe.
 */
export type SseEvent = { id: string } & SsePayload;

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
    // Spread (not `{ type, data }`) so the union stays discriminated.
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
