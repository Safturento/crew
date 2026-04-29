import { render } from './render.js';
import type { BrunoSmokePromptOptions } from './ticket.js';

export interface BuildFixPrPromptOptions {
  key: string;
  feedback: string;
  feedbackSource: string;
  conflictFiles?: string[];
  brunoSmoke?: BrunoSmokePromptOptions;
  discoveredSkillsBlock?: string;
}

export function buildFixPrPrompt(opts: BuildFixPrPromptOptions): string {
  const conflictFiles = opts.conflictFiles ?? [];
  const hasConflicts = conflictFiles.length > 0;
  const conflictPreamble = hasConflicts
    ? render('conflict-preamble', {
        key: opts.key,
        fileList: conflictFiles.map((f) => `- ${f}`).join('\n'),
      })
    : '';
  const pushDirective = hasConflicts
    ? `**DO NOT PUSH this run.** Conflicts were resolved during the rebase, so the human must inspect the resolution commits before they reach origin. After your feedback fixes are committed and verified, print exactly one line and exit: "Rebase resolution + feedback ready for inspection — run 'git push --force-with-lease origin ${opts.key}' once you've reviewed."`
    : `Push with \`git push --force-with-lease origin ${opts.key}\` to extend the existing PR. Do NOT open a new PR. Plain \`--force\` is never allowed.`;
  return render('fix-pr', {
    key: opts.key,
    feedback: opts.feedback,
    feedbackSource: opts.feedbackSource,
    conflictPreamble,
    pushDirective,
    brunoSmokeBlock: buildBrunoSmokeBlock(opts.brunoSmoke),
    discoveredSkillsBlock: opts.discoveredSkillsBlock ?? '',
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
