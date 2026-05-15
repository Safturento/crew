import type { Kysely } from 'kysely';
import type { DaemonDatabase } from '../db.js';

/**
 * The four per-run metrics captured on run completion. `cleanlinessPass` is a
 * strict 0/1 flag; the other three are nullable — a metric the run gives no
 * signal for is recorded as `null` rather than a misleading 0.
 */
export interface MetricInputs {
  docLoadCoveragePct: number | null;
  cleanlinessPass: 0 | 1;
  prClaimInputTokens: number | null;
  parityViolations: number | null;
}

/**
 * Cohort-level rollup over the `runs` table. `avgDocLoadCoverage` is null when
 * no run in the cohort recorded a coverage value; the rate fields are 0 over
 * an empty cohort. Averages skip null contributors so a metric missing from
 * some runs does not skew the cohort.
 */
export interface AggregateMetrics {
  runCount: number;
  avgDocLoadCoverage: number | null;
  cleanlinessPassRate: number;
  avgPrClaimInputTokens: number;
  parityViolationRate: number;
}

export interface MetricsServiceDeps {
  db: Kysely<DaemonDatabase>;
}

/**
 * Owns the Layer-1 metrics: writes per-run measurements onto the `runs` row
 * and rolls them up into a current-vs-baseline cohort aggregate. The
 * `baseline` column splits the two cohorts — `aggregate({ baseline })` never
 * mixes them.
 */
export class MetricsService {
  private readonly db: Kysely<DaemonDatabase>;

  constructor(deps: MetricsServiceDeps) {
    this.db = deps.db;
  }

  /** Stamps the four metric columns onto an existing run row. */
  async recordMetrics(runId: number, inputs: MetricInputs): Promise<void> {
    await this.db
      .updateTable('runs')
      .set({
        doc_load_coverage_pct: inputs.docLoadCoveragePct,
        cleanliness_pass: inputs.cleanlinessPass,
        pr_claim_input_tokens: inputs.prClaimInputTokens,
        parity_violations: inputs.parityViolations,
      })
      .where('id', '=', runId)
      .execute();
  }

  /** Rolls up one cohort (`baseline` true/false) into an `AggregateMetrics`. */
  async aggregate(opts: { baseline: boolean }): Promise<AggregateMetrics> {
    const rows = await this.db
      .selectFrom('runs')
      .select([
        'doc_load_coverage_pct',
        'cleanliness_pass',
        'pr_claim_input_tokens',
        'parity_violations',
      ])
      .where('baseline', '=', opts.baseline ? 1 : 0)
      .execute();

    const runCount = rows.length;
    if (runCount === 0) {
      return {
        runCount: 0,
        avgDocLoadCoverage: null,
        cleanlinessPassRate: 0,
        avgPrClaimInputTokens: 0,
        parityViolationRate: 0,
      };
    }

    const docLoad = rows
      .map((r) => r.doc_load_coverage_pct)
      .filter((v): v is number => v !== null);
    const tokens = rows
      .map((r) => r.pr_claim_input_tokens)
      .filter((v): v is number => v !== null);
    const parity = rows.map((r) => r.parity_violations).filter((v): v is number => v !== null);

    const cleanlinessPassCount = rows.filter((r) => r.cleanliness_pass === 1).length;
    const parityViolationCount = parity.filter((v) => v > 0).length;

    return {
      runCount,
      avgDocLoadCoverage: docLoad.length > 0 ? mean(docLoad) : null,
      cleanlinessPassRate: cleanlinessPassCount / runCount,
      avgPrClaimInputTokens: tokens.length > 0 ? mean(tokens) : 0,
      parityViolationRate: parity.length > 0 ? parityViolationCount / parity.length : 0,
    };
  }
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}
