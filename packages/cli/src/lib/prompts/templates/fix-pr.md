{{conflictPreamble}}Code review feedback on the work you have already pushed for {{key}}.
Source: {{feedbackSource}}.

---

{{feedback}}

---

## Skills

- **`superpowers:test-driven-development`** — for every feedback item that requires implementation work.
- **`superpowers:verification-before-completion`** — before pushing.
- **`superpowers:systematic-debugging`** — when something fails unexpectedly.
- **`superpowers:requesting-code-review`** — before pushing.{{discoveredSkillsBlock}}

{{playwrightBlock}}{{brunoSmokeBlock}}

## Apply the fixes

- Update implementation and tests to address each point.
- After each meaningful unit of work, `git add` and commit with a clear message referencing {{key}}.
- Run `npm run lint`, `npm run format`, `npm run typecheck`, and `npm run test:run` — all must pass before pushing.
- {{pushDirective}}
- If a piece of feedback is wrong or you disagree with it, write your reasoning back instead of blindly applying it.
- Do NOT resolve review threads on GitHub yourself.
