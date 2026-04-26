import { createHash } from 'node:crypto';

export interface PortAssignment {
  http: number;
  https: number;
  postgres: number;
}

const HTTP_BASE = 8000;
const HTTPS_BASE = 8400;
const POSTGRES_BASE = 15400;
const RANGE = 99;

/**
 * Compute deterministic per-worktree docker host ports from the worktree's
 * directory basename. Matches scripts/docker-env.sh in Recipes-App:
 * md5(basename) → first 4 hex chars → offset = (hash mod 99) + 1.
 */
export function portHash(basename: string): PortAssignment {
  const hashHex = createHash('md5').update(basename).digest('hex').slice(0, 4);
  const offset = (parseInt(hashHex, 16) % RANGE) + 1;
  return {
    http: HTTP_BASE + offset,
    https: HTTPS_BASE + offset,
    postgres: POSTGRES_BASE + offset,
  };
}
