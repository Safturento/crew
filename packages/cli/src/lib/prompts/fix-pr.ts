import { buildRebasePreamble } from './rebase-preamble.js';
import { render } from './render.js';
import { buildSandboxNetworkBlock } from './sandbox-network-note.js';
import type { BrunoSmokePromptOptions } from './ticket.js';

export interface PlaywrightFixPrOptions {
  appUrl: string;
  authored?: { testsDir: string; testCommand: string };
}

export interface BuildFixPrPromptOptions {
  key: string;
  feedback: string;
  feedbackSource: string;
  baseBranch?: string;
  playwright?: PlaywrightFixPrOptions;
  brunoSmoke?: BrunoSmokePromptOptions;
  playwrightEnabled?: boolean;
}

export function buildFixPrPrompt(opts: BuildFixPrPromptOptions): string {
  const baseBranch = opts.baseBranch ?? 'main';
  const rebasePreamble = buildRebasePreamble({
    key: opts.key,
    baseBranch,
    playwrightEnabled: opts.playwrightEnabled ?? false,
  });
  return render('fix-pr', {
    key: opts.key,
    feedback: opts.feedback,
    feedbackSource: opts.feedbackSource,
    rebasePreamble,
    playwrightBlock: buildPlaywrightFixPrBlock(opts.playwright),
    brunoSmokeBlock: buildBrunoSmokeBlock(opts.brunoSmoke),
    sandboxNetworkBlock: buildSandboxNetworkBlock({
      key: opts.key,
      appUrl: opts.playwright?.appUrl ?? opts.brunoSmoke?.baseUrl,
      hasBrunoSmoke: Boolean(opts.brunoSmoke),
      authoredTestCommand: opts.playwright?.authored?.testCommand,
    }),
  });
}

function buildPlaywrightFixPrBlock(pw: PlaywrightFixPrOptions | undefined): string {
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
