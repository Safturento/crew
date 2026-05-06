import { describe, it, expect } from 'vitest';
import { deriveStateFromToolCalls } from './state-derivation.js';

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

  it('does not match Bash calls that merely mention gh pr create later in the line', () => {
    expect(
      deriveStateFromToolCalls([
        { tool_name: 'Bash', input_summary: 'echo "see also: gh pr create"' },
      ]),
    ).toBe('running');
  });

  it('does not match non-Bash tools that happen to start with gh pr create', () => {
    expect(
      deriveStateFromToolCalls([
        { tool_name: 'Read', input_summary: 'gh pr create' },
      ]),
    ).toBe('running');
  });

  it('treats a null input_summary as no PR-create signal', () => {
    expect(
      deriveStateFromToolCalls([{ tool_name: 'Bash', input_summary: null }]),
    ).toBe('running');
  });
});
