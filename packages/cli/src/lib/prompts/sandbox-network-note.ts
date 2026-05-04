import { render } from './render.js';

export interface SandboxNetworkNoteOptions {
  key: string;
  /** [playwright].app_url or [bruno_smoke].base_url, whichever is set. */
  appUrl?: string;
  /** Set when [bruno_smoke] is configured. */
  hasBrunoSmoke: boolean;
  /** Set when [playwright].authored is configured. */
  authoredTestCommand?: string;
}

export function buildSandboxNetworkBlock(opts: SandboxNetworkNoteOptions): string {
  if (!opts.hasBrunoSmoke && !opts.authoredTestCommand) return '';

  const whitelisted: string[] = [];
  if (opts.hasBrunoSmoke) whitelisted.push('npm run bruno:smoke');
  if (opts.authoredTestCommand) whitelisted.push(opts.authoredTestCommand);

  return render('sandbox-network-note', {
    appUrl: opts.appUrl ?? '',
    whitelistedCommands: whitelisted.map((c) => `\`${c}\``).join(' and '),
    e2eCommand: opts.authoredTestCommand ?? 'npm run test:e2e',
    key: opts.key,
  });
}
