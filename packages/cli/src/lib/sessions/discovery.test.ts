import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encodeWorktreeProjectPath } from './index.js';
import { listSessionsForRepo } from './discovery.js';

interface AssistantOpts {
  toolName?: string;
  outputTokens?: number;
  gitBranch?: string;
  cwd?: string;
  timestamp?: string;
}

function assistantToolUseLine(opts: AssistantOpts = {}): string {
  return JSON.stringify({
    type: 'assistant',
    timestamp: opts.timestamp ?? '2026-04-26T12:00:00.000Z',
    cwd: opts.cwd,
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

function lastPromptLine(): string {
  return JSON.stringify({ type: 'last-prompt', lastPrompt: 'x', sessionId: 's' });
}

describe('listSessionsForRepo', () => {
  let tmp: string;
  let projectsRoot: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'crew-discovery-'));
    projectsRoot = join(tmp, 'projects');
    mkdirSync(projectsRoot, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('returns no sessions when no project directories exist for the repo', () => {
    expect(listSessionsForRepo({ repoPath: '/home/u/Repo', projectsRoot })).toEqual([]);
  });

  it('finds sessions in the repo dir and in sibling worktree dirs', () => {
    const repoPath = '/home/u/Repo';

    // Repo itself: -home-u-Repo
    const mainDir = join(projectsRoot, encodeWorktreeProjectPath(repoPath));
    mkdirSync(mainDir);
    writeFileSync(join(mainDir, 'aaa.jsonl'), assistantToolUseLine({ gitBranch: 'main' }) + '\n');

    // Sibling worktree: /home/u/Repo-KAN-23 → -home-u-Repo-KAN-23
    const sib = '/home/u/Repo-KAN-23';
    const sibDir = join(projectsRoot, encodeWorktreeProjectPath(sib));
    mkdirSync(sibDir);
    writeFileSync(join(sibDir, 'bbb.jsonl'), assistantToolUseLine({ gitBranch: 'KAN-23' }) + '\n');

    const sessions = listSessionsForRepo({ repoPath, projectsRoot });
    const branches = sessions.map((s) => s.branch).sort();
    expect(branches).toEqual(['KAN-23', 'main']);
  });

  it('does not match unrelated repos that share a path prefix', () => {
    // /home/u/Repo and /home/u/RepoOther share the prefix `-home-u-Repo` if we
    // matched naively on string prefix. Disambiguate by requiring a `-` after
    // the basename (i.e. either the encoded path is exactly the repo or starts
    // with `<encoded>-` where the next segment is a worktree suffix).
    const repoPath = '/home/u/Repo';

    const otherDir = join(projectsRoot, encodeWorktreeProjectPath('/home/u/RepoOther'));
    mkdirSync(otherDir);
    writeFileSync(join(otherDir, 'aaa.jsonl'), assistantToolUseLine({ gitBranch: 'main' }) + '\n');

    expect(listSessionsForRepo({ repoPath, projectsRoot })).toEqual([]);
  });

  it('aggregates per-session: tool count, output tokens, branch, lastModified', () => {
    const repoPath = '/home/u/Repo';
    const dir = join(projectsRoot, encodeWorktreeProjectPath('/home/u/Repo-KAN-23'));
    mkdirSync(dir);
    const file = join(dir, 'sess.jsonl');
    writeFileSync(
      file,
      [
        assistantToolUseLine({ outputTokens: 10, gitBranch: 'KAN-23', toolName: 'Read' }),
        assistantToolUseLine({ outputTokens: 50, gitBranch: 'KAN-23', toolName: 'Bash' }),
      ].join('\n') + '\n',
    );

    const [sess] = listSessionsForRepo({ repoPath, projectsRoot });
    expect(sess?.sessionId).toBe('sess');
    expect(sess?.toolCalls).toBe(2);
    expect(sess?.outputTokens).toBe(60);
    expect(sess?.branch).toBe('KAN-23');
    expect(sess?.transcriptPath).toBe(file);
    expect(sess?.worktreePath).toBe('/home/u/Repo-KAN-23');
    expect(sess?.lastToolName).toBe('Bash');
    expect(sess?.lastModified).toBeInstanceOf(Date);
  });

  it('sorts results by lastModified descending', () => {
    const repoPath = '/home/u/Repo';
    const dir = join(projectsRoot, encodeWorktreeProjectPath(repoPath));
    mkdirSync(dir);
    const older = join(dir, 'older.jsonl');
    const newer = join(dir, 'newer.jsonl');
    writeFileSync(older, assistantToolUseLine() + '\n');
    writeFileSync(newer, assistantToolUseLine() + '\n');
    const past = new Date('2024-01-01T00:00:00Z');
    utimesSync(older, past, past);

    const ids = listSessionsForRepo({ repoPath, projectsRoot }).map((s) => s.sessionId);
    expect(ids).toEqual(['newer', 'older']);
  });

  it('marks a session running when mtime is within the running window', () => {
    const repoPath = '/home/u/Repo';
    const dir = join(projectsRoot, encodeWorktreeProjectPath(repoPath));
    mkdirSync(dir);
    const file = join(dir, 'live.jsonl');
    writeFileSync(file, assistantToolUseLine() + '\n');
    // mtime is "now" by default, well within the running window.

    const [sess] = listSessionsForRepo({ repoPath, projectsRoot });
    expect(sess?.running).toBe(true);
  });

  it('still marks a session running when last-prompt events are present (they are per-turn resume markers, not end-of-session)', () => {
    const repoPath = '/home/u/Repo';
    const dir = join(projectsRoot, encodeWorktreeProjectPath(repoPath));
    mkdirSync(dir);
    const file = join(dir, 'still-running.jsonl');
    writeFileSync(file, [assistantToolUseLine(), lastPromptLine()].join('\n') + '\n');

    const [sess] = listSessionsForRepo({ repoPath, projectsRoot });
    expect(sess?.running).toBe(true);
  });

  it('marks a session finished when mtime is older than the running window', () => {
    const repoPath = '/home/u/Repo';
    const dir = join(projectsRoot, encodeWorktreeProjectPath(repoPath));
    mkdirSync(dir);
    const file = join(dir, 'stale.jsonl');
    writeFileSync(file, assistantToolUseLine() + '\n');
    const longAgo = new Date(Date.now() - 10 * 60_000); // 10 minutes ago
    utimesSync(file, longAgo, longAgo);

    const [sess] = listSessionsForRepo({ repoPath, projectsRoot, runningWindowMs: 60_000 });
    expect(sess?.running).toBe(false);
  });

  it('skips files that are not .jsonl', () => {
    const repoPath = '/home/u/Repo';
    const dir = join(projectsRoot, encodeWorktreeProjectPath(repoPath));
    mkdirSync(dir);
    writeFileSync(join(dir, 'README.md'), 'not a transcript');

    expect(listSessionsForRepo({ repoPath, projectsRoot })).toEqual([]);
  });
});
