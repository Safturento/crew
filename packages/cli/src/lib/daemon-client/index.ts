import pc from 'picocolors';
import type {
  ActionRequest,
  ActionStatus,
  FinishStepInput,
  LiveProcess,
  RunFailure,
  RunnerCommand,
  RunnerSnapshot,
} from 'crew-shared';

export type RunCommand = 'run' | 'fix-pr' | 'finish';

export interface ReportLaunchingInput {
  key: string;
  projectName: string;
  command: RunCommand;
  worktreePath: string;
  branch: string;
  startedAt: string;
  ticketTitle?: string;
  appUrl?: string | null;
}

/**
 * CREW-307 — the direct-CLI birth payload. Mirrors the launching input minus
 * the run-specific fields (`command`/`startedAt`): it births only the agent row
 * + an `init` transition, not a `runs` row.
 */
export interface ReportInitializingInput {
  key: string;
  projectName: string;
  worktreePath: string;
  branch: string;
  ticketTitle?: string;
  appUrl?: string | null;
}

export interface ReportFailedStartInput {
  key: string;
  projectName: string;
  command: RunCommand;
  failure: RunFailure;
  worktreePath?: string;
  branch?: string;
  ticketTitle?: string;
  startedAt?: string;
}

export interface RegisterRunInput {
  key: string;
  projectName: string;
  ticketTitle: string;
  worktreePath: string;
  branch: string;
  sessionId: string;
  command: RunCommand;
  startedAt: string;
  /** Materialized per-worktree APP_URL (CREW-233). Omitted/null for legacy or
   *  non-docker projects; the daemon COALESCEs null against the stored value. */
  appUrl?: string | null;
}

export interface RegisterRunSuccess {
  ok: true;
  agent: {
    key: string;
    projectName: string;
    ticketTitle: string;
    worktreePath: string;
    branch: string;
  };
  run: {
    id: number;
    agentKey: string;
    command: RunCommand;
    sessionId: string;
    startedAt: string;
  };
}

export interface CompleteRunInput {
  exitCode: number;
  completedAt: string;
}

export interface AgentSummary {
  key: string;
  projectName: string;
  ticketTitle: string;
  state:
    | 'initializing'
    | 'running'
    | 'idle'
    | 'waiting'
    | 'pr_open'
    | 'pr_merged'
    | 'error'
    | 'finished';
  startedAt: string;
  tokens: number;
  prUrl?: string;
}

/** The daemon's runner status payload (`GET /api/runner/status`). */
export interface RunnerStatus {
  online: boolean;
  lastSeen: number | null;
  processes: LiveProcess[];
}

export type DaemonResult<T> = T | { ok: false; reason: string };

export interface CrewDaemonClientOptions {
  baseUrl: string;
  warn?: (message: string) => void;
}

const defaultWarn = (msg: string): void => {
  process.stderr.write(pc.yellow(`[crew-daemon] ${msg}\n`));
};

/**
 * Thin HTTP client over the daemon's run-lifecycle endpoints. Designed to
 * never throw: connection refused or non-2xx returns `{ ok: false, reason }`
 * so a downed daemon never breaks `crew run`.
 */
export class CrewDaemonClient {
  readonly baseUrl: string;
  private readonly warn: (msg: string) => void;

  constructor(opts: CrewDaemonClientOptions) {
    this.baseUrl = opts.baseUrl;
    this.warn = opts.warn ?? defaultWarn;
  }

