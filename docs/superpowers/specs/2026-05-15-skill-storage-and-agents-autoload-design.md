# Skill ownership + `AGENTS.md` auto-load fix

## Context

Two of crew's agent-context mechanisms were built partly on assumptions that
empirical testing has now corrected.

**1. `AGENTS.md` auto-loading.** CREW-153 migrated crew off `CLAUDE.md` onto the
cross-tool `AGENTS.md` convention, on the premise that Claude Code reads
`AGENTS.md` natively. That premise is false. Three empirical tests (`AGENTS.md`
alone; `AGENTS.md` + `CLAUDE.md`; nested `packages/*/AGENTS.md`) all showed
Claude Code never auto-ingests `AGENTS.md` — only `CLAUDE.md`. The official docs
confirm it verbatim: *"Claude Code reads `CLAUDE.md`, not `AGENTS.md`."*
([code.claude.com/docs/en/memory](https://code.claude.com/docs/en/memory)). The
CREW-153 spec's risk table flagged this exact risk and dismissed it with a
fabricated *"Verified by research."* `crew run` dispatches happen to work anyway
because the `ticket.md` prompt template orders the agent to *read* `AGENTS.md`;
interactive sessions in the crew repo auto-load no project context at all.

**2. The skill-injection subsystem — partly right, partly redundant.** crew
dispatches agents into worktrees of *other* projects (Recipes, etc.), not just
crew itself. Native skill discovery is cwd-relative: Claude Code discovers
`~/.claude/skills/` (any cwd) and `<cwd>/.claude/skills/` (rooted at the
worktree). So for a crew-owned skill to reach a dispatched agent working in a
non-crew project, crew must physically place the skill in that worktree's
`.claude/skills/`. That copy step — `runSkillInjection` — is **load-bearing and
correct**. What was built on a false assumption ("Claude can't see
`.claude/skills/`") is the *other* half: `discoverSkills` +
`renderDiscoveredSkillsBlock`, which walk the skill directories and render their
descriptions into the dispatch prompt. A controlled probe (a skill committed at
`<repo>/.claude/skills/<name>/`, a fresh `claude -p` run) confirmed Claude Code
discovers and invokes such skills natively, from the repo root and nested
subdirectories — so the prompt-rendered listing is redundant *for discovery*.

The constraint that resolves the design: crew must stay **self-contained** (a
clone of crew alone is a working tool — no dependency on the maintainer's
personal dotfiles) *and* its skills must reach **any** dispatched agent against
**any** project. Both hold only if crew **owns** its skills (commits them in its
own repo) and **injects** them into target worktrees. That is the existing
shape, minus the redundant prompt-discovery half.

A third question — whether crew's `.agents/<topic>.md` + `covers:` system should
move onto Claude Code's native `.claude/rules/` + `paths:` feature — is deferred
to its own brainstorm (`docs/followups.md`, `2026-05-15 — .agents/ topic-doc
system vs native .claude/rules/`). This spec does not touch `.agents/` content
or the doc-parity hook.

## Goals

- crew is self-contained: cloning the crew repo alone yields a working tool, its
  skills included. No dependency on the maintainer's personal dotfiles.
- Every crew-owned skill reaches every dispatched agent, against every project.
- `AGENTS.md` content actually loads — for `crew run` dispatches and interactive
  sessions, root and per-package.
- crew does not depend on the maintainer's *personal* skills; references to them
  are removed.
- The dynamic prompt-discovery half (`discoverSkills` /
  `renderDiscoveredSkillsBlock`) is removed; the "you are required to use these
  skills" nudge is preserved as static content in the dispatch templates.
- The universal *personal* layer (`~/.claude/CLAUDE.md`, `~/.claude/conventions/`,
  personal skills) is version-controlled in the dotfiles repo.

## Non-goals

- Removing or rewriting `runSkillInjection` / the injection copy step. It stays.
- Migrating `.agents/<topic>.md` onto `.claude/rules/`, or any change to the
  `.agents/` topic docs, `covers:` frontmatter, the doc-parity hook (CREW-163),
  or the frontmatter validator. Deferred.
- Changing what any skill *teaches*. Skill content is unchanged; files move.
- Cross-agent (non-Claude) support work.

## Skill ownership model

Two categories:

- **crew-owned skills** — skills crew's tooling and docs depend on, that crew
  wants every dispatched agent to have. Source of truth: committed in the crew
  repo. crew injects them into every dispatched worktree. Current set:
  `bruno-collection-maintenance`, `agents-doc-parity-check`,
  `visual-fidelity-check`.
- **personal skills** — the maintainer's own workflow skills, not crew's
  concern: `reaching-for-backend-patterns`, `reaching-for-frontend-libraries`,
  `figma-design-system-propagation`, `figma-screen-migration`, `mumen`. They
  live in `~/.claude/skills/`, version-controlled via the dotfiles repo. crew
  does not own, ship, inject, or hard-reference them.

## Part 1 — Fix `AGENTS.md` auto-load

Claude Code auto-loads `CLAUDE.md` (root + ancestors at launch; nested
subdirectory `CLAUDE.md` on demand) and resolves `@path` imports inside them.
The documented pattern for an `AGENTS.md`-based repo is a thin `CLAUDE.md` that
imports it.

**Add `CLAUDE.md` shim files** (committed; `CLAUDE.md` at repo/package roots is
not under `.claude/` and is not gitignored):

- Repo-root `CLAUDE.md`:

  > ```markdown
  > <!-- Claude Code reads CLAUDE.md, not AGENTS.md. This shim makes the AGENTS.md
  >      content auto-load. AGENTS.md remains the canonical file; edit that. -->
  > @AGENTS.md
  > ```

- One `CLAUDE.md` in each package (`packages/cli/`, `packages/daemon/`,
  `packages/dashboard/`, `packages/shared/`), identical content — the
  `@AGENTS.md` import resolves relative to the file, so each loads its own
  package `AGENTS.md` on demand when Claude touches files in that package.

**Correct `.agents/README.md`.** Its claim that "`AGENTS.md` files (root +
per-package) auto-load" is false. Replace with: Claude Code auto-loads
`CLAUDE.md`; thin `CLAUDE.md` shims (`@AGENTS.md` imports) at the repo root and
each package pull the `AGENTS.md` content into context — root at launch,
per-package on demand.

The `ticket.md` line ordering the agent to read `AGENTS.md` becomes redundant
for Claude once the shim exists, but is kept — harmless, and aids non-Claude
agents.

## Part 2 — Skill storage and injection

### 2a — Allow `.claude/skills/` to be committed

`.gitignore` ignores all of `.claude/`. Git cannot re-include a path under an
excluded directory, so the rule is narrowed. Replace the line `.claude/` with:

> ```gitignore
> .claude/*
> !.claude/skills/
> ```

`.claude/*` keeps ignoring `settings.json`, `secrets/`, etc. (already-tracked
`.claude/settings.json` is unaffected — gitignore never untracks). `!.claude/skills/`
re-includes the skills subtree.

### 2b — Commit crew-owned skills at `.claude/skills/`

Each crew-owned skill lives committed at `<crew-repo>/.claude/skills/<name>/`:

- `visual-fidelity-check` — **moved** from `packages/cli/src/lib/skills/visual-fidelity-check/`.
- `bruno-collection-maintenance` — **moved** from `~/.claude/skills/`.
- `agents-doc-parity-check` — **moved** from `~/.claude/skills/`.

`packages/cli/src/lib/skills/` is deleted (its sole occupant moves). The two
skills moved out of `~/.claude/skills/` are deleted from there — the crew repo
becomes their single source. (Each triggers only on `bruno/` / `.agents/` /
`visual_fidelity` config; nothing outside crew loses anything.)

Committed at `.claude/skills/`, the skills are discovered natively by
interactive crew sessions and present in every crew worktree checkout.

### 2c — Keep `runSkillInjection`; inject all crew-owned skills

`runSkillInjection` stays. At `crew run` dispatch — which creates the worktree —
it copies each crew-owned skill from the crew repo's `.claude/skills/` into the
new worktree's `.claude/skills/<name>/`, so the dispatched agent, working in any
project's worktree, discovers them natively. `resume` and `fix-pr` reuse a
worktree the original `run` already populated, so they need no injection step
(this matches today's behavior — only `run` injects).

Changes from today:

- The injection **source path** changes from `packages/cli/src/lib/skills/` to
  the crew repo's `.claude/skills/`.
- `SKILL_APPLICABILITY` (per-skill config predicate) is replaced by an
  unconditional list — all crew-owned skills are injected on every dispatch.
  Each skill self-gates via its own description/trigger, so injecting a
  non-applicable one is harmless. (The separate `runPreDispatchFigmaSnapshot`
  step stays gated on `config.visual_fidelity` — that gates *snapshot
  generation*, not the skill file.)

### 2d — Delete the dynamic prompt-discovery; keep the nudge as static content

Delete `discoverSkills`, `renderDiscoveredSkillsBlock` (`prompts/skills.ts`),
and the `{{discoveredSkillsBlock}}` template placeholder, plus their call sites
and tests. Native discovery surfaces the injected skills without a
prompt-rendered listing.

**The "you are required to use these skills" nudge is preserved.** The dispatch
templates (`ticket.md`, `fix-pr.md`, `resume.md`) have a `## Skills` section
that statically lists the required `superpowers:*` skills with their trigger
conditions. Add the three crew-owned skills as static bullets in that same
section, same format — name, trigger condition, "invoke via the `Skill` tool."
The nudge moves from dynamically-rendered to statically-authored; it is not
lost.

### 2e — Remove crew's references to personal skills

crew must not hard-depend on personal skills. Remove the skill mention from:

- `packages/daemon/AGENTS.md` — the "Writing a new route or service" row cites
  `reaching-for-backend-patterns`. Drop the skill mention; keep
  `.agents/architecture.md`.
- `packages/dashboard/AGENTS.md` — the "Writing a React component" row cites
  `reaching-for-frontend-libraries`. Same treatment.

The `figma-design-system-propagation` cross-references in `.agents/design-system.md`
("see Trap 1 / Trap 2 for the workaround") and the `mumen` pointer in
`.agents/workflow.md` are soft "see also" references, not hard dependencies —
left as-is. (Noted as a minor future cleanup, not in scope here.)

## Part 3 — Version the personal layer in the dotfiles repo

The personal user-level layer is currently in no git repo (the dotfiles repo
tracks only `claude/themes/`). Bring it under version control.

The dotfiles repo gains, under its existing `claude/` directory:

- `claude/CLAUDE.md` — the user-global `~/.claude/CLAUDE.md`.
- `claude/conventions/*.md` — all of `~/.claude/conventions/`.
- `claude/skills/` — the **personal** skills only: `reaching-for-backend-patterns`,
  `reaching-for-frontend-libraries`, `figma-design-system-propagation`,
  `figma-screen-migration`, `mumen`.

`install.sh` is extended to symlink each into `~/.claude/`. The three crew-owned
skills are **not** here — they live in the crew repo (Part 2b).

This work is in the dotfiles repo, not crew. It is not a Jira ticket — handled
interactively per the user-level `~/.claude/CLAUDE.md` "Don't ticket — handle
manually" rule. It has no code dependency on Parts 1–2 and runs in parallel.

## Part 4 — Document the plugin dependency

Plugins (`superpowers`, `figma`, `claude-mem`, `superpowers-chrome`) cannot be
vendored — they are plugin-manager installs. Add a "Required Claude Code plugins"
section to crew's `README.md` listing them; the implementer confirms the final
list by grepping crew's templates and docs for plugin references. State that
crew is otherwise self-contained — its skills ship in-repo; no external dotfiles
clone is needed for crew itself to function.

## Doc updates

Rolled through Parts 1–4:

- `.agents/dispatch.md` — rewrite the "Skill injection" and "Discovered skills"
  sections: injection still copies crew-owned skills into the worktree, but
  there is no prompt-rendered skills block; the dispatched agent discovers the
  injected skills natively, and the dispatch template statically lists them as
  required.
- `.agents/testing.md` — `bruno-collection-maintenance` is a crew-owned skill at
  `<crew-repo>/.claude/skills/`, injected into dispatched worktrees; update the
  two references.
- `packages/daemon/AGENTS.md`, `packages/dashboard/AGENTS.md` — Part 2e edits.
- `AGENTS.md` (root) — review skill wording for accuracy; the
  `agents-doc-parity-check` trigger reference stays valid.
- `README.md` — the `bruno-collection-maintenance` paragraph; add the Part 4
  plugin section.
- `docs/superpowers/specs/2026-05-13-agent-progressive-disclosure-system.md` —
  append a one-line correction at the risk table (~line 344) noting the
  "Claude Code reads `AGENTS.md` natively" claim was false; point at this spec.

## Sequencing

The crew-side work becomes one Epic. Logical groupings, refined by the plan:

1. **`AGENTS.md` auto-load fix** — Part 1. Self-contained; independent.
2. **Skill storage + injection rework** — Parts 2a–2d. The `.gitignore` change,
   moving the skills into `.claude/skills/`, repointing `runSkillInjection`,
   deleting the prompt-discovery, adding the static skill bullets.
3. **Personal-skill de-referencing + doc updates** — Part 2e + Part 4 + the
   doc-update list. Depends on groupings 1–2.

Part 3 (dotfiles) is parallel and non-ticketed.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Repointing `runSkillInjection` breaks dispatch | Keep the existing injection tests, adjusted for the new source path; a `crew run` smoke dispatch must show the three skills present in the worktree's `.claude/skills/`. |
| The "use these skills" nudge is weakened by going static | The static bullets use the same wording/placement as the existing required-`superpowers:*` bullets, which already drive compliance. Net: the nudge is more explicit, not less. |
| `.gitignore` negation done wrong | Use the `.claude/*` + `!.claude/skills/` form exactly; verify with `git check-ignore`. |
| Moving skills out of `~/.claude/skills/` breaks interactive use elsewhere | The three are crew-owned and trigger only on `bruno/` / `.agents/` / `visual_fidelity` — only crew. Committed in crew, they are discovered natively in crew sessions. |
| Removing `reaching-for-*` references loses useful guidance | The per-package `AGENTS.md` rows keep pointing at `.agents/architecture.md`; the skills still exist in `~/.claude/skills/` and self-trigger by description when relevant. crew simply stops *depending* on them. |

## Out of scope / future work

- `.agents/<topic>.md` + `covers:` vs native `.claude/rules/` — deferred
  brainstorm (`docs/followups.md`).
- The soft `figma-*` / `mumen` cross-references in `.agents/` docs — minor;
  revisit if crew's personal-skill independence needs to be airtight.
- Cross-agent (Codex, Cursor, Gemini) support.

## Open questions

None blocking. The exact Part 4 plugin list is settled during implementation by
grepping crew's references.
