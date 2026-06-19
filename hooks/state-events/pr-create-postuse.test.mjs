import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handlePostToolUse } from './pr-create-postuse.mjs';

const ev = (command, stdout, exitCode) => ({
  tool_name: 'Bash',
  tool_input: { command },
  tool_response: { stdout, stderr: '', exitCode },
});

const eventsFile = (home, key) => join(home, '.crew', 'state-events', `${key}.jsonl`);
const mkHome = () => mkdtempSync(join(tmpdir(), 'crew-hook-'));

describe('handlePostToolUse', () => {
  it('emits pr_created for a `;`-chained gh pr create that exits 0', () => {
    const home = mkHome();
    handlePostToolUse(
      ev('cd /x; gh pr create --base main', 'https://github.com/o/r/pull/7\n', 0),
      'CREW-1',
      home,
    );
    const parsed = JSON.parse(readFileSync(eventsFile(home, 'CREW-1'), 'utf8').trim());
    expect(parsed.event).toBe('pr_created');
    expect(parsed.key).toBe('CREW-1');
    expect(parsed.prUrl).toBe('https://github.com/o/r/pull/7');
    expect(parsed.source).toBe('hook-pr-create');
    expect(typeof parsed.eventId).toBe('string');
    expect(parsed.eventId.length).toBeGreaterThan(0);
    expect(Number.isNaN(Date.parse(parsed.ts))).toBe(false);
  });

  it('matches the `&&`-chained form', () => {
    const home = mkHome();
    handlePostToolUse(
      ev('git push && gh pr create', 'https://github.com/o/r/pull/8', 0),
      'CREW-1',
      home,
    );
    const parsed = JSON.parse(readFileSync(eventsFile(home, 'CREW-1'), 'utf8').trim());
    expect(parsed.prUrl).toBe('https://github.com/o/r/pull/8');
  });

  it('matches a bare `gh pr create` at the start of the command', () => {
    const home = mkHome();
    handlePostToolUse(ev('gh pr create --base main --fill', 'https://github.com/o/r/pull/9', 0), 'CREW-1', home);
    expect(existsSync(eventsFile(home, 'CREW-1'))).toBe(true);
  });

  it('still emits (no prUrl) when stdout carries no parseable URL', () => {
    const home = mkHome();
    handlePostToolUse(ev('gh pr create', 'created\n', 0), 'CREW-1', home);
    const parsed = JSON.parse(readFileSync(eventsFile(home, 'CREW-1'), 'utf8').trim());
    expect(parsed.event).toBe('pr_created');
    expect(parsed.prUrl).toBeUndefined();
  });

  it('ignores a failed gh pr create (non-zero exit)', () => {
    const home = mkHome();
    handlePostToolUse(ev('gh pr create', 'oops', 1), 'CREW-1', home);
    expect(existsSync(eventsFile(home, 'CREW-1'))).toBe(false);
  });

  it('ignores an echo decoy that merely mentions gh pr create', () => {
    const home = mkHome();
    handlePostToolUse(ev('echo "run gh pr create later"', '', 0), 'CREW-1', home);
    expect(existsSync(eventsFile(home, 'CREW-1'))).toBe(false);
  });

  it('ignores a non-Bash tool', () => {
    const home = mkHome();
    handlePostToolUse(
      { tool_name: 'Edit', tool_input: { command: 'gh pr create' }, tool_response: { exitCode: 0 } },
      'CREW-1',
      home,
    );
    expect(existsSync(eventsFile(home, 'CREW-1'))).toBe(false);
  });

  it('does not throw on an unwritable home (best-effort)', () => {
    expect(() =>
      handlePostToolUse(ev('gh pr create', 'https://github.com/o/r/pull/1', 0), 'CREW-1', '/dev/null/nope'),
    ).not.toThrow();
  });
});
