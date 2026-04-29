import { startCommandHint } from '../visual-testing/index.js';
import { render } from './render.js';

export interface VisualTestingPromptOptions {
  appUrl: string;
  startCommand?: string;
  authored?: {
    testsDir: string;
    testCommand: string;
  };
}

export interface BuildTicketPromptOptions {
  key: string;
  githubRepo: string;
  jiraSite: string;
  visualTesting?: VisualTestingPromptOptions;
  discoveredSkillsBlock?: string;
}

export function buildTicketPrompt(opts: BuildTicketPromptOptions): string {
  return render('ticket', {
    key: opts.key,
    githubRepo: opts.githubRepo,
    jiraSite: opts.jiraSite,
    visualTestingBlock: buildVisualTestingBlock(opts.visualTesting),
    discoveredSkillsBlock: opts.discoveredSkillsBlock ?? '',
  });
}

function buildVisualTestingBlock(vt: VisualTestingPromptOptions | undefined): string {
  if (!vt) return '';
  const smoke = render('ticket-visual-smoke', {
    appUrl: vt.appUrl,
    startCommandHint: startCommandHint({
      appUrl: vt.appUrl,
      startCommand: vt.startCommand,
    }),
  });
  if (!vt.authored) return smoke;
  const authored = render('ticket-visual-authored', {
    testsDir: vt.authored.testsDir,
    testCommand: vt.authored.testCommand,
  });
  return smoke + authored;
}
