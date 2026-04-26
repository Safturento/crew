import { describe, it, expect } from 'vitest';
import { buildTicketPrompt, buildFixPrPrompt } from './index.js';

describe('buildTicketPrompt', () => {
  it('substitutes the ticket key throughout', () => {
    const prompt = buildTicketPrompt({
      key: 'KAN-23',
      githubRepo: 'Safturento/Recipes',
      jiraSite: 'https://safturento.atlassian.net',
    });

    expect(prompt).toContain('KAN-23');
    expect(prompt).not.toContain('__KEY__');
    expect(prompt).toContain('Safturento/Recipes');
    expect(prompt).toContain('https://safturento.atlassian.net');
  });

  it('mentions the required Superpowers skills', () => {
    const prompt = buildTicketPrompt({
      key: 'KAN-23',
      githubRepo: 'Safturento/Recipes',
      jiraSite: 'https://safturento.atlassian.net',
    });

    expect(prompt).toContain('superpowers:executing-plans');
    expect(prompt).toContain('superpowers:test-driven-development');
    expect(prompt).toContain('superpowers:verification-before-completion');
    expect(prompt).toContain('superpowers:requesting-code-review');
  });

  it('includes the Epic guard step', () => {
    const prompt = buildTicketPrompt({
      key: 'KAN-23',
      githubRepo: 'Safturento/Recipes',
      jiraSite: 'https://safturento.atlassian.net',
    });

    expect(prompt).toMatch(/issue_type\.name == "Epic"/);
  });
});

describe('buildFixPrPrompt', () => {
  it('substitutes the ticket key and feedback body', () => {
    const prompt = buildFixPrPrompt({
      key: 'KAN-23',
      feedback: 'Please fix the typo in line 42.',
      feedbackSource: 'GitHub PR comments',
    });

    expect(prompt).toContain('KAN-23');
    expect(prompt).toContain('Please fix the typo in line 42.');
    expect(prompt).toContain('GitHub PR comments');
  });

  it('omits the conflict preamble when no conflicts are passed', () => {
    const prompt = buildFixPrPrompt({
      key: 'KAN-23',
      feedback: '...',
      feedbackSource: 'stdin',
    });

    expect(prompt).not.toContain('mid-rebase');
    expect(prompt).toContain('git push --force-with-lease');
  });

  it('inserts the conflict preamble when conflictFiles are provided', () => {
    const prompt = buildFixPrPrompt({
      key: 'KAN-23',
      feedback: '...',
      feedbackSource: 'stdin',
      conflictFiles: ['src/foo.ts', 'src/bar.ts'],
    });

    expect(prompt).toContain('mid-rebase');
    expect(prompt).toContain('src/foo.ts');
    expect(prompt).toContain('src/bar.ts');
    expect(prompt).toContain('DO NOT PUSH this run');
  });
});
