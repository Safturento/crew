# Skill-storage consolidation + `AGENTS.md` auto-load fix

## Context

Two of crew's agent-context mechanisms were built on assumptions that empirical
testing has now disproven.

**1. The skill-injection subsystem.** crew ships a "dispatcher-managed skills"
mechanism: skill directories live under `packages/cli/src/lib/skills/`, and at
`crew run` dispatch time `runSkillInjection` copies the applicable ones into the
target worktree's `.claude/skills/`. A companion `discoverSkills` walks
`~/.claude/skills/` + `<repo>/.claude/skills/` and renders a skill-description
block into the dispatch prompt. This was built on the assumption that a
dispatched `claude` could not see `.claude/skills/` natively. That assumption is
false — a controlled probe (a skill committed at `<repo>/.claude/skills/<name>/`,
a fresh `claude -p` run) confirmed Claude Code natively discovers and invokes
project-level skills, from the repo root and from nested subdirectories, with
zero prompt injection.

**2. `AGENTS.md` auto-loading.** CREW-153 migrated crew off `CLAUDE.md` onto the
cross-tool `AGENTS.md` convention, on the premise that Claude Code reads
`AGENTS.md` natively. That premise is false. Three empirical tests (`AGENTS.md`
alone; `AGENTS.md` + `CLAUDE.md`; nested `packages/*/AGENTS.md`) all showed
Claude Code **never** auto-ingests `AGENTS.md` — only `CLAUDE.md`. The official
docs confirm it verbatim: *"Claude Code reads `CLAUDE.md`, not `AGENTS.md`."*
([code.claude.com/docs/en/memory](https://code.claude.com/docs/en/memory)). The
CREW-153 spec's risk table had flagged this exact risk and dismissed it with a
fabricated *"Verified by research: Claude Code reads `AGENTS.md` natively."* The
planned "smoke-test one session" mitigation, if run, was almost certainly run
inside a `crew run` dispatch — where the prompt template explicitly orders the
agent to *read* `AGENTS.md` — a confounded test that would confirm anything.

The practical state today: `crew run` dispatches happen to work because the
`ticket.md` prompt template's first line orders the agent to read `AGENTS.md`.
But **interactive** sessions in the crew repo auto-load no project context at
all — crew has no `CLAUDE.md`, and `AGENTS.md` does not auto-load. Per-package
`AGENTS.md` files are never auto-loaded in either mode.

A third, larger question — whether crew's `.agents/<topic>.md` + `covers:`
system should migrate onto Claude Code's native `.claude/rules/` + `paths:`
feature — is **deferred** to its own brainstorm (see
`docs/followups.md`, entry `2026-05-15 — .agents/ topic-doc system vs native
.claude/rules/`). This spec does not touch `.agents/` content or the doc-parity
hook.

## Goals

- Every skill and instruction file lives in exactly one version-controlled
  location; Claude Code's native discovery does all loading. No copy steps, no
  prompt injection.
- `AGENTS.md` content actually loads — for both `crew run` dispatches and
  interactive sessions, root and per-package.
- crew-shaped skills (`bruno-collection-maintenance`, `agents-doc-parity-check`)
  are committed inside the crew repo, so a fresh clone has them.
- The universal user-level layer (`~/.claude/CLAUDE.md`, `~/.claude/conventions/`,
  universal skills) is version-controlled in the dotfiles repo, so a fresh
  machine is reproducible.
- crew's external plugin dependency is documented.

## Non-goals

- Migrating `.agents/<topic>.md` onto `.claude/rules/`, or any change to the
  `.agents/` topic docs, the `covers:` frontmatter, the doc-parity hook
  (CREW-163), or the frontmatter validator. Deferred — see the followup.
- Reconciling crew against the full agents.md spec. Part of the deferred work.
- Changing what any skill *teaches*. This spec moves files and deletes
  plumbing; skill content is unchanged.
- Cross-agent (non-Claude) support work. The deferred `.agents/` brainstorm owns
  the cross-agent question.

## Part 1 — Fix `AGENTS.md` auto-load

Claude Code auto-loads `CLAUDE.md` (root + ancestors at launch; nested
subdirectory `CLAUDE.md` on demand when it reads files there) and resolves
`@path` imports inside them. The documented pattern for an `AGENTS.md`-based repo
is a thin `CLAUDE.md` that imports it.

**Add `CLAUDE.md` shim files** (committed; `CLAUDE.md` at repo/package roots is
not under `.claude/` and is not gitignored):

- Repo root `CLAUDE.md`:

  > ```markdown
  > <!-- Claude Code reads CLAUDE.md, not AGENTS.md. This shim makes the
  >      AGENTS.md content auto-load. AGENTS.md remains the canonical file. -->
  > @AGENTS.md
  > ```

- One `CLAUDE.md` in each package — `packages/cli/`, `packages/daemon/`,
  `packages/dashboard/`, `packages/shared/` — with identical content
  (`@AGENTS.md`, resolving to that package's own `AGENTS.md`). Nested `CLAUDE.md`
  loads on demand when Claude touches files in the package, giving the
  per-package context the lazy loading CREW-153 intended.

**Correct `.agents/README.md`.** Its claim that "`AGENTS.md` files (root +
per-package) auto-load" is false. Replace with an accurate description: Claude
Code auto-loads `CLAUDE.md`; root and per-package `CLAUDE.md` shims (`@AGENTS.md`
imports) are what pull the `AGENTS.md` content into context — root at launch,
per-package on demand.

**Dispatch prompt template.** The `ticket.md` line *"The repo's `AGENTS.md` is
your authoritative project guide; read it before doing anything else"* becomes
redundant for Claude once the shim exists, but is kept — it is harmless and aids
any non-Claude agent. No change required.

## Part 2 — Skill-storage consolidation

### 2a — Delete the injection subsystem

Native discovery makes the subsystem dead weight. Delete:

- `packages/cli/src/lib/run/skill-injection.ts` (`SKILL_APPLICABILITY`,
  `skillsApplicableTo`, `copySkillIntoWorktree`)
- `packages/cli/src/lib/run/skill-injection-step.ts` (`runSkillInjection`)
- `packages/cli/src/lib/prompts/skills.ts` (`discoverSkills`,
  `renderDiscoveredSkillsBlock`)
- `packages/cli/src/lib/skills/visual-fidelity-check/` (the entire vendored
  copy — see 2c)
- All associated tests, fixtures, and prompt snapshots (`skills.test.ts`,
  the skill-injection tests, `builders.test.ts` snapshot entries).

Remove the call sites and the prompt-block placeholder:

- `run.ts`, `fix-pr.ts`, `resume.ts`, `verify-authored-e2e.ts` — remove the
  `runSkillInjection` / `discoverSkills` calls and their result handling.
- `templates/ticket.md` and `templates/fix-pr.md` — remove the
  `{{discoveredSkillsBlock}}` placeholder and any prose introducing it.

The implementer greps for every reference to the deleted symbols before
declaring the removal complete; no consumer may remain.

### 2b — Allow `.claude/skills/` to be committed

`.gitignore` currently ignores all of `.claude/`. Git cannot re-include a path
whose parent directory is excluded, so the broad rule must be narrowed.
Replace the single line `.claude/` with:

> ```gitignore
> .claude/*
> !.claude/skills/
> ```

`.claude/*` keeps ignoring `settings.json`, `secrets/`, etc. (`.claude/settings.json`
is already force-tracked and is unaffected — gitignore does not untrack tracked
files). `!.claude/skills/` re-includes the skills subtree so it can be committed
normally.

### 2c — Place skills in their single correct location

| Skill | New home | Removed from |
|---|---|---|
| `bruno-collection-maintenance` | `crew/.claude/skills/bruno-collection-maintenance/` (committed) | `~/.claude/skills/` |
| `agents-doc-parity-check` | `crew/.claude/skills/agents-doc-parity-check/` (committed) | `~/.claude/skills/` |
| `visual-fidelity-check` | dotfiles `~/.claude/skills/` (universal — see Part 3) | `packages/cli/src/lib/skills/` |

`bruno-collection-maintenance` and `agents-doc-parity-check` are crew-shaped
(they trigger on `bruno/` and `.agents/`, which only crew has). Committed at
`crew/.claude/skills/`, they are discovered natively by interactive sessions and
appear in every worktree checkout automatically. They are deleted from
`~/.claude/skills/` so each has exactly one source.

`visual-fidelity-check` is reclassified as a universal user-level skill: it
already exists at `~/.claude/skills/visual-fidelity-check/`, so 2c for it is
purely the deletion of the `packages/cli/src/lib/skills/` copy. Its canonical
home becomes the dotfiles-tracked `~/.claude/skills/` (Part 3). A `crew run`
dispatch into any project still sees it — it is a user-level skill on the
machine running crew, available to every dispatch regardless of target project.

## Part 3 — Version the universal layer in the dotfiles repo

The universal user-level layer is currently in no git repo at all (the dotfiles
repo tracks only `claude/themes/catppuccin-mocha.json`). Bring it under version
control so a fresh machine is reproducible.

The dotfiles repo gains, under its existing `claude/` directory:

- `claude/CLAUDE.md` — the user-global `~/.claude/CLAUDE.md`.
- `claude/conventions/*.md` — all files from `~/.claude/conventions/`.
- `claude/skills/` — the **universal** user-level skills:
  `reaching-for-backend-patterns`, `reaching-for-frontend-libraries`,
  `visual-fidelity-check`, `figma-design-system-propagation`,
  `figma-screen-migration`, `mumen`.

`install.sh` is extended to symlink each into `~/.claude/` (matching the
existing symlink-based dotfiles pattern). After install, `~/.claude/CLAUDE.md`,
`~/.claude/conventions/`, and the universal entries under `~/.claude/skills/`
are symlinks into the dotfiles checkout.

This work is in the **dotfiles repo**, not crew. It is not a Jira ticket — it
follows the same in-repo handling as other dotfiles work. It is included here
because the user asked for one combined spec; it has no code dependency on
Parts 1–2 and can proceed in parallel.

## Part 4 — Document the plugin dependency

Plugins (`superpowers`, `figma`, `claude-mem`, `superpowers-chrome`) cannot be
vendored as files — they are plugin-manager installs. crew's dispatch templates
and docs reference them (e.g. `superpowers:*` skills in `ticket.md`). A fresh
clone has no signal that they are required.

Add a "Required Claude Code plugins" section to crew's `README.md` listing the
plugins crew depends on. The implementer confirms the final list by grepping
crew's templates and docs for plugin references rather than assuming.

## Doc updates

Rolled through Parts 1–4:

- `AGENTS.md` (root) — the "Before claiming work complete" reference to
  `agents-doc-parity-check` stays valid (the skill simply moves to
  `.claude/skills/`); update any wording that implies skill injection.
- `.agents/dispatch.md` — delete the "Skill injection" and "Discovered skills"
  sections; describe committed `.claude/skills/` + native discovery instead.
- `.agents/testing.md` — `bruno-collection-maintenance` is now a committed
  project skill at `.claude/skills/`, not a user-level skill; update the two
  references.
- `packages/daemon/AGENTS.md`, `packages/dashboard/AGENTS.md` — update skill
  references (`bruno-collection-maintenance`, `visual-fidelity-check`) to their
  new homes and drop "user-level" qualifiers where inaccurate.
- `README.md` — the `bruno-collection-maintenance` paragraph; add the Part 4
  plugin section.
- `docs/superpowers/specs/2026-05-13-agent-progressive-disclosure-system.md` —
  add a one-line correction note at the risk table (line ~344) flagging that
  the "Claude Code reads `AGENTS.md` natively" claim was false and pointing at
  this spec. The historical spec is otherwise left intact.

## Sequencing

The crew-side work (Parts 1, 2, 4 + doc updates) becomes one **Epic**. Rough
logical groupings, to be refined by the implementation plan:

1. **`AGENTS.md` auto-load fix** — Part 1. Self-contained; no dependency on the
   skill work. Can land first and independently.
2. **Delete the injection subsystem** — Part 2a. Code + test + template
   removal.
3. **Commit crew skills** — Part 2b + 2c. The `.gitignore` change and the two
   skill directories. Logically after grouping 2 so the "no injection" doc
   updates land coherently.
4. **Doc updates + plugin docs** — Part 4 + the doc-update list. Depends on
   groupings 1–3.

Part 3 (dotfiles) is a parallel, non-ticketed task in the dotfiles repo.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| A consumer of the deleted injection symbols is missed | Implementer greps for every deleted symbol; typecheck + test suite must pass before the PR. |
| `.gitignore` negation done wrong (`!.claude/skills/` under a broadly-ignored `.claude/`) | Use the `.claude/*` + `!.claude/skills/` form exactly as specified; verify with `git check-ignore` and `git status`. |
| Moving `bruno-collection-maintenance` / `agents-doc-parity-check` out of `~/.claude/skills/` breaks them elsewhere | They trigger only on `bruno/` and `.agents/` — directories only crew has. No other repo loses anything. |
| A `crew run` dispatch into another project loses `visual-fidelity-check` | It becomes a dotfiles-tracked user-level skill, present on the machine running crew; every dispatch sees it as a user skill regardless of target project. |
| dotfiles symlinks in git | crew/dotfiles target Linux/WSL only, where symlinks in git work; consistent with the existing symlink-based dotfiles design. |

## Out of scope / future work

- `.agents/<topic>.md` + `covers:` vs native `.claude/rules/` + `paths:`, and
  full agents.md-spec alignment — deferred to its own brainstorm
  (`docs/followups.md`, `2026-05-15 — .agents/ topic-doc system vs native
  .claude/rules/`).
- Any cross-agent (Codex, Cursor, Gemini) support.

## Open questions

None blocking. The exact Part 4 plugin list is settled during implementation by
grepping crew's references rather than guessing.
