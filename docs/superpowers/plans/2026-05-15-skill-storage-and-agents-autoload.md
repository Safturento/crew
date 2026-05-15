# Skill-storage consolidation + `AGENTS.md` auto-load — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every skill and instruction file live in exactly one version-controlled place that Claude Code discovers natively — delete the skill-injection subsystem, fix `AGENTS.md` auto-loading, vendor crew-shaped skills into the repo, and version the universal user-level layer in the dotfiles repo.

**Architecture:** Claude Code natively auto-loads `CLAUDE.md` (and `@`-imports inside it) and natively discovers `.claude/skills/`. crew's `runSkillInjection` / `discoverSkills` subsystem and its `AGENTS.md`-only docs were built on the false premise that neither worked. This plan deletes the subsystem, adds thin `CLAUDE.md` → `@AGENTS.md` shims, and commits crew skills at `.claude/skills/`.

**Tech Stack:** TypeScript, Node, npm workspaces, Vitest. Spec: `docs/superpowers/specs/2026-05-15-skill-storage-and-agents-autoload-design.md`.

**Verification commands:** run crew's full suite per `.agents/commands.md` — `npm run lint`, `npm run typecheck`, `npm run test:run` from the repo root — at each task's verification step.

---

## Task 1: `AGENTS.md` auto-load fix

Adds the `CLAUDE.md` shims so Claude Code actually loads the `AGENTS.md` content. `CLAUDE.md` at repo/package roots is not under `.claude/`, so it is tracked normally.

**Files:**
- Create: `CLAUDE.md`
- Create: `packages/cli/CLAUDE.md`, `packages/daemon/CLAUDE.md`, `packages/dashboard/CLAUDE.md`, `packages/shared/CLAUDE.md`
- Modify: `.agents/README.md:10`

- [ ] **Step 1: Create the root `CLAUDE.md` shim**

Create `CLAUDE.md` at the repo root with exactly:

```markdown
<!-- Claude Code reads CLAUDE.md, not AGENTS.md. This shim makes the AGENTS.md
     content auto-load. AGENTS.md remains the canonical file; edit that, not this. -->
@AGENTS.md
```

- [ ] **Step 2: Create the four per-package `CLAUDE.md` shims**

Create `packages/cli/CLAUDE.md`, `packages/daemon/CLAUDE.md`, `packages/dashboard/CLAUDE.md`, and `packages/shared/CLAUDE.md`, each with identical content (the `@AGENTS.md` import resolves relative to the file, so each picks up its own package `AGENTS.md`):

```markdown
<!-- Claude Code reads CLAUDE.md, not AGENTS.md. This shim makes this package's
     AGENTS.md content load on demand. AGENTS.md remains the canonical file. -->
@AGENTS.md
```

- [ ] **Step 3: Correct the false "auto-load" claim in `.agents/README.md`**

In `.agents/README.md`, line 10 currently reads:

> Two-tier progressive disclosure for agent context. `AGENTS.md` files (root + per-package) auto-load; `.agents/<topic>.md` topic docs load on demand when referenced from an index. ...

Replace the first clause so it states the real mechanism:

> Two-tier progressive disclosure for agent context. Claude Code auto-loads `CLAUDE.md`, not `AGENTS.md`; thin `CLAUDE.md` shims (`@AGENTS.md` imports) at the repo root and in each package pull the `AGENTS.md` content into context — root at launch, per-package on demand. `.agents/<topic>.md` topic docs load on demand when referenced from an index. ...

Leave the rest of the sentence (the user-level skills/conventions clause) unchanged.

- [ ] **Step 4: Verify the shim loads**

Run a fresh `claude` in the repo root and confirm the `AGENTS.md` content is in context:

