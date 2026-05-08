## Step 0: rebase onto `origin/{{baseBranch}}` (do this FIRST, before any feedback work)

Bring `{{key}}` up to date before applying review feedback:

```
git fetch origin {{baseBranch}}
git rebase origin/{{baseBranch}}
```

If the rebase is clean (no conflicts, or already up-to-date), continue to the feedback section below — Step 0 was a silent no-op.

If the rebase produces conflicts, follow these rules before going any further:

- Read each conflicting file. Use `git log` and `git show` if needed to understand both sides' intent. Discover the affected files via `git status`.
- Resolve each conflict preserving both sides' intent where they don't directly contradict.
- After resolving a file: `git add <file>`.
- When all conflicts in the current rebase step are resolved: `git rebase --continue`. Loop until the rebase finishes.
- Run `npm run lint`, `npm run typecheck`, `npm run test:run` — ALL must pass.
- If you are not confident in a resolution: `git rebase --abort`, document the blocker in `docs/tickets/{{key}}.md` "Open questions", and exit WITHOUT applying the review feedback.
- **If you resolved conflicts during this run, DO NOT push at the end** even if everything passes. The human must inspect the rebase resolution commits before they reach origin. After your feedback fixes are committed and verified, print exactly one line and exit: `Rebase resolution + feedback ready for inspection — run 'git push --force-with-lease origin {{key}}' once you've reviewed.`

## Step 0.5: bring up the environment (do this AFTER Step 0 succeeds)

Now that the source is current with `origin/{{baseBranch}}`, bring up the docker stack and any browser dependencies:

```
docker compose up --build --wait{{playwrightInstall}}
```

If `docker compose up` fails for environmental reasons (host docker daemon down, port collision with another stack, missing CLI tools) — i.e., a failure that rebasing would not have fixed — abort with a clear message: document the blocker in `docs/tickets/{{key}}.md` "Open questions" and exit WITHOUT applying the review feedback. Do not push.

If `docker compose` itself returns a permission error — typically `/var/run/docker.sock` denied — that's a missing `excludedCommands` entry; see `docs/plans/sandbox-limitations.md`. Abort and ask the user to add the entry rather than trying to write the settings.json yourself.

**Do not reset the worktree or use any "hard" reset command** — those wipe in-progress work.

---

