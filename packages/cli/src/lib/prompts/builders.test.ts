import { describe, it, expect } from 'vitest';
import { buildTicketPrompt, buildFixPrPrompt } from './index.js';
import { renderDiscoveredSkillsBlock } from './skills.js';

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

  it('matches the baseline snapshot when playwright is omitted', () => {
    const prompt = buildTicketPrompt({
      key: 'KAN-23',
      githubRepo: 'Safturento/Recipes',
      jiraSite: 'https://safturento.atlassian.net',
    });
    expect(prompt).toMatchSnapshot();
  });

  it('renders identically when playwright is undefined as when omitted', () => {
    const a = buildTicketPrompt({
      key: 'KAN-23',
      githubRepo: 'Safturento/Recipes',
      jiraSite: 'https://safturento.atlassian.net',
    });
    const b = buildTicketPrompt({
      key: 'KAN-23',
      githubRepo: 'Safturento/Recipes',
      jiraSite: 'https://safturento.atlassian.net',
      playwright: undefined,
    });
    expect(a).toBe(b);
  });

  it('includes the user-message block when userMessage is provided', () => {
    const prompt = buildTicketPrompt({
      key: 'KAN-23',
      githubRepo: 'Safturento/Recipes',
      jiraSite: 'https://safturento.atlassian.net',
      userMessage: 'start by looking at lib/recipe-list/',
    });
    expect(prompt).toContain('Additional context from the user');
    expect(prompt).toContain('start by looking at lib/recipe-list/');
  });

  it('omits the user-message block when userMessage is undefined', () => {
    const prompt = buildTicketPrompt({
      key: 'KAN-23',
      githubRepo: 'Safturento/Recipes',
      jiraSite: 'https://safturento.atlassian.net',
    });
    expect(prompt).not.toContain('Additional context from the user');
  });

  it('renders identically when userMessage is undefined as when omitted', () => {
    const a = buildTicketPrompt({
      key: 'KAN-23',
      githubRepo: 'Safturento/Recipes',
      jiraSite: 'https://safturento.atlassian.net',
    });
    const b = buildTicketPrompt({
      key: 'KAN-23',
      githubRepo: 'Safturento/Recipes',
      jiraSite: 'https://safturento.atlassian.net',
      userMessage: undefined,
    });
    expect(a).toBe(b);
  });

  it('appends the discoveredSkillsBlock after the curated bullets when populated', () => {
    const discoveredSkillsBlock = renderDiscoveredSkillsBlock([
      {
        name: 'reaching-for-backend-patterns',
        description: 'Use when implementing Node backend code that handles HTTP requests.',
        source: 'user',
      },
    ]);
    const prompt = buildTicketPrompt({
      key: 'KAN-23',
      githubRepo: 'Safturento/Recipes',
      jiraSite: 'https://safturento.atlassian.net',
      discoveredSkillsBlock,
    });

    const curatedBulletIdx = prompt.indexOf('`superpowers:requesting-code-review`');
    const userParaIdx = prompt.indexOf('user-level skills');
    expect(curatedBulletIdx).toBeGreaterThan(-1);
    expect(userParaIdx).toBeGreaterThan(curatedBulletIdx);
    expect(prompt).toContain(
      '- **`reaching-for-backend-patterns`** — Use when implementing Node backend code that handles HTTP requests.',
    );
    expect(prompt).toMatchSnapshot();
  });

  it('renders the smoke verification section when playwright.smoke is provided (docker case)', () => {
    const prompt = buildTicketPrompt({
      key: 'KAN-23',
      githubRepo: 'Safturento/Recipes',
      jiraSite: 'https://safturento.atlassian.net',
      playwright: { appUrl: 'https://localhost:18443', smoke: true },
    });
    expect(prompt).toContain('Visual smoke verification');
    expect(prompt).toContain('https://localhost:18443');
    expect(prompt).toContain('docker stack is already running');
    expect(prompt).toContain('mcp__playwright__');
    expect(prompt).toMatchSnapshot();
  });

  it('renders the smoke verification section with start_command hint (non-docker case)', () => {
    const prompt = buildTicketPrompt({
      key: 'CREW-99',
      githubRepo: 'Safturento/crew',
      jiraSite: 'https://safturento.atlassian.net',
      playwright: {
        appUrl: 'http://localhost:5173',
        startCommand: 'npm run dev --workspace=crew-dashboard',
        smoke: true,
      },
    });
    expect(prompt).toContain('http://localhost:5173');
    expect(prompt).toContain('npm run dev --workspace=crew-dashboard');
    expect(prompt).toContain('Wait for the dev server to be reachable');
    expect(prompt).toMatchSnapshot();
  });

  it('PW-off snapshot still matches the CREW-19 baseline (no regression from CREW-20)', () => {
    const prompt = buildTicketPrompt({
      key: 'KAN-23',
      githubRepo: 'Safturento/Recipes',
      jiraSite: 'https://safturento.atlassian.net',
    });
    expect(prompt).toMatchSnapshot();
  });

  it('renders the authored test section after the smoke section when both are provided', () => {
    const prompt = buildTicketPrompt({
      key: 'KAN-23',
      githubRepo: 'Safturento/Recipes',
      jiraSite: 'https://safturento.atlassian.net',
      playwright: {
        appUrl: 'https://localhost:18443',
        smoke: true,
        authored: {
          testsDir: 'tests/e2e',
          testCommand: 'npm run test:e2e',
        },
      },
    });
    expect(prompt).toContain('Visual smoke verification');
    expect(prompt).toContain('Authored Playwright test');
    expect(prompt).toContain('tests/e2e');
    expect(prompt).toContain('npm run test:e2e');

    const smokeIdx = prompt.indexOf('Visual smoke verification');
    const authoredIdx = prompt.indexOf('Authored Playwright test');
    expect(authoredIdx).toBeGreaterThan(smokeIdx);

    expect(prompt).toMatchSnapshot();
  });

  it('omits the authored section when only smoke is set', () => {
    const prompt = buildTicketPrompt({
      key: 'KAN-23',
      githubRepo: 'Safturento/Recipes',
      jiraSite: 'https://safturento.atlassian.net',
      playwright: { appUrl: 'https://localhost:18443', smoke: true },
    });
    expect(prompt).toContain('Visual smoke verification');
    expect(prompt).not.toContain('Authored Playwright test');
  });

  it('omits the authored section when playwright is undefined', () => {
    const prompt = buildTicketPrompt({
      key: 'KAN-23',
      githubRepo: 'Safturento/Recipes',
      jiraSite: 'https://safturento.atlassian.net',
    });
    expect(prompt).not.toContain('Authored Playwright test');
  });

  it('renders only the authored section when smoke is omitted (authored-only)', () => {
    const prompt = buildTicketPrompt({
      key: 'KAN-1',
      githubRepo: 'a/b',
      jiraSite: 'https://x.atlassian.net',
      playwright: {
        appUrl: 'https://localhost:18443',
        authored: { testsDir: 'tests/e2e', testCommand: 'npm run test:e2e' },
      },
    });
    expect(prompt).not.toContain('Visual smoke verification');
    expect(prompt).toContain('Authored Playwright test');
  });

  it('renders identically when brunoSmoke is undefined as when omitted', () => {
    const a = buildTicketPrompt({
      key: 'KAN-23',
      githubRepo: 'Safturento/Recipes',
      jiraSite: 'https://safturento.atlassian.net',
    });
    const b = buildTicketPrompt({
      key: 'KAN-23',
      githubRepo: 'Safturento/Recipes',
      jiraSite: 'https://safturento.atlassian.net',
      brunoSmoke: undefined,
    });
    expect(a).toBe(b);
  });

  it('renders the bruno-smoke section when brunoSmoke is provided (no smoke_user)', () => {
    const prompt = buildTicketPrompt({
      key: 'KAN-23',
      githubRepo: 'Safturento/Recipes',
      jiraSite: 'https://safturento.atlassian.net',
      brunoSmoke: {
        baseUrl: 'https://localhost:18443',
        envName: 'recipes-kan-23',
        collectionDir: 'bruno',
        hasSmokeUser: false,
      },
    });
    expect(prompt).toContain('API smoke verification (Bruno)');
    expect(prompt).toContain('https://localhost:18443');
    expect(prompt).toContain('CREW_BRUNO_ENV=recipes-kan-23');
    expect(prompt).toContain('npm run bruno:smoke');
    expect(prompt).toContain('bruno/');
    expect(prompt).not.toContain('and a test user');
    expect(prompt).toMatchSnapshot();
  });

  it('renders the testUser clause when hasSmokeUser is true', () => {
    const prompt = buildTicketPrompt({
      key: 'KAN-23',
      githubRepo: 'Safturento/Recipes',
      jiraSite: 'https://safturento.atlassian.net',
      brunoSmoke: {
        baseUrl: 'https://localhost:18443',
        envName: 'recipes-kan-23',
        collectionDir: 'bruno',
        hasSmokeUser: true,
      },
    });
    expect(prompt).toContain('and a test user');
    expect(prompt).toMatchSnapshot();
  });

  it('renders both playwright and bruno-smoke when both are provided', () => {
    const prompt = buildTicketPrompt({
      key: 'KAN-23',
      githubRepo: 'Safturento/Recipes',
      jiraSite: 'https://safturento.atlassian.net',
      playwright: { appUrl: 'https://localhost:18443', smoke: true },
      brunoSmoke: {
        baseUrl: 'https://localhost:18443',
        envName: 'recipes-kan-23',
        collectionDir: 'bruno',
        hasSmokeUser: true,
      },
    });
    expect(prompt).toContain('Visual smoke verification');
    expect(prompt).toContain('API smoke verification (Bruno)');
    const visualIdx = prompt.indexOf('Visual smoke verification');
    const brunoIdx = prompt.indexOf('API smoke verification (Bruno)');
    expect(brunoIdx).toBeGreaterThan(visualIdx);
    expect(prompt).toMatchSnapshot();
  });

  it('honours a custom collection_dir in the rendered fragment', () => {
    const prompt = buildTicketPrompt({
      key: 'KAN-23',
      githubRepo: 'Safturento/Recipes',
      jiraSite: 'https://safturento.atlassian.net',
      brunoSmoke: {
        baseUrl: 'http://localhost:3000',
        envName: 'recipes',
        collectionDir: 'api-tests',
        hasSmokeUser: false,
      },
    });
    expect(prompt).toContain('api-tests/');
    expect(prompt).not.toContain('`bruno/`');
  });

  it('mandates the final-report echo contract (CREW-73)', () => {
    const prompt = buildTicketPrompt({
      key: 'KAN-23',
      githubRepo: 'Safturento/Recipes',
      jiraSite: 'https://safturento.atlassian.net',
    });
    expect(prompt).toContain('echo "→ PR $(gh pr view');
    expect(prompt).toContain('--head KAN-23');
    expect(prompt).toContain('→ no-pr:');
    const inReviewIdx = prompt.indexOf('In Review');
    const finalReportIdx = prompt.indexOf('Final report');
    expect(finalReportIdx).toBeGreaterThan(inReviewIdx);
  });

  it('renders the external-gate disclosure on the authored block when verifyAfterRun is true', () => {
    const prompt = buildTicketPrompt({
      key: 'KAN-23',
      githubRepo: 'Safturento/Recipes',
      jiraSite: 'https://safturento.atlassian.net',
      playwright: {
        appUrl: 'https://localhost:18443',
        authored: {
          testsDir: 'tests/e2e',
          testCommand: 'npm run test:e2e',
          verifyAfterRun: true,
        },
      },
    });
    expect(prompt).toContain('Authored Playwright test');
    expect(prompt).toContain('Crew runs');
    expect(prompt).toContain('externally');
    expect(prompt).not.toContain('Sandbox limitation');
  });

  it('omits the external-gate disclosure when verifyAfterRun is undefined or false', () => {
    const prompt = buildTicketPrompt({
      key: 'KAN-23',
      githubRepo: 'Safturento/Recipes',
      jiraSite: 'https://safturento.atlassian.net',
      playwright: {
        appUrl: 'https://localhost:18443',
        authored: {
          testsDir: 'tests/e2e',
          testCommand: 'npm run test:e2e',
        },
      },
    });
    expect(prompt).not.toMatch(/Crew runs.*externally/);
  });

  it('renders a docker_unavailable disclosure when dockerUnavailable is true', () => {
    const prompt = buildTicketPrompt({
      key: 'KAN-23',
      githubRepo: 'Safturento/Recipes',
      jiraSite: 'https://safturento.atlassian.net',
      dockerUnavailable: true,
    });
    expect(prompt).toContain('Docker stack is not available');
    expect(prompt).toContain('PR description');
  });

  it('omits the docker_unavailable disclosure by default', () => {
    const prompt = buildTicketPrompt({
      key: 'KAN-23',
      githubRepo: 'Safturento/Recipes',
      jiraSite: 'https://safturento.atlassian.net',
    });
    expect(prompt).not.toContain('Docker stack is not available');
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

  it('renders the discovered skills block under the curated Skills list', () => {
    const prompt = buildFixPrPrompt({
      key: 'KAN-23',
      feedback: 'Some feedback',
      feedbackSource: 'manual test',
      discoveredSkillsBlock:
        "\n\nThe following user-level skills are equally required when their description matches what you're about to do — invoke them via the `Skill` tool the same way:\n\n- **`reaching-for-frontend-libraries`** — Use when implementing frontend features.",
    });

    expect(prompt).toContain('superpowers:requesting-code-review');
    expect(prompt).toContain('reaching-for-frontend-libraries');
    const curatedIdx = prompt.indexOf('superpowers:requesting-code-review');
    const discoveredIdx = prompt.indexOf('reaching-for-frontend-libraries');
    expect(discoveredIdx).toBeGreaterThan(curatedIdx);
  });

  it('renders identically when brunoSmoke is undefined as when omitted', () => {
    const a = buildFixPrPrompt({
      key: 'KAN-23',
      feedback: 'fix the typo',
      feedbackSource: 'stdin',
    });
    const b = buildFixPrPrompt({
      key: 'KAN-23',
      feedback: 'fix the typo',
      feedbackSource: 'stdin',
      brunoSmoke: undefined,
    });
    expect(a).toBe(b);
  });

  it('renders the bruno-smoke section when brunoSmoke is provided', () => {
    const prompt = buildFixPrPrompt({
      key: 'KAN-23',
      feedback: 'rename the field from x to y',
      feedbackSource: 'GitHub PR comments',
      brunoSmoke: {
        baseUrl: 'https://localhost:18443',
        envName: 'recipes-kan-23',
        collectionDir: 'bruno',
        hasSmokeUser: true,
      },
    });
    expect(prompt).toContain('API smoke verification (Bruno)');
    expect(prompt).toContain('https://localhost:18443');
    expect(prompt).toContain('CREW_BRUNO_ENV=recipes-kan-23');
    expect(prompt).toContain('npm run bruno:smoke');
    expect(prompt).toMatchSnapshot();
  });

  it('renders identically when playwright is undefined as when omitted', () => {
    const a = buildFixPrPrompt({
      key: 'KAN-23',
      feedback: 'fix the typo',
      feedbackSource: 'stdin',
    });
    const b = buildFixPrPrompt({
      key: 'KAN-23',
      feedback: 'fix the typo',
      feedbackSource: 'stdin',
      playwright: undefined,
    });
    expect(a).toBe(b);
  });

  it('omits the playwright block when playwright is not provided', () => {
    const prompt = buildFixPrPrompt({
      key: 'KAN-23',
      feedback: 'fix it',
      feedbackSource: 'stdin',
    });
    expect(prompt).not.toContain('Playwright e2e');
  });

  it('renders the playwright block (smoke-only / no authored)', () => {
    const prompt = buildFixPrPrompt({
      key: 'KAN-23',
      feedback: 'fix it',
      feedbackSource: 'stdin',
      playwright: { appUrl: 'https://localhost:8443' },
    });
    expect(prompt).toContain('Playwright e2e');
    expect(prompt).toContain('https://localhost:8443');
    expect(prompt).toContain('Do not run `npm run docker:up`');
    expect(prompt).toContain('Do not run `npx playwright install`');
    expect(prompt).not.toContain('authors Playwright tests under');
    expect(prompt).toMatchSnapshot();
  });

  it('renders the authored clause when playwright.authored is set', () => {
    const prompt = buildFixPrPrompt({
      key: 'KAN-23',
      feedback: 'fix it',
      feedbackSource: 'stdin',
      playwright: {
        appUrl: 'https://localhost:8443',
        authored: { testsDir: 'tests/e2e', testCommand: 'npm run test:e2e' },
      },
    });
    expect(prompt).toContain('authors Playwright tests under **tests/e2e/**');
    expect(prompt).toContain('npm run test:e2e');
    expect(prompt).toMatchSnapshot();
  });

  it('renders the playwright block before the Apply the fixes section', () => {
    const prompt = buildFixPrPrompt({
      key: 'KAN-23',
      feedback: 'fix the typo',
      feedbackSource: 'stdin',
      playwright: { appUrl: 'https://localhost:8443' },
    });
    const pwIdx = prompt.indexOf('Playwright e2e');
    const fixesIdx = prompt.indexOf('Apply the fixes');
    expect(pwIdx).toBeGreaterThan(-1);
    expect(fixesIdx).toBeGreaterThan(pwIdx);
  });

  it('renders both playwright and bruno-smoke when both are provided', () => {
    const prompt = buildFixPrPrompt({
      key: 'KAN-23',
      feedback: 'fix the typo',
      feedbackSource: 'stdin',
      playwright: { appUrl: 'https://localhost:8443' },
      brunoSmoke: {
        baseUrl: 'https://localhost:8443',
        envName: 'recipes-kan-23',
        collectionDir: 'bruno',
        hasSmokeUser: false,
      },
    });
    expect(prompt).toContain('Playwright e2e');
    expect(prompt).toContain('API smoke verification (Bruno)');
    const pwIdx = prompt.indexOf('Playwright e2e');
    const brunoIdx = prompt.indexOf('API smoke verification (Bruno)');
    expect(brunoIdx).toBeGreaterThan(pwIdx);
  });

  it('renders the bruno-smoke block before the Apply the fixes section', () => {
    const prompt = buildFixPrPrompt({
      key: 'KAN-23',
      feedback: 'fix the typo',
      feedbackSource: 'stdin',
      brunoSmoke: {
        baseUrl: 'http://localhost:3000',
        envName: 'recipes',
        collectionDir: 'bruno',
        hasSmokeUser: false,
      },
    });
    const brunoIdx = prompt.indexOf('API smoke verification (Bruno)');
    const fixesIdx = prompt.indexOf('Apply the fixes');
    expect(brunoIdx).toBeGreaterThan(-1);
    expect(fixesIdx).toBeGreaterThan(brunoIdx);
  });

  it('mandates the final-report echo contract (CREW-73)', () => {
    const prompt = buildFixPrPrompt({
      key: 'KAN-23',
      feedback: '...',
      feedbackSource: 'stdin',
    });
    expect(prompt).toContain('echo "→ PR $(gh pr view');
    expect(prompt).toContain('--head KAN-23');
    const fixesIdx = prompt.indexOf('Apply the fixes');
    const finalReportIdx = prompt.indexOf('Final report');
    expect(finalReportIdx).toBeGreaterThan(fixesIdx);
  });
});
