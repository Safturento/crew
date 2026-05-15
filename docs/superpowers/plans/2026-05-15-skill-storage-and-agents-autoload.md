# Skill ownership + `AGENTS.md` auto-load — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make crew a self-contained tool — it owns its skills (committed in-repo), ships and injects them into every dispatched worktree, and Claude Code actually auto-loads its `AGENTS.md` content. Remove crew's dependence on the maintainer's personal skills.

**Architecture:** Claude Code auto-loads `CLAUDE.md` (and `@`-imports), not `AGENTS.md`; and discovers `.claude/skills/` natively (cwd-relative). crew is a *dispatcher* — its agents run in other projects' worktrees — so it must commit its skills in-repo and copy them into each dispatched worktree (`runSkillInjection`, kept). The dynamic prompt-discovery half (`discoverSkills`/`renderDiscoveredSkillsBlock`) is redundant and is replaced by static skill bullets in the dispatch templates.

**Tech Stack:** TypeScript, Node, npm workspaces, Vitest. Spec: `docs/superpowers/specs/2026-05-15-skill-storage-and-agents-autoload-design.md`.

**Verification commands:** run crew's full suite per `.agents/commands.md` — `npm run lint`, `npm run typecheck`, `npm run test:run` from the repo root.

---

## Task 1: `AGENTS.md` auto-load fix

Adds `CLAUDE.md` shims so Claude Code loads the `AGENTS.md` content. `CLAUDE.md` at repo/package roots is not under `.claude/`, so it is tracked normally.

**Files:**
- Create: `CLAUDE.md`, `packages/cli/CLAUDE.md`, `packages/daemon/CLAUDE.md`, `packages/dashboard/CLAUDE.md`, `packages/shared/CLAUDE.md`
- Modify: `.agents/README.md:10`

- [ ] **Step 1: Create the root `CLAUDE.md` shim**

Create `CLAUDE.md` at the repo root with exactly:

```markdown
<!-- Claude Code reads CLAUDE.md, not AGENTS.md. This shim makes the AGENTS.md
     content auto-load. AGENTS.md remains the canonical file; edit that, not this. -->
@AGENTS.md
```

- [ ] **Step 2: Create the four per-package `CLAUDE.md` shims**

