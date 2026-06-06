{{rebasePreamble}}Code review feedback on the work you have already pushed for {{key}}.
Source: {{feedbackSource}}.

---

{{feedback}}

---

## Skills

- **`superpowers:test-driven-development`** — for every feedback item that requires implementation work.
- **`superpowers:verification-before-completion`** — before pushing.
- **`superpowers:systematic-debugging`** — when something fails unexpectedly.
- **`superpowers:requesting-code-review`** — before pushing.
- **`agents-doc-parity-check`** — fires before you claim work complete or open a PR in a repo with an `.agents/` directory. Scans your changed files against each `.agents/<topic>.md`'s `covers:` globs and updates any doc your change made stale.
- **`bruno-collection-maintenance`** — fires when you author or modify an HTTP route, controller, or request/response schema in a project that has a `bruno/` directory. Add or update the matching `.bru` in the same commit.
- **`visual-fidelity-check`** — fires before you claim a UI-touching task complete in a project wired to a Figma source of truth. Compares rendered output to the Figma design.

{{playwrightBlock}}{{brunoSmokeBlock}}
{{sandboxNetworkBlock}}

## Apply the fixes

- Update implementation and tests to address each point.
- After each meaningful unit of work, `git add` and commit with a clear message referencing {{key}}.
- Run `npm run lint`, `npm run format`, `npm run typecheck`, and `npm run test:run` — all must pass before pushing.
- If a piece of feedback is wrong or you disagree with it, write your reasoning back instead of blindly applying it.
- Do NOT resolve review threads on GitHub yourself.

## Closing your session

When you've finished addressing the review feedback, deliver the result back to the PR branch before exiting:

1. Check what you have to push:

   ```
   git log @{upstream}..HEAD --oneline
   ```

2. If commits exist, push them:

   ```
   git push --force-with-lease origin {{key}}
   ```

   `--force-with-lease` is required because fix-pr sessions frequently rebase or amend commits; plain `--force` is never allowed because it would clobber concurrent pushes the user may have made manually. `--force-with-lease` refuses the push in that case so nothing gets overwritten.

3. If there are no commits to push (you decided no changes were needed, or you're aborting), don't push — just exit. You may optionally add a brief comment to the PR explaining your reasoning, but do NOT resolve review threads yourself.

Do not skip the push on a successful session — the user is relying on you to deliver the result back to the PR branch. This includes sessions where Step 0's rebase resolved conflicts: push those too (the resolution lands on the PR branch and is reviewed before merge). If `--force-with-lease` is refused (e.g. branch-protection rules, concurrent upstream commits), surface that as the final error and exit; the user will resolve it manually.

## Final report

As your VERY LAST action, run a single Bash:

```
echo "→ PR $(gh pr view --head {{key}} --json url --jq .url)"
```

Do not emit any further tool calls or prose after this. If you are aborting without pushing (e.g. unresolved disagreement, blocked by upstream), substitute:

```
echo "→ no-pr: <one-line reason>"
```
