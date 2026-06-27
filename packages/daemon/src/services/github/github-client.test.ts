import { describe, expect, it } from 'vitest';
import type { Octokit } from '@octokit/rest';
import { GithubClient, parsePrUrl } from './github-client.js';

function fakeOctokit(data: { state: string; merged: boolean }): Octokit {
  return { pulls: { get: async () => ({ data }) } } as unknown as Octokit;
}

describe('parsePrUrl', () => {
  it('extracts owner/repo/number', () => {
    expect(parsePrUrl('https://github.com/Safturento/crew/pull/427')).toEqual({
      owner: 'Safturento',
      repo: 'crew',
      number: 427,
    });
  });
  it('throws on an unparseable URL', () => {
    expect(() => parsePrUrl('https://example.com/x')).toThrow(/unparseable/i);
  });
});

describe('GithubClient.fetchPrState', () => {
  const url = 'https://github.com/Safturento/crew/pull/1';
  it('merged → MERGED', async () => {
    expect(
      await new GithubClient(fakeOctokit({ state: 'closed', merged: true })).fetchPrState(url),
    ).toBe('MERGED');
  });
  it('closed unmerged → CLOSED', async () => {
    expect(
      await new GithubClient(fakeOctokit({ state: 'closed', merged: false })).fetchPrState(url),
    ).toBe('CLOSED');
  });
  it('open → OPEN', async () => {
    expect(
      await new GithubClient(fakeOctokit({ state: 'open', merged: false })).fetchPrState(url),
    ).toBe('OPEN');
  });
});
