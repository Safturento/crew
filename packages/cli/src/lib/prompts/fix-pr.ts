export interface BuildFixPrPromptOptions {
  key: string;
  feedback: string;
  feedbackSource: string;
  conflictFiles?: string[];
}

export function buildFixPrPrompt(opts: BuildFixPrPromptOptions): string {
  const hasConflicts = !!opts.conflictFiles && opts.conflictFiles.length > 0;
  const conflictPreamble = hasConflicts ? buildConflictPreamble(opts) : '';
  const pushDirective = hasConflicts
    ? `**DO NOT PUSH this run.** Conflicts were resolved during the rebase, so the human must inspect the resolution commits before they reach origin. After your feedback fixes are committed and verified, print exactly one line and exit: "Rebase resolution + feedback ready for inspection — run 'git push --force-with-lease origin ${opts.key}' once you've reviewed."`
    : `Push with \`git push --force-with-lease origin ${opts.key}\` to extend the existing PR. Do NOT open a new PR. Plain \`--force\` is never allowed.`;

  return `${conflictPreamble}Code review feedback on the work you have already pushed for ${opts.key}.
Source: ${opts.feedbackSource}.

---

${opts.feedback}

---

## Skills

- **\`superpowers:test-driven-development\`** — for every feedback item that requires implementation work.
- **\`superpowers:verification-before-completion\`** — before pushing.
- **\`superpowers:systematic-debugging\`** — when something fails unexpectedly.
- **\`superpowers:requesting-code-review\`** — before pushing.

## Apply the fixes

- Update implementation and tests to address each point.
- After each meaningful unit of work, \`git add\` and commit with a clear message referencing ${opts.key}.
- Run \`npm run lint\`, \`npm run format\`, \`npm run typecheck\`, and \`npm run test:run\` — all must pass before pushing.
- ${pushDirective}
- If a piece of feedback is wrong or you disagree with it, write your reasoning back instead of blindly applying it.
- Do NOT resolve review threads on GitHub yourself.
`;
}

function buildConflictPreamble(opts: BuildFixPrPromptOptions): string {
  const fileList = (opts.conflictFiles ?? []).map((f) => `- ${f}`).join('\n');
  return `**You are mid-rebase.** \`${opts.key}\` is being rebased on top of \`origin/main\`, and these files have unresolved conflicts that you must resolve before applying the review feedback below:

${fileList}

## Conflict-resolution rules (do this FIRST, before any feedback work)

- Read each conflicting file. Use \`git log\` and \`git show\` if needed to understand both sides' intent.
- Resolve each conflict preserving both sides' intent where they don't directly contradict.
- After resolving a file: \`git add <file>\`.
- When all conflicts in the current rebase step are resolved: \`git rebase --continue\`. Loop until the rebase finishes.
- Run \`npm run lint\`, \`npm run typecheck\`, \`npm run test:run\` — ALL must pass.
- If you are not confident in a resolution: \`git rebase --abort\`, document the blocker in \`docs/tickets/${opts.key}.md\` "Open questions", and exit WITHOUT applying the review feedback.
- **DO NOT push, even if everything passes.** The human must inspect rebase resolution commits.

---

`;
}