Run: `claude -p "In one sentence, what is this repository? Name the four packages." < /dev/null`
Expected: the answer names `cli`, `daemon`, `dashboard`, `shared` — content that only appears in `AGENTS.md`. (Before this task it would not.)

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md packages/*/CLAUDE.md .agents/README.md
git commit -m "fix(<KEY>): add CLAUDE.md @AGENTS.md shims so AGENTS.md auto-loads"
```

---

## Task 2: Delete the skill-injection subsystem

Native `.claude/skills/` discovery makes injection and prompt-block rendering dead code. This task removes it entirely. There is no new behavior to test; the verification is that typecheck and the full suite stay green after removal.

**Files:**
- Delete: `packages/cli/src/lib/run/skill-injection.ts`, `packages/cli/src/lib/run/skill-injection-step.ts`, `packages/cli/src/lib/run/skill-injection.test.ts`, `packages/cli/src/lib/run/skill-injection-step.test.ts`
- Delete: `packages/cli/src/lib/prompts/skills.ts`, `packages/cli/src/lib/prompts/skills.test.ts`
- Delete: `packages/cli/src/lib/skills/` (the entire directory — the vendored `visual-fidelity-check/`)
- Modify: `packages/cli/src/lib/run/index.ts`, `packages/cli/src/commands/run.ts`, `packages/cli/src/commands/resume.ts`, `packages/cli/src/commands/fix-pr.ts`, `packages/cli/src/lib/run/verify-authored-e2e.ts`
- Modify: `packages/cli/src/lib/prompts/ticket.ts`, `packages/cli/src/lib/prompts/fix-pr.ts`, `packages/cli/src/lib/prompts/resume.ts`
- Modify: `packages/cli/src/lib/prompts/templates/ticket.md`, `templates/fix-pr.md`, `templates/resume.md`
- Modify: `packages/cli/src/lib/prompts/render.test.ts`, `packages/cli/src/lib/prompts/builders.test.ts`, `packages/cli/src/lib/prompts/resume.test.ts`, `packages/cli/src/commands/resume.test.ts`

- [ ] **Step 1: Delete the subsystem source and test files**

```bash
git rm packages/cli/src/lib/run/skill-injection.ts \
       packages/cli/src/lib/run/skill-injection-step.ts \
       packages/cli/src/lib/run/skill-injection.test.ts \
       packages/cli/src/lib/run/skill-injection-step.test.ts \
       packages/cli/src/lib/prompts/skills.ts \
       packages/cli/src/lib/prompts/skills.test.ts
git rm -r packages/cli/src/lib/skills
```

- [ ] **Step 2: Remove the barrel re-export**

In `packages/cli/src/lib/run/index.ts`, delete the line:

```ts
export * from './skill-injection-step.js';
```

- [ ] **Step 3: Clean up `commands/run.ts`**

In `packages/cli/src/commands/run.ts`:
- Delete the import `import { discoverSkills, renderDiscoveredSkillsBlock } from '../lib/prompts/skills.js';`.
- In the import block from `'../lib/run/index.js'`, delete the `runSkillInjection,` entry.
- In the `if (config.visual_fidelity) { ... }` block, delete the skill-injection call only — the `console.log('→ injecting dispatcher-managed skills…')` line and the entire `await runSkillInjection({ ... });` call. Keep `runPreDispatchFigmaSnapshot` and the rest of the block.
- Delete the `const discoveredSkillsBlock = renderDiscoveredSkillsBlock(discoverSkills({ repoPath: config.repo_path }));` statement.
- In the `buildTicketPrompt({ ... })` call, delete the `discoveredSkillsBlock,` property.
- Delete the local `function skillsSourceRoot(): string { ... }` definition (no longer referenced).

- [ ] **Step 4: Clean up `commands/resume.ts`**

In `packages/cli/src/commands/resume.ts`:
- Delete the import `import { discoverSkills, renderDiscoveredSkillsBlock } from '../lib/prompts/skills.js';`.
- Delete the `const discoveredSkillsBlock = renderDiscoveredSkillsBlock(discoverSkills({ repoPath: config.repo_path }));` statement.
- In both the `buildResumePrompt({ ... })` and `buildTicketPrompt({ ... })` calls, delete the `discoveredSkillsBlock,` property.

- [ ] **Step 5: Clean up `commands/fix-pr.ts`**

In `packages/cli/src/commands/fix-pr.ts`:
- Delete the import `import { discoverSkills, renderDiscoveredSkillsBlock } from '../lib/prompts/skills.js';`.
- In the `buildFixPrPrompt({ ... })` call, delete the property `discoveredSkillsBlock: renderDiscoveredSkillsBlock(discoverSkills({ repoPath })),`.

- [ ] **Step 6: Clean up `lib/run/verify-authored-e2e.ts`**

In `packages/cli/src/lib/run/verify-authored-e2e.ts`:
- Delete the import `import { discoverSkills, renderDiscoveredSkillsBlock } from '../prompts/skills.js';`.
- In the `buildFixPrPrompt({ ... })` call, delete the property `discoveredSkillsBlock: renderDiscoveredSkillsBlock(discoverSkills({ repoPath })),`.

- [ ] **Step 7: Remove the `discoveredSkillsBlock` option from the three prompt builders**

- `packages/cli/src/lib/prompts/ticket.ts`: delete `discoveredSkillsBlock?: string;` from `BuildTicketPromptOptions`, and delete `discoveredSkillsBlock: opts.discoveredSkillsBlock ?? '',` from the `render('ticket', { ... })` call.
- `packages/cli/src/lib/prompts/fix-pr.ts`: delete `discoveredSkillsBlock?: string;` from the options interface, and delete `discoveredSkillsBlock: opts.discoveredSkillsBlock ?? '',` from the render call.
- `packages/cli/src/lib/prompts/resume.ts`: delete `discoveredSkillsBlock?: string;` from the options interface, and delete `discoveredSkillsBlock: opts.discoveredSkillsBlock ?? '',` from the render call.

- [ ] **Step 8: Remove the `{{discoveredSkillsBlock}}` placeholder from the three templates**

- `packages/cli/src/lib/prompts/templates/ticket.md`: line 12 ends with `...before pushing.{{discoveredSkillsBlock}}` — delete the `{{discoveredSkillsBlock}}` token, leaving `...before pushing.`.
- `packages/cli/src/lib/prompts/templates/fix-pr.md`: line 15 ends with `...before pushing.{{discoveredSkillsBlock}}` — delete the token.
- `packages/cli/src/lib/prompts/templates/resume.md`: line 15 is `{{discoveredSkillsBlock}}` on its own — delete the whole line.

- [ ] **Step 9: Update `render.test.ts`**

In `packages/cli/src/lib/prompts/render.test.ts`:
- Delete the `discoveredSkillsBlock: '',` line from both `render('ticket', { ... })` calls (the two passing-vars tests).
- In the "throws when a placeholder has no matching var" test, remove `discoveredSkillsBlock` from the regex alternation on line 51 and from the comment on line 48.

- [ ] **Step 10: Update `builders.test.ts`**

In `packages/cli/src/lib/prompts/builders.test.ts`:
- Delete the import `import { renderDiscoveredSkillsBlock } from './skills.js';`.
- Delete the entire test `it('appends the discoveredSkillsBlock after the curated bullets when populated', ...)`.
- Delete the entire test `it('renders the discovered skills block under the curated Skills list', ...)`.
- Remove the `discoveredSkillsBlock: ...` property from any remaining `buildTicketPrompt` / `buildFixPrPrompt` / `buildResumePrompt` call in the file (e.g. the snapshot fixture near line 585).

- [ ] **Step 11: Update `lib/prompts/resume.test.ts`**

In `packages/cli/src/lib/prompts/resume.test.ts`:
- Delete the test `it('renders the discoveredSkillsBlock when provided', ...)`.
- Delete the test `it('keeps the Final report section as the prompt tail even when discoveredSkillsBlock is set', ...)`.
- Remove any `discoveredSkillsBlock` property from other `buildResumePrompt` calls in the file.

- [ ] **Step 12: Update `commands/resume.test.ts`**

In `packages/cli/src/commands/resume.test.ts`, delete the `vi.mock('../lib/prompts/skills.js', ...)` block entirely (the `discoverSkills` / `renderDiscoveredSkillsBlock` mock at lines ~74–77) — the module no longer exists.

- [ ] **Step 13: Verify nothing references the deleted symbols**

Run: `git grep -nE 'discoverSkills|renderDiscoveredSkillsBlock|runSkillInjection|skill-injection|discoveredSkillsBlock|skillsSourceRoot|skillsApplicableTo|copySkillIntoWorktree' -- packages/`
Expected: **no output.** Any hit is a missed reference — fix it before continuing.

- [ ] **Step 14: Verify the suite is green**

Run: `npm run lint && npm run typecheck && npm run test:run`
Expected: lint clean, typecheck exit 0, all tests pass (0 failures). If a prompt snapshot test fails because the rendered prompt changed, update the snapshot intentionally and confirm the diff is only the removed skills block.

- [ ] **Step 15: Commit**

```bash
git add -A
git commit -m "refactor(<KEY>): delete the skill-injection subsystem — Claude Code discovers .claude/skills/ natively"
```

---

## Task 3: Allow `.claude/skills/` to be committed, and vendor the crew skills

`.claude/` is gitignored wholesale. Git cannot re-include a path under an excluded directory, so the rule is narrowed, then the two crew-shaped skills are committed.

**Files:**
- Modify: `.gitignore`
- Create: `.claude/skills/bruno-collection-maintenance/SKILL.md`
- Create: `.claude/skills/agents-doc-parity-check/SKILL.md`

- [ ] **Step 1: Narrow the `.claude/` ignore rule**

In `.gitignore`, find the line `.claude/` (under the comment `# Per-repo agent sandbox config + secrets (gh-token, etc.)`) and replace that single line with:

```gitignore
.claude/*
!.claude/skills/
```

`.claude/*` keeps ignoring `settings.json`, `secrets/`, etc. (already-tracked `.claude/settings.json` is unaffected — gitignore never untracks tracked files). `!.claude/skills/` re-includes the skills subtree.

- [ ] **Step 2: Verify the negation works**

Run: `git check-ignore -v .claude/skills/x 2>/dev/null; echo "exit=$?"`
Expected: `exit=1` (path is NOT ignored). Also run `git check-ignore .claude/settings.local.json` and confirm it still IS ignored.

- [ ] **Step 3: Create `.claude/skills/bruno-collection-maintenance/SKILL.md`**

Create the file with this exact content:

```markdown
---
name: bruno-collection-maintenance
description: Use when authoring or modifying HTTP routes (Fastify route registration, controller files, OpenAPI schemas, or anything that adds/changes a request/response shape) in a project with a `bruno/` directory. Even if the change is small, even if a quick `npm run bruno:smoke` looks green, the matching `bruno/endpoints/<group>/<verb>-<name>.bru` must be added or updated in the same commit. Skip only when the change is in a project without `bruno/` at all.
---

# Bruno collection maintenance

This skill applies whenever you author or modify HTTP routes in a project that has a `bruno/` directory. Crew's per-project setup writes a generated `bruno/environments/<envName>.bru` and exports `CREW_BRUNO_ENV=<envName>`, so the project's `npm run bruno:smoke` script can be invoked directly. Your job is to keep the collection in sync with the code.

## File layout

\```
bruno/
├── bruno.json                              # collection metadata
├── .gitignore                              # excludes environments/
├── environments/<envName>.bru              # generated per-worktree by crew — never commit
├── endpoints/
│   └── <route-group>/
│       ├── post-create.bru
│       ├── get-show.bru
│       ├── get-list.bru
│       └── delete-destroy.bru
└── flows/
    ├── login.bru                           # the auth flow other flows depend on
    └── main-smoke.bru                      # the canonical end-to-end smoke
\```

- **`endpoints/`** — one `.bru` per (route, verb) pair. Filename `<verb>-<name>[-<case>].bru` (e.g. `post-create-with-tags.bru` for a variant). Mirror the project's route grouping (`endpoints/recipes/`, `endpoints/auth/`).
- **`flows/`** — multi-step user journeys. Each flow chains endpoint requests with `vars:post-response` to thread state.

## When you change a route, you change a `.bru`

- **New endpoint** → add a new `.bru` under `endpoints/<group>/`. Pick the closest existing sibling and copy its shape (auth header, body shape, asserts).
- **Renamed endpoint** → rename the `.bru` to match (`mv` it, don't leave the old name dangling).
- **Changed request body** → update the `body { ... }` block.
- **Changed response shape** → update the `assert { ... }` block. Asserts that exercise the new field count as test coverage; vague asserts (e.g. `assert: res.status: 200`) are not.
- **Removed endpoint** → delete the `.bru` and remove any flow steps that called it.

`npm run bruno:smoke` passing is **necessary** but not **sufficient**. Smoke flows hit a small subset of endpoints; coverage drift in less-trafficked endpoints is what this skill prevents.

## Auth chaining pattern

The project's `flows/login.bru` runs first and saves a token via `vars:post-response`:

\```
vars:post-response {
  token: res.body.token
}
\```

Subsequent flow steps read it from the env (it's set on the env for the duration of the run, scoped to the flow):

\```
auth {
  bearer: {
    token: {{token}}
  }
}
\```

When you add an authenticated endpoint, copy this shape — do not hand-roll a token by pasting one in.

## What does NOT trigger this skill

- Pure refactors that don't change the request/response shape (renaming an internal helper, splitting a controller into two files where the route signature is identical).
- Backend changes outside the HTTP layer (worker jobs, scheduled tasks, internal services).
- Documentation, comments, formatting.

If you're unsure, the safe default is to update the `.bru` — false positives (a touched-but-unchanged `.bru`) cost a tiny diff; false negatives (an out-of-date `.bru`) hide regressions.
```

> **Note for the implementer:** the four \``` fences shown above as `\``` are real triple-backtick fences in the file — the SKILL.md contains fenced code blocks. Reproduce them as plain ` ``` ` fences. The simplest reliable approach: `cp ~/.claude/skills/bruno-collection-maintenance/SKILL.md .claude/skills/bruno-collection-maintenance/SKILL.md` if `~/.claude/skills/` is readable in your environment; otherwise type the content above with real fences.

- [ ] **Step 4: Create `.claude/skills/agents-doc-parity-check/SKILL.md`**

Copy it from the existing user-level skill: `cp ~/.claude/skills/agents-doc-parity-check/SKILL.md .claude/skills/agents-doc-parity-check/SKILL.md`. If `~/.claude/skills/` is not readable in your environment, recreate it — the canonical content is the file at `~/.claude/skills/agents-doc-parity-check/SKILL.md` (a ~62-line skill: frontmatter `name: agents-doc-parity-check` + a description, then a workflow that matches changed files against each `.agents/<topic>.md`'s `covers:` globs via git's `:(glob)` pathspec). Do not paraphrase — the file must be byte-identical to the user-level original.

- [ ] **Step 5: Verify the skills are staged and discoverable**

Run: `git add .claude/skills && git status --short .claude/`
Expected: both `SKILL.md` files show as new/added.
Run: `claude -p "List the names of skills available from this project's .claude/skills directory." < /dev/null`
Expected: output names `bruno-collection-maintenance` and `agents-doc-parity-check`.

- [ ] **Step 6: Commit**

```bash
git add .gitignore .claude/skills
git commit -m "feat(<KEY>): commit crew-shaped skills at .claude/skills/, un-ignore the path"
```

---

## Task 4: Documentation updates + plugin dependency

Brings every doc that described the old injection model into line with committed `.claude/skills/` + native discovery, and documents the plugin dependency.

**Files:**
- Modify: `.agents/dispatch.md`, `.agents/testing.md`, `AGENTS.md`, `packages/daemon/AGENTS.md`, `packages/dashboard/AGENTS.md`, `README.md`
- Modify: `docs/superpowers/specs/2026-05-13-agent-progressive-disclosure-system.md`

- [ ] **Step 1: Rewrite the skill sections of `.agents/dispatch.md`**

In `.agents/dispatch.md`, delete the "Skill injection" step (the `runSkillInjection` description, step 10 in the dispatch flow) and the "Discovered skills" section (the `discoverSkills` / `renderDiscoveredSkillsBlock` paragraph). Replace with a short paragraph stating: skills live committed at `<repo>/.claude/skills/<name>/` and at `~/.claude/skills/` (user-level); Claude Code discovers both natively at session start — there is no injection step and no prompt-rendered skill block. Renumber the dispatch-flow steps if the deleted step 10 leaves a gap.

- [ ] **Step 2: Update `.agents/testing.md`**

In `.agents/testing.md`, the two references to `bruno-collection-maintenance` (around lines 36 and 109) describe it as a user-level skill at `~/.claude/skills/bruno-collection-maintenance/`. Update both to: committed project skill at `.claude/skills/bruno-collection-maintenance/`, discovered natively. Drop the "auto-loaded for any agent dispatched … via `crew run`" phrasing — it is discovered natively in every session, dispatched or interactive.

- [ ] **Step 3: Update the per-package `AGENTS.md` skill references**

- `packages/daemon/AGENTS.md`: the "When you need it" row referencing `bruno-collection-maintenance` — drop any "user-level" qualifier; it is now a project skill. Leave `reaching-for-backend-patterns` described as a user-level skill (it stays user-level).
- `packages/dashboard/AGENTS.md`: the row referencing `visual-fidelity-check` — it remains a user-level skill (moved to dotfiles, Part 5); keep the "user-level" qualifier. No change needed unless wording implies injection.

- [ ] **Step 4: Update root `AGENTS.md`**

In `AGENTS.md`, review the "Before claiming work complete" section and any skill mention for wording that implies injection or a user-level location for `agents-doc-parity-check`. `agents-doc-parity-check` is now a committed project skill; the trigger text ("run the `agents-doc-parity-check` skill") stays valid as-is. Adjust only wording that is now inaccurate.

- [ ] **Step 5: Update `README.md`**

In `README.md`:
- The `bruno-collection-maintenance` paragraph (around line 226) says the agent "automatically picks up the user-scope skill at `~/.claude/skills/…`". Rewrite: it is a committed project skill at `.claude/skills/bruno-collection-maintenance/`, discovered natively.
- Add a new section, **"Required Claude Code plugins"**, listing the plugins crew depends on. Determine the list by running `git grep -hoE '[a-z-]+:[a-z-]+' -- packages/cli/src/lib/prompts/templates/ docs/ .agents/ | sort -u` and inspecting which are plugin-skill references; the known set is `superpowers`, `figma`, `claude-mem`, and `superpowers-chrome`. State that a fresh clone must install these via the plugin manager for `crew run` dispatches and DS/visual work to function.

- [ ] **Step 6: Add a correction note to the CREW-153 spec**

In `docs/superpowers/specs/2026-05-13-agent-progressive-disclosure-system.md`, at the risk table row claiming *"Verified by research: Claude Code reads `AGENTS.md` natively"* (around line 344), append a bracketed correction:

> **[Correction, 2026-05-15: this was false — Claude Code reads `CLAUDE.md`, not `AGENTS.md`. Fixed via `CLAUDE.md`→`@AGENTS.md` shims; see `docs/superpowers/specs/2026-05-15-skill-storage-and-agents-autoload-design.md`.]**

Leave the rest of the historical spec intact.

- [ ] **Step 7: Verify and commit**

Run: `npm run lint` (catches markdown issues if linted) and re-read each edited doc for accuracy.
Run: `git grep -nE 'runSkillInjection|discoverSkills|skill.injection' -- '.agents/' 'AGENTS.md' 'README.md' 'packages/*/AGENTS.md'`
Expected: no stale references to the deleted subsystem.

