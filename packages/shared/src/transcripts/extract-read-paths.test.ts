import { describe, it, expect } from 'vitest';
import { extractReadPaths } from './extract-read-paths.js';

describe('extractReadPaths', () => {
  it('returns empty for no events', () => {
    expect(extractReadPaths([])).toEqual([]);
  });

  it('extracts file paths from Read tool_use entries in order', () => {
    const events = [
      {
        type: 'assistant',
        message: {
          content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/path/to/file.ts' } }],
        },
      },
      {
        type: 'assistant',
        message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }] },
      },
      {
        type: 'assistant',
        message: {
          content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/other.md' } }],
        },
      },
    ];
    expect(extractReadPaths(events)).toEqual(['/path/to/file.ts', '/other.md']);
  });

  it('deduplicates repeated reads of the same file', () => {
    const events = [
      {
        type: 'assistant',
        message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/a.ts' } }] },
      },
      {
        type: 'assistant',
        message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/a.ts' } }] },
      },
    ];
    expect(extractReadPaths(events)).toEqual(['/a.ts']);
  });

  it('handles a missing message field', () => {
    expect(extractReadPaths([{ type: 'assistant' }])).toEqual([]);
  });
});
