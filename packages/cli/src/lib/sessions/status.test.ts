import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encodeWorktreeProjectPath } from './index.js';
import { findLatestSessionForBranch, summarizeSessionStatus } from './status.js';

interface AssistantOpts {
  toolName?: string;
  outputTokens?: number;
  gitBranch?: string;
  timestamp?: string;
}

function assistantToolUseLine(opts: AssistantOpts = {}): string {
  return JSON.stringify({
    type: 'assistant',
    timestamp: opts.timestamp ?? '2026-04-26T12:00:00.000Z',
    gitBranch: opts.gitBranch,
    message: {
      id: 'msg',
      model: 'claude-opus-4-7',
      role: 'assistant',
      content: [
        {
          type: 'tool_use',
          id: 'tu',
          name: opts.toolName ?? 'Read',
          input: { file_path: '/x' },
        },
      ],
      usage: {
        input_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        output_tokens: opts.outputTokens ?? 100,
      },
    },
  });
}

describe('findLatestSessionForBranch', () => {
  let tmp: string;
  let projectsRoot: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'crew-status-'));
    projectsRoot = join(tmp, 'projects');
    mkdirSync(projectsRoot, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('returns null when no session matches the branch', () => {
    const result = findLatestSessionForBranch({
      repoPath: '/home/u/Repo',
      branch: 'KAN-999',
      projectsRoot,
    });
    expect(result).toBeNull();
  });

  it('returns the most recently modified session whose gitBranch matches', () => {
    const repoPath = '/home/u/Repo';
    const dir = join(projectsRoot, encodeWorktreeProjectPath('/home/u/Repo-KAN-23'));
    mkdirSync(dir);
    writeFileSync(join(dir, 'a.jsonl'), assistantToolUseLine({ gitBranch: 'KAN-23' }) + '\n');

    const result = findLatestSessionForBranch({
      repoPath,
      branch: 'KAN-23',
      projectsRoot,
    });

    expect(result?.branch).toBe('KAN-23');
    expect(result?.sessionId).toBe('a');
  });

  it('ignores sessions whose branch does not match', () => {
    const repoPath = '/home/u/Repo';
    const main = join(projectsRoot, encodeWorktreeProjectPath(repoPath));
    mkdirSync(main);
    writeFileSync(join(main, 'm.jsonl'), assistantToolUseLine({ gitBranch: 'main' }) + '\n');

    expect(
      findLatestSessionForBranch({ repoPath, branch: 'KAN-23', projectsRoot }),
    ).toBeNull();
  });
});

describe('summarizeSessionStatus', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'crew-status-summary-'));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('extracts the timeline of tool calls in transcript order', () => {
    const file = join(tmp, 'sess.jsonl');
    writeFileSync(
      file,
      [
        assistantToolUseLine({
          timestamp: '2026-04-26T12:00:00.000Z',
          toolName: 'Read',
          outputTokens: 10,
        }),
        assistantToolUseLine({
          timestamp: '2026-04-26T12:00:01.000Z',
          toolName: 'Bash',
          outputTokens: 20,
        }),
      ].join('\n') + '\n',
    );

    const status = summarizeSessionStatus(file);

    expect(status.timeline).toHaveLength(2);
    expect(status.timeline[0]?.name).toBe('Read');
    expect(status.timeline[1]?.name).toBe('Bash');
  });

  it('breaks token totals down by tool type', () => {
    const file = join(tmp, 'sess.jsonl');
    writeFileSync(
      file,
      [
        assistantToolUseLine({ toolName: 'Read', outputTokens: 10 }),
        assistantToolUseLine({ toolName: 'Read', outputTokens: 5 }),
        assistantToolUseLine({ toolName: 'Bash', outputTokens: 100 }),
      ].join('\n') + '\n',
    );

    const status = summarizeSessionStatus(file);

    expect(status.tokensByTool).toEqual({ Read: 15, Bash: 100 });
    expect(status.totalOutputTokens).toBe(115);
  });

  it('reports runtime as the gap between first and last tool call', () => {
    const file = join(tmp, 'sess.jsonl');
    writeFileSync(
      file,
      [
        assistantToolUseLine({ timestamp: '2026-04-26T12:00:00.000Z' }),
        assistantToolUseLine({ timestamp: '2026-04-26T12:05:30.000Z' }),
      ].join('\n') + '\n',
    );

    const status = summarizeSessionStatus(file);

    expect(status.runtimeMs).toBe(5 * 60_000 + 30_000);
  });

  it('returns null runtime / empty timeline when there are no tool calls', () => {
    const file = join(tmp, 'sess.jsonl');
    writeFileSync(file, '');

    const status = summarizeSessionStatus(file);

    expect(status.timeline).toEqual([]);
    expect(status.runtimeMs).toBeNull();
    expect(status.currentStep).toBeNull();
    expect(status.totalOutputTokens).toBe(0);
  });

  it('reports the last tool call as the current step', () => {
    const file = join(tmp, 'sess.jsonl');
    writeFileSync(
      file,
      [
        assistantToolUseLine({ toolName: 'Read' }),
        assistantToolUseLine({ toolName: 'Edit' }),
      ].join('\n') + '\n',
    );

    const status = summarizeSessionStatus(file);

    expect(status.currentStep?.name).toBe('Edit');
  });
});
