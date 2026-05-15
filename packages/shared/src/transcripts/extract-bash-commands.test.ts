import { describe, it, expect } from 'vitest';
import { extractBashCommands } from './extract-bash-commands.js';

describe('extractBashCommands', () => {
  it('returns empty for no events', () => {
    expect(extractBashCommands([])).toEqual([]);
  });

  it('extracts commands from Bash tool_use entries in order', () => {
    const events = [
      {
        type: 'assistant',
        message: {
          content: [{ type: 'tool_use', name: 'Bash', input: { command: 'npm run lint' } }],
        },
      },
      {
        type: 'assistant',
        message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: 'x.ts' } }] },
      },
      {
        type: 'assistant',
        message: {
          content: [{ type: 'tool_use', name: 'Bash', input: { command: 'git status' } }],
        },
      },
    ];
    expect(extractBashCommands(events)).toEqual(['npm run lint', 'git status']);
  });

  it('handles events whose content is a plain string', () => {
    const events = [{ type: 'user', message: { content: 'plain text' } }];
    expect(extractBashCommands(events)).toEqual([]);
  });

  it('handles a missing message field', () => {
    const events = [{ type: 'assistant' }];
    expect(extractBashCommands(events)).toEqual([]);
  });

  it('skips Bash tool_use entries with no command', () => {
    const events = [
      { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: {} }] } },
    ];
    expect(extractBashCommands(events)).toEqual([]);
  });
});
