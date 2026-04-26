**You are mid-rebase.** `{{key}}` is being rebased on top of `origin/main`, and these files have unresolved conflicts that you must resolve before applying the review feedback below:

{{fileList}}

## Conflict-resolution rules (do this FIRST, before any feedback work)

- Read each conflicting file. Use `git log` and `git show` if needed to understand both sides' intent.
- Resolve each conflict preserving both sides' intent where they don't directly contradict.
- After resolving a file: `git add <file>`.
- When all conflicts in the current rebase step are resolved: `git rebase --continue`. Loop until the rebase finishes.
- Run `npm run lint`, `npm run typecheck`, `npm run test:run` — ALL must pass.
- If you are not confident in a resolution: `git rebase --abort`, document the blocker in `docs/tickets/{{key}}.md` "Open questions", and exit WITHOUT applying the review feedback.
- **DO NOT push, even if everything passes.** The human must inspect rebase resolution commits.

---

