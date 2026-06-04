import type { EventBus } from './EventBus.js';

export interface RunnerStatus {
  online: boolean;
  /** Epoch-ms of the last heartbeat, or null before the first one. */
  lastSeen: number | null;
}

export interface RunnerStatusServiceDeps {
  eventBus: EventBus;
  /** A heartbeat older than this many ms counts as offline. Default 15s. */
  staleMs?: number;
  /** Injectable clock so edge/staleness tests are deterministic. */
  now?: () => number;
}

/** Default staleness window — the host runner heartbeats every ~5s (T4). */
const DEFAULT_STALE_MS = 15_000;

/**
 * CREW-215 — tracks whether the host-side runner process is alive.
 *
 * The runner POSTs `/api/runner/heartbeat` on an interval. This service
 * records the last heartbeat and emits `runner.status_changed` on the
 * *edges* of online/offline — not on every heartbeat:
 *
 * - **Rising edge:** `heartbeat()` while currently offline emits `{online:true}`.
 *   Subsequent heartbeats just refresh `lastSeen`; no duplicate edge fires.
 * - **Falling edge:** there is no event when a runner simply stops, so a
 *   periodic `checkStale()` (driven by a timer the app owns, mirroring
 *   `PrPoller`) emits `{online:false}` once `now - lastSeen >= staleMs`.
 *
 * `online` here is the *last emitted edge state*; `isOnline()` is the live
 * staleness truth. They can briefly diverge between a heartbeat going stale
 * and the next `checkStale()` tick — `status()`/`isOnline()` report the
 * accurate value, while the SSE edge event lags by at most one tick.
 */
export class RunnerStatusService {
  private readonly eventBus: EventBus;
  private readonly staleMs: number;
  private readonly now: () => number;
  private lastSeen: number | null = null;
  /** The last edge we published — guards against duplicate edge events. */
  private emittedOnline = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(deps: RunnerStatusServiceDeps) {
    this.eventBus = deps.eventBus;
    this.staleMs = deps.staleMs ?? DEFAULT_STALE_MS;
    this.now = deps.now ?? Date.now;
  }

  /** Record a heartbeat; emit the rising edge if we were offline. */
  heartbeat(): void {
    this.lastSeen = this.now();
    if (!this.emittedOnline) {
      this.emittedOnline = true;
      this.publish();
    }
  }

  /** Live truth: a heartbeat exists and is within the staleness window. */
  isOnline(): boolean {
    return this.lastSeen !== null && this.now() - this.lastSeen < this.staleMs;
  }

  status(): RunnerStatus {
    return { online: this.isOnline(), lastSeen: this.lastSeen };
  }

  /**
   * Emit the falling edge if we were online but have since gone stale.
   * Idempotent — calling it while already offline is a no-op. Also the
   * body the interval started by `start()` runs.
   */
  checkStale(): void {
    if (this.emittedOnline && !this.isOnline()) {
      this.emittedOnline = false;
      this.publish();
    }
  }

  /** Begin the periodic falling-edge check. App lifecycle owns start/stop. */
  start(intervalMs = 5_000): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.checkStale(), intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private publish(): void {
    this.eventBus.publish({
      type: 'runner.status_changed',
      data: { online: this.emittedOnline, lastSeen: this.lastSeen },
    });
  }
}
