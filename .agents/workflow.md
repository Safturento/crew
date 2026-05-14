---
name: workflow
description: CREW-* tickets, followups, specs/plans, branching
last_updated: 2026-05-14
covers:
  - 'docs/tickets/**'
  - 'docs/superpowers/**'
  - 'docs/followups.md'
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
| Followups queue                                         | `docs/followups.md` (single file)                     |
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

- The queue lives at `docs/followups.md`. Format (template, ticketing protocol, Active/Resolved/Abandoned sections, Epic-exception rule) is defined in user-level `~/.claude/CLAUDE.md` "Followup detection" section — follow that verbatim.
- At the start of substantial new work in this repo, skim `docs/followups.md` for items relevant to the task. Some may be ready to fold in; others worth flagging before scoping.
- File entries are versioned with the code — surface them in PR descriptions when added, and move them to Resolved in the same PR that ships the fix (Epic exception aside).

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

## 8. The "stop after planning + ticketing" rule

This repo is the canonical site of the rule — crew itself is what runs the autonomous-dispatch flow that the rule gates on. Concretely:

1. Brainstorm + plan produce a spec and a plan doc.
2. Translate the plan into an Epic + child tickets in Jira; link "blocks" / "is blocked by" edges; discuss the parallel-vs-sequential schedule.
3. **Stop.** The user triggers implementation via `crew run <KEY>` (one ticket at a time) or by manually picking up a child ticket. Implementer subagents are not dispatched from the planning session.

Reviews of completed work are different — the user asks explicitly when those are wanted.

For work whose deliverable lives under `~/.claude/**` (user-level skills, global CLAUDE.md edits, settings), skip ticketing entirely and author in-session — the dispatch flow can't write there. See user-level CLAUDE.md "Don't ticket — handle manually".

## See also

- User-level `~/.claude/CLAUDE.md` — "Planning workflow", "Followup detection", "Branching", "Secrets".
- User-level `~/.claude/conventions/documentation.md` — generic plan/spec/ticket structure, Jira description authoring conventions.
- `.agents/dispatch.md` — what `crew run` actually does once the user triggers it.
