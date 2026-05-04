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
{{discoveredSkillsBlock}}

## Final report

Whatever you do — finish the work, abort, hand back — your VERY LAST action must be a single Bash printing one of:

```
echo "→ PR $(gh pr view --head {{key}} --json url --jq .url 2>/dev/null || echo none)"
echo "→ no-pr: <one-line reason>"
```

Do not emit further tool calls or prose after this.

