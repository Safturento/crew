import { createHash } from 'node:crypto';

/** Lower bound of the dynamic / private port range (RFC 6335). */
const RANGE_LOW = 16384;
const RANGE_SIZE = 32767 - RANGE_LOW + 1;

/**
 * Compute a deterministic port number for the (basename, varName) pair.
 * Used by the env.toml materialization pipeline when crew is generating a
 * spawned worktree's ports — the canonical worktree uses each entry's
 * `default` instead.
 *
 * The mapping is intentionally simple (md5 → mod RANGE_SIZE) — collisions
 * within one project are rare because varNames within one env.toml are
 * distinct and the basename is the worktree identifier. Cross-project
 * collisions are tolerable because each project runs in its own
 * COMPOSE_PROJECT_NAME and Docker network.
 */
export function allocatePort(basename: string, varName: string): number {
  const hashHex = createHash('md5').update(`${basename}::${varName}`).digest('hex').slice(0, 8);
  const offset = parseInt(hashHex, 16) % RANGE_SIZE;
  return RANGE_LOW + offset;
}
