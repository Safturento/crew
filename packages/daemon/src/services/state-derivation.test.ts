import { describe, it, expect } from 'vitest';
import { currentStateFromTransitions, deriveStateFromToolCalls } from './state-derivation.js';

describe('currentStateFromTransitions — new pre-run / mismatch states (CREW-307)', () => {
  it('maps a queued transition to the queued badge state', () => {
    expect(currentStateFromTransitions([{ to: 'queued', ts: 0 }])).toBe('queued');
  });

  it('maps an orphaned transition to the orphaned badge state', () => {
    expect(currentStateFromTransitions([{ to: 'orphaned', ts: 0 }])).toBe('orphaned');
  });
});

describe('deriveStateFromToolCalls', () => {
  it('returns init for an empty slice', () => {
    expect(deriveStateFromToolCalls([])).toBe('init');
  });

  it('returns running for any non-PR-creating tool_calls', () => {
    expect(
      deriveStateFromToolCalls([
        { tool_name: 'Read', input_summary: '/x' },
        { tool_name: 'Edit', input_summary: '/y' },
      ]),
    ).toBe('running');
  });

  it('returns pr_open once a Bash gh-pr-create call appears', () => {
    expect(
      deriveStateFromToolCalls([
        { tool_name: 'Read', input_summary: '/x' },
        { tool_name: 'Bash', input_summary: 'gh pr create --title hi' },
      ]),
    ).toBe('pr_open');
  });

  it('returns pr_open when gh pr create runs on its own line after a cd prefix', () => {
    // Agents routinely cd into the worktree before opening the PR, so the
    // summarised command is `cd /path ⏎ gh pr create …` rather than starting
    // with `gh pr create`. CREW status bug: this slid straight to finished.
    expect(
      deriveStateFromToolCalls([
        { tool_name: 'Read', input_summary: '/x' },
        {
          tool_name: 'Bash',
          input_summary: 'cd /home/me/Repos/crew-CREW-31 ⏎ gh pr create --base main --head CREW-31',
        },
      ]),
    ).toBe('pr_open');
  });

  it('does not match Bash calls that merely mention gh pr create later in the line', () => {
    expect(
      deriveStateFromToolCalls([
        { tool_name: 'Bash', input_summary: 'echo "see also: gh pr create"' },
      ]),
    ).toBe('running');
  });

  it('does not match non-Bash tools that happen to start with gh pr create', () => {
    expect(deriveStateFromToolCalls([{ tool_name: 'Read', input_summary: 'gh pr create' }])).toBe(
      'running',
    );
  });

  it('treats a null input_summary as no PR-create signal', () => {
    expect(deriveStateFromToolCalls([{ tool_name: 'Bash', input_summary: null }])).toBe('running');
  });
});

describe('currentStateFromTransitions', () => {
  it('returns initializing when there are no transitions', () => {
    expect(currentStateFromTransitions([])).toBe('initializing');
  });

  it('returns the latest transition target, mapped to AgentState', () => {
    expect(
      currentStateFromTransitions([
        { to: 'init', ts: 1 },
        { to: 'running', ts: 2 },
        { to: 'pr_open', ts: 3 },
        { to: 'running', ts: 4 }, // fix-pr cycle: badge must read running, not pr_open
      ]),
    ).toBe('running');
  });

  it('maps init → initializing', () => {
    expect(currentStateFromTransitions([{ to: 'init', ts: 1 }])).toBe('initializing');
  });

  it('passes pr_open / pr_merged / finished / error through unchanged', () => {
    expect(currentStateFromTransitions([{ to: 'pr_open', ts: 1 }])).toBe('pr_open');
    expect(currentStateFromTransitions([{ to: 'pr_merged', ts: 1 }])).toBe('pr_merged');
    expect(currentStateFromTransitions([{ to: 'finished', ts: 1 }])).toBe('finished');
    expect(currentStateFromTransitions([{ to: 'error', ts: 1 }])).toBe('error');
  });

  it('maps idle/waiting transitions to their own badge state', () => {
    // CREW-257: concrete events make `idle` reachable (clean run_exited, no PR).
    // Both must project to their dedicated badge, not collapse to `running`.
    expect(currentStateFromTransitions([{ to: 'idle', ts: 1 }])).toBe('idle');
    expect(currentStateFromTransitions([{ to: 'waiting', ts: 1 }])).toBe('waiting');
  });

  it('picks the latest by ts regardless of input order', () => {
    expect(
      currentStateFromTransitions([
        { to: 'pr_open', ts: 3000 },
        { to: 'init', ts: 1000 },
        { to: 'running', ts: 2000 },
      ]),
    ).toBe('pr_open');
  });
});
