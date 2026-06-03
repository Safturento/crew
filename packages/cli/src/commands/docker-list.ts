import { Command } from 'commander';
import Table from 'cli-table3';
import pc from 'picocolors';
import {
  collectDockerStacks,
  discoverProjectConfig,
  type DockerStackRow,
  type StackServiceNames,
} from '../lib/index.js';

export interface DockerListDeps {
  services: StackServiceNames;
  collect: (services: StackServiceNames) => Promise<DockerStackRow[]>;
  log: (msg: string) => void;
}

export interface DockerListResult {
  ok: boolean;
  reason?: string;
}

/**
 * Render the running compose stacks as a table consistent with `crew list` /
 * `crew status` (cli-table3 + picocolors). Returns the rendered string so it's
 * trivial to test; missing port bindings show as a dim em-dash.
 */
export function formatDockerListTable(rows: DockerStackRow[]): string {
  const table = new Table({
    head: ['PROJECT', 'HTTP', 'HTTPS', 'POSTGRES', 'URL'],
    style: { head: ['dim'], border: ['dim'] },
  });

  const dash = pc.dim('—');
  for (const r of rows) {
    table.push([r.project, r.http ?? dash, r.https ?? dash, r.postgres ?? dash, r.url ?? dash]);
  }

  return table.toString();
}

/**
 * Collect running docker compose stacks and render them. Read-only by design.
 * Empty stack list prints a friendly message and still succeeds; a missing
 * `docker` binary fails clearly so the caller can exit non-zero.
 */
export async function runDockerList(deps: DockerListDeps): Promise<DockerListResult> {
  const { services, collect, log } = deps;

  try {
    const rows = await collect(services);
    if (rows.length === 0) {
      log('No running docker compose stacks.');
      return { ok: true };
    }
    log(formatDockerListTable(rows));
    return { ok: true };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return {
        ok: false,
        reason: 'docker not found on PATH — is Docker installed and on your PATH?',
      };
    }
    return { ok: false, reason: (err as Error).message };
  }
}

export const dockerListCommand = new Command('docker-list')
  .description('list running docker compose stacks with their host port bindings')
  .action(async () => {
    const config = await discoverProjectConfig(process.cwd());

    // A project config is optional here — docker-list inspects every running
    // stack regardless of project. When present, it supplies service-name
    // overrides; otherwise we fall back to the canonical caddy / postgres.
    const services: StackServiceNames = {
      caddy: config?.docker?.caddy_service ?? 'caddy',
      postgres: config?.docker?.postgres_service ?? 'postgres',
    };

    const result = await runDockerList({
      services,
      collect: collectDockerStacks,
      log: (msg) => console.log(msg),
    });

    if (!result.ok) {
      console.error(pc.red('✗'), result.reason ?? 'docker-list failed');
      process.exit(1);
    }
  });
