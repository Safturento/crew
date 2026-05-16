You're being resumed on {{key}} after an interruption.

{{userMessageBlock}}
## Worktree state

- Branch: {{branch}}
- {{commitsAhead}} commits ahead of origin/{{defaultBranch}}
- {{uncommittedCount}} uncommitted files (preserved as-is from before the interruption)

{{playwrightBlock}}{{brunoSmokeBlock}}
{{sandboxNetworkBlock}}
## What to do

Reassess where you left off — check your last actions in this conversation, the worktree's git state, and any uncommitted changes. Then continue toward closing the ticket. If the user-supplied context above changes your direction, factor it in before resuming.

These crew-owned skills are required when their trigger fires — invoke each via the `Skill` tool:

- **`agents-doc-parity-check`** — fires before you claim work complete or open a PR in a repo with an `.agents/` directory. Scans your changed files against each `.agents/<topic>.md`'s `covers:` globs and updates any doc your change made stale.
- **`bruno-collection-maintenance`** — fires when you author or modify an HTTP route, controller, or request/response schema in a project that has a `bruno/` directory. Add or update the matching `.bru` in the same commit.
- **`visual-fidelity-check`** — fires before you claim a UI-touching task complete in a project wired to a Figma source of truth. Compares rendered output to the Figma design.

## Final report

Whatever you do — finish the work, abort, hand back — your VERY LAST action must be a single Bash printing one of:

```
echo "→ PR $(gh pr view --head {{key}} --json url --jq .url 2>/dev/null || echo none)"
echo "→ no-pr: <one-line reason>"
```

Do not emit further tool calls or prose after this.

