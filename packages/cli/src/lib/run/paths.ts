// CREW-307: `worktreePathFor` moved to `crew-shared` so the daemon can derive
// the same path when it births the queued agent row at enqueue. Re-exported
// here so existing CLI callers keep importing it from this module unchanged.
export { worktreePathFor } from 'crew-shared';

export function runLogPathFor(key: string): string {
  return `/tmp/crew-run-${key}.log`;
}

export function dockerLogPathFor(key: string): string {
  return `/tmp/crew-docker-${key}.log`;
}

export function playwrightLogPathFor(key: string): string {
  return `/tmp/crew-playwright-${key}.log`;
}

export function npmInstallLogPathFor(key: string): string {
  return `/tmp/crew-npm-install-${key}.log`;
}

export function verifyGateLogPathFor(key: string): string {
  return `/tmp/crew-verify-gate-${key}.log`;
}

export function mcpLogPathFor(key: string): string {
  return `/tmp/crew-mcp-${key}.log`;
}
