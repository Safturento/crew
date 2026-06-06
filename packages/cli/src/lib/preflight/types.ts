/**
 * Thrown by the dispatch gate when a `lib/health` project check fails. The
 * `run-preflight` adapter builds it from the first failing `CheckResult`; the
 * calling command (run / resume / fix-pr) renders the structured remediation
 * output via `render-error.ts` before exiting.
 */
export class PreflightError extends Error {
  constructor(
    public readonly checkName: string,
    public readonly headline: string,
    public readonly remediation: string,
    public readonly details: Record<string, string> = {},
  ) {
    super(`preflight ${checkName}: ${headline}`);
    this.name = 'PreflightError';
  }
}
