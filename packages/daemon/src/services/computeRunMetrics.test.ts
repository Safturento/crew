import { describe, it, expect } from 'vitest';
import { computeRunMetrics, type MetricEvent } from './computeRunMetrics.js';

function bash(command: string): MetricEvent {
  return {
    type: 'assistant',
    message: { content: [{ type: 'tool_use', name: 'Bash', input: { command } }] },
  };
}

function read(filePath: string): MetricEvent {
  return {
    type: 'assistant',
    message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: filePath } }] },
  };
}

describe('computeRunMetrics', () => {
  it('flags cleanlinessPass when a verification command ran', () => {
    const events = [bash('npm run lint'), bash('git status')];
    const m = computeRunMetrics(events, { agentDocRelPaths: [] });
    expect(m.cleanlinessPass).toBe(1);
  });

  it('leaves cleanlinessPass 0 when no verification command ran', () => {
    const events = [bash('git status'), bash('ls -la')];
    const m = computeRunMetrics(events, { agentDocRelPaths: [] });
    expect(m.cleanlinessPass).toBe(0);
  });

  it('does not flag cleanlinessPass on incidental mentions of "test"/"format"', () => {
    // A bare "test" substring (e.g. a filename) is not a verification run.
    const events = [bash('cat test.txt'), bash('ls src/format')];
    const m = computeRunMetrics(events, { agentDocRelPaths: [] });
    expect(m.cleanlinessPass).toBe(0);
  });

  it('flags cleanlinessPass for a direct verification-tool invocation', () => {
    const m = computeRunMetrics([bash('npx vitest run')], { agentDocRelPaths: [] });
    expect(m.cleanlinessPass).toBe(1);
  });

  it('captures prClaimInputTokens from the gh pr create turn', () => {
    const events: MetricEvent[] = [
      bash('npm run test'),
      {
        type: 'assistant',
        message: {
          content: [{ type: 'tool_use', name: 'Bash', input: { command: 'gh pr create --fill' } }],
          usage: {
            input_tokens: 1200,
            cache_read_input_tokens: 40000,
            cache_creation_input_tokens: 800,
          },
        },
      },
    ];
    const m = computeRunMetrics(events, { agentDocRelPaths: [] });
    expect(m.prClaimInputTokens).toBe(42000);
  });

  it('leaves prClaimInputTokens null when no PR was created', () => {
    const m = computeRunMetrics([bash('npm run lint')], { agentDocRelPaths: [] });
    expect(m.prClaimInputTokens).toBeNull();
  });

  it('computes docLoadCoveragePct as the fraction of agent docs read', () => {
    const events = [
      read('/work/CREW-1/AGENTS.md'),
      read('/work/CREW-1/.agents/testing.md'),
      read('/work/CREW-1/src/index.ts'),
    ];
    const m = computeRunMetrics(events, {
      agentDocRelPaths: [
        'AGENTS.md',
        '.agents/testing.md',
        '.agents/architecture.md',
        '.agents/security.md',
      ],
    });
    // 2 of 4 agent docs were opened.
    expect(m.docLoadCoveragePct).toBe(50);
  });

  it('returns docLoadCoveragePct null when the worktree has no agent docs', () => {
    const m = computeRunMetrics([read('/work/CREW-1/AGENTS.md')], { agentDocRelPaths: [] });
    expect(m.docLoadCoveragePct).toBeNull();
  });

  it('leaves parityViolations null — no transcript-only signal exists yet', () => {
    const m = computeRunMetrics([bash('npm run lint')], { agentDocRelPaths: ['AGENTS.md'] });
    expect(m.parityViolations).toBeNull();
  });
});
