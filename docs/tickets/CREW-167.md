# CREW-167 — Skill storage + injection rework: commit crew-owned skills in-repo

Jira: https://safturento.atlassian.net/browse/CREW-167

## Goal

The autonomous, code-only half of Task 2 of the skill-storage plan (Steps
5–19). The skill-file migration — committing the three skills under
`.claude/skills/`, narrowing `.gitignore`, repointing `skillsSourceRoot()` —
was the interactive half, done in PR #221. This ticket: make `runSkillInjection`
inject the crew-owned skill set unconditionally on every dispatch, delete the
redundant dynamic prompt-discovery subsystem, and replace it with static skill
bullets in the dispatch templates. "Done" = injection is unconditional, no
`discoverSkills` / `renderDiscoveredSkillsBlock` / `discoveredSkillsBlock` /
`skillsApplicableTo` / `SKILL_APPLICABILITY` references remain in `packages/`,
the three skills appear as static bullets in all three templates, and lint /
typecheck / tests pass.

## Relevant files

- `packages/cli/src/lib/run/skill-injection.ts` — `SKILL_APPLICABILITY` /
  `skillsApplicableTo` replaced with the unconditional `CREW_OWNED_SKILLS`
  constant + `crewOwnedSkills()`.
- `packages/cli/src/lib/run/skill-injection-step.ts` — `runSkillInjection`
  iterates `crewOwnedSkills()`; `config` field and the `skipped` result kind
  dropped (the list is never empty).
- `packages/cli/src/commands/run.ts` — `runSkillInjection` call moved out of
  the `if (config.visual_fidelity)` block so it runs on every dispatch;
  `runPreDispatchFigmaSnapshot` stays inside.
- `packages/cli/src/lib/prompts/skills.ts` + `skills.test.ts` — deleted (the
  dynamic prompt-discovery module).
- `commands/resume.ts`, `commands/fix-pr.ts`, `lib/run/verify-authored-e2e.ts`
  — `discoverSkills` / `renderDiscoveredSkillsBlock` plumbing removed.
- `lib/prompts/{ticket,fix-pr,resume}.ts` — `discoveredSkillsBlock` option
  removed from the three prompt builders.
- `lib/prompts/templates/{ticket,fix-pr,resume}.md` — `{{discoveredSkillsBlock}}`
  placeholder replaced with three static crew-owned skill bullets.
- `.agents/dispatch.md` — Skills section, prompt-builder table, and step 11
  updated to describe the unconditional-injection model (agents-doc-parity).

## Decisions

- **Injection is unconditional; skills self-gate.** Each crew-owned skill's own
  `description` decides when it fires, so injecting a non-applicable one is
  harmless — simpler than a per-skill `ProjectConfig` predicate.
- **`.agents/dispatch.md` updated in this PR, not deferred to CREW-168.** Its
  Skills section described `SKILL_APPLICABILITY` / `discoverSkills` as live
  code; this PR deletes that code, so leaving the doc would ship a PR whose
  doc contradicts its own diff. CREW-168 still owns the broader doc pass.

## Notes

Implements Task 2 Steps 5–19 of
`docs/superpowers/plans/2026-05-15-skill-storage-and-agents-autoload.md`.
Gated on PR #221 (Steps 1–4) — merged. Task 3 is tracked under sibling ticket
CREW-168 of Epic CREW-169.
