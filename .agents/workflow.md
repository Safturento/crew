---
name: workflow
description: CREW-* tickets, followups, specs/plans, branching
last_updated: 2026-06-29
covers:
  - 'docs/tickets/**'
  - 'docs/superpowers/**'
  - 'docs/followups.md'
  - 'docs/followups/**'
  - 'docs/mumen/**'
---

# Workflow

Repo-specific overlay on the user-level `~/.claude/CLAUDE.md` "Planning workflow" + "Followup detection" sections. Read those first — this doc names the crew-specific instances (Jira prefix, file locations, branch shapes) and **does not** restate the rules.

## 1. Jira prefix

Crew's Jira project key is `CREW`. Every ticket in this repo is `CREW-<n>`. When mixing repos in the same session, confirm `CREW-*` before implementing anything in this worktree — see the user-level memory entry on verifying repo-vs-ticket-project alignment.

## 2. Doc taxonomy (where things live)

Canonical taxonomy is `.agents/README.md` §10 ("What does NOT belong in `.agents/`"). Crew's instances of those rows:

| Content                                                 | Location                                              |
| ------------------------------------------------------- | ----------------------------------------------------- |
| Per-ticket work log                                     | `docs/tickets/<KEY>.md` (from `_template.md`)         |
| Design spec from `superpowers:brainstorming`            | `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` |
| Implementation plan from `superpowers:writing-plans`    | `docs/superpowers/plans/YYYY-MM-DD-<topic>.md`        |
| Long-form architecture rationale                        | `docs/rationale/<topic>.md`                           |
| Mumen-tier scoping                                      | `docs/mumen/YYYY-MM-DD-<topic>.md`                    |
| Followups queue                                         | `docs/followups.md` (index) + `docs/followups/*.md` (per-topic) |
| Agent-actionable repo rules                             | `.agents/<topic>.md` (this directory)                 |
| Skill fixtures (golden data for `superpowers:*` skills) | `docs/superpowers/skill-fixtures/<skill>/`            |

If a new doc doesn't fit a row above, re-check `.agents/README.md` §10 before inventing a new home.

## 3. Tickets workflow

- For any non-trivial ticket, create `docs/tickets/<KEY>.md` from `_template.md` at the start of the work and update it as decisions land. The file is the ticket's working memory — Goal, Relevant files, Decisions, Open questions, Ruled out, Notes.
- The `crew run <KEY>` autonomous dispatch expects this file to either exist or be created during the run. Trivial fixes (one-line, typo, config tweak) can skip it.
- Use the file to record _why_-decisions you'd otherwise lose between sessions; the commit history captures _what_ changed, not the rejected alternatives.

## 4. Specs and plans

- Specs come out of `superpowers:brainstorming`. Filename: `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`.
- Plans come out of `superpowers:writing-plans`. Filename: `docs/superpowers/plans/YYYY-MM-DD-<topic>.md`.
- The date prefix is the day the doc was authored, not the day the work ships. Don't rename when work lands on a different date.
- Both directories are flat — no nested subdirectories. Recent files in each are the freshest reference for tone and shape.

## 5. Mumen tier

`docs/mumen/` holds middle-tier scoping for unit-of-work-sized tasks (roughly one Jira ticket) that need more than "just do it" but less than a full brainstorm+plan pass. See the user-level `mumen` skill — invoke it only when the user explicitly says `/mumen` or names it. Don't auto-pick this tier; the human picks.

## 6. Followups

The queue grew past a single file, so crew uses the **split layout** the user-level convention describes for large queues. Format (entry template, ticketing protocol, Active/Resolved/Abandoned lifecycle, Epic-exception rule) is defined in `~/.claude/CLAUDE.md` "Followup detection" — follow that verbatim. The split only changes *where entries physically live*, not how they're written:

- **`docs/followups.md`** is the index/router — intro, format pointer, and the topic→file table. It holds no entries; don't add any there.
- **Active entries** live in per-topic files under `docs/followups/`, partitioned to mirror the `.agents/*.md` `covers:` topics. Route a new entry by the area it touches:

  | Entry subject | File |
  | --- | --- |
  | Figma DS components/tokens, Crew DS | `docs/followups/figma-crew-ds.md` |
  | `figma-snapshot`, `visual-fidelity-check`, enrichment tooling | `docs/followups/visual-fidelity.md` |
  | Dashboard React UI — drawers, components, screens | `docs/followups/dashboard-ui.md` |
  | Daemon services/routes, `crew` CLI, dispatch flow | `docs/followups/daemon-cli-dispatch.md` |
  | docker/env, project config, architecture | `docs/followups/architecture-config.md` |
  | conventions, docs, workflow, the followup system itself | `docs/followups/process-conventions.md` (also the catch-all when nothing fits) |

- **Resolved / Abandoned** are archive files: `docs/followups/resolved.md` and `docs/followups/abandoned.md`. Resolving an entry cuts it from its topic file into the archive file — same protocol as the single-file convention, just across files instead of across `##` sections.
- Within every file, entries are `##` headings, newest at top.
- At the start of substantial new work in this repo, skim the relevant topic file(s) for items to fold in or flag before scoping.
- Entries are versioned with the code — surface them in PR descriptions when added, and move them to Resolved in the same PR that ships the fix (Epic exception aside).

## 7. Branching

Two patterns coexist on crew, both visible in `git log --oneline -30`:

