# CREW-155 — Phase 2: migrate `.agents/architecture.md`

Jira: https://safturento.atlassian.net/browse/CREW-155

## Goal

Replace the `.agents/architecture.md` stub with the agent-actionable layering rules + tech stack from `docs/plans/architecture.md`. Extract the rationale/narrative into `docs/rationale/architecture.md`. Delete the source. Root `AGENTS.md` inline "Architecture rules" section is removed (the index entry already points at the topic doc).

## Plan reference

`docs/superpowers/plans/2026-05-13-agent-progressive-disclosure-system.md` — "Ticket #2 — `.agents/architecture.md`" (Steps 1–10). This is the canonical Phase 2 migration procedure.

## Content audit (A / R / S)

| Section of `docs/plans/architecture.md`        | Classification | Destination                                                                                                     |
| ---------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------- |
| Context                                        | **R**          | `docs/rationale/architecture.md` — origin story                                                                 |
| Audience                                       | **R**          | `docs/rationale/architecture.md`                                                                                |
| Non-goals                                      | **R**          | `docs/rationale/architecture.md`                                                                                |
| Tech stack (table + prose)                     | **A**          | `.agents/architecture.md` — condensed table; long rationale bullets move to the rationale doc                   |
| Architecture overview (4 packages)             | **A**          | `.agents/architecture.md` — layering rules                                                                      |
| CLI / Daemon / Dashboard / Shared sub-sections | **A**          | `.agents/architecture.md`                                                                                       |
| State store                                    | **A**          | `.agents/architecture.md`                                                                                       |
| Per-project config                             | **A**          | `.agents/architecture.md` (rule); example TOML kept lean                                                        |
| Phases (1, 1.5, 2, 3, 4)                       | **R**          | `docs/rationale/architecture.md` — historical roadmap                                                           |
| Migration path for Recipes-App                 | **R**          | `docs/rationale/architecture.md`                                                                                |
| Open questions — _Distribution past Phase 1_   | **A**          | `.agents/architecture.md` (still open; one-line pointer)                                                        |
| Open questions — _Auth secrets_                | **A**          | `.agents/architecture.md` (still open; one-line pointer)                                                        |
| Open questions — _Sandbox config drift_        | **R**          | `docs/rationale/architecture.md` (settled — `crew`-generated-header pattern + `sandbox-limitations.md` shipped) |
| Open questions — _Phase 2/3 separation_        | **R**          | `docs/rationale/architecture.md` (settled — phases shipped separately)                                          |
| Open questions — _MCP tools or REST_           | **R**          | `docs/rationale/architecture.md` (settled — agent uses MCP, daemon uses REST; acceptable duplication)           |
| Conventions inherited from Recipes-App         | **A**          | `.agents/architecture.md`                                                                                       |

No sections classified **S** (stale/superseded) — all content has a destination.

## Decisions

- **Tech stack table is the current spec, not historical.** The plan doc described it as "locked through the brainstorming session"; the `.agents/` version is a rules table without that framing — agents reading it should treat entries as the canonical pick _today_. Historical context (why commander over citty, why tsx over native TS strip-types) moves to the rationale doc.
- **Per-package `AGENTS.md` "When you need it" tables already point at `.agents/architecture.md`.** No edits needed in `packages/*/AGENTS.md`.
- **Root `AGENTS.md` "Architecture rules" section is removed.** Its 5 bullets are the layering rules — duplicated in the new topic doc.
- **`docs/plans/architecture.md` is deleted, not retained as a stub.** The followup created at ticket #1 (CREW-154) called for full removal once content moved.

## Relevant files

- `.agents/architecture.md` — replace stub with full content; bump `last_updated`
- `docs/rationale/architecture.md` — new; rationale + history
- `docs/plans/architecture.md` — deleted
- `AGENTS.md` — remove inline "Architecture rules" section
