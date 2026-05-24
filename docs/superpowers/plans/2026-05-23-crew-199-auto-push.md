# CREW-199 — Auto-push fix-pr results Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agent auto-runs `git push --force-with-lease` at the end of a successful fix-pr session if commits exist to push. Surfaces as a normal Bash tool_call in the transcript; failure surfaces as a normal Bash error.

**Architecture:** Pure prompt-template change in `packages/cli/src/lib/prompts/fix-pr.ts` — add a closing-step block. No new infra; agent already has Bash.

**Tech Stack:** TypeScript + the existing prompt-template render machinery (`render('fix-pr', ...)`).

**Spec:** [`docs/superpowers/specs/2026-05-23-crew-199-auto-push-design.md`](../specs/2026-05-23-crew-199-auto-push-design.md)
**Ticket:** [CREW-199](https://safturento.atlassian.net/browse/CREW-199) (Epic [CREW-197](https://safturento.atlassian.net/browse/CREW-197), soft-depends on [CREW-198](https://safturento.atlassian.net/browse/CREW-198))

---

## Pre-work — locate the prompt template

```bash
grep -rn "render('fix-pr'\|fix-pr.md\|fixPr" packages/cli/src --include='*.ts' --include='*.md' | head -10
```

Find the prompt template file (likely `packages/cli/src/lib/prompts/fix-pr.md` or rendered inline in `fix-pr.ts`). The `render('fix-pr', ...)` call in `fix-pr.ts:28` points at the template — note its location for Task 1.

Also inspect any existing closing-step language in the template — the new push step should fit the existing tone/structure.

---

## File Structure

| Action | Path | Responsibility |
|---|---|---|
| Modify | `packages/cli/src/lib/prompts/fix-pr.md` (or wherever `render('fix-pr')` resolves) | Add closing push step |
| Modify | `packages/cli/src/lib/prompts/fix-pr.test.ts` (create if absent) | Assert push step present + correct semantics |

---

## Task 1: Add push closing-step to the fix-pr prompt template

**Files:**
- Modify: fix-pr prompt template (located in pre-work)
- Modify: `packages/cli/src/lib/prompts/fix-pr.test.ts` (or create)

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from 'vitest';

import { buildFixPrPrompt } from './fix-pr.js';

describe('buildFixPrPrompt', () => {
  it('includes a closing-step section instructing the agent to push', () => {
    const prompt = buildFixPrPrompt(/* minimal fixture args */);
    expect(prompt).toContain('git push --force-with-lease');
  });

  it('instructs the agent to check for commits before pushing', () => {
    const prompt = buildFixPrPrompt(/* ... */);
    expect(prompt).toContain('git log @{upstream}..HEAD');
  });

  it('explains why force-with-lease (not -f)', () => {
    const prompt = buildFixPrPrompt(/* ... */);
    expect(prompt).toMatch(/force-with-lease/);
    expect(prompt).toMatch(/concurrent/i);
  });

  it('tells the agent NOT to push when no commits exist', () => {
    const prompt = buildFixPrPrompt(/* ... */);
    expect(prompt).toMatch(/(no commits|nothing to push).*don't push/i);
  });
});
```

(Adapt fixture args per the existing `buildFixPrPrompt` signature.)

- [ ] **Step 2: Run, verify fail**

```bash
npm run test:run --workspace=crew-cli -- fix-pr
```

Expected: FAIL — template doesn't include the push step.

- [ ] **Step 3: Add the closing-step block to the template**

In `fix-pr.md` (or inline string), append after the existing instructional sections — before any "good luck" / handoff closer:

```markdown
## Closing your session

When you've finished addressing the review feedback:

1. Run `git log @{upstream}..HEAD --oneline` to see what commits you have ahead of the remote.
2. If there are commits, push them with:

   ```bash
   git push --force-with-lease
   ```

   `--force-with-lease` is required because fix-pr sessions typically rebase or amend commits; plain `-f` is wrong here because it would clobber concurrent pushes the user may have made manually.

3. If there are no commits to push (you decided no changes were needed), don't push — just exit. Optionally add a brief comment to the PR explaining your reasoning.

Do not skip the push step on a successful session — the user is relying on you to deliver the result back to the PR branch. If `--force-with-lease` is refused (e.g. branch-protection rules), surface that as the final error; the user will resolve it manually.
```

Match the existing template's formatting conventions (heading levels, code-fence style, etc.).

- [ ] **Step 4: Re-run tests**

```bash
npm run test:run --workspace=crew-cli -- fix-pr
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/lib/prompts/fix-pr.md  # or wherever
git add packages/cli/src/lib/prompts/fix-pr.test.ts
git commit -m "feat(cli): fix-pr prompt instructs agent to push --force-with-lease (CREW-199)

Closing-step block at the end of the fix-pr prompt: agent checks
for commits ahead of upstream, pushes with --force-with-lease if any,
or exits cleanly if nothing to push.

Together with CREW-198 (state cycle), this completes the fix-pr UX
loop — user runs crew fix-pr KEY, walks away, returns to find the
PR branch updated and the agent back at pr_open."
```

---

## Task 2: Manual verification

- [ ] `npm run lint` — green
- [ ] `npm run typecheck` — green
- [ ] `npm run test:run --workspace=crew-cli` — green
- [ ] **Manual smoke:** dispatch a real `crew fix-pr <KEY>` (e.g. on a small known PR with one easy review comment to address). Confirm:
  - Agent runs through the fix-pr work as before
  - At the end, agent runs `git log @{upstream}..HEAD --oneline`
  - If commits exist, agent runs `git push --force-with-lease` (Bash tool_call visible in drawer Timeline)
  - PR branch on GitHub shows the new commits without user intervention
  - If CREW-198 has landed: drawer state cycles back to `pr_open` after run completes

PR title: `feat(cli): fix-pr prompt — auto-push results with force-with-lease (CREW-199)`