| Source                             | Branch shape                                 | Example                                      |
| ---------------------------------- | -------------------------------------------- | -------------------------------------------- |
| `crew run <KEY>` dispatch          | `<KEY>` (bare ticket key)                    | `CREW-140`                                   |
| Hand-authored ticketed work        | `<KEY>` or `feat/<scope>` if not in Jira yet | `CREW-154`, `feat/ticket-10-doc-parity-hook` |
| Doc-only PR without a ticket       | `docs/<scope>`                               | `docs/agent-progressive-disclosure-system`   |
| Chore (config, sandbox, gitignore) | `chore/<scope>`                              | `chore/docker-compose-resource-limits`       |
| Bug fix without a ticket           | `fix/<scope>`                                | `fix/baseline-capture`                       |

Universal rule: never commit on `main`. `crew run` creates the `<KEY>` branch for you; for hand-authored work, branch before staging anything. See user-level `~/.claude/CLAUDE.md` "Branching" section for the pre-commit branch check.

## 8. Worktree-per-planning-session

When starting any brainstorm or `writing-plans` flow, provision a dedicated git worktree before touching files. This isolates planning work from any other session (a parallel Claude agent, or your own canonical worktree) so concurrent branch switches and `npm install` runs can't clobber each other.

```bash
# At start of planning. Use the ticket key when known, else a topic slug.
git -C ~/Repos/crew worktree add \
  -b docs/<topic>-spec \
  .planning-worktrees/<topic> \
  origin/main
```

Rules:

- **Path:** worktrees go under `.planning-worktrees/<topic>/` inside the main repo. The path is gitignored. (`~/Repos/crew-plan-<topic>/` outside the repo also works for human-driven sessions, but Claude Code sandboxes typically can't write outside the main repo dir.)
- **Branch off `origin/main`** explicitly so the new worktree doesn't inherit whatever branch the main worktree happens to be on.
- **All file ops target absolute paths under the worktree.** Read/Edit/Write the full `.planning-worktrees/<topic>/...` path; never relative paths that resolve to main.
- **All git ops use `git -C .planning-worktrees/<topic>`.** Bare `git` from the wrong CWD lands the change on the wrong branch.
- **Bash with CWD dependencies:** `cd .planning-worktrees/<topic> && ...`.
- **On merge** (or when the planning session ends and the branch is no longer needed): `git -C ~/Repos/crew worktree remove .planning-worktrees/<topic>`.

This convention applies even when only one session is active — `.planning-worktrees/<topic>` is cheap, and the discipline keeps a future parallel session safe by default.

The previous convention (operating directly in the main worktree) is still acceptable for: small in-place doc edits with no in-flight planning elsewhere, fix-pr review comments, ticket-body updates that don't touch repo files.

## 9. The "stop after planning + ticketing" rule

This repo is the canonical site of the rule — crew itself is what runs the autonomous-dispatch flow that the rule gates on. Concretely:

1. Brainstorm + plan produce a spec and a plan doc.
2. Translate the plan into an Epic + child tickets in Jira; link "blocks" / "is blocked by" edges; discuss the parallel-vs-sequential schedule.
3. **Stop.** The user triggers implementation via `crew run <KEY>` (one ticket at a time) or by manually picking up a child ticket. Implementer subagents are not dispatched from the planning session.

Reviews of completed work are different — the user asks explicitly when those are wanted.

For work whose deliverable lives under `~/.claude/**` (user-level skills, global CLAUDE.md edits, settings), skip ticketing entirely and author in-session — the dispatch flow can't write there. See user-level CLAUDE.md "Don't ticket — handle manually".

## 10. Parking planning intentions in Jira (not session memory)

Crew's instance of the user-level "Park planning intentions in Jira, not memory" rule. When we decide something is worth planning — a followup graduating, a fresh scope — create the CREW artifact immediately rather than caching the intention in a session memory or leaving it only in `docs/followups.md`.

- **Create as** an Epic (large effort), a child of an existing Epic, or a standalone Task — sized to the work.
- **Planning state = Jira status:**
  - **`Backlog`** — parked, **not yet planned**. The queue of things to plan. (Custom status added to the CREW workflow on 2026-06-01 specifically for this — the workflow's only other To-Do-category status, `Ready for Development`, means "planned and ready," so a distinct backlog status was needed.)
  - **`Ready for Development`** — brainstorm + spec + plan done, on the board, awaiting `crew run <KEY>`.
  - then `In Progress` → `In Review` → `Done`.
  - New tickets should land in `Backlog` by default; promote to `Ready for Development` only once a spec + plan exist. (Get the live transition id from `jira_get_transitions` — do not hard-code it; and verify the move actually took, the "To Do" transition in this workflow is a no-op that leaves the ticket in `Ready for Development`.)
- **Stamp the followup** with its `**Ticket:**` line when it graduates (per user-level `~/.claude/CLAUDE.md` "Ticketing a followup").
- **Keep the followup and its ticket in sync.** A stamped followup and its ticket are two copies of the same pre-planning intent. If you revise one — the followup body, or the ticket description — mirror the change into the other in the same pass, so their contexts never drift. (This is the recurring drift risk the parking convention introduces; CREW-211 tracks whether tooling beyond this convention is warranted.)
- **Answering "what's queued for planning?"** — query Jira first, never session memory or `followups.md` alone:
  ```
  project = CREW AND status = "Backlog" ORDER BY updated DESC
  ```
  Also scan In-Progress Epics for unplanned children. Reconcile each candidate against the code (a ticket can be stale-open while the work already shipped under another Epic) before reporting it as queued.

## See also

- User-level `~/.claude/CLAUDE.md` — "Planning workflow", "Park planning intentions in Jira, not memory", "Followup detection", "Branching", "Secrets".
- User-level `~/.claude/conventions/documentation.md` — generic plan/spec/ticket structure, Jira description authoring conventions.
- `.agents/dispatch.md` — what `crew run` actually does once the user triggers it.
