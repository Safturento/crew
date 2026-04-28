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
}

export function buildTicketPrompt(opts: BuildTicketPromptOptions): string {
  return render('ticket', {
    key: opts.key,
    githubRepo: opts.githubRepo,
    jiraSite: opts.jiraSite,
    visualTestingBlock: buildVisualTestingBlock(opts.visualTesting),
  });
}

function buildVisualTestingBlock(_vt: VisualTestingPromptOptions | undefined): string {
  // CREW-20 (β) fills the smoke fragment; CREW-21 (γ) extends with the authored
  // fragment. For CREW-19 (α), the placeholder always renders empty.
  return '';
}
