import pc from 'picocolors';

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
}

export function crewDaemonClientFromEnv(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
): CrewDaemonClient {
  const port = env.CREW_PORT ?? '7773';
  return new CrewDaemonClient({ baseUrl: `http://localhost:${port}` });
}
