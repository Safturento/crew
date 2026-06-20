import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handlePostToolUse, prCreateFailureLine } from './pr-create-postuse.mjs';
// Cross-import the canonical TS remediation so the drift guard below fails if
// the dependency-free hook's inlined copy diverges from the shared wording.
import { stateEventsChownRemediation } from '../../packages/cli/src/lib/state-events/writer.ts';

// Real Claude Code PostToolUse(Bash) payload shape — empirically captured from a
// live session transcript (CREW-261): `tool_response` carries
// `{ stdout, stderr, interrupted, isImage, noOutputExpected }` and has **no
// `exitCode` field**. The hook must therefore key success off the parsed PR URL,
// never off `tool_response.exitCode`.
const ev = (command, stdout) => ({
  tool_name: 'Bash',
  tool_input: { command },
  tool_response: { stdout, stderr: '', interrupted: false, isImage: false, noOutputExpected: false },
});

const eventsFile = (home, key) => join(home, '.crew', 'state-events', `${key}.jsonl`);
const mkHome = () => mkdtempSync(join(tmpdir(), 'crew-hook-'));

describe('handlePostToolUse', () => {
  it('emits pr_created for a `;`-chained gh pr create whose stdout carries a PR URL', () => {
    const home = mkHome();
    handlePostToolUse(
      ev('cd /x; gh pr create --base main', 'https://github.com/o/r/pull/7\n'),
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
    handlePostToolUse(ev('git push && gh pr create', 'https://github.com/o/r/pull/8'), 'CREW-1', home);
    const parsed = JSON.parse(readFileSync(eventsFile(home, 'CREW-1'), 'utf8').trim());
    expect(parsed.prUrl).toBe('https://github.com/o/r/pull/8');
  });

  it('matches the `|`-piped form', () => {
    const home = mkHome();
    handlePostToolUse(ev('true | gh pr create', 'https://github.com/o/r/pull/3'), 'CREW-1', home);
    const parsed = JSON.parse(readFileSync(eventsFile(home, 'CREW-1'), 'utf8').trim());
    expect(parsed.prUrl).toBe('https://github.com/o/r/pull/3');
  });

  it('matches a bare `gh pr create` at the start of the command', () => {
    const home = mkHome();
    handlePostToolUse(
      ev('gh pr create --base main --fill', 'https://github.com/o/r/pull/9'),
      'CREW-1',
      home,
    );
    expect(existsSync(eventsFile(home, 'CREW-1'))).toBe(true);
  });

  it('matches the newline-separated form (`cd <wt>⏎gh pr create`, the CREW-246 miss)', () => {
    const home = mkHome();
    handlePostToolUse(
      ev('cd /home/x/crew-CREW-1\ngh pr create --base main --head CREW-1', 'https://github.com/o/r/pull/12'),
      'CREW-1',
      home,
    );
    const parsed = JSON.parse(readFileSync(eventsFile(home, 'CREW-1'), 'utf8').trim());
    expect(parsed.event).toBe('pr_created');
    expect(parsed.prUrl).toBe('https://github.com/o/r/pull/12');
  });

  it('matches a heredoc-bodied gh pr create on its own line', () => {
    const home = mkHome();
    const command = [
      'git push -u origin CREW-1',
      'gh pr create --base main --body "$(cat <<EOF',
      'Summary line',
      'EOF',
      ')"',
    ].join('\n');
    handlePostToolUse(ev(command, 'https://github.com/o/r/pull/13'), 'CREW-1', home);
    const parsed = JSON.parse(readFileSync(eventsFile(home, 'CREW-1'), 'utf8').trim());
    expect(parsed.prUrl).toBe('https://github.com/o/r/pull/13');
  });

  it('emits when the payload has no exitCode field at all (CREW-261 regression)', () => {
    const home = mkHome();
    // Construct the payload by hand to guarantee no `exitCode` key is present —
    // the exact shape Claude Code sends, which the old exitCode gate dropped.
    const payload = {
      tool_name: 'Bash',
      tool_input: { command: 'gh pr create --base main --head CREW-1' },
      tool_response: {
        stdout: 'https://github.com/o/r/pull/42\n',
        stderr: '',
        interrupted: false,
        isImage: false,
        noOutputExpected: false,
      },
    };
    expect('exitCode' in payload.tool_response).toBe(false);
    handlePostToolUse(payload, 'CREW-1', home);
    const parsed = JSON.parse(readFileSync(eventsFile(home, 'CREW-1'), 'utf8').trim());
    expect(parsed.event).toBe('pr_created');
    expect(parsed.prUrl).toBe('https://github.com/o/r/pull/42');
  });

  it('does not emit when a gh pr create stdout carries no parseable PR URL (the failed-create signal)', () => {
    const home = mkHome();
    handlePostToolUse(ev('gh pr create', 'pull request create failed: ...\n'), 'CREW-1', home);
    expect(existsSync(eventsFile(home, 'CREW-1'))).toBe(false);
  });

  it('ignores an echo decoy that merely mentions gh pr create (no URL in its output)', () => {
    const home = mkHome();
    // A realistic decoy: `echo` prints the literal mention, which carries no PR
    // URL. The URL gate — not position-anchoring — is what rejects it now.
    handlePostToolUse(ev('echo "run gh pr create later"', 'run gh pr create later\n'), 'CREW-1', home);
    expect(existsSync(eventsFile(home, 'CREW-1'))).toBe(false);
  });

  it('does not emit for `gh pr create --help` (mentions create but prints no PR URL)', () => {
    const home = mkHome();
    handlePostToolUse(
      ev('gh pr create --help', 'Usage: gh pr create [flags]\n  Create a pull request on GitHub.\n'),
      'CREW-1',
      home,
    );
    expect(existsSync(eventsFile(home, 'CREW-1'))).toBe(false);
  });

  it('does not emit for `gh pr view` even though it prints a PR URL (not a create)', () => {
    const home = mkHome();
    handlePostToolUse(ev('gh pr view --json url', 'https://github.com/o/r/pull/5'), 'CREW-1', home);
    expect(existsSync(eventsFile(home, 'CREW-1'))).toBe(false);
  });

  it('does not emit for `gh pr list` even though it prints a PR URL (not a create)', () => {
    const home = mkHome();
    handlePostToolUse(ev('gh pr list --web', 'https://github.com/o/r/pull/6'), 'CREW-1', home);
    expect(existsSync(eventsFile(home, 'CREW-1'))).toBe(false);
  });

  it('does not emit for the past-tense "gh pr created" (word-boundary guard)', () => {
    const home = mkHome();
    handlePostToolUse(
      ev('echo "gh pr created the PR"', 'https://github.com/o/r/pull/4'),
      'CREW-1',
      home,
    );
    expect(existsSync(eventsFile(home, 'CREW-1'))).toBe(false);
  });

  it('ignores a non-Bash tool', () => {
    const home = mkHome();
    handlePostToolUse(
      { tool_name: 'Edit', tool_input: { command: 'gh pr create' }, tool_response: { stdout: 'https://github.com/o/r/pull/1' } },
      'CREW-1',
      home,
    );
    expect(existsSync(eventsFile(home, 'CREW-1'))).toBe(false);
  });

  it('does not throw on an unwritable home (best-effort)', () => {
    expect(() =>
      handlePostToolUse(ev('gh pr create', 'https://github.com/o/r/pull/1'), 'CREW-1', '/dev/null/nope'),
    ).not.toThrow();
  });
});

describe('prCreateFailureLine', () => {
  it('appends the chown remediation on a permission error (EACCES)', () => {
    const err = Object.assign(new Error('permission denied'), { code: 'EACCES' });
    const line = prCreateFailureLine('/dir', 'CREW-1', err);
    expect(line).toContain('failed to emit pr_created for CREW-1');
    expect(line).toContain('sudo chown -R "$(id -u):$(id -g)" /dir');
  });

  it('appends the chown remediation on EPERM too', () => {
    const err = Object.assign(new Error('operation not permitted'), { code: 'EPERM' });
    expect(prCreateFailureLine('/dir', 'CREW-1', err)).toContain('sudo chown -R');
  });

  it('does not append remediation for a non-permission error', () => {
    const err = Object.assign(new Error('boom'), { code: 'ENOENT' });
    expect(prCreateFailureLine('/dir', 'CREW-1', err)).not.toContain('sudo chown');
  });

  it('keeps its inlined remediation byte-identical to the shared TS string (drift guard)', () => {
    const err = Object.assign(new Error('permission denied'), { code: 'EACCES' });
    // The hook can't import crew-cli (it's dependency-free .mjs), so it inlines
    // the remediation. This guard fails if that copy drifts from the canonical
    // `stateEventsChownRemediation` in lib/state-events/writer.ts.
    expect(prCreateFailureLine('/dir', 'CREW-1', err)).toContain(
      stateEventsChownRemediation('/dir'),
    );
  });
});
