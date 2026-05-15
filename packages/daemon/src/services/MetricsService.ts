import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { Kysely } from 'kysely';
import type { Logger } from 'pino';
import { claudeProjectDirFor, parseTranscript } from 'crew-shared';
import type { DaemonDatabase } from '../db.js';
import { computeRunMetrics, type MetricEvent } from './computeRunMetrics.js';

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
  logger: Logger;
}

/**
 * Owns the Layer-1 metrics: writes per-run measurements onto the `runs` row
 * and rolls them up into a current-vs-baseline cohort aggregate. The
 * `baseline` column splits the two cohorts — `aggregate({ baseline })` never
 * mixes them.
 */
export class MetricsService {
  private readonly db: Kysely<DaemonDatabase>;
  private readonly logger: Logger;

  constructor(deps: MetricsServiceDeps) {
    this.db = deps.db;
    this.logger = deps.logger;
  }

  /**
   * Transcript-driven capture for a completed run. Resolves the run's JSONL,
   * derives the four metrics via `computeRunMetrics`, and records them.
   *
   * Best-effort by design — a missing transcript, a `finish` run (no Claude
   * process, no JSONL), or an unknown run id all resolve to a quiet no-op.
   * Failures are logged, never thrown: metrics capture must never break the
   * run-completion path that calls it.
   */
  async captureForRun(runId: number): Promise<void> {
    try {
      const run = await this.db
        .selectFrom('runs')
        .innerJoin('agents', 'agents.key', 'runs.agent_key')
        .select(['runs.command', 'runs.session_id', 'agents.worktree_path'])
        .where('runs.id', '=', runId)
        .executeTakeFirst();
      // `finish` runs spawn no Claude process, so there is no transcript to
      // read — skip them rather than logging a spurious missing-file warning.
      if (!run || run.command === 'finish') return;

      const jsonlPath = join(claudeProjectDirFor(run.worktree_path), `${run.session_id}.jsonl`);
      let raw: string;
      try {
        raw = await fs.readFile(jsonlPath, 'utf8');
      } catch {
        this.logger.debug({ runId, jsonlPath }, 'metrics capture skipped — transcript missing');
        return;
      }

      const events = parseTranscript(raw) as unknown as MetricEvent[];
      const agentDocRelPaths = await listAgentDocs(run.worktree_path);
      await this.recordMetrics(runId, computeRunMetrics(events, { agentDocRelPaths }));
    } catch (err) {
      this.logger.warn({ err, runId }, 'metrics capture failed');
    }
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

    const docLoad = rows.map((r) => r.doc_load_coverage_pct).filter((v): v is number => v !== null);
    const tokens = rows.map((r) => r.pr_claim_input_tokens).filter((v): v is number => v !== null);
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

/**
 * Inventory of a worktree's agent-context docs as worktree-relative paths:
 * the root `AGENTS.md`, every `packages/<pkg>/AGENTS.md`, and every
 * `.agents/*.md` topic doc. The denominator for `docLoadCoveragePct`.
 */
async function listAgentDocs(worktree: string): Promise<string[]> {
  const docs: string[] = [];

  if (await fileExists(join(worktree, 'AGENTS.md'))) docs.push('AGENTS.md');

  try {
    const pkgs = await fs.readdir(join(worktree, 'packages'), { withFileTypes: true });
    for (const pkg of pkgs) {
      if (
        pkg.isDirectory() &&
        (await fileExists(join(worktree, 'packages', pkg.name, 'AGENTS.md')))
      ) {
        docs.push(`packages/${pkg.name}/AGENTS.md`);
      }
    }
  } catch {
    // No `packages/` dir — fine, not every repo is a monorepo.
  }

  try {
    const topics = await fs.readdir(join(worktree, '.agents'));
    for (const topic of topics) {
      if (topic.endsWith('.md')) docs.push(`.agents/${topic}`);
    }
  } catch {
    // No `.agents/` dir — the topic library may not exist yet.
  }

  return docs;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}