  async registerRun(input: RegisterRunInput): Promise<DaemonResult<RegisterRunSuccess>> {
    try {
      const res = await fetch(`${this.baseUrl}/api/agents/runs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        this.warn(`registerRun: HTTP ${res.status} (run will not be tracked)`);
        return { ok: false, reason: `http_${res.status}` };
      }
      const body = (await res.json()) as Omit<RegisterRunSuccess, 'ok'>;
      return { ok: true, ...body };
    } catch (err) {
      this.warn(
        `registerRun: ${(err as Error).message} (daemon unreachable; run will not be tracked)`,
      );
      return { ok: false, reason: 'connect_error' };
    }
  }

  async completeRun(runId: number, input: CompleteRunInput): Promise<DaemonResult<{ ok: true }>> {
    try {
      const res = await fetch(`${this.baseUrl}/api/agents/runs/${runId}/complete`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        this.warn(`completeRun: HTTP ${res.status}`);
        return { ok: false, reason: `http_${res.status}` };
      }
      return { ok: true };
    } catch (err) {
      this.warn(`completeRun: ${(err as Error).message}`);
      return { ok: false, reason: 'connect_error' };
    }
  }

  async listAgents(): Promise<DaemonResult<{ agents: AgentSummary[] }>> {
    try {
      const res = await fetch(`${this.baseUrl}/api/agents`);
      if (!res.ok) {
        this.warn(`listAgents: HTTP ${res.status}`);
        return { ok: false, reason: `http_${res.status}` };
      }
      const body = (await res.json()) as { agents: AgentSummary[] };
      return { agents: body.agents };
    } catch (err) {
      this.warn(`listAgents: ${(err as Error).message}`);
      return { ok: false, reason: 'connect_error' };
    }
  }

  async updateTicketTitle(key: string, ticketTitle: string): Promise<DaemonResult<{ ok: true }>> {
    try {
      const res = await fetch(`${this.baseUrl}/api/agents/${encodeURIComponent(key)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ticketTitle }),
      });
      if (!res.ok) {
        return { ok: false, reason: `http_${res.status}` };
      }
      return { ok: true };
    } catch (err) {
      this.warn(`updateTicketTitle: ${(err as Error).message}`);
      return { ok: false, reason: 'connect_error' };
    }
  }

  /**
   * Long-poll the action queue for the next pending request. The daemon holds
   * the connection up to `timeoutMs` and returns the claimed row the moment one
   * lands, or a `null` body on timeout. Returns `{ action }` (row or null) on a
   * successful poll; `{ ok: false, reason }` keeps a downed daemon from
   * crashing the runner loop — it just re-polls.
   */
  async claimPendingAction(
    timeoutMs = 25_000,
  ): Promise<DaemonResult<{ action: ActionRequest | null }>> {
    try {
      const res = await fetch(`${this.baseUrl}/api/actions/pending?timeoutMs=${timeoutMs}`, {
        method: 'GET',
      });
      if (!res.ok) {
        this.warn(`claimPendingAction: HTTP ${res.status}`);
        return { ok: false, reason: `http_${res.status}` };
      }
      const action = (await res.json()) as ActionRequest | null;
      return { action };
    } catch (err) {
      this.warn(`claimPendingAction: ${(err as Error).message}`);
      return { ok: false, reason: 'connect_error' };
    }
  }

  /** Report the host-side launch outcome of a claimed action (204 on success). */
  async reportActionResult(
    id: number,
    status: Extract<ActionStatus, 'launching' | 'launched' | 'failed'>,
    error?: string,
  ): Promise<DaemonResult<{ ok: true }>> {
    try {
      const res = await fetch(`${this.baseUrl}/api/actions/${id}/result`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(error === undefined ? { status } : { status, error }),
      });
      if (!res.ok) {
        this.warn(`reportActionResult: HTTP ${res.status}`);
        return { ok: false, reason: `http_${res.status}` };
      }
      return { ok: true };
    } catch (err) {
      this.warn(`reportActionResult: ${(err as Error).message}`);
      return { ok: false, reason: 'connect_error' };
    }
  }

  /**
   * Report one `crew finish` step result to the daemon (201 → the stored
   * step). Best-effort like the other methods: a downed daemon returns
   * `{ ok: false, reason }` rather than throwing, so finish's local cleanup
   * is never broken by a missing daemon. The agent `key` is the route param;
   * `input` is the `finishStepSchema` body (index/label/status/detail?/ts).
   */
  async reportFinishStep(key: string, input: FinishStepInput): Promise<DaemonResult<{ ok: true }>> {
    try {
      const res = await fetch(`${this.baseUrl}/api/agents/${encodeURIComponent(key)}/finish-step`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        this.warn(`reportFinishStep: HTTP ${res.status}`);
        return { ok: false, reason: `http_${res.status}` };
      }
      return { ok: true };
    } catch (err) {
      this.warn(`reportFinishStep: ${(err as Error).message}`);
      return { ok: false, reason: 'connect_error' };
    }
  }

  /**
   * CREW-307 — birth the agent row on the direct-CLI path, immediately after
   * config resolves and before the preflight gate, so a `crew run` is visible
   * in the dashboard from the earliest attributable moment. Idempotent on the
   * daemon side (safe when a `queued` row already exists). Best-effort: a downed
   * daemon just means the run won't be tracked, exactly like `reportLaunching`.
   */
  async reportInitializing(input: ReportInitializingInput): Promise<DaemonResult<{ ok: true }>> {
    try {
      const res = await fetch(`${this.baseUrl}/api/runner/initializing`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        this.warn(`reportInitializing: HTTP ${res.status} (run will not be tracked)`);
        return { ok: false, reason: `http_${res.status}` };
      }
      return { ok: true };
    } catch (err) {
      this.warn(
        `reportInitializing: ${(err as Error).message} (daemon unreachable; run will not be tracked)`,
      );
      return { ok: false, reason: 'connect_error' };
    }
  }

  /**
   * Pre-register a run as `launching` *before* preflight (CREW-244), so an
   * init failure leaves a row to convert into a structured failed-start.
   * Returns the new run id on success. Never throws — a downed daemon just
   * means the run won't be tracked, exactly like `registerRun`.
   */
  async reportLaunching(
    input: ReportLaunchingInput,
  ): Promise<DaemonResult<{ ok: true; runId: number }>> {
    try {
      const res = await fetch(`${this.baseUrl}/api/runner/launching`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        this.warn(`reportLaunching: HTTP ${res.status} (run will not be tracked)`);
        return { ok: false, reason: `http_${res.status}` };
      }
      const body = (await res.json()) as { runId: number };
      return { ok: true, runId: body.runId };
    } catch (err) {
      this.warn(
        `reportLaunching: ${(err as Error).message} (daemon unreachable; run will not be tracked)`,
      );
      return { ok: false, reason: 'connect_error' };
    }
  }

  /**
   * Record a structured failed-start (CREW-244) — the run died during
   * init/preflight. Converts the launching placeholder for the key when one
   * exists; otherwise inserts a fresh failed-start row. Best-effort.
   */
  async reportFailedStart(
    input: ReportFailedStartInput,
  ): Promise<DaemonResult<{ ok: true; runId: number }>> {
    try {
      const res = await fetch(`${this.baseUrl}/api/runner/failed-start`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        this.warn(`reportFailedStart: HTTP ${res.status}`);
        return { ok: false, reason: `http_${res.status}` };
      }
      const body = (await res.json()) as { runId: number };
      return { ok: true, runId: body.runId };
    } catch (err) {
      this.warn(`reportFailedStart: ${(err as Error).message}`);
      return { ok: false, reason: 'connect_error' };
    }
  }

  /** Acknowledge (dismiss) a key's failed-start rows. Best-effort. */
  async acknowledgeRun(key: string): Promise<DaemonResult<{ ok: true; acknowledged: number }>> {
    try {
      const res = await fetch(`${this.baseUrl}/api/runs/${encodeURIComponent(key)}/acknowledge`, {
        method: 'POST',
      });
      if (!res.ok) {
        this.warn(`acknowledgeRun: HTTP ${res.status}`);
        return { ok: false, reason: `http_${res.status}` };
      }
      const body = (await res.json()) as { acknowledged: number };
      return { ok: true, acknowledged: body.acknowledged };
    } catch (err) {
      this.warn(`acknowledgeRun: ${(err as Error).message}`);
      return { ok: false, reason: 'connect_error' };
    }
  }

  /**
   * Ping the daemon's runner heartbeat; flips the dashboard runner chip online.
   * When a `snapshot` is supplied (CREW-243), it rides along in a `{ snapshot }`
   * body — the daemon mirrors the live-process list and emits
   * `runner.snapshot_changed`. A bodyless ping is the legacy online-edge-only
   * heartbeat.
   */
  async heartbeat(snapshot?: RunnerSnapshot): Promise<DaemonResult<RunnerStatus>> {
    try {
      const init: RequestInit =
        snapshot === undefined
          ? { method: 'POST' }
          : {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ snapshot }),
            };
      const res = await fetch(`${this.baseUrl}/api/runner/heartbeat`, init);
      if (!res.ok) {
        this.warn(`heartbeat: HTTP ${res.status}`);
        return { ok: false, reason: `http_${res.status}` };
      }
      return (await res.json()) as RunnerStatus;
    } catch (err) {
      this.warn(`heartbeat: ${(err as Error).message}`);
      return { ok: false, reason: 'connect_error' };
    }
  }

  /**
   * Read-only runner status snapshot (`GET /api/runner/status`) — supervisor
   * online/offline + the live-process list. Unlike {@link heartbeat} this does
   * not record liveness, so `crew runner status` can render the registry
   * without falsely flipping the runner online.
   */
  async getRunnerStatus(): Promise<DaemonResult<RunnerStatus>> {
    try {
      const res = await fetch(`${this.baseUrl}/api/runner/status`, { method: 'GET' });
      if (!res.ok) {
        this.warn(`getRunnerStatus: HTTP ${res.status}`);
        return { ok: false, reason: `http_${res.status}` };
      }
      return (await res.json()) as RunnerStatus;
    } catch (err) {
      this.warn(`getRunnerStatus: ${(err as Error).message}`);
      return { ok: false, reason: 'connect_error' };
    }
  }

  /**
   * Claim the oldest pending reverse-queue command (CREW-243). Mirrors
   * {@link claimPendingAction}: returns `{ command }` (the claimed row or
   * `null` when the queue is empty) on success, or `{ ok: false, reason }` so
   * a downed daemon never crashes the drain loop — it just retries next cycle.
   */
  async claimPendingCommand(): Promise<DaemonResult<{ command: RunnerCommand | null }>> {
    try {
      const res = await fetch(`${this.baseUrl}/api/runner/commands/pending`, { method: 'GET' });
      if (!res.ok) {
        this.warn(`claimPendingCommand: HTTP ${res.status}`);
        return { ok: false, reason: `http_${res.status}` };
      }
      const command = (await res.json()) as RunnerCommand | null;
      return { command };
    } catch (err) {
      this.warn(`claimPendingCommand: ${(err as Error).message}`);
      return { ok: false, reason: 'connect_error' };
    }
  }

  /** Report the apply outcome of a claimed command (204 on success). Best-effort. */
  async reportCommandResult(
    id: number,
    status: 'applied' | 'failed',
    error?: string,
  ): Promise<DaemonResult<{ ok: true }>> {
    try {
      const res = await fetch(`${this.baseUrl}/api/runner/commands/${id}/result`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(error === undefined ? { status } : { status, error }),
      });
      if (!res.ok) {
        this.warn(`reportCommandResult: HTTP ${res.status}`);
        return { ok: false, reason: `http_${res.status}` };
      }
      return { ok: true };
    } catch (err) {
      this.warn(`reportCommandResult: ${(err as Error).message}`);
      return { ok: false, reason: 'connect_error' };
    }
  }
}

export function crewDaemonClientFromEnv(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
): CrewDaemonClient {
  const port = env.CREW_PORT ?? '7773';
  return new CrewDaemonClient({ baseUrl: `http://localhost:${port}` });
}
