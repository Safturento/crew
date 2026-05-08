import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { AssistantEvent, ToolUseContent } from 'crew-shared';

import { ToolUseCard } from './ToolUseCard.js';

const baseEvent: AssistantEvent = {
  type: 'assistant',
  uuid: 'evt-1',
  timestamp: '2026-04-29T14:32:17.000Z',
  message: {
    role: 'assistant',
    content: [],
    usage: { output_tokens: 1234 },
  },
} as AssistantEvent;

const bash: ToolUseContent = {
  type: 'tool_use',
  id: 'tu-1',
  name: 'Bash',
  input: { command: 'npm test', description: 'Run tests' },
};

describe('ToolUseCard', () => {
  it('line 1 is "[Bash] {command}" for a Bash tool_use', () => {
    render(<ToolUseCard event={baseEvent} content={bash} />);
    expect(screen.getByTestId('card-line-1')).toHaveTextContent('[Bash] npm test');
  });

  it('line 1 falls back to a JSON-ish summary when no command-like field is present', () => {
    const read: ToolUseContent = {
      type: 'tool_use',
      id: 'tu-2',
      name: 'Read',
      input: { file_path: '/home/x/repo/foo.ts' },
    };
    render(<ToolUseCard event={baseEvent} content={read} />);
    expect(screen.getByTestId('card-line-1')).toHaveTextContent('[Read] /home/x/repo/foo.ts');
  });

  it('line 2 includes the timestamp and token count', () => {
    render(<ToolUseCard event={baseEvent} content={bash} />);
    const line2 = screen.getByTestId('card-line-2').textContent ?? '';
    expect(line2).toMatch(/\d{2}:\d{2}:\d{2}/);
    expect(line2).toMatch(/1\.2k tok|1234 tok/);
  });

  it('does not render the expanded view by default', () => {
    render(<ToolUseCard event={baseEvent} content={bash} />);
    expect(screen.queryByTestId('card-expanded')).toBeNull();
  });

  it('clicking expands to show the full input', async () => {
    const user = userEvent.setup();
    render(<ToolUseCard event={baseEvent} content={bash} />);
    await user.click(screen.getByTestId('card-line-1'));
    expect(screen.getByTestId('card-expanded')).toHaveTextContent('npm test');
    expect(screen.getByTestId('card-expanded')).toHaveTextContent('Run tests');
  });
});
