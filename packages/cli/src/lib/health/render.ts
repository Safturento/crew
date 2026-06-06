import pc from 'picocolors';
import type { CheckStatus } from './types.js';
import type { CheckOutcome } from './run-health.js';

export interface RenderOptions {
  /** Optional heading — the project name, or a label like `machine`. */
  project?: string;
}

const GLYPH: Record<CheckStatus, string> = {
  ok: pc.green('✓'),
  warn: pc.yellow('⚠'),
  fail: pc.red('✗'),
};

/**
 * Render a grouped ✓/⚠/✗ report for a set of check outcomes.
 *
 * One glyphed line per finding (in registry order), with any remediation
 * indented beneath the problems (`warn`/`fail`). A footer summarizes the
 * health: `N problems (M auto-fixable)`, where problems = warns + fails and
 * auto-fixable = fails carrying `fixable: true`.
 */
export function renderReport(outcomes: CheckOutcome[], opts: RenderOptions): string {
  const lines: string[] = [];

  if (opts.project) {
    lines.push(pc.bold(opts.project));
  }

  for (const { check, result } of outcomes) {
    lines.push(`  ${GLYPH[result.status]} ${check.name}: ${result.headline}`);
    if (result.status !== 'ok' && result.remediation) {
      lines.push(pc.dim(`      → ${result.remediation}`));
    }
  }

  const problems = outcomes.filter((o) => o.result.status !== 'ok').length;
  const fixable = outcomes.filter(
    (o) => o.result.status === 'fail' && o.result.fixable === true,
  ).length;

  lines.push('');
  lines.push(`  ${problems} problems (${fixable} auto-fixable)`);

  return lines.join('\n');
}
