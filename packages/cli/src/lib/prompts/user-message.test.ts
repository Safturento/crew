import { describe, it, expect } from 'vitest';
import { renderUserMessageBlock } from './user-message.js';

describe('renderUserMessageBlock', () => {
  it('returns empty string when message is undefined', () => {
    expect(renderUserMessageBlock(undefined)).toBe('');
  });

  it('returns empty string when message is empty', () => {
    expect(renderUserMessageBlock('')).toBe('');
  });

  it('returns empty string when message is whitespace only', () => {
    expect(renderUserMessageBlock('   \n  ')).toBe('');
  });

  it('renders the partial with the message slotted in', () => {
    const result = renderUserMessageBlock('focus on the recipe-list view');
    expect(result).toContain('Additional context from the user');
    expect(result).toContain('focus on the recipe-list view');
  });

  it('preserves multi-line message content verbatim', () => {
    const msg = 'line one\nline two\nline three';
    const result = renderUserMessageBlock(msg);
    expect(result).toContain(msg);
  });
});
