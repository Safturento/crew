import { describe, expect, it, vi } from 'vitest';
import {
  fetchTicketSummary,
  fetchTicketSummaryFromEnv,
} from './fetch-ticket-summary.js';

describe('fetchTicketSummary', () => {
  it('returns the issue summary on a successful getIssue', async () => {
    const clientFactory = vi.fn().mockReturnValue({
      getIssue: vi.fn().mockResolvedValue({
        key: 'KAN-23',
        fields: { status: { name: 'In Progress' }, summary: 'Add board archival endpoint' },
      }),
    });
    const result = await fetchTicketSummary({
      key: 'KAN-23',
      jiraSite: 'https://x.atlassian.net',
      email: 'e',
      token: 't',
      clientFactory,
    });
    expect(result).toBe('Add board archival endpoint');
  });

  it('returns "" and calls warn when getIssue throws', async () => {
    const warn = vi.fn();
    const clientFactory = vi.fn().mockReturnValue({
      getIssue: vi.fn().mockRejectedValue(new Error('404 not found')),
    });
    const result = await fetchTicketSummary({
      key: 'KAN-999',
      jiraSite: 'https://x.atlassian.net',
      email: 'e',
      token: 't',
      warn,
      clientFactory,
    });
    expect(result).toBe('');
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/KAN-999.*404 not found/));
  });

  it('returns "" when the issue payload has no summary field', async () => {
    const clientFactory = vi.fn().mockReturnValue({
      getIssue: vi.fn().mockResolvedValue({
        key: 'KAN-23',
        fields: { status: { name: 'Open' } },
      }),
    });
    const result = await fetchTicketSummary({
      key: 'KAN-23',
      jiraSite: 'https://x.atlassian.net',
      email: 'e',
      token: 't',
      clientFactory,
    });
    expect(result).toBe('');
  });
});

describe('fetchTicketSummaryFromEnv', () => {
  it('returns "" without calling Jira when CREW_JIRA_EMAIL is missing', async () => {
    const result = await fetchTicketSummaryFromEnv('KAN-23', 'https://x.atlassian.net', {
      CREW_JIRA_API_TOKEN: 'tok',
    });
    expect(result).toBe('');
  });

  it('returns "" without calling Jira when CREW_JIRA_API_TOKEN is missing', async () => {
    const result = await fetchTicketSummaryFromEnv('KAN-23', 'https://x.atlassian.net', {
      CREW_JIRA_EMAIL: 'e@x',
    });
    expect(result).toBe('');
  });

  it('returns "" without calling Jira when both credentials are empty strings', async () => {
    const result = await fetchTicketSummaryFromEnv('KAN-23', 'https://x.atlassian.net', {
      CREW_JIRA_EMAIL: '   ',
      CREW_JIRA_API_TOKEN: '   ',
    });
    expect(result).toBe('');
  });
});
