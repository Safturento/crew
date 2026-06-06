import { describe, it, expect } from 'vitest';
import { renderReport } from './render.js';
import { ok, warn, fail } from './types.js';
import type { CheckOutcome } from './run-health.js';

const outcome = (name: string, scope: 'project' | 'machine', result: CheckOutcome['result']): CheckOutcome => ({
  check: { name, scope, detect: async () => result },
  result,
});

// picocolors emits ANSI escapes; strip them so assertions read plainly.
const plain = (s: string) => s.replace(/\[[0-9;]*m/g, '');

describe('renderReport', () => {
  it('renders a glyph per finding and indents remediation under problems', () => {
    const outcomes: CheckOutcome[] = [
      outcome('config-valid', 'project', ok('config is valid')),
      outcome(
        'excluded-commands',
        'project',
        fail('.claude/settings.json missing the bruno smoke command', {
          remediation: 'add the bruno command to sandbox.excludedCommands',
          fixable: true,
        }),
      ),
      outcome(
        'baseline-present',
        'project',
        warn('AGENTS.md is missing', { remediation: 'run the establishing-a-new-project skill' }),
      ),
    ];

    const report = plain(renderReport(outcomes, { project: 'crew' }));

    expect(report).toContain('crew');
    expect(report).toContain('✓ config-valid');
    expect(report).toContain('✗ excluded-commands');
    expect(report).toContain('⚠ baseline-present');
    // remediation appears, indented, only for the problems
    expect(report).toContain('→ add the bruno command to sandbox.excludedCommands');
    expect(report).toContain('→ run the establishing-a-new-project skill');
  });

  it('footer counts problems (warn + fail) and auto-fixable fails', () => {
    const outcomes: CheckOutcome[] = [
      outcome('a', 'project', ok('fine')),
      outcome('b', 'project', fail('broken', { fixable: true })),
      outcome('c', 'project', fail('also broken')), // not fixable
      outcome('d', 'project', warn('heads up')),
    ];

    const report = plain(renderReport(outcomes, {}));

    expect(report).toContain('3 problems (1 auto-fixable)');
  });

  it('reports a clean bill of health when nothing is wrong', () => {
    const outcomes: CheckOutcome[] = [outcome('a', 'project', ok('fine'))];

    const report = plain(renderReport(outcomes, {}));

    expect(report).toContain('0 problems');
  });
});
