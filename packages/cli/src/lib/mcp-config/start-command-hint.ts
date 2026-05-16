export function startCommandHint(opts: {
  appUrl: string;
  startCommand: string | undefined;
}): string {
  if (opts.startCommand) {
    return `Run \`${opts.startCommand}\` in the worktree. Wait for the dev server to be reachable, then proceed.`;
  }
  return `The docker stack is already running — verify with \`curl ${opts.appUrl}\` or just navigate.`;
}
