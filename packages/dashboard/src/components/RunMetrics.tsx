import { formatTokens } from '../format/tokens.js';
import type { AgentDetailRun } from '../data/types.js';

interface RunMetricsProps {
  runs: AgentDetailRun[];
}

function isMeasured(run: AgentDetailRun): boolean {
  return (
    run.doc_load_coverage_pct !== null ||
    run.cleanliness_pass !== null ||
    run.pr_claim_input_tokens !== null ||
    run.parity_violations !== null
  );
}

/**
 * The agent-detail "Metrics" panel — the Layer-1 metrics for this agent's
 * most recently measured run. Captured on run completion, so an in-flight
 * run shows a not-yet-measured state until it finishes.
 */
export function RunMetrics({ runs }: RunMetricsProps) {
  // Prefer the latest measured run; fall back to the latest run overall so an
  // in-flight agent still gets the panel (with the not-yet-measured note).
  const measured = [...runs].reverse().find(isMeasured);
  const run = measured ?? runs.at(-1);
  if (!run) return null;

  return (
    <div className="shrink-0 border-b border-white/10 bg-card px-6 py-3">
      <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Run metrics
      </h2>
      {isMeasured(run) ? (
        <dl className="mt-2 flex flex-wrap gap-x-8 gap-y-2">
          <Metric
            label="Doc-load coverage"
            value={run.doc_load_coverage_pct !== null ? `${run.doc_load_coverage_pct}%` : '—'}
          />
          <Metric label="Cleanliness" value={cleanlinessLabel(run.cleanliness_pass)} />
          <Metric
            label="Context at PR-claim"
            value={
              run.pr_claim_input_tokens !== null ? formatTokens(run.pr_claim_input_tokens) : '—'
            }
          />
          <Metric
            label="Parity violations"
            value={run.parity_violations !== null ? String(run.parity_violations) : '—'}
          />
        </dl>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">
          Not yet measured — metrics are captured when the run completes.
        </p>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-mono text-sm tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

function cleanlinessLabel(pass: number | null): string {
  if (pass === null) return '—';
  return pass === 1 ? 'pass' : 'fail';
}
