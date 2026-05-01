import { render } from './render.js';
import { renderUserMessageBlock } from './user-message.js';
import type { PlaywrightFixPrOptions } from './fix-pr.js';
import type { BrunoSmokePromptOptions } from './ticket.js';

export interface BuildResumePromptOptions {
  key: string;
  branch: string;
  commitsAhead: number;
  uncommittedCount: number;
  /** Project default branch (e.g. 'main', 'master') used in the
   * "commits ahead of origin/<branch>" line. */
  defaultBranch: string;
  userMessage?: string;
  playwright?: PlaywrightFixPrOptions;
  brunoSmoke?: BrunoSmokePromptOptions;
  discoveredSkillsBlock?: string;
}

export function buildResumePrompt(opts: BuildResumePromptOptions): string {
  return render('resume', {
    key: opts.key,
    branch: opts.branch,
    commitsAhead: String(opts.commitsAhead),
    uncommittedCount: String(opts.uncommittedCount),
    defaultBranch: opts.defaultBranch,
    userMessageBlock: renderUserMessageBlock(opts.userMessage),
    playwrightBlock: buildPlaywrightBlock(opts.playwright),
    brunoSmokeBlock: buildBrunoSmokeBlock(opts.brunoSmoke),
    discoveredSkillsBlock: opts.discoveredSkillsBlock ?? '',
  });
}

function buildPlaywrightBlock(pw: PlaywrightFixPrOptions | undefined): string {
  if (!pw) return '';
  const authoredClause = pw.authored
    ? `\n- This project authors Playwright tests under **${pw.authored.testsDir}/** runnable via \`${pw.authored.testCommand}\`. If your fix touches a user-facing flow with regression value, ensure the relevant tests pass before pushing.`
    : '';
  return render('fix-pr-playwright', {
    appUrl: pw.appUrl,
    authoredClause,
  });
}

function buildBrunoSmokeBlock(bs: BrunoSmokePromptOptions | undefined): string {
  if (!bs) return '';
  return render('fix-pr-bruno-smoke', {
    baseUrl: bs.baseUrl,
    envName: bs.envName,
    collectionDir: bs.collectionDir,
  });
}