```bash
git add .agents/ AGENTS.md packages/daemon/AGENTS.md packages/dashboard/AGENTS.md README.md docs/superpowers/specs/2026-05-13-agent-progressive-disclosure-system.md
git commit -m "docs(<KEY>): describe native .claude/skills/ discovery; document plugin dependency"
```

---

## Part 5 — Manual: version the universal layer in the dotfiles repo

**Not Jira tickets.** This work touches `~/.claude/**` and the separate dotfiles repo, which the autonomous `crew run` flow cannot write. Handle interactively, per the user-level `~/.claude/CLAUDE.md` "Don't ticket — handle manually" rule. No dependency on Tasks 1–4; can run in parallel.

- [ ] **Step 1: Move the universal layer into the dotfiles repo**

In the dotfiles repo (`~/dotfiles`), under the existing `claude/` directory, add:
- `claude/CLAUDE.md` — the current `~/.claude/CLAUDE.md`.
- `claude/conventions/` — all files from `~/.claude/conventions/`.
- `claude/skills/` — the universal user-level skills: `reaching-for-backend-patterns`, `reaching-for-frontend-libraries`, `visual-fidelity-check`, `figma-design-system-propagation`, `figma-screen-migration`, `mumen`.

Move the files (don't copy — the originals become symlinks in Step 2).

- [ ] **Step 2: Wire `install.sh` to symlink them into `~/.claude/`**

Extend the dotfiles `install.sh` to symlink `claude/CLAUDE.md` → `~/.claude/CLAUDE.md`, `claude/conventions/` → `~/.claude/conventions/`, and each `claude/skills/<name>/` → `~/.claude/skills/<name>/`, following the existing symlink pattern used for the rest of dotfiles. Run `install.sh` and confirm the symlinks resolve.

- [ ] **Step 3: Remove the now-vendored crew skills from `~/.claude/skills/`**

`bruno-collection-maintenance` and `agents-doc-parity-check` are now committed in the crew repo (Task 3). Delete `~/.claude/skills/bruno-collection-maintenance/` and `~/.claude/skills/agents-doc-parity-check/` so each skill has exactly one source. (They are only triggered by `bruno/` and `.agents/` directories, which only the crew repo has — no other project loses anything.)

- [ ] **Step 4: Commit the dotfiles repo**

```bash
# in ~/dotfiles
git add claude/ install.sh
git commit -m "feat: version ~/.claude CLAUDE.md, conventions, and universal skills"
```

---

## Self-review — spec coverage

- Part 1 (AGENTS.md auto-load fix) → Task 1.
- Part 2a (delete injection subsystem) → Task 2.
- Part 2b (`.gitignore` negation) → Task 3 Step 1.
- Part 2c (vendor crew skills) → Task 3 Steps 3–4; `visual-fidelity-check` vendored copy deleted in Task 2 Step 1.
- Part 3 (universal layer in dotfiles) → Part 5.
- Part 4 (plugin docs) → Task 4 Step 5.
- Doc updates → Task 4 Steps 1–6.

## Sequencing

- **Task 1** is independent — can land first or in parallel.
- **Task 2** is independent of Task 1; the largest task.
- **Task 3** depends on Task 2 only for clean doc/commit coherence (the `.gitignore` change itself is independent); run it after Task 2.
- **Task 4** depends on Tasks 1–3 (it describes their end state).
- **Part 5** is parallel and non-ticketed (dotfiles repo + `~/.claude/`).

Suggested ticketing: one Epic with three child tickets — Task 1; Task 2; Tasks 3 + 4 combined (vendor skills then document) — plus Part 5 handled manually. Final grouping confirmed at the ticketing step.
