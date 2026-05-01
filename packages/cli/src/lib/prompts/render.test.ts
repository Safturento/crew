import { describe, it, expect } from 'vitest';
import { render } from './render.js';

describe('render', () => {
  it('substitutes a {{key}} placeholder with the matching value', () => {
    const out = render('ticket', {
      key: 'ZZZ-9',
      githubRepo: 'owner/repo',
      jiraSite: 'https://example.atlassian.net',
      playwrightBlock: '',
      brunoSmokeBlock: '',
      discoveredSkillsBlock: '',
      userMessageBlock: '',
    });

    expect(out).toContain('ZZZ-9');
    expect(out).toContain('owner/repo');
    expect(out).toContain('https://example.atlassian.net');
  });

  it('replaces every occurrence of a placeholder, not just the first', () => {
    const out = render('ticket', {
      key: 'ZZZ-9',
      githubRepo: 'owner/repo',
      jiraSite: 'https://example.atlassian.net',
      playwrightBlock: '',
      brunoSmokeBlock: '',
      discoveredSkillsBlock: '',
      userMessageBlock: '',
    });

    // The ticket template references {{key}} many times; ensure no `{{key}}`
    // literal survives substitution.
    expect(out).not.toMatch(/\{\{key\}\}/);
  });

  it('throws when a placeholder has no matching var (loud failure)', () => {
    expect(() =>
      render('ticket', {
        key: 'ZZZ-9',
        // intentionally omitting githubRepo, jiraSite, playwrightBlock,
        // brunoSmokeBlock, discoveredSkillsBlock, userMessageBlock
      }),
    ).toThrow(
      /githubRepo|jiraSite|playwrightBlock|brunoSmokeBlock|discoveredSkillsBlock|userMessageBlock/,
    );
  });

  it('throws when the template name does not exist', () => {
    expect(() => render('does-not-exist', {})).toThrow();
  });
});
