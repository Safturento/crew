# CREW-167 — Skill storage + injection rework

Jira: https://safturento.atlassian.net/browse/CREW-167

## Status: BLOCKED — cannot be implemented by an autonomous `crew run`

This ticket's central deliverable is **committing three skill directories under
`<repo>/.claude/skills/`** (`agents-doc-parity-check`,
`bruno-collection-maintenance`, `visual-fidelity-check`). That cannot be done
from inside a `crew run` dispatch: the Claude Code harness masks `.claude/skills/`
as a read-only `/dev/null` device node, so no file can be created beneath it.

## Goal

Per the plan (`docs/superpowers/plans/2026-05-15-skill-storage-and-agents-autoload.md`,
Task 2): move crew's three owned skills into `.claude/skills/`, repoint
`runSkillInjection` at that source, inject all three unconditionally on every
dispatch, delete the redundant dynamic prompt-discovery (`prompts/skills.ts`),
and make the required-skills nudge static dispatch-template content.

## The blocker — what was found

A `crew run` dispatch executes under a Claude Code harness inside a write
sandbox. Probing the worktree's `.claude/` directory:

| Path | State in the dispatch sandbox |
| --- | --- |
| `.claude/` (the directory itself) | writable — new arbitrary paths can be created (`mkdir .claude/skillz_probe` succeeded) |
| `.claude/settings.json` | real file, **read-only** (in the sandbox's `denyWithinAllow`) |
| `.claude/settings.local.json` | masked `/dev/null` device node |
| `.claude/agents/` | masked `/dev/null` device node |
| `.claude/commands/` | masked `/dev/null` device node |
| **`.claude/skills/`** | **masked `/dev/null` device node** |

`.claude/skills/` is one of Claude Code's own config-loading directories. The
harness bind-mounts `/dev/null` over it so a dispatched agent cannot read or
modify the skill set the harness itself loaded. Consequences observed:

- `mkdir .claude/skills` → `File exists` (the device node occupies the name).
- `touch .claude/skills/<anything>` → `Not a directory (ENOTDIR)`.
- `rm .claude/skills` → `Device or resource busy` (it is an active mount).

So Task 2 Steps 2–4 (`git mv` `visual-fidelity-check` into `.claude/skills/`;
create `bruno-collection-maintenance/SKILL.md` and
`agents-doc-parity-check/SKILL.md` there) are all impossible, and Step 18's
verification ("confirm the three skill directories exist under `.claude/skills/`")
can never pass.

This is the same class of failure the user-level `~/.claude/CLAUDE.md`
"Don't ticket — handle manually" rule already calls out for `~/.claude/**`
work — *"Claude Code's hardcoded sensitive-file check blocks writes there even
with `--dangerously-skip-permissions`."* The plan correctly applied that rule to
Part 4 (the personal dotfiles layer) but **missed that a repo's own
`.claude/skills/` is masked by the same mechanism.** CREW-167 was ticketed for
`crew run`; it should have been (at least partly) a manual task.

## Why a partial PR was not opened

Doing only the code-side steps (repoint `runSkillInjection` at `.claude/skills/`,
delete `prompts/skills.ts` + `discoverSkills`/`renderDiscoveredSkillsBlock`,
swap the dispatch templates to static bullets) **without** the skill files in
place would leave crew strictly worse off:

- `runSkillInjection` would copy from an empty/absent `.claude/skills/` — every
  dispatch injects **zero** skills.
- The dynamic prompt-discovery that currently surfaces skills would already be
  deleted — so there is no fallback.

The result is a dispatch flow that silently injects nothing. Landing that is a
regression, so no partial PR was produced. The unit tests *could* be made green
(they use temp-dir fixtures), which makes the regression worse, not better — it
would pass CI while breaking real dispatches.

## Recommended path

CREW-167 needs to be split along the sandbox boundary:

1. **Manual step (a human, in a plain terminal — not a `crew run`, not a Claude
   Code Write):** create the three directories under `<repo>/.claude/skills/`
   and commit them. Sources:
   - `git mv packages/cli/src/lib/skills/visual-fidelity-check .claude/skills/visual-fidelity-check`
   - `.claude/skills/bruno-collection-maintenance/SKILL.md` — `cp` from
     `~/.claude/skills/bruno-collection-maintenance/SKILL.md`, or recreate from
     **Appendix A** of the plan.
   - `.claude/skills/agents-doc-parity-check/SKILL.md` — `cp` from
     `~/.claude/skills/agents-doc-parity-check/SKILL.md`, or recreate from
     **Appendix B** of the plan.
   - The `.gitignore` narrowing (Task 2 Step 1: `.claude/` → `.claude/*` +
     `!.claude/skills/`) can go in the same manual commit.
2. **Code step (safe for `crew run` once the files exist):** Task 2 Steps 5–17 —
   repoint `skillsSourceRoot()`, make injection unconditional, delete
   `prompts/skills.ts` and the `discoveredSkillsBlock` plumbing, swap the
   templates to static bullets, update the tests. This half has no `.claude/`
   write and is fully autonomous-safe — *but only after Step 1 has landed*,
   otherwise the injection points at a missing directory.

A re-dispatch of the code half could be a new ticket (e.g. "CREW-167b") gated on
the manual commit, or CREW-167 can be re-run after the manual files are pushed
to its branch.

Open question for the user: is `.claude/skills/` masking a fixed Claude Code
behavior, or can the crew dispatch sandbox be configured to expose the *target
repo's* `.claude/skills/` as writable? If the latter, the manual split is
avoidable and CREW-167 could run autonomously after a sandbox-config change.
The user-level note attributes it to Claude Code's hardcoded check, which would
mean no sandbox tweak can lift it — hence the manual recommendation above.

## Relevant files

- `docs/superpowers/plans/2026-05-15-skill-storage-and-agents-autoload.md` — Task 2 (Steps 1–19) + Appendices A/B with the skill `SKILL.md` contents.
- `docs/superpowers/specs/2026-05-15-skill-storage-and-agents-autoload-design.md` — Part 2, the design.
- `packages/cli/src/lib/skills/visual-fidelity-check/` — the skill awaiting the move.
- `packages/cli/src/lib/run/skill-injection.ts`, `skill-injection-step.ts` — the injection code to repoint.
- `packages/cli/src/lib/prompts/skills.ts` — the dynamic prompt-discovery to delete.
- `.gitignore` — the `.claude/` ignore rule to narrow.

## Notes

What is reachable from a `crew run` and what is not, for this ticket:

- Reachable: every code/test/template change under `packages/`, the `.gitignore`
  narrowing, all docs.
- Not reachable: any file write under `.claude/skills/` (and `.claude/agents/`,
  `.claude/commands/`, `.claude/settings.local.json`).
