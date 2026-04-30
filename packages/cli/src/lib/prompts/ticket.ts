import { startCommandHint } from '../playwright/index.js';
import { render } from './render.js';

export interface PlaywrightPromptOptions {
  appUrl: string;
  startCommand?: string;
  smoke?: boolean;
  authored?: {
    testsDir: string;
    testCommand: string;
  };
}

export interface BrunoSmokePromptOptions {
  baseUrl: string;
  envName: string;
  collectionDir: string;
  hasSmokeUser: boolean;
}

export interface BuildTicketPromptOptions {
  key: string;
  githubRepo: string;
  jiraSite: string;
  playwright?: PlaywrightPromptOptions;
  brunoSmoke?: BrunoSmokePromptOptions;
  discoveredSkillsBlock?: string;
}

export function buildTicketPrompt(opts: BuildTicketPromptOptions): string {
  return render('ticket', {
    key: opts.key,
    githubRepo: opts.githubRepo,
    jiraSite: opts.jiraSite,
    playwrightBlock: buildPlaywrightBlock(opts.playwright),
    brunoSmokeBlock: buildBrunoSmokeBlock(opts.brunoSmoke),
    discoveredSkillsBlock: opts.discoveredSkillsBlock ?? '',
  });
}

function buildPlaywrightBlock(pw: PlaywrightPromptOptions | undefined): string {
  if (!pw) return '';
  let out = '';
  if (pw.smoke) {
    out += render('ticket-playwright-smoke', {
      appUrl: pw.appUrl,
      startCommandHint: startCommandHint({
        appUrl: pw.appUrl,
        startCommand: pw.startCommand,
      }),
    });
  }
  if (pw.authored) {
    out += render('ticket-playwright-authored', {
      appUrl: pw.appUrl,
      testsDir: pw.authored.testsDir,
      testCommand: pw.authored.testCommand,
    });
  }
  return out;
}

function buildBrunoSmokeBlock(bs: BrunoSmokePromptOptions | undefined): string {
  if (!bs) return '';
  return render('ticket-bruno-smoke', {
    baseUrl: bs.baseUrl,
    envName: bs.envName,
    collectionDir: bs.collectionDir,
    testUserClause: bs.hasSmokeUser ? ' and a test user' : '',
  });
}
