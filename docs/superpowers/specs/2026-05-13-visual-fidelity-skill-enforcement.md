# Visual-fidelity-check skill enforcement

## Context

The `visual-fidelity-check` skill is a comprehensive pre-completion gate for UI work in projects with a Figma source of truth. It runs structural / caller / visual checks and surfaces mismatches that test-pass + eyeball-smoke misses. Its content is in good shape.

The skill is not firing in autonomous `crew run` dispatches.

The CREW-135 re-dispatch (PR #188, May 12 2026) shipped with three confirmed regressions a working gate would have caught — Badge `intensity="muted"` instead of `mid` in `AgentRow`, CSS dot where Figma defines a lucide `Icon` INSTANCE_SWAP, literal `↗` Unicode glyph where Figma uses a leading lucide icon. The session transcript shows three skill invocations (`executing-plans`, `verification-before-completion`, `requesting-code-review`) and zero invocations of `visual-fidelity-check`.

The skill *is* referenced in the dispatch run-prompt, in two places:

1. Auto-rendered into the user-level skills list (alongside `mumen`, `reaching-for-backend-patterns`, etc.) by `packages/cli/src/lib/prompts/skills.ts`.
2. As `{{visualFidelityBlock}}`, rendered between numbered workflow steps 7 (Execute) and 8 (Verify) in the dispatch template `ticket.md`.

Neither location is a *numbered workflow step*. The agent reliably worked through numbered steps 1 → 10. The visual-fidelity guidance sat in the gap between Execute and Verify as advisory prose and got skipped, while the adjacent numbered step 8 (Verify, which names `verification-before-completion`) fired normally.

The pattern: dispatched agents treat numbered workflow steps as a sequence to execute and treat prose between them as background information.

This spec is **B1** (the lighter, prose + hook fix). A follow-up **B2** will close the screenshot-capture loop via `superpowers-chrome` integration so the skill's optional Step 5 (rendered-vs-Figma comparison) becomes fully autonomous. B2 has its own spec to be written later.

## Goals

1. The `visual-fidelity-check` skill fires on every UI-touching `crew run` dispatch in a project that has visual-fidelity wired up — without relying on the agent's good judgment about which skills "match what it's about to do".
2. The enforcement is two-layered: prompt-level structure makes the gate the obvious next step; a hook-level hard gate blocks PR creation if the skill silently didn't fire.
3. The gate's purpose is distinct from `verification-before-completion` in plain language, so an agent that just ran one doesn't conflate it with the other.

## Non-goals

- Autonomous rendered-screenshot capture. That's B2.
- Changing the skill's content (workflow, examples, findings format). The skill itself is in good shape — this is a discipline/enforcement fix, not a content fix.
- Cross-platform hook portability (Windows-native). The user works on WSL/Linux; bash is acceptable for hook scripts.

## Design

### Change B1.1 — Promote visual-fidelity to a numbered workflow step

> **Project-specific:** edits land in `packages/cli/src/lib/prompts/templates/ticket.md` and `packages/cli/src/lib/prompts/templates/ticket-visual-fidelity.md`.

`ticket-visual-fidelity.md` currently renders a `## Visual-fidelity verification` section between numbered steps. Restructure so the same content renders as an explicit numbered step inside the workflow:

```
8. **Visual fidelity gate** (UI-touching changes only).
   Invoke `visual-fidelity-check`. The skill compares your rendered work
   against the Figma snapshot at {{snapshotPath}}. Fix any high-severity
   findings before proceeding; surface medium/low in the PR description.
   Fail-closed: if the snapshot is missing or the gate can't run, stop
   and surface the blocker. This step is required IN ADDITION TO step 9
   (Verify) — that step covers tests/lint/build; this one covers visual
   fidelity. They are not interchangeable. Running one does not replace
   the other.

9. **Verify.** Invoke `superpowers:verification-before-completion`...
10. **Self-review.** ...
11. **Push and PR.** ...
12. **Move {{key}} to "In Review".**
13. **Final report.** ...
```

The "UI-touching changes only" qualifier is necessary — not every dispatch touches the frontend. Detection mirrors the existing block's conditional rendering: the project must have `<repo>/.crew/visual-fidelity.json` or a `[visual_fidelity]` block in its crew TOML for the step to render. Backend-only dispatches see steps 8 (Verify), 9 (Self-review), 10 (Push and PR), etc.

The block's existing copy (snapshot path, "fail-closed" framing) moves into the new step's body. The renumbering of subsequent steps cascades through `ticket.md`.

### Change B1.2 — Skill source-of-truth in the repo, dispatcher injects into worktrees

The skill currently lives only at the user-level path `~/.claude/skills/visual-fidelity-check/`. That makes it invisible to:

- Anyone cloning the crew repo to a fresh machine (they won't have the skill).
- Any dispatched agent that doesn't share the original developer's `~/.claude/skills/` (e.g., CI, a different machine, a teammate's box).

Moving it directly into `<repo>/.claude/skills/visual-fidelity-check/` would solve the cloning problem, but is blocked by the Claude Code sandbox — both that path and `~/.claude/skills/` are in the sandbox's `denyWithinAllow` list, so an agent cannot write skill files there. The dispatched implementation agent would hit the same block whenever the skill needs editing.

The architectural fix: **the skill's source-of-truth moves to a path the crew CLI dispatcher controls, outside the sandbox-blocked `.claude/` tree.** The dispatcher (which runs as the user's own process, outside the agent sandbox) copies the skill files into each dispatched worktree's `.claude/skills/` before the agent boots — same mechanism settings.json injection uses today.

> **Project-specific:** new source-of-truth path is `packages/cli/src/lib/skills/visual-fidelity-check/` (mirrors the layout pattern of `packages/cli/src/lib/figma-snapshot/`, `packages/cli/src/lib/bruno-smoke/`, etc.). Files:
> ```
> packages/cli/src/lib/skills/visual-fidelity-check/
>   SKILL.md
>   workflow.md
>   examples/
>     findings-report-example.md
>     good-report-example.md
> ```

The skill files are committed at this path as part of this docs PR (they exist on the docs branch already; the implementation PR doesn't need to materialize them itself).

The crew CLI dispatcher gains a new pre-spawn step (alongside the existing `excludedCommands` / `bruno/environments/` materialization) that:

1. Discovers skill directories under `packages/cli/src/lib/skills/`.
2. Filters to skills the project should receive (e.g., `visual-fidelity-check` only injects when the project has visual-fidelity config — `<repo>/.crew/visual-fidelity.json` or `[visual_fidelity]` TOML).
3. Copies each selected skill directory into the worktree at `<worktree>/.claude/skills/<skill-name>/`.

The dispatched agent then auto-discovers the skill via the existing project-level skill mechanism in `packages/cli/src/lib/prompts/skills.ts` (`readSkillsFromRoot(join(opts.repoPath, '.claude', 'skills'), 'project')`).

The SKILL.md description sharpening — appending *"Required IN ADDITION TO `superpowers:verification-before-completion` — that skill covers tests, lint, and build correctness; this one covers visual fidelity. They are not interchangeable. Running one does not replace the other."* — applies to the source-of-truth at the new location.

The phrasing is position-agnostic: if the workflow order ever flips (visual-fidelity after Verify instead of before), the wording remains correct. The point is purpose, not sequencing.

#### Local developer access

For developers working on the crew repo locally (not via a dispatched worktree), the skill needs to be discoverable. Three viable patterns:

1. **Manual user-level copy** — developer keeps `~/.claude/skills/visual-fidelity-check/` as a developer-convenience copy, syncs it manually when the source-of-truth changes. Simple, no tooling, but drifts.
2. **Repo-level symlink** — `.claude/skills/visual-fidelity-check` → `../../packages/cli/src/lib/skills/visual-fidelity-check`. Blocked by the same sandbox restriction during normal dev, but `npm run` scripts ride outside the sandbox and can create it via a postinstall step. The symlink itself stays out of git (`.claude/skills/` is already gitignored / device-masked).
3. **Defer the local-dev question** — accept that local devs need a manual copy until the symlink/postinstall is wired. Worktree dispatches still work because the dispatcher does the injection. Followup spec covers the local-dev ergonomics if it becomes painful.

Recommendation: **defer (option 3) for B1**. The injection path solves the load-bearing problem (autonomous dispatches getting the skill). Local-dev ergonomics is a separate concern with multiple reasonable answers — worth its own design pass rather than baking a choice into B1.

The existing user-level copy at `~/.claude/skills/visual-fidelity-check/` stays during B1's transition. Once dispatcher injection is shipped and verified, the user-level copy can be deleted (or kept as a developer-convenience copy — see option 1 above).

### Change B1.3 — PreToolUse hook on `gh pr create`

> **Project-specific:** new hook script in `packages/cli/src/hooks/visual-fidelity-pr-gate.sh` (or `.ts`/`.js`, depending on existing convention — see open question below). Hook is wired into dispatched-worktree `.claude/settings.json` via the existing settings-generation pipeline that already injects `excludedCommands`.

A `PreToolUse` hook intercepts `Bash` tool calls whose command matches `gh pr create*`. Hook behavior:

1. **Detect whether this project uses visual-fidelity.** Read `<repo>/.crew/visual-fidelity.json` or the `[visual_fidelity]` block from the project's crew TOML. If absent, no-op (exit 0, allow the PR).
2. **Read the active session transcript** (path passed in as a hook-input field — see Claude Code's hooks docs for the schema). Scan for an assistant `tool_use` entry whose `name == "Skill"` and `input.skill == "visual-fidelity-check"`.
3. **If found,** exit 0, allow the PR.
4. **If absent,** exit non-zero with a blocking system message: *"visual-fidelity-check skill has not been invoked this session. Per the dispatch workflow, that gate must run before opening a PR. Invoke the skill, address findings, then retry `gh pr create`."*

The hook is fail-closed in the strict sense — if it can't read the transcript or can't determine project config, it surfaces a warning to the agent rather than silently allowing the PR. (Soft-fail to "allow" would re-introduce the same silent-skip pattern we're fixing.)

Hook installation: the dispatch's existing settings-generation pipeline (the same place `excludedCommands` get materialized into a worktree's `.claude/settings.json`) gains a new `hooks.PreToolUse` entry pointing at the script. The script ships as part of the crew repo so it's versioned with the dispatcher.

#### Open question on hook implementation

The crew repo has no existing PreToolUse hooks in `packages/cli/src/`. The implementation choice (bash one-liner vs Node script vs TypeScript via tsx) should follow whatever pattern the codebase establishes for sibling concerns. If no pattern exists, default to bash for simplicity — the hook does file existence + JSONL line-grep + string match, all of which are 5-line bash.

> **Project-specific:** worth a quick look during the plan phase at how `excludedCommands` get materialized into the dispatched worktree — the new hook follows the same materialization path.

## Acceptance criteria

- Every UI-touching `crew run` dispatch in a project with `<repo>/.crew/visual-fidelity.json` renders the workflow with a numbered "Visual fidelity gate" step.
- Backend-only dispatches (or dispatches in projects without visual-fidelity config) do not render that step.
- The `visual-fidelity-check` skill files live at `packages/cli/src/lib/skills/visual-fidelity-check/` in the crew repo. SKILL.md description includes the "IN ADDITION TO `verification-before-completion`" disambiguation, and the same phrasing appears in the dispatch step 8 body.
- The crew CLI dispatcher injects `packages/cli/src/lib/skills/visual-fidelity-check/` into each dispatched worktree at `<worktree>/.claude/skills/visual-fidelity-check/` before the agent boots, but only when the project's visual-fidelity config is present.
- The dispatched agent's session transcript (after a successful UI dispatch) shows a `Skill` tool_use entry with `input.skill == "visual-fidelity-check"`. Validated end-to-end by Thread A's re-dispatch (see Verification).
- A new PreToolUse hook is installed into dispatched worktrees that have visual-fidelity config; the hook blocks `gh pr create` when the session transcript does not contain a `visual-fidelity-check` skill invocation.
- The hook does *not* fire on backend-only dispatches (no visual-fidelity config → no hook → no blocking).
- An end-to-end test exists: a fixture dispatch (manual or automated) that skips the skill is blocked by the hook with the correct message; a dispatch that runs the skill normally proceeds.

## Verification

After implementation, validate by re-running the CREW-135 dispatch (Thread A's re-dispatch is the natural ultimate test). Expected outcome: the dispatched agent runs visual-fidelity-check as step 8, surfaces findings, and either fixes them or surfaces them in the PR description. If the agent somehow skips the skill, the hook blocks `gh pr create` with the correct message.

Verification step on the dispatch's session transcript: grep for `"skill": "visual-fidelity-check"` in the JSONL — must be present.

## Dependencies and order

- **B1 must ship before Thread A's re-dispatch of CREW-135.** Without B1, the re-dispatch can silently skip the gate again and we ship the same regression a third time.
- B1 has no external dependencies. It can ship as soon as the plan is written and the ticket is dispatched.
- B2 (chrome integration for autonomous screenshot capture) is independent of B1 — can ship before or after Thread A.

## Out of scope

- Autonomous rendered-screenshot capture for the skill's optional Step 5. B2.
- Reorganizing the skill's content, examples, or workflow. The skill's body is in good shape — content edits are not part of this fix.
- Local-dev ergonomics for the skill (symlinks, postinstall scripts, etc.). The dispatcher injection covers autonomous use; local devs work from `~/.claude/skills/` or manual repo copies during B1's transition. A follow-up spec handles ergonomics if it becomes painful.
- Generalizing the dispatcher's skill-injection mechanism to other skills (`bruno-collection-maintenance`, etc.). The injection module should be written generically (it discovers skill directories under `packages/cli/src/lib/skills/` rather than hardcoding `visual-fidelity-check`), but adding additional skills to the bundle is its own decision per skill.
- Adding hooks for other tool calls (`git push`, `Edit`, etc.). The PR-create boundary is sufficient; expanding the hook surface invites false positives.

## Forward path

If B1's prose-only changes prove sufficient (the hook never fires because the numbered step is enough), the hook becomes redundant and could be removed in a future cleanup. If the hook fires regularly, it's evidence that promotion-to-numbered-step alone isn't enough and the hook is load-bearing — keep it.

B2 (`superpowers-chrome` integration) extends the same gate: once the agent can capture rendered screenshots autonomously, the skill's Step 5 fires automatically and the gate becomes a complete loop without human-in-the-middle steps.