Create `packages/cli/CLAUDE.md`, `packages/daemon/CLAUDE.md`, `packages/dashboard/CLAUDE.md`, `packages/shared/CLAUDE.md`, each with identical content (the `@AGENTS.md` import resolves relative to the file, picking up that package's own `AGENTS.md`):

```markdown
<!-- Claude Code reads CLAUDE.md, not AGENTS.md. This shim makes this package's
     AGENTS.md content load on demand. AGENTS.md remains the canonical file. -->
@AGENTS.md
```

- [ ] **Step 3: Correct the false "auto-load" claim in `.agents/README.md`**

`.agents/README.md` line 10 currently states "`AGENTS.md` files (root + per-package) auto-load". Replace that clause with:

> Claude Code auto-loads `CLAUDE.md`, not `AGENTS.md`; thin `CLAUDE.md` shims (`@AGENTS.md` imports) at the repo root and in each package pull the `AGENTS.md` content into context — root at launch, per-package on demand.

Leave the rest of the sentence unchanged.

- [ ] **Step 4: Verify the shim loads**

Run: `claude -p "In one sentence, what is this repository? Name the four packages." < /dev/null`
Expected: the answer names `cli`, `daemon`, `dashboard`, `shared` — content that only appears in `AGENTS.md`.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md packages/*/CLAUDE.md .agents/README.md
git commit -m "fix(<KEY>): add CLAUDE.md @AGENTS.md shims so AGENTS.md auto-loads"
```

---

## Task 2: Skill storage + injection rework

crew owns three skills. They move into the crew repo at `.claude/skills/`; `runSkillInjection` is kept and repointed to copy them into dispatched worktrees; the redundant prompt-discovery is deleted and the "required skills" nudge becomes static template content.

> **Execution split (added 2026-05-15).** Steps 1–4 create files under `<crew-repo>/.claude/skills/`. A Claude Code session masks the current project's `.claude/skills/` read-only inside its command sandbox, so an autonomous `crew run` dispatch cannot create them — there is no human to approve the escalated write. Steps 1–4 are therefore done in an **interactive session** (the Write tool, maintainer-approved) and are **not** part of the CREW-167 dispatch. **CREW-167 = Steps 5–19** — pure injection / prompt-discovery code, no `.claude/` write — gated on Steps 1–4 having landed (otherwise `runSkillInjection` repoints at an empty directory). See the design spec's Part 2 execution-constraint note.

**Files:**
- Modify: `.gitignore`
- Move: `packages/cli/src/lib/skills/visual-fidelity-check/` → `.claude/skills/visual-fidelity-check/`
- Create: `.claude/skills/bruno-collection-maintenance/SKILL.md`, `.claude/skills/agents-doc-parity-check/SKILL.md`
- Modify: `packages/cli/src/lib/run/skill-injection.ts`, `packages/cli/src/lib/run/skill-injection.test.ts`, `packages/cli/src/lib/run/skill-injection-step.ts`, `packages/cli/src/lib/run/skill-injection-step.test.ts`
- Modify: `packages/cli/src/commands/run.ts`
- Delete: `packages/cli/src/lib/prompts/skills.ts`, `packages/cli/src/lib/prompts/skills.test.ts`
- Modify: `packages/cli/src/commands/resume.ts`, `packages/cli/src/commands/fix-pr.ts`, `packages/cli/src/lib/run/verify-authored-e2e.ts`
- Modify: `packages/cli/src/lib/prompts/ticket.ts`, `packages/cli/src/lib/prompts/fix-pr.ts`, `packages/cli/src/lib/prompts/resume.ts`
- Modify: `packages/cli/src/lib/prompts/templates/ticket.md`, `templates/fix-pr.md`, `templates/resume.md`
- Modify: `packages/cli/src/lib/prompts/render.test.ts`, `builders.test.ts`, `resume.test.ts`, `packages/cli/src/commands/resume.test.ts`

### Steps 1–4 — DONE (interactive skill-file migration, not part of CREW-167)

> Completed outside `crew run`, in an interactive session — see the execution-split note above. The skill files now live committed at `<crew-repo>/.claude/skills/`: `visual-fidelity-check/` (moved from `packages/cli/src/lib/skills/`, git history preserved as a rename), `bruno-collection-maintenance/SKILL.md`, and `agents-doc-parity-check/SKILL.md` (both copied byte-identical from `~/.claude/skills/`). The `.gitignore` rule was narrowed to `.claude/*` + `!.claude/skills/`. Verified: `git check-ignore` reports the skills tracked while `settings.local.json` and `secrets/` stay ignored. **CREW-167's dispatch scope begins at Step 5.**

- [x] **Step 1: Narrow the `.claude/` ignore rule** — `.gitignore` line `.claude/` replaced with `.claude/*` + `!.claude/skills/`.
- [x] **Step 2: Move `visual-fidelity-check` into `.claude/skills/`** — moved; `packages/cli/src/lib/skills/` no longer exists.
- [x] **Step 3: Create `.claude/skills/bruno-collection-maintenance/SKILL.md`** — copied from `~/.claude/skills/`.
- [x] **Step 4: Create `.claude/skills/agents-doc-parity-check/SKILL.md`** — copied from `~/.claude/skills/`.

- [ ] **Step 5: Make injection unconditional over the crew-owned skill set**

In `packages/cli/src/lib/run/skill-injection.ts`, replace the `SKILL_APPLICABILITY` array (which gates each skill on a `ProjectConfig` predicate) with an unconditional constant list of the crew-owned skills, and simplify `skillsApplicableTo` to return it:

```ts
/** Skills crew owns and injects into every dispatched worktree. Source of
 * truth: <crew-repo>/.claude/skills/<name>/. Each skill self-gates via its
 * own description, so injecting a non-applicable one is harmless. */
const CREW_OWNED_SKILLS = [
  'agents-doc-parity-check',
  'bruno-collection-maintenance',
  'visual-fidelity-check',
] as const;

export function crewOwnedSkills(): readonly string[] {
  return CREW_OWNED_SKILLS;
}
```

Delete `skillsApplicableTo` and the `ProjectConfig` import if now unused. `copySkillIntoWorktree` is unchanged.

- [ ] **Step 6: Update `runSkillInjection` to inject the unconditional set**

In `packages/cli/src/lib/run/skill-injection-step.ts`, change `runSkillInjection` to iterate `crewOwnedSkills()` instead of `skillsApplicableTo(opts.config)`. Remove the `config` field from `SkillInjectionOptions` if it is now unused. The `{ kind: 'skipped' }` branch (empty applicable list) can be dropped — the list is never empty.

- [ ] **Step 7: Make injection unconditional in `run.ts`**

`skillsSourceRoot()` was already repointed to `<repo>/.claude/skills/` by the interactive skill-file migration (Steps 1–4) — it had to move in lockstep with the files, since leaving it pointing at the deleted `packages/cli/src/lib/skills/` would silently break injection on `main`. The `skill-injection-step.ts` `sourceRoot` doc-comment and `.agents/dispatch.md`'s skill-path references were corrected in that same migration. Remaining in `packages/cli/src/commands/run.ts`:
- Move the `runSkillInjection({ ... })` call **out** of the `if (config.visual_fidelity) { ... }` block so it runs on every dispatch. Keep `runPreDispatchFigmaSnapshot` inside that block. Drop the `config` argument from the `runSkillInjection` call if Step 6 removed it.

- [ ] **Step 8: Delete the dynamic prompt-discovery module**

```bash
git rm packages/cli/src/lib/prompts/skills.ts packages/cli/src/lib/prompts/skills.test.ts
```

- [ ] **Step 9: Remove `discoverSkills` / `renderDiscoveredSkillsBlock` from the call sites**

- `run.ts`: delete the import from `'../lib/prompts/skills.js'`; delete the `const discoveredSkillsBlock = renderDiscoveredSkillsBlock(discoverSkills({ ... }));` statement; delete the `discoveredSkillsBlock,` property from the `buildTicketPrompt({ ... })` call.
- `resume.ts`: delete the same import; delete the `discoveredSkillsBlock` statement; delete the `discoveredSkillsBlock,` property from both the `buildResumePrompt` and `buildTicketPrompt` calls.
- `fix-pr.ts`: delete the same import; delete the `discoveredSkillsBlock: renderDiscoveredSkillsBlock(discoverSkills({ repoPath })),` property from the `buildFixPrPrompt` call.
- `verify-authored-e2e.ts`: delete the same import; delete the `discoveredSkillsBlock: …` property from its `buildFixPrPrompt` call.

- [ ] **Step 10: Remove the `discoveredSkillsBlock` option from the three prompt builders**

In `packages/cli/src/lib/prompts/ticket.ts`, `fix-pr.ts`, and `resume.ts`: delete the `discoveredSkillsBlock?: string;` interface field and the `discoveredSkillsBlock: opts.discoveredSkillsBlock ?? '',` line in each `render(...)` call.

- [ ] **Step 11: Replace `{{discoveredSkillsBlock}}` with static crew-owned skill bullets**

In each of `templates/ticket.md`, `templates/fix-pr.md`, `templates/resume.md`, remove the `{{discoveredSkillsBlock}}` placeholder and, in the same `## Skills` required-skills list, add these three bullets (same format as the existing `superpowers:*` bullets):

```markdown
- **`agents-doc-parity-check`** — fires before you claim work complete or open a PR in a repo with an `.agents/` directory. Scans your changed files against each `.agents/<topic>.md`'s `covers:` globs and updates any doc your change made stale.
- **`bruno-collection-maintenance`** — fires when you author or modify an HTTP route, controller, or request/response schema in a project that has a `bruno/` directory. Add or update the matching `.bru` in the same commit.
- **`visual-fidelity-check`** — fires before you claim a UI-touching task complete in a project wired to a Figma source of truth. Compares rendered output to the Figma design.
```

For `ticket.md` and `fix-pr.md` the placeholder sits at the end of the `superpowers:requesting-code-review` bullet line — put the new bullets on the lines after it. For `resume.md` the placeholder is its own line — replace that line with the three bullets, matching the surrounding list.

- [ ] **Step 12: Update `render.test.ts`**

In `packages/cli/src/lib/prompts/render.test.ts`: delete the `discoveredSkillsBlock: '',` entry from both `render('ticket', { ... })` calls; remove `discoveredSkillsBlock` from the missing-var regex (line ~51) and the comment (line ~48).

- [ ] **Step 13: Update `builders.test.ts`**

In `packages/cli/src/lib/prompts/builders.test.ts`: delete the `import { renderDiscoveredSkillsBlock } from './skills.js';` line; delete the test `it('appends the discoveredSkillsBlock after the curated bullets when populated', …)`; delete the test `it('renders the discovered skills block under the curated Skills list', …)`; remove any remaining `discoveredSkillsBlock` property from `buildTicketPrompt`/`buildFixPrPrompt`/`buildResumePrompt` calls (e.g. the fixture near line 585).

- [ ] **Step 14: Update `lib/prompts/resume.test.ts` and `commands/resume.test.ts`**

- `packages/cli/src/lib/prompts/resume.test.ts`: delete `it('renders the discoveredSkillsBlock when provided', …)` and `it('keeps the Final report section as the prompt tail even when discoveredSkillsBlock is set', …)`; remove `discoveredSkillsBlock` from any other `buildResumePrompt` call.
- `packages/cli/src/commands/resume.test.ts`: delete the `vi.mock('../lib/prompts/skills.js', …)` block (lines ~74–77) — the module no longer exists.

- [ ] **Step 15: Update the injection tests**

- `packages/cli/src/lib/run/skill-injection.test.ts`: it imports `copySkillIntoWorktree, skillsApplicableTo`. Replace `skillsApplicableTo` usage with `crewOwnedSkills`; assert it returns the three crew-owned skill names. Keep the `copySkillIntoWorktree` tests.
- `packages/cli/src/lib/run/skill-injection-step.test.ts`: it imports `discoverSkills` from the deleted module — remove that import and any assertion that used it. Adjust the `runSkillInjection` tests for the new signature (no `config`, injects the three skills unconditionally). Update the fixture `sourceRoot` to a directory containing the three skill dirs.

- [ ] **Step 16: Verify no stale references remain**

Run: `git grep -nE 'discoverSkills|renderDiscoveredSkillsBlock|discoveredSkillsBlock|skillsApplicableTo|SKILL_APPLICABILITY' -- packages/`
Expected: **no output.**

- [ ] **Step 17: Verify the suite is green**

Run: `npm run lint && npm run typecheck && npm run test:run`
Expected: lint clean, typecheck exit 0, all tests pass. Update any prompt snapshot intentionally and confirm the diff is only the swapped skills block.

- [ ] **Step 18: Verify injection end-to-end**

Confirm the three skill directories exist under `.claude/skills/` and that a `runSkillInjection` unit test shows all three copied into a fixture worktree's `.claude/skills/`.

- [ ] **Step 19: Commit**

```bash
git add -A
git commit -m "refactor(<KEY>): commit crew-owned skills in-repo, repoint injection, drop prompt-discovery"
```

---

## Task 3: De-reference personal skills + documentation

Removes crew's hard references to the maintainer's personal skills, and brings every doc into line with the in-repo + injected skill model.

**Files:**
- Modify: `packages/daemon/AGENTS.md`, `packages/dashboard/AGENTS.md`, `.agents/dispatch.md`, `.agents/testing.md`, `AGENTS.md`, `README.md`
- Modify: `docs/superpowers/specs/2026-05-13-agent-progressive-disclosure-system.md`

- [ ] **Step 1: Drop the `reaching-for-*` references from per-package `AGENTS.md`**

- `packages/daemon/AGENTS.md`: the "Writing a new route or service" row in the "When you need it" table cites `user-level reaching-for-backend-patterns skill`. Remove that clause; the row keeps `.agents/architecture.md`.
- `packages/dashboard/AGENTS.md`: the "Writing a React component" row cites `user-level reaching-for-frontend-libraries skill`. Same treatment.

- [ ] **Step 2: Rewrite the skill sections of `.agents/dispatch.md`**

In `.agents/dispatch.md`, rewrite the "Skill injection" step and the "Discovered skills" section to describe the corrected model: crew commits its three owned skills at `<repo>/.claude/skills/`; `runSkillInjection` copies them into every dispatched worktree's `.claude/skills/`; the dispatched agent discovers them natively; the dispatch template's `## Skills` section statically lists them as required. There is no `discoverSkills`/`renderDiscoveredSkillsBlock` prompt rendering. Renumber the dispatch-flow steps if needed.

- [ ] **Step 3: Update `.agents/testing.md`**

The two `bruno-collection-maintenance` references (around lines 36 and 109) describe it as a user-level skill at `~/.claude/skills/`. Update both: it is a crew-owned skill committed at `<repo>/.claude/skills/bruno-collection-maintenance/`, injected into every dispatched worktree and discovered natively.

- [ ] **Step 4: Review root `AGENTS.md`**

Check the "Before claiming work complete" section and any skill mention. `agents-doc-parity-check` is now a crew-owned committed skill; the trigger text ("run the `agents-doc-parity-check` skill") stays valid. Adjust only wording that is now inaccurate (e.g. anything implying it is user-level).

- [ ] **Step 5: Update `README.md`**

- Rewrite the `bruno-collection-maintenance` paragraph (around line 226): it is a crew-owned skill committed at `.claude/skills/bruno-collection-maintenance/` and injected into dispatched worktrees — not a user-scope skill the agent "picks up."
- Add a **"Required Claude Code plugins"** section. Determine the list by running `git grep -hoE '[a-z-]+:[a-z-]+' -- packages/cli/src/lib/prompts/templates/ docs/ .agents/ | sort -u` and identifying plugin-skill references; the known set is `superpowers`, `figma`, `claude-mem`, `superpowers-chrome`. State that crew is otherwise self-contained — its own skills ship in-repo, so no external dotfiles clone is needed for crew to function.

- [ ] **Step 6: Add a correction note to the CREW-153 spec**

In `docs/superpowers/specs/2026-05-13-agent-progressive-disclosure-system.md`, at the risk-table row claiming *"Verified by research: Claude Code reads `AGENTS.md` natively"* (around line 344), append:

> **[Correction, 2026-05-15: false — Claude Code reads `CLAUDE.md`, not `AGENTS.md`. Fixed via `CLAUDE.md`→`@AGENTS.md` shims; see `docs/superpowers/specs/2026-05-15-skill-storage-and-agents-autoload-design.md`.]**

- [ ] **Step 7: Verify and commit**

Run: `git grep -nE 'discoverSkills|renderDiscoveredSkillsBlock|reaching-for-(backend|frontend)' -- '.agents/' 'AGENTS.md' 'README.md' 'packages/*/AGENTS.md'`
Expected: no stale subsystem references; no `reaching-for-*` references outside historical `docs/`.

```bash
git add .agents/ AGENTS.md packages/daemon/AGENTS.md packages/dashboard/AGENTS.md README.md docs/superpowers/specs/2026-05-13-agent-progressive-disclosure-system.md
git commit -m "docs(<KEY>): describe in-repo crew-owned skills; drop personal-skill references"
```

---

## Part 4 — Manual: version the personal layer in the dotfiles repo

**Not Jira tickets.** Touches `~/.claude/**` and the separate dotfiles repo, which `crew run` cannot write. Handle interactively per the user-level `~/.claude/CLAUDE.md` "Don't ticket — handle manually" rule. No dependency on Tasks 1–3.

- [ ] **Step 1: Move the personal layer into the dotfiles repo**

Under the dotfiles repo's existing `claude/` directory, add:
- `claude/CLAUDE.md` — the current `~/.claude/CLAUDE.md`.
- `claude/conventions/` — all files from `~/.claude/conventions/`.
- `claude/skills/` — the **personal** skills only: `reaching-for-backend-patterns`, `reaching-for-frontend-libraries`, `figma-design-system-propagation`, `figma-screen-migration`, `mumen`.

Move the files (originals become symlinks in Step 2).

- [ ] **Step 2: Wire `install.sh` to symlink them into `~/.claude/`**

Extend the dotfiles `install.sh` to symlink `claude/CLAUDE.md` → `~/.claude/CLAUDE.md`, `claude/conventions/` → `~/.claude/conventions/`, and each `claude/skills/<name>/` → `~/.claude/skills/<name>/`, following the existing dotfiles symlink pattern. Run `install.sh`; confirm the symlinks resolve.

- [ ] **Step 3: Remove the now-crew-owned skills from `~/.claude/skills/`**

`bruno-collection-maintenance` and `agents-doc-parity-check` are now committed in the crew repo (Task 2). Delete `~/.claude/skills/bruno-collection-maintenance/` and `~/.claude/skills/agents-doc-parity-check/`. (`visual-fidelity-check` was already only in `packages/cli/src/lib/skills/` and the crew repo — confirm no stray `~/.claude/skills/visual-fidelity-check/` remains; if one exists, delete it too.)

- [ ] **Step 4: Commit the dotfiles repo**

```bash
# in ~/dotfiles
git add claude/ install.sh
git commit -m "feat: version ~/.claude CLAUDE.md, conventions, and personal skills"
```

---

## Self-review — spec coverage

- Part 1 (AGENTS.md auto-load fix) → Task 1.
- Part 2a (`.gitignore` negation) → Task 2 Step 1.
- Part 2b (commit crew-owned skills) → Task 2 Steps 2–4.
- Part 2c (keep + repoint `runSkillInjection`) → Task 2 Steps 5–7.
- Part 2d (delete prompt-discovery, static nudge) → Task 2 Steps 8–14.
- Part 2e (de-reference personal skills) → Task 3 Step 1.
- Part 3 (personal layer in dotfiles) → Part 4.
- Part 4 (plugin docs) → Task 3 Step 5.
- Doc updates → Task 3 Steps 2–6.

## Sequencing

- **Task 1** is independent — land first or in parallel.
- **Task 2 Steps 1–4** (skill-file migration) run interactively and must land first — they are the gate for the rest of Task 2.
- **Task 2 Steps 5–19** (CREW-167) is independent of Task 1; the largest dispatched task. Gated on Steps 1–4.
- **Task 3** depends on Tasks 1–2 (its docs describe their end state).
- **Part 4** is parallel and non-ticketed.

Suggested ticketing: one Epic, three children — Task 1; Task 2 (CREW-167, Steps 5–19 only); Task 3 — plus Task 2 Steps 1–4 and Part 4 handled interactively (not ticketed). Final grouping confirmed at the ticketing step.

---

## Appendix A — `bruno-collection-maintenance/SKILL.md`

Canonical source: `~/.claude/skills/bruno-collection-maintenance/SKILL.md`. Prefer `cp` from there. If unreadable, reproduce this content exactly. The body contains fenced code blocks — the markers shown here as `~~~` are literal triple-backtick fences in the file.

```markdown
---
name: bruno-collection-maintenance
description: Use when authoring or modifying HTTP routes (Fastify route registration, controller files, OpenAPI schemas, or anything that adds/changes a request/response shape) in a project with a `bruno/` directory. Even if the change is small, even if a quick `npm run bruno:smoke` looks green, the matching `bruno/endpoints/<group>/<verb>-<name>.bru` must be added or updated in the same commit. Skip only when the change is in a project without `bruno/` at all.
---

# Bruno collection maintenance

This skill applies whenever you author or modify HTTP routes in a project that has a `bruno/` directory. Crew's per-project setup writes a generated `bruno/environments/<envName>.bru` and exports `CREW_BRUNO_ENV=<envName>`, so the project's `npm run bruno:smoke` script can be invoked directly. Your job is to keep the collection in sync with the code.

## File layout

~~~
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
~~~

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

~~~
vars:post-response {
  token: res.body.token
}
~~~

Subsequent flow steps read it from the env (it's set on the env for the duration of the run, scoped to the flow):

~~~
auth {
  bearer: {
    token: {{token}}
  }
}
~~~

When you add an authenticated endpoint, copy this shape — do not hand-roll a token by pasting one in.

## What does NOT trigger this skill

- Pure refactors that don't change the request/response shape (renaming an internal helper, splitting a controller into two files where the route signature is identical).
- Backend changes outside the HTTP layer (worker jobs, scheduled tasks, internal services).
- Documentation, comments, formatting.

If you're unsure, the safe default is to update the `.bru` — false positives (a touched-but-unchanged `.bru`) cost a tiny diff; false negatives (an out-of-date `.bru`) hide regressions.
```

## Appendix B — `agents-doc-parity-check/SKILL.md`

Canonical source: `~/.claude/skills/agents-doc-parity-check/SKILL.md`. Prefer `cp` from there. If unreadable, reproduce exactly. The body contains one fenced `sh` block — the `~~~` markers are literal triple-backtick fences in the file.

```markdown
---
name: agents-doc-parity-check
description: Use when about to claim any task complete or open a PR in a repo that has a `.agents/` directory — even if tests, lint, and build all pass, even if the change feels unrelated to documentation, even if you think a topic doc is out of scope. Triggers on any committed or staged file change in such a repo. Each `.agents/<topic>.md` declares a `covers` glob list; a change touching a covered path means that doc must be reviewed and, if affected, updated. Required IN ADDITION TO `superpowers:verification-before-completion` — that skill covers tests, lint, and build correctness; this one covers agent-doc parity. They are not interchangeable. Running one does not replace the other. Inert in repos with no `.agents/` directory.
---

# agents-doc-parity-check

When a repo carries `.agents/<topic>.md` topic docs, each doc's `covers` frontmatter is a contract: "these paths are mine." Changing a covered file without reviewing its doc lets the doc rot. This skill is the completion-time audit that catches that before you claim done.

**Announce when invoking:** "Using agents-doc-parity-check before claiming this task complete."

**Scope rule:** additive to `superpowers:verification-before-completion`, not a replacement. Run both. This skill does not check tests/lint/build; that skill does not check doc parity.

**Inert without `.agents/`:** if the repo has no `.agents/` directory, say "no `.agents/` in this repo — parity audit not applicable" and move on. Don't fabricate a result.

## Red flags — STOP and run the audit

| Thought | Reality |
|---|---|
| "Tests pass, ready to commit" | Tests don't read docs. Run the audit. |
| "My change was code, not docs" | Code changes are exactly what `covers` tracks. Run it. |
| "The commit hook will catch stale docs" | The hook is the *second* net and only warns. Don't outsource your audit to it. |
| "This topic doc is obviously unrelated" | The `covers` glob decides scope, not your gut. Check the glob. |
| "Small change — the doc still reads fine" | Then confirm that by reading the doc. Don't assume it. |
| "I'll review docs after the PR is open" | Parity is part of done, not a follow-up. |

## Workflow

1. **Confirm applicability.** `ls .agents/*.md`. None → skill inert; note it and stop.

2. **Determine the diff base.** Capture all three change states — committed, staged, unstaged. For committed work the base is the branch you'll merge into (usually `main`/`master`; `git remote show origin` shows the default). If your work isn't on a feature branch yet — still uncommitted on the base branch itself — the `<base>...HEAD` diff is simply empty and the staged/unstaged diffs carry everything. That's expected; run all three regardless.

3. **Match changed files to docs.** For each `.agents/<topic>.md`, read its `covers` list. For each glob, ask git directly — git's `:(glob)` pathspec magic handles `**` and `*` correctly, so you don't hand-roll glob matching. Run all three; an empty result from any one is fine:

   ~~~sh
   git diff --name-only <base>...HEAD -- ":(glob)<glob>"   # committed on this branch
   git diff --cached    --name-only   -- ":(glob)<glob>"   # staged
   git diff             --name-only   -- ":(glob)<glob>"   # unstaged
   ~~~

   Any non-empty result → that doc is **in scope**. One changed file can match several docs — that is the overlap case; record *every* match, not just the closest fit.

4. **Review each in-scope doc.** Read it. Decide per doc: does my change make any statement in it wrong, incomplete, or newly missing?
   - **Yes** → update the doc, and bump `last_updated` to today's ISO date in the same change.
   - **No** → leave it untouched (including `last_updated`).

5. **Gate the completion claim.** Any in-scope doc that needs an edit you have not made = not done. Either make the edit, or state explicitly which doc you are deferring and why.

## Rationalizations to counter

| Rationalization | Reality |
|---|---|
| "No `.agents/` doc is *about* my feature" | `covers` is a path glob, not a topic vibe. A match is a match. |
| "I bumped `last_updated`, so I'm covered" | The date is a freshness signal, not the work. Update the *content*. |
| "The hook didn't complain" | The hook runs later, only on commit/PR, and only warns. This audit runs now. |
| "Overlap means I pick the best-fit doc" | No — update every doc whose `covers` glob matches. |
| "Couldn't resolve the diff base" | Fail closed: surface the blocker, don't skip the audit. |

## Related skills

- `superpowers:verification-before-completion` — the parent completion gate; run it too.
- `superpowers:writing-skills` — for iterating this skill.
```
