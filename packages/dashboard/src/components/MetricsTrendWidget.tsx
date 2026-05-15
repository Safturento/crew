import { useMetrics } from '../data/queries.js';
import { formatTokens } from '../format/tokens.js';
import type { AggregateMetrics } from '../data/types.js';

/**
 * Landing-page widget for the Layer-1 metrics aggregate. Surfaces the
 * current cohort against the pre-rollout baseline so a reader can see
 * whether the agent-docs system is moving the numbers.
 */
export function MetricsTrendWidget() {
  const current = useMetrics(false);
  const baseline = useMetrics(true);

  if (current.isLoading || baseline.isLoading) {
    return <WidgetShell>Loading metrics…</WidgetShell>;
  }
  if (current.isError || baseline.isError || !current.data || !baseline.data) {
    return <WidgetShell>Couldn’t load metrics.</WidgetShell>;
  }

  return <MetricsGrid current={current.data} baseline={baseline.data} />;
}

function WidgetShell({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-white/10 bg-card p-4">
      <h2 className="text-sm font-medium text-foreground">Agent docs — metrics</h2>
      <p className="mt-2 text-xs text-muted-foreground">{children}</p>
    </section>
  );
}

function MetricsGrid({
  current,
  baseline,
}: {
  current: AggregateMetrics;
  baseline: AggregateMetrics;
}) {
  return (
    <section className="rounded-md border border-white/10 bg-card p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-foreground">Agent docs — metrics</h2>
        <span className="font-mono text-xs text-muted-foreground">
          {current.runCount} runs · baseline {baseline.runCount}
        </span>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        <Stat
          label="Doc-load coverage"
          value={
            current.avgDocLoadCoverage !== null ? formatPct(current.avgDocLoadCoverage) : 'n/a'
          }
        />
        <Stat
          label="Cleanliness pass"
          value={formatRate(current.cleanlinessPassRate)}
          baseline={`baseline ${formatRate(baseline.cleanlinessPassRate)}`}
        />
        <Stat
          label="Context at PR-claim"
          value={formatTokens(current.avgPrClaimInputTokens)}
          baseline={`baseline ${formatTokens(baseline.avgPrClaimInputTokens)}`}
        />
        <Stat label="Parity violations" value={formatRate(current.parityViolationRate)} />
      </dl>
    </section>
  );
}

function Stat({ label, value, baseline }: { label: string; value: string; baseline?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-mono text-lg tabular-nums text-foreground">{value}</dd>
      {baseline && <dd className="font-mono text-xs text-muted-foreground">{baseline}</dd>}
    </div>
  );
}

/** A 0–100 coverage number → a whole-percent string. */
function formatPct(pct: number): string {
  return `${pct.toFixed(0)}%`;
}

/** A 0–1 rate → a whole-percent string. */
function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(0)}%`;
}
