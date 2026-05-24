# CREW-199 — Auto-push fix-pr results

**Ticket:** [CREW-199](https://safturento.atlassian.net/browse/CREW-199)
**Epic:** [CREW-197 — Fix-pr workflow improvements](https://safturento.atlassian.net/browse/CREW-197)
**Soft-depends:** [CREW-198](https://safturento.atlassian.net/browse/CREW-198) (for the state cycle that the push completes)
**Date:** 2026-05-23

## Goal

Today the user has to manually `git push --force-with-lease` after every fix-pr session. The agent should do this itself at the end of a successful fix-pr run, so the user just runs `crew fix-pr <KEY>` and walks away — when it returns, the PR branch is updated.

Combined with [CREW-198](https://safturento.atlassian.net/browse/CREW-198)'s state cycle, the full flow becomes:

```
pr_open (initial)
  → user runs `crew fix-pr KEY`
  → first tool_call from new run_id → pr_open → running
  → agent iterates...
  → agent's final step: git push --force-with-lease
  → run completes → running → pr_open
```

## Non-goals

- **Detecting push failures and transitioning to error.** Existing error pathways handle bash-tool failures; push errors would show up there. We don't add a special "push failed" state.
- **Auto-merge on green CI.** Out of scope per the Epic.
- **Auto-comment on the PR after push.** Out of scope.
- **Push with a different remote / branch than the worktree's current.** Use whatever the worktree's tracking branch is.

## Design (brainstormed 2026-05-23)

| Q | Decision |
|---|---|
| Who pushes? | **The agent itself**, via a fix-pr prompt addition. Agent already has Bash. Push becomes a tool_call in the transcript → visible in the drawer Timeline. |
| Push command | **`git push --force-with-lease`**. Force-overwrites the remote branch but refuses if someone else pushed concurrent commits. Standard for fix-pr's rebase/amend-style workflow. |
| When to push | At the end of the session, only if there are commits to push (skip otherwise — agent might decide it can't fix the issue and exit without committing). |

## Architecture

### Prompt-template extension

`packages/cli/src/lib/prompts/fix-pr.ts` builds the fix-pr prompt. Add a closing-step section:

```ts
// rendered into the prompt before the closing handoff
const PUSH_STEP = `
## Closing your session

When you've finished addressing the review feedback:

1. Run \`git log @{upstream}..HEAD --oneline\` to see what commits you have ahead of the remote.
2. If there are commits, push them with:

   \`\`\`bash
   git push --force-with-lease
   \`\`\`

   \`--force-with-lease\` is required because fix-pr sessions typically rebase or amend; \`-f\` is wrong because it can clobber concurrent pushes the user made.

3. If there are no commits to push (you didn't make any changes), don't push — just exit. Add a brief comment to the PR explaining you couldn't address the feedback.

Do not skip the push step on a successful session — the user is relying on the agent to deliver the result back to the PR branch.
`;
```

(Exact format / wording: per project's existing prompt style — see other `lib/prompts/*.ts` for tone calibration.)

### Detection of "should push or not"

Push only when commits exist:

```bash
git log @{upstream}..HEAD --oneline
```

Empty → no push. Non-empty → push.

This guard prevents:
- Empty fix-pr sessions (agent decided no changes were needed) from pushing nothing
- Push failures from "nothing to push" scenarios

### Failure handling

Push failure (e.g. branch protection, network, force-with-lease refused) renders as a failed Bash tool_call with error in tool_result. Surfaces as a normal error in the timeline; no special state. User can re-run fix-pr to retry.

The prompt doesn't tell the agent to retry the push on failure — that's the user's call. Avoids infinite-retry loops on persistent failures.

### Interaction with CREW-198 (state cycle)

The push itself doesn't fire any state transition. The transition fires on run completion — see [CREW-198](https://safturento.atlassian.net/browse/CREW-198)'s `recordRunCompleted`. CREW-199 is purely about getting the push to happen; the state-cycle wiring is CREW-198's job.

If CREW-198 hasn't landed first: CREW-199 still works (agent pushes), but the drawer state stays at "running" until the run completes via CREW-198's mechanism. Soft dependency.

## Testing

`packages/cli/src/lib/prompts/fix-pr.test.ts` (or equivalent):

```ts
it('fix-pr prompt includes the push closing step', () => {
  const prompt = buildFixPrPrompt({ /* fixture args */ });
  expect(prompt).toContain('git push --force-with-lease');
  expect(prompt).toContain('git log @{upstream}..HEAD');
});

it('fix-pr prompt explains why force-with-lease over -f', () => {
  const prompt = buildFixPrPrompt({ /* fixture args */ });
  expect(prompt).toMatch(/force-with-lease.*concurrent/i);
});

it('fix-pr prompt instructs agent NOT to push when no commits exist', () => {
  const prompt = buildFixPrPrompt({ /* fixture args */ });
  expect(prompt).toMatch(/no commits to push.*don't push/i);
});
```

### Manual smoke

After implementation, run `crew fix-pr` on a real PR. Confirm:
- Agent runs through the fix-pr work as before
- At the end, agent runs `git log @{upstream}..HEAD --oneline`
- If commits exist, agent runs `git push --force-with-lease`
- PR branch on GitHub shows the agent's commits without manual intervention

## Out of scope

- Custom push branches / remotes
- Push retry logic
- Auto-comment on the PR with a summary of changes
- Detecting "no upstream" and handling it (worktrees from `crew run` always have an upstream)

## Risks

- **Agent doesn't follow the instruction.** LLMs occasionally skip closing steps. Mitigation: the prompt addition is short, explicit, and at the END of the prompt where instructions have higher follow-through. If reliability becomes an issue, add a wrapper-script fallback (option B from brainstorm) — but try prompt-only first.
- **Push happens prematurely** (agent thinks it's done, but it's not). Existing fix-pr prompt already covers "make sure the fix actually works before claiming done"; adding the push doesn't change that. If a premature push lands, the user runs fix-pr again to iterate further.
- **Branch protection blocks force-with-lease.** Some repos block force-push to PR branches. The push fails as a normal Bash tool_call error; user adjusts protection or pushes manually. Document in the prompt that this is a possibility.
- **Concurrent agent pushes (multi-fix-pr-on-same-PR).** If the user dispatches two fix-pr sessions on the same PR somehow (parallel?), both might try to push. `--force-with-lease` refuses the second one — error in the second session. This is the correct behavior; don't add coordination.
