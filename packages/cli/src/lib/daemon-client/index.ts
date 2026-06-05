import pc from 'picocolors';
import type { ActionRequest, ActionStatus } from 'crew-shared';

export type RunCommand = 'run' | 'fix-pr' | 'finish';

export interface RegisterRunInput {
  key: string;
  projectName: string;
  ticketTitle: string;
  worktreePath: string;
  branch: string;
  sessionId: string;
  command: RunCommand;
  startedAt: string;
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
  state: 'initializing' | 'running' | 'pr_open' | 'error' | 'finished';
  startedAt: string;
  tokens: number;
  prUrl?: string;
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

  async updateTicketTitle(
    key: string,
    ticketTitle: string,
  ): Promise<DaemonResult<{ ok: true }>> {
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

  /** Ping the daemon's runner heartbeat; flips the dashboard runner chip online. */
  async heartbeat(): Promise<DaemonResult<{ online: boolean; lastSeen: number | null }>> {
    try {
      const res = await fetch(`${this.baseUrl}/api/runner/heartbeat`, { method: 'POST' });
      if (!res.ok) {
        this.warn(`heartbeat: HTTP ${res.status}`);
        return { ok: false, reason: `http_${res.status}` };
      }
      const body = (await res.json()) as { online: boolean; lastSeen: number | null };
      return body;
    } catch (err) {
      this.warn(`heartbeat: ${(err as Error).message}`);
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
