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
  // CREW-21 (γ) will append the authored fragment here when vt.authored is set.
  return smoke;
}
