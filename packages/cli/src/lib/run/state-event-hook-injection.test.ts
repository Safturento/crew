import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { injectStateEventHook } from './state-event-hook-injection.js';

function makeWorktree(): string {
  return mkdtempSync(join(tmpdir(), 'crew-seh-'));
}

function readLocal(worktree: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(join(worktree, '.claude', 'settings.local.json'), 'utf8'),
  ) as Record<string, unknown>;
}

describe('injectStateEventHook', () => {
  it('writes a PostToolUse(Bash) hook into settings.local.json with the templated key + absolute path', () => {
    const worktree = makeWorktree();

    const dest = injectStateEventHook({ worktree, key: 'CREW-256', log: () => {} });

    expect(dest).toBe(join(worktree, '.claude', 'settings.local.json'));
    const settings = readLocal(worktree) as {
      hooks: { PostToolUse: { matcher: string; hooks: { type: string; command: string }[] }[] };
    };
    const post = settings.hooks.PostToolUse;
    expect(post).toHaveLength(1);
    expect(post[0].matcher).toBe('Bash|mcp__github__create_pull_request');
    const command = post[0].hooks[0].command;
    expect(command).toContain('CREW_AGENT_KEY=CREW-256');
    expect(command).toContain('$CLAUDE_PROJECT_DIR/hooks/state-events/pr-create-postuse.mjs');
    expect(post[0].hooks[0].type).toBe('command');
  });

  it('registers the PostToolUse hook against both Bash and the GitHub MCP tool', () => {
    const worktree = makeWorktree();
    injectStateEventHook({ worktree, key: 'CREW-7', log: () => {} });
    const settings = readLocal(worktree) as {
      hooks: { PostToolUse: { matcher: string }[] };
    };
    const entry = settings.hooks.PostToolUse.at(-1);
    expect(entry?.matcher).toBe('Bash|mcp__github__create_pull_request');
  });

  it('writes into the gitignored settings.local.json, never the tracked settings.json', () => {
    const worktree = makeWorktree();
    mkdirSync(join(worktree, '.claude'), { recursive: true });
    writeFileSync(
      join(worktree, '.claude', 'settings.json'),
      `${JSON.stringify({ sandbox: { enabled: true } }, null, 2)}\n`,
    );

    injectStateEventHook({ worktree, key: 'CREW-256', log: () => {} });

    // The tracked file is left exactly as it was — no dirty diff.
    expect(JSON.parse(readFileSync(join(worktree, '.claude', 'settings.json'), 'utf8'))).toEqual({
      sandbox: { enabled: true },
    });
  });

  it('array-merges into an existing settings.local.json, preserving other keys and hooks', () => {
    const worktree = makeWorktree();
    mkdirSync(join(worktree, '.claude'), { recursive: true });
    writeFileSync(
      join(worktree, '.claude', 'settings.local.json'),
      `${JSON.stringify(
        {
          permissions: { allow: ['Bash(ls)'] },
          hooks: {
            PostToolUse: [
              { matcher: 'Edit', hooks: [{ type: 'command', command: 'pre-existing' }] },
            ],
          },
        },
        null,
        2,
      )}\n`,
    );

    injectStateEventHook({ worktree, key: 'CREW-1', log: () => {} });

    const settings = readLocal(worktree) as {
      permissions: { allow: string[] };
      hooks: { PostToolUse: { matcher: string; hooks: { command: string }[] }[] };
    };
    expect(settings.permissions).toEqual({ allow: ['Bash(ls)'] });
    expect(settings.hooks.PostToolUse).toHaveLength(2);
    expect(settings.hooks.PostToolUse[0].hooks[0].command).toBe('pre-existing');
    expect(settings.hooks.PostToolUse[1].hooks[0].command).toContain('CREW_AGENT_KEY=CREW-1');
  });

  it('is idempotent — a second injection does not duplicate the hook', () => {
    const worktree = makeWorktree();

    injectStateEventHook({ worktree, key: 'CREW-1', log: () => {} });
    injectStateEventHook({ worktree, key: 'CREW-1', log: () => {} });

    const settings = readLocal(worktree) as {
      hooks: { PostToolUse: unknown[] };
    };
    expect(settings.hooks.PostToolUse).toHaveLength(1);
  });

  it('re-templates the key on a re-dispatch with a different key (replace, not append)', () => {
    const worktree = makeWorktree();

    injectStateEventHook({ worktree, key: 'CREW-1', log: () => {} });
    injectStateEventHook({ worktree, key: 'CREW-2', log: () => {} });

    const settings = readLocal(worktree) as {
      hooks: { PostToolUse: { hooks: { command: string }[] }[] };
    };
    expect(settings.hooks.PostToolUse).toHaveLength(1);
    expect(settings.hooks.PostToolUse[0].hooks[0].command).toContain('CREW_AGENT_KEY=CREW-2');
    expect(settings.hooks.PostToolUse[0].hooks[0].command).not.toContain('CREW_AGENT_KEY=CREW-1');
  });

  it('logs the destination', () => {
    const worktree = makeWorktree();
    const log = vi.fn();
    injectStateEventHook({ worktree, key: 'CREW-1', log });
    expect(log).toHaveBeenCalledOnce();
  });
});
