import { startCommandHint } from '../playwright/index.js';
import { render } from './render.js';
import { renderUserMessageBlock } from './user-message.js';

export interface PlaywrightPromptOptions {
  appUrl: string;
  startCommand?: string;
  smoke?: boolean;
  authored?: {
    testsDir: string;
    testCommand: string;
    /** When true, the agent is told crew runs the e2e suite externally
     * after handoff (and resumes them with the failure output if it fails). */
    verifyAfterRun?: boolean;
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
  userMessage?: string;
  /** When true, render a one-line disclosure telling the agent the docker
   * stack is unavailable so they call out the gap in the PR description
   * rather than silently shipping. */
  dockerUnavailable?: boolean;
}

export function buildTicketPrompt(opts: BuildTicketPromptOptions): string {
  return render('ticket', {
    key: opts.key,
    githubRepo: opts.githubRepo,
    jiraSite: opts.jiraSite,
    playwrightBlock: buildPlaywrightBlock(opts.playwright),
    brunoSmokeBlock: buildBrunoSmokeBlock(opts.brunoSmoke),
    discoveredSkillsBlock: opts.discoveredSkillsBlock ?? '',
    userMessageBlock: renderUserMessageBlock(opts.userMessage),
    dockerUnavailableBlock: opts.dockerUnavailable
      ? '\n\n> **Docker stack is not available for this run.** The application is not reachable, so any verification that needs the running stack (e2e, bruno smoke, manual checks) cannot run. Surface this gap in the PR description as an uncompleted test item rather than silently shipping.'
      : '',
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
      externalGateBlock: pw.authored.verifyAfterRun
        ? '\n\n**Crew runs `' +
          pw.authored.testCommand +
          '` externally** after your transcript stream resolves and will resume you with the captured output if it fails. You do not need to run it yourself from inside the sandbox — the host runner has full reachability to the docker stack at ' +
          pw.appUrl +
          ' that the sandbox does not.'
        : '',
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
