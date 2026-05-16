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
- Push with `git push --force-with-lease origin {{key}}` to extend the existing PR (unless Step 0 produced rebase-resolution commits — see the preamble's "do not push" override). Do NOT open a new PR. Plain `--force` is never allowed.
- If a piece of feedback is wrong or you disagree with it, write your reasoning back instead of blindly applying it.
- Do NOT resolve review threads on GitHub yourself.

## Final report

As your VERY LAST action, run a single Bash:

```
echo "→ PR $(gh pr view --head {{key}} --json url --jq .url)"
```

Do not emit any further tool calls or prose after this. If you are aborting without pushing (e.g. unresolved disagreement, blocked by upstream), substitute:

```
echo "→ no-pr: <one-line reason>"
```
