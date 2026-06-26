/**
 * `process.kill(pid, 0)` liveness probe. Signal 0 performs the permission +
 * existence checks without delivering a signal: it throws `ESRCH` when no such
 * process exists (dead) and `EPERM` when the process exists but we may not
 * signal it (alive, owned by another user) — so EPERM counts as alive.
 *
 * Lives in the runner lib (not `commands/`) so the worker can inject it as the
 * heartbeat reap boundary without a command→lib cross-import; `commands/runner.ts`
 * imports it from here too.
 */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}
