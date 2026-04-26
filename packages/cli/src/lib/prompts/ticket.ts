import { render } from './render.js';

export interface BuildTicketPromptOptions {
  key: string;
  githubRepo: string;
  jiraSite: string;
}

export function buildTicketPrompt(opts: BuildTicketPromptOptions): string {
  return render('ticket', {
    key: opts.key,
    githubRepo: opts.githubRepo,
    jiraSite: opts.jiraSite,
  });
}
