import { describe, it, expect } from 'vitest';
import { selectSessionsToShow, formatListTable } from './list.js';
import type { SessionSummary } from '../lib/sessions/index.js';

function session(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    sessionId: 'sid',
    transcriptPath: '/tmp/sid.jsonl',
    worktreePath: '/home/u/Repo',
    branch: 'main',
    toolCalls: 0,
    outputTokens: 0,
    lastModified: new Date('2026-04-26T12:00:00.000Z'),
    lastToolName: null,
    running: false,
    ...overrides,
  };
}

describe('selectSessionsToShow', () => {
  const now = new Date('2026-04-26T12:00:00.000Z').getTime();

  const live = session({ sessionId: 'live', running: true });
  const recent = session({
    sessionId: 'recent',
    running: false,
    lastModified: new Date(now - 30 * 60_000), // 30 min ago
  });
  const yesterday = session({
    sessionId: 'yesterday',
    running: false,
    lastModified: new Date(now - 36 * 60 * 60_000), // 36h ago
  });

  it('default: running + last 5 finished by mtime', () => {
    const finished: SessionSummary[] = [];
    for (let i = 0; i < 8; i += 1) {
      finished.push(
        session({
          sessionId: `done-${i}`,
          running: false,
          lastModified: new Date(now - (i + 1) * 60_000),
        }),
      );
    }

    const all = [live, ...finished];
    const result = selectSessionsToShow(all, { now });

    // 1 running + 5 most recent finished = 6 total
    expect(result).toHaveLength(6);
    const ids = result.map((s) => s.sessionId);
    expect(ids).toContain('live');
    expect(ids).toContain('done-0');
    expect(ids).toContain('done-4');
    expect(ids).not.toContain('done-5');
  });

  it('--running: only running sessions', () => {
    const result = selectSessionsToShow([live, recent, yesterday], { running: true, now });
    expect(result).toEqual([live]);
  });

  it('--all: every session within the last 24h, by mtime desc', () => {
    const result = selectSessionsToShow([live, recent, yesterday], { all: true, now });
    expect(result.map((s) => s.sessionId)).toEqual(['live', 'recent']);
  });

  it('--all explicitly excludes sessions older than 24h', () => {
    const result = selectSessionsToShow([yesterday], { all: true, now });
    expect(result).toEqual([]);
  });
});

describe('formatListTable', () => {
  const now = new Date('2026-04-26T12:00:00.000Z').getTime();

  it('returns "no sessions" message when empty', () => {
    expect(formatListTable([], { now })).toMatch(/no sessions/i);
  });

  it('renders one row per session with KEY, branch, tools, tokens, age, last-tool', () => {
    const out = formatListTable(
      [
        session({
          sessionId: 'live',
          branch: 'KAN-23',
          toolCalls: 12,
          outputTokens: 1234,
          lastToolName: 'Bash',
          lastModified: new Date(now - 90_000), // 1m30s ago
          running: true,
        }),
      ],
      { now },
    );

    expect(out).toContain('KAN-23');
    expect(out).toContain('12');
    // token formatting accepts any of "1234", "1.2k", etc — just check the
    // value made it into the output somehow
    expect(out).toMatch(/1[.,]?\d?k|1234/);
    expect(out).toContain('Bash');
    expect(out).toMatch(/1m\s*30s|1m/);
  });

  it('marks running sessions distinctly from finished ones', () => {
    const out = formatListTable(
      [
        session({ sessionId: 'a', branch: 'A-1', running: true, toolCalls: 1 }),
        session({ sessionId: 'b', branch: 'B-1', running: false, toolCalls: 1 }),
      ],
      { now },
    );
    // Whatever the marker is, the two rows must visually differ — easiest
    // assertion: their lines are not identical.
    const lines = out.split('\n').filter((l) => l.includes('A-1') || l.includes('B-1'));
    expect(lines).toHaveLength(2);
    expect(lines[0]).not.toBe(lines[1]);
  });
});
