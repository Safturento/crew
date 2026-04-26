import { describe, it, expect } from 'vitest';
import { formatStatusReport } from './status.js';
import type { SessionSummary, SessionStatus } from '../lib/sessions/index.js';

function session(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    sessionId: 'sid',
    transcriptPath: '/tmp/sid.jsonl',
    worktreePath: '/home/u/Repo-KAN-23',
    branch: 'KAN-23',
    toolCalls: 3,
    outputTokens: 999,
    lastModified: new Date('2026-04-26T12:05:30.000Z'),
    lastToolName: 'Edit',
    running: true,
    ...overrides,
  };
}

function status(overrides: Partial<SessionStatus> = {}): SessionStatus {
  return {
    timeline: [
      {
        name: 'Read',
        input: { file_path: '/x/foo.ts' },
        timestamp: '2026-04-26T12:00:00.000Z',
        outputTokens: 100,
      },
      {
        name: 'Bash',
        input: { command: 'npm test' },
        timestamp: '2026-04-26T12:01:00.000Z',
        outputTokens: 500,
      },
      {
        name: 'Edit',
        input: { file_path: '/x/foo.ts' },
        timestamp: '2026-04-26T12:05:30.000Z',
        outputTokens: 399,
      },
    ],
    tokensByTool: { Read: 100, Bash: 500, Edit: 399 },
    totalOutputTokens: 999,
    runtimeMs: 5 * 60_000 + 30_000,
    currentStep: {
      name: 'Edit',
      input: { file_path: '/x/foo.ts' },
      timestamp: '2026-04-26T12:05:30.000Z',
      outputTokens: 399,
    },
    ...overrides,
  };
}

describe('formatStatusReport', () => {
  it('includes the KEY, branch, worktree path, runtime, and current step', () => {
    const out = formatStatusReport({
      key: 'KAN-23',
      session: session(),
      status: status(),
      pr: null,
    });

    expect(out).toContain('KAN-23');
    expect(out).toContain('/home/u/Repo-KAN-23');
    expect(out).toMatch(/5m\s*30s/);
    expect(out).toContain('Edit');
  });

  it('includes the per-tool token breakdown', () => {
    const out = formatStatusReport({
      key: 'KAN-23',
      session: session(),
      status: status(),
      pr: null,
    });

    expect(out).toContain('Read');
    expect(out).toContain('Bash');
    expect(out).toContain('100');
    expect(out).toContain('500');
  });

  it('renders the tool-call timeline in order', () => {
    const out = formatStatusReport({
      key: 'KAN-23',
      session: session(),
      status: status(),
      pr: null,
    });

    const readPos = out.indexOf('foo.ts');
    const npmTestPos = out.indexOf('npm test');
    expect(readPos).toBeGreaterThanOrEqual(0);
    expect(npmTestPos).toBeGreaterThan(readPos);
  });

  it('shows PR URL when one is provided', () => {
    const out = formatStatusReport({
      key: 'KAN-23',
      session: session(),
      status: status(),
      pr: { number: 42, state: 'OPEN', url: 'https://github.com/o/r/pull/42' },
    });

    expect(out).toContain('https://github.com/o/r/pull/42');
    expect(out).toContain('#42');
  });

  it('marks the session as running vs finished', () => {
    const live = formatStatusReport({
      key: 'KAN-23',
      session: session({ running: true }),
      status: status(),
      pr: null,
    });
    const dead = formatStatusReport({
      key: 'KAN-23',
      session: session({ running: false }),
      status: status(),
      pr: null,
    });

    expect(live).not.toEqual(dead);
  });

  it('handles a session with zero tool calls gracefully', () => {
    const out = formatStatusReport({
      key: 'KAN-23',
      session: session({ toolCalls: 0, outputTokens: 0, lastToolName: null }),
      status: status({
        timeline: [],
        tokensByTool: {},
        totalOutputTokens: 0,
        runtimeMs: null,
        currentStep: null,
      }),
      pr: null,
    });

    expect(out).toContain('KAN-23');
    expect(out).toMatch(/no tool calls/i);
  });
});
