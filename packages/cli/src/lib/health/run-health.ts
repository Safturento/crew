import { fail, type CheckResult, type HealthCheck, type HealthContext } from './types.js';

export interface CheckOutcome {
  check: HealthCheck;
  result: CheckResult;
}

/**
 * Run every check and collect a result for each — no fail-fast. A check whose
 * `detect()` throws is recorded as a `fail` result rather than propagating the
 * exception, so one broken check never hides the rest. The dispatch gate layers
 * fail-fast semantics on top of this collect-all base (see CREW-226 / Plan P2).
 */
export async function runHealth(
  checks: HealthCheck[],
  ctx: HealthContext,
): Promise<CheckOutcome[]> {
  const out: CheckOutcome[] = [];
  for (const check of checks) {
    let result: CheckResult;
    try {
      result = await check.detect(ctx);
    } catch (err) {
      result = fail(`${check.name} errored: ${(err as Error).message}`);
    }
    out.push({ check, result });
  }
  return out;
}
