import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { injectStateEventHook } from './state-event-hook-injection.js';

const NEW_HOOK_PATH = '$CLAUDE_PROJECT_DIR/.claude/crew-hooks/pr-create-postuse.mjs';
const OLD_HOOK_PATH = '$CLAUDE_PROJECT_DIR/hooks/state-events/pr-create-postuse.mjs';

/** The committed hook script the injection copies into each worktree. */
const HOOK_SCRIPT_SOURCE = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  '..',
  'hooks',
  'state-events',
  'pr-create-postuse.mjs',
);

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
    expect(command).toContain(NEW_HOOK_PATH);
    expect(post[0].hooks[0].type).toBe('command');
  });

  it('copies the dependency-free hook script into the worktree at the re-pointed path', () => {
    const worktree = makeWorktree();

    injectStateEventHook({ worktree, key: 'CREW-314', log: () => {} });

    const copied = join(worktree, '.claude', 'crew-hooks', 'pr-create-postuse.mjs');
    expect(existsSync(copied)).toBe(true);
    // Byte-identical to the committed source so the hook behaves exactly as tested.
    expect(readFileSync(copied, 'utf8')).toBe(readFileSync(HOOK_SCRIPT_SOURCE, 'utf8'));

    // And the injected command points at that copy, not the old crew-repo path.
    const settings = readLocal(worktree) as {
      hooks: { PostToolUse: { hooks: { command: string }[] }[] };
    };
    const command = settings.hooks.PostToolUse[0].hooks[0].command;
    expect(command).toContain(NEW_HOOK_PATH);
    expect(command).not.toContain(OLD_HOOK_PATH);
  });

  it('overwrites the worktree hook copy on re-dispatch (hook fixes propagate)', () => {
    const worktree = makeWorktree();
    const copied = join(worktree, '.claude', 'crew-hooks', 'pr-create-postuse.mjs');

    mkdirSync(dirname(copied), { recursive: true });
    writeFileSync(copied, '// stale hook body\n');

    injectStateEventHook({ worktree, key: 'CREW-314', log: () => {} });

    expect(readFileSync(copied, 'utf8')).toBe(readFileSync(HOOK_SCRIPT_SOURCE, 'utf8'));
  });

  it('sweeps a stale entry pointing at the old crew-repo hook path', () => {
    const worktree = makeWorktree();
    mkdirSync(join(worktree, '.claude'), { recursive: true });
    writeFileSync(
      join(worktree, '.claude', 'settings.local.json'),
      `${JSON.stringify(
        {
          hooks: {
            PostToolUse: [
              {
                matcher: 'Bash|mcp__github__create_pull_request',
                hooks: [
                  { type: 'command', command: `CREW_AGENT_KEY=CREW-9 node "${OLD_HOOK_PATH}"` },
                ],
              },
            ],
          },
        },
        null,
        2,
      )}\n`,
    );

    injectStateEventHook({ worktree, key: 'CREW-314', log: () => {} });

    const settings = readLocal(worktree) as {
      hooks: { PostToolUse: { hooks: { command: string }[] }[] };
    };
    // Exactly one crew entry survives, and it points at the new path only.
    expect(settings.hooks.PostToolUse).toHaveLength(1);
    const command = settings.hooks.PostToolUse[0].hooks[0].command;
    expect(command).toContain(NEW_HOOK_PATH);
    expect(command).not.toContain(OLD_HOOK_PATH);
    expect(command).toContain('CREW_AGENT_KEY=CREW-314');
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
