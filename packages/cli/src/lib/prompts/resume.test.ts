import { describe, it, expect } from 'vitest';
import { buildResumePrompt } from './resume.js';

describe('buildResumePrompt', () => {
  it('renders the baseline resume frame', () => {
    const prompt = buildResumePrompt({
      key: 'KAN-23',
      branch: 'KAN-23',
      commitsAhead: 2,
      uncommittedCount: 1,
      defaultBranch: 'main',
    });
    expect(prompt).toContain("You're being resumed on KAN-23");
    expect(prompt).toContain('Branch: KAN-23');
    expect(prompt).toContain('2 commits ahead of origin/main');
    expect(prompt).toContain('1 uncommitted files');
  });

  it('uses the provided defaultBranch in the rendered "commits ahead" line', () => {
    const prompt = buildResumePrompt({
      key: 'KAN-23',
      branch: 'KAN-23',
      commitsAhead: 2,
      uncommittedCount: 0,
      defaultBranch: 'develop',
    });
    expect(prompt).toContain('2 commits ahead of origin/develop');
  });

  it('omits the user-message block when userMessage is undefined', () => {
    const prompt = buildResumePrompt({
      key: 'KAN-23',
      branch: 'KAN-23',
      commitsAhead: 0,
      uncommittedCount: 0,
      defaultBranch: 'main',
    });
    expect(prompt).not.toContain('Additional context from the user');
  });

  it('includes the user-message block when userMessage is provided', () => {
    const prompt = buildResumePrompt({
      key: 'KAN-23',
      branch: 'KAN-23',
      commitsAhead: 0,
      uncommittedCount: 0,
      defaultBranch: 'main',
      userMessage: 'stop trying X, do Y instead',
    });
    expect(prompt).toContain('Additional context from the user');
    expect(prompt).toContain('stop trying X, do Y instead');
  });

  it('renders the playwright fragment when playwright is provided', () => {
    const prompt = buildResumePrompt({
      key: 'KAN-23',
      branch: 'KAN-23',
      commitsAhead: 0,
      uncommittedCount: 0,
      defaultBranch: 'main',
      playwright: { appUrl: 'https://localhost:18443' },
    });
    expect(prompt).toContain('https://localhost:18443');
    expect(prompt).toContain('Do not run `npm run docker:up`');
  });

  it('renders the bruno-smoke fragment when brunoSmoke is provided', () => {
    const prompt = buildResumePrompt({
      key: 'KAN-23',
      branch: 'KAN-23',
      commitsAhead: 0,
      uncommittedCount: 0,
      defaultBranch: 'main',
      brunoSmoke: {
        baseUrl: 'http://localhost:7773',
        envName: 'recipes-kan-23',
        collectionDir: 'bruno',
        hasSmokeUser: false,
      },
    });
    expect(prompt).toContain('recipes-kan-23');
  });

  it('renders the discoveredSkillsBlock when provided', () => {
    const prompt = buildResumePrompt({
      key: 'KAN-23',
      branch: 'KAN-23',
      commitsAhead: 0,
      uncommittedCount: 0,
      defaultBranch: 'main',
      discoveredSkillsBlock:
        '\n\nUser-level skills:\n- **`reaching-for-backend-patterns`** — Use when implementing Node backend code.',
    });
    expect(prompt).toContain('reaching-for-backend-patterns');
  });
});
