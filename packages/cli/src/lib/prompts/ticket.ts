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

// CREW-20 (β) will populate the smoke fragment from `vt`; CREW-21 (γ) will
// extend it with the authored fragment. For CREW-19 (α), the placeholder
// always renders empty regardless of input.
function buildVisualTestingBlock(vt: VisualTestingPromptOptions | undefined): string {
  if (vt === undefined) return '';
  return '';
}
