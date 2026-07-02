import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type {
  AssistantEvent,
  AttachmentEvent,
  SystemEvent,
  TranscriptEvent,
  UnknownEvent,
  UserEvent,
} from 'crew-shared';

import { TranscriptRow } from './TranscriptRow.js';

const ts = '2026-04-29T14:32:17.000Z';

function rows() {
  return screen.getAllByTestId('transcript-row');
}

describe('TranscriptRow', () => {
  describe('tools category', () => {
    it('renders an assistant tool_use as one row tagged with the tool name', () => {
      const event: AssistantEvent = {
        type: 'assistant',
        timestamp: ts,
        message: {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'tu-1', name: 'Bash', input: { command: 'npm test' } }],
          usage: { output_tokens: 180 },
        },
      } as AssistantEvent;
      render(<TranscriptRow event={event} />);
      const row = screen.getByTestId('transcript-row');
      expect(row).toHaveAttribute('data-block-type', 'tool_use');
      expect(row).toHaveAttribute('data-category', 'tools');
      expect(screen.getByTestId('transcript-row-tag')).toHaveTextContent('Bash');
      expect(screen.getByTestId('transcript-row-text')).toHaveTextContent('npm test');
      expect(screen.getByTestId('transcript-row-meta')).toHaveTextContent('14:32:17');
      expect(screen.getByTestId('transcript-row-meta')).toHaveTextContent('180 tok');
    });

    it('renders a user tool_result as one row tagged "Result"', () => {
      const event: UserEvent = {
        type: 'user',
        timestamp: ts,
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'tu-9', content: 'ok' }],
        },
      } as UserEvent;
      render(<TranscriptRow event={event} />);
      const row = screen.getByTestId('transcript-row');
      expect(row).toHaveAttribute('data-block-type', 'tool_result');
      expect(row).toHaveAttribute('data-category', 'tools');
      expect(screen.getByTestId('transcript-row-tag')).toHaveTextContent('Result');
      expect(screen.getByTestId('transcript-row-text')).toHaveTextContent('ok');
    });

    it('error tool_result raises the row tag to the error colour', () => {
      const event: UserEvent = {
        type: 'user',
        timestamp: ts,
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'tu-1', content: 'boom', is_error: true }],
        },
      } as UserEvent;
      render(<TranscriptRow event={event} />);
      expect(screen.getByTestId('transcript-row')).toHaveAttribute('data-tone', 'error');
    });

    it('renders tool_use Tag with the per-tool color', () => {
      const event: AssistantEvent = {
        type: 'assistant',
        timestamp: ts,
        message: {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'tu-1', name: 'Bash', input: { command: 'ls' } }],
          usage: { output_tokens: 1 },
        },
      } as AssistantEvent;
      render(<TranscriptRow event={event} />);
      const tag = screen.getByTestId('transcript-row-tag');
      expect(tag.className).toContain('text-amber-300');
      expect(tag.dataset.color).toBe('bash');
    });

    it('aliased MCP tool gets the MCP family color and aliased label', () => {
      const event: AssistantEvent = {
        type: 'assistant',
        timestamp: ts,
        message: {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'tu-1', name: 'mcp__atlassian__jira_get_issue', input: {} },
          ],
          usage: { output_tokens: 1 },
        },
      } as AssistantEvent;
      render(<TranscriptRow event={event} />);
      const tag = screen.getByTestId('transcript-row-tag');
      expect(tag).toHaveTextContent('MCP:Jira');
      expect(tag.className).toContain('text-blue-300');
      expect(tag.dataset.color).toBe('mcpJira');
    });

    it('unknown tool gets the default slate palette', () => {
      const event: AssistantEvent = {
        type: 'assistant',
        timestamp: ts,
        message: {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'tu-1', name: 'NeverBeforeSeenTool', input: {} }],
          usage: { output_tokens: 1 },
        },
      } as AssistantEvent;
      render(<TranscriptRow event={event} />);
      const tag = screen.getByTestId('transcript-row-tag');
      expect(tag.className).toContain('text-slate-400');
      expect(tag.dataset.color).toBe('default');
    });

    it('error tool_result still renders red regardless of tool color', () => {
      const event: UserEvent = {
        type: 'user',
        timestamp: ts,
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'tu-1', content: 'boom', is_error: true }],
        },
      } as UserEvent;
      render(<TranscriptRow event={event} />);
      const tag = screen.getByTestId('transcript-row-tag');
      expect(tag.className).toMatch(/text-red-\d+/);
    });

    it('non-tool rows do not pick up a tool color', () => {
      const event: AssistantEvent = {
        type: 'assistant',
        timestamp: ts,
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'hi' }],
          usage: { output_tokens: 1 },
        },
      } as AssistantEvent;
      render(<TranscriptRow event={event} />);
      const tag = screen.getByTestId('transcript-row-tag');
      expect(tag.className).not.toContain('amber');
      expect(tag.className).not.toContain('text-blue-300');
    });
  });

  describe('conversation category', () => {
    it('renders an assistant text block tagged "Assistant"', () => {
      const event: AssistantEvent = {
        type: 'assistant',
        timestamp: ts,
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'hello world' }],
          usage: { output_tokens: 5 },
        },
      } as AssistantEvent;
      render(<TranscriptRow event={event} />);
      const row = screen.getByTestId('transcript-row');
      expect(row).toHaveAttribute('data-category', 'conversation');
      expect(screen.getByTestId('transcript-row-tag')).toHaveTextContent('Assistant');
      expect(screen.getByTestId('transcript-row-text')).toHaveTextContent('hello world');
    });

    it('renders a user text block tagged "User"', () => {
      const event: UserEvent = {
        type: 'user',
        timestamp: ts,
        message: { role: 'user', content: [{ type: 'text', text: 'do it' }] },
      } as UserEvent;
      render(<TranscriptRow event={event} />);
      expect(screen.getByTestId('transcript-row-tag')).toHaveTextContent('User');
      expect(screen.getByTestId('transcript-row-text')).toHaveTextContent('do it');
    });

    it('treats a bare-string user message as a single conversation row', () => {
      const event = {
        type: 'user',
        timestamp: ts,
        message: { role: 'user', content: 'fix the build' },
      } as unknown as UserEvent;
      render(<TranscriptRow event={event} />);
      expect(rows()).toHaveLength(1);
      expect(screen.getByTestId('transcript-row-tag')).toHaveTextContent('User');
      expect(screen.getByTestId('transcript-row-text')).toHaveTextContent('fix the build');
    });
  });

  describe('thinking category', () => {
    it('renders a thinking block tagged "Thinking"', () => {
      const event: AssistantEvent = {
        type: 'assistant',
        timestamp: ts,
        message: {
          role: 'assistant',
          content: [{ type: 'thinking', thinking: 'first I would …' }],
          usage: { output_tokens: 12 },
        },
      } as AssistantEvent;
      render(<TranscriptRow event={event} />);
      const row = screen.getByTestId('transcript-row');
      expect(row).toHaveAttribute('data-category', 'thinking');
      expect(screen.getByTestId('transcript-row-tag')).toHaveTextContent('Thinking');
      expect(screen.getByTestId('transcript-row-text')).toHaveTextContent('first I would');
    });
  });

  describe('hooks-and-skills category', () => {
    it('renders a hook attachment tagged with a human-readable label', () => {
      const event = {
        type: 'attachment',
        timestamp: ts,
        attachment: { type: 'hook_success', hookName: 'pre-commit' },
      } as unknown as AttachmentEvent;
      render(<TranscriptRow event={event} />);
      const row = screen.getByTestId('transcript-row');
      expect(row).toHaveAttribute('data-category', 'hooks-and-skills');
      expect(screen.getByTestId('transcript-row-tag')).toHaveTextContent('Hook');
      expect(screen.getByTestId('transcript-row-text')).toHaveTextContent('pre-commit');
    });

    it('falls back to humanized label for unknown attachment subtype', () => {
      const event = {
        type: 'attachment',
        timestamp: ts,
        attachment: { type: 'future_unknown_subtype' },
      } as unknown as AttachmentEvent;
      render(<TranscriptRow event={event} />);
      expect(screen.getByTestId('transcript-row-tag')).toHaveTextContent('Future unknown subtype');
    });

    it('renders a Skill tool_use like a skill attachment (Skill invoked, hooks-and-skills)', () => {
      const event = {
        type: 'assistant',
        timestamp: ts,
        message: {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 't1', name: 'Skill', input: { command: 'brainstorming' } },
          ],
        },
      } as unknown as AssistantEvent;
      render(<TranscriptRow event={event} />);
      const row = screen.getByTestId('transcript-row');
      expect(row).toHaveAttribute('data-category', 'hooks-and-skills');
      expect(screen.getByTestId('transcript-row-tag')).toHaveTextContent('Skill invoked');
    });

    it('renders a Skill tool_result under hooks-and-skills (Skill result), not Tools/Result', () => {
      const event = {
        type: 'user',
        timestamp: ts,
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'sk1', content: 'Launching skill: …' }],
        },
      } as unknown as UserEvent;
      render(<TranscriptRow event={event} toolNameById={new Map([['sk1', 'Skill']])} />);
      const row = screen.getByTestId('transcript-row');
      expect(row).toHaveAttribute('data-category', 'hooks-and-skills');
      expect(screen.getByTestId('transcript-row-tag')).toHaveTextContent('Skill result');
    });

    it('keeps a non-Skill tool_result under tools (Result)', () => {
      const event = {
        type: 'user',
        timestamp: ts,
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'tu-9', content: 'ok' }],
        },
      } as unknown as UserEvent;
      render(<TranscriptRow event={event} toolNameById={new Map([['tu-9', 'Bash']])} />);
      const row = screen.getByTestId('transcript-row');
      expect(row).toHaveAttribute('data-category', 'tools');
      expect(screen.getByTestId('transcript-row-tag')).toHaveTextContent('Result');
    });
  });

  describe('system category', () => {
    it('renders a system event tagged with a human-readable label', () => {
      const event = {
        type: 'system',
        subtype: 'turn_duration',
        timestamp: ts,
        durationMs: 8_500,
        messageCount: 4,
      } as unknown as SystemEvent;
      render(<TranscriptRow event={event} />);
      const row = screen.getByTestId('transcript-row');
      expect(row).toHaveAttribute('data-category', 'system');
      expect(screen.getByTestId('transcript-row-tag')).toHaveTextContent('Turn');
    });

    describe('CREW-201 startup phase rows', () => {
      function makeStartupPhaseRow(over: Partial<Record<string, unknown>> = {}) {
        return {
          type: 'system',
          subtype: 'crew_startup_npm_install',
          startedAt: '2026-05-23T10:00:00.000Z',
          completedAt: '2026-05-23T10:00:01.000Z',
          status: 'completed',
          summary: 'installed 152 packages',
          durationMs: 1000,
          logPath: null,
          ...over,
        } as unknown as SystemEvent;
      }

      it('renders the human-readable label for each of the 7 subtypes', () => {
        const cases: Array<[string, string]> = [
          ['crew_startup_preflight', 'Preflight'],
          ['crew_startup_worktree', 'Worktree'],
          ['crew_startup_env_spec', 'Env spec'],
          ['crew_startup_npm_install', 'npm install'],
          ['crew_startup_docker', 'Docker'],
          ['crew_startup_mcp', 'MCP'],
          ['crew_startup_claude_spawn', 'Claude spawn'],
        ];
        for (const [subtype, label] of cases) {
          const { unmount } = render(<TranscriptRow event={makeStartupPhaseRow({ subtype })} />);
          expect(screen.getByTestId('transcript-row-tag')).toHaveTextContent(label);
          unmount();
        }
      });

      it('failed status renders the row with error tone (red)', () => {
        const event = makeStartupPhaseRow({
          status: 'failed',
          summary: 'exit 1: cannot resolve foo',
        });
        render(<TranscriptRow event={event} />);
        expect(screen.getByTestId('transcript-row')).toHaveAttribute('data-tone', 'error');
        expect(screen.getByTestId('transcript-row-text').className).toContain('text-red-400');
      });

      it('in_flight status keeps the default tone and shows the started summary', () => {
        const event = makeStartupPhaseRow({
          status: 'in_flight',
          completedAt: null,
          summary: 'npm ci begun',
          durationMs: null,
        });
        render(<TranscriptRow event={event} />);
        expect(screen.getByTestId('transcript-row')).toHaveAttribute('data-tone', 'default');
        expect(screen.getByTestId('transcript-row-text')).toHaveTextContent('npm ci begun');
      });

      it('completed status uses startedAt as the displayed timestamp', () => {
        const event = makeStartupPhaseRow({
          startedAt: '2026-05-23T14:32:17.000Z',
        });
        render(<TranscriptRow event={event} />);
        // formatHHMMSS uses UTC; matches the existing tools-category test pattern.
        expect(screen.getByTestId('transcript-row-meta')).toHaveTextContent('14:32:17');
      });

      it('expanded view includes the logPath when present', () => {
        const event = makeStartupPhaseRow({
          status: 'failed',
          logPath: '/tmp/crew-npm-install-CREW-201.log',
        });
        render(<TranscriptRow event={event} />);
        fireEvent.click(screen.getByTestId('transcript-row-trigger'));
        expect(screen.getByTestId('transcript-row-expanded')).toHaveTextContent(
          '/tmp/crew-npm-install-CREW-201.log',
        );
      });
    });

    describe('CREW-313 synthetic failed-start event', () => {
      const failedStart = {
        type: 'system',
        subtype: 'crew_failed_start',
        timestamp: '2026-07-02T17:44:01.000Z',
        check: 'excluded-commands',
        headline: 'Sandbox is missing required excludedCommands entries',
        remediation: 'Run `crew doctor --fix`',
        output: 'excluded-commands FAIL\n  missing: npm run bruno:smoke*',
      } as unknown as SystemEvent;

      it('renders the Failed start label with error tone and the headline', () => {
        render(<TranscriptRow event={failedStart} />);
        expect(screen.getByTestId('transcript-row-tag')).toHaveTextContent('Failed start');
        expect(screen.getByTestId('transcript-row')).toHaveAttribute('data-tone', 'error');
        expect(screen.getByTestId('transcript-row-text')).toHaveTextContent(
          'Sandbox is missing required excludedCommands entries',
        );
      });

      it('expanded view carries the full diagnosis (check, remediation, output)', () => {
        render(<TranscriptRow event={failedStart} />);
        fireEvent.click(screen.getByTestId('transcript-row-trigger'));
        const expanded = screen.getByTestId('transcript-row-expanded');
        expect(expanded).toHaveTextContent('Check: excluded-commands');
        expect(expanded).toHaveTextContent('crew doctor --fix');
        expect(expanded).toHaveTextContent('npm run bruno:smoke*');
      });
    });
  });

  describe('multi-block events', () => {
    it('renders one row per content block in an assistant message', () => {
      const event: AssistantEvent = {
        type: 'assistant',
        timestamp: ts,
        message: {
          role: 'assistant',
          content: [
            { type: 'thinking', thinking: 'first' },
            { type: 'tool_use', id: 'tu-1', name: 'Bash', input: { command: 'ls' } },
            { type: 'text', text: 'done' },
          ],
          usage: { output_tokens: 9 },
        },
      } as AssistantEvent;
      render(<TranscriptRow event={event} />);
      expect(rows()).toHaveLength(3);
      const tags = screen.getAllByTestId('transcript-row-tag').map((n) => n.textContent);
      expect(tags).toEqual(['Thinking', 'Bash', 'Assistant']);
    });
  });

  describe('unknown / raw blocks', () => {
    it('renders an unknown event as a single "unknown" row', () => {
      const event: UnknownEvent = {
        type: 'unknown',
        reason: 'unknown_top_level',
        raw: { type: 'whatever' },
        timestamp: ts,
      } as UnknownEvent;
      render(<TranscriptRow event={event} />);
      const row = screen.getByTestId('transcript-row');
      expect(row).toHaveAttribute('data-block-type', 'unknown');
      expect(screen.getByTestId('transcript-row-tag')).toHaveTextContent('unknown');
    });

    it('renders an unrecognised content block as its own row, not the whole event', () => {
      const event: AssistantEvent = {
        type: 'assistant',
        timestamp: ts,
        message: {
          role: 'assistant',
          content: [
            { type: 'text', text: 'visible-text' },
            { type: 'mystery_block', payload: 99 } as unknown as never,
          ],
          usage: { output_tokens: 0 },
        },
      } as AssistantEvent;
      render(<TranscriptRow event={event} />);
      expect(rows()).toHaveLength(2);
      const tags = screen.getAllByTestId('transcript-row-tag').map((n) => n.textContent);
      expect(tags).toEqual(['Assistant', 'mystery_block']);
    });

    it('falls back to a single row for non-mapped top-level event types', () => {
      const event = {
        type: 'last-prompt',
        timestamp: ts,
        sessionId: 's-1',
        lastPrompt: 'hi',
      } as unknown as TranscriptEvent;
      render(<TranscriptRow event={event} />);
      const row = screen.getByTestId('transcript-row');
      expect(row).toHaveAttribute('data-block-type', 'last-prompt');
    });
  });

  describe('row expansion', () => {
    it('does not show the expanded view by default', () => {
      const event: AssistantEvent = {
        type: 'assistant',
        timestamp: ts,
        message: {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'tu-1', name: 'Bash', input: { command: 'npm test' } }],
          usage: { output_tokens: 5 },
        },
      } as AssistantEvent;
      render(<TranscriptRow event={event} />);
      expect(screen.queryByTestId('transcript-row-expanded')).toBeNull();
    });

    it('clicking the row expands to show the underlying JSON / full text', async () => {
      const user = userEvent.setup();
      const event: AssistantEvent = {
        type: 'assistant',
        timestamp: ts,
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tu-1',
              name: 'Bash',
              input: { command: 'npm test', description: 'Run tests' },
            },
          ],
          usage: { output_tokens: 5 },
        },
      } as AssistantEvent;
      render(<TranscriptRow event={event} />);
      await user.click(screen.getByTestId('transcript-row-trigger'));
      expect(screen.getByTestId('transcript-row-expanded')).toHaveTextContent('npm test');
      expect(screen.getByTestId('transcript-row-expanded')).toHaveTextContent('Run tests');
    });
  });

  describe('wrap + chevron + expansion cap (CREW-193)', () => {
    it('replaces truncate with line-clamp-3 + whitespace-normal on the oneliner', () => {
      const event: AssistantEvent = {
        type: 'assistant',
        timestamp: ts,
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'medium length' }],
          usage: { output_tokens: 1 },
        },
      } as AssistantEvent;
      render(<TranscriptRow event={event} />);
      const text = screen.getByTestId('transcript-row-text');
      expect(text.className).toContain('line-clamp-3');
      expect(text.className).toContain('whitespace-normal');
      expect(text.className).not.toContain('truncate');
    });

    it('renders a chevron for tool_use blocks', () => {
      const event: AssistantEvent = {
        type: 'assistant',
        timestamp: ts,
        message: {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'tu-1', name: 'Bash', input: { command: 'ls' } }],
          usage: { output_tokens: 1 },
        },
      } as AssistantEvent;
      render(<TranscriptRow event={event} />);
      const chevron = screen.getByTestId('transcript-row-chevron');
      expect(chevron).toBeInTheDocument();
      expect(chevron.className).not.toContain('invisible');
    });

    it('renders a chevron for tool_result blocks', () => {
      const event: UserEvent = {
        type: 'user',
        timestamp: ts,
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'tu-9', content: 'ok' }],
        },
      } as UserEvent;
      render(<TranscriptRow event={event} />);
      const chevron = screen.getByTestId('transcript-row-chevron');
      expect(chevron).toBeInTheDocument();
      expect(chevron.className).not.toContain('invisible');
    });

    it('renders a chevron for attachment blocks', () => {
      const event = {
        type: 'attachment',
        timestamp: ts,
        attachment: { type: 'hook_success', hookName: 'pre-commit' },
      } as unknown as AttachmentEvent;
      render(<TranscriptRow event={event} />);
      const chevron = screen.getByTestId('transcript-row-chevron');
      expect(chevron).toBeInTheDocument();
      expect(chevron.className).not.toContain('invisible');
    });

    it('renders a chevron for system blocks', () => {
      const event = {
        type: 'system',
        subtype: 'turn_duration',
        timestamp: ts,
        durationMs: 1000,
        messageCount: 1,
      } as unknown as SystemEvent;
      render(<TranscriptRow event={event} />);
      const chevron = screen.getByTestId('transcript-row-chevron');
      expect(chevron).toBeInTheDocument();
      expect(chevron.className).not.toContain('invisible');
    });

    it('chevron is invisible (reserved space) for short text blocks to prevent layout shift', () => {
      const event: AssistantEvent = {
        type: 'assistant',
        timestamp: ts,
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'short' }],
          usage: { output_tokens: 1 },
        },
      } as AssistantEvent;
      render(<TranscriptRow event={event} />);
      const chevron = screen.getByTestId('transcript-row-chevron');
      expect(chevron).toBeInTheDocument();
      expect(chevron.className).toContain('invisible');
    });

    it('expanded pre is capped at max-h-[300px] with internal scroll', () => {
      const event: AssistantEvent = {
        type: 'assistant',
        timestamp: ts,
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tu-1',
              name: 'Bash',
              input: { command: 'x'.repeat(2000) },
            },
          ],
          usage: { output_tokens: 1 },
        },
      } as AssistantEvent;
      render(<TranscriptRow event={event} />);
      fireEvent.click(screen.getByTestId('transcript-row-trigger'));
      const expanded = screen.getByTestId('transcript-row-expanded');
      expect(expanded.className).toMatch(/max-h-\[300px\]/);
      expect(expanded.className).toContain('overflow-y-auto');
    });

    it('aria-expanded reflects open state', () => {
      const event: AssistantEvent = {
        type: 'assistant',
        timestamp: ts,
        message: {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'tu-1', name: 'Bash', input: {} }],
          usage: { output_tokens: 1 },
        },
      } as AssistantEvent;
      render(<TranscriptRow event={event} />);
      const trigger = screen.getByTestId('transcript-row-trigger');
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      fireEvent.click(trigger);
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
    });

    it('chevron picks up the tool color from CREW-192 palette for tool rows', () => {
      const event: AssistantEvent = {
        type: 'assistant',
        timestamp: ts,
        message: {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'tu-1', name: 'Bash', input: { command: 'ls' } }],
          usage: { output_tokens: 1 },
        },
      } as AssistantEvent;
      render(<TranscriptRow event={event} />);
      const chevron = screen.getByTestId('transcript-row-chevron');
      expect(chevron.className).toContain('text-amber-300');
    });

    it('chevron stays muted-foreground for non-tool rows', () => {
      const event: AssistantEvent = {
        type: 'assistant',
        timestamp: ts,
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'hi' }],
          usage: { output_tokens: 1 },
        },
      } as AssistantEvent;
      render(<TranscriptRow event={event} />);
      const chevron = screen.getByTestId('transcript-row-chevron');
      expect(chevron.className).toContain('text-muted-foreground');
    });

    it('chevron renders red on error rows regardless of tool color', () => {
      const event: UserEvent = {
        type: 'user',
        timestamp: ts,
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'tu-1', content: 'boom', is_error: true }],
        },
      } as UserEvent;
      render(<TranscriptRow event={event} />);
      const chevron = screen.getByTestId('transcript-row-chevron');
      expect(chevron.className).toMatch(/text-red-\d+/);
    });
  });

  describe('a11y', () => {
    it('exposes a descriptive aria-label including the tag + one-liner', () => {
      const event: AssistantEvent = {
        type: 'assistant',
        timestamp: ts,
        message: {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'tu-1', name: 'Bash', input: { command: 'npm test' } }],
          usage: { output_tokens: 0 },
        },
      } as AssistantEvent;
      render(<TranscriptRow event={event} />);
      const trigger = screen.getByTestId('transcript-row-trigger');
      expect(trigger).toHaveAttribute('aria-label', expect.stringContaining('Bash'));
      expect(trigger).toHaveAttribute('aria-label', expect.stringContaining('npm test'));
    });
  });
});
