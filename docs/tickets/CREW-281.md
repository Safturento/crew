# CREW-281 — CLI: figma-snapshot --enrich flag + mergeEnrichment lib

Jira: https://safturento.atlassian.net/browse/CREW-281

## Goal

Add `crew figma-snapshot --enrich <file>` that merges a `{ nodeId: enrichment }` map
(dumped from `use_figma`) into the committed per-node snapshot files. Atomic /
fail-closed: any invalid entry ⇒ zero files written, non-zero exit. Folds the
figma-snapshot-refresh skill's per-node hand-merge (steps 5–6) into the CLI.

## Relevant files

- `packages/cli/src/lib/figma-snapshot/merge.ts` — new `mergeEnrichment` (validate + atomic write)
- `packages/cli/src/lib/figma-snapshot/index.ts` — re-export
- `packages/cli/src/commands/figma-snapshot.ts` — `--enrich` routing via `runFigmaSnapshot`

## Decisions

- Pure-filesystem lib module, no network I/O, no sibling lib cross-imports (per `packages/cli/AGENTS.md`).
- `--enrich` mutually exclusive with `--check` and `--node-id`; never touches `meta.json`.
- No HTTP route added → no Bruno endpoint, no UI → no visual fidelity gate.

## Inputs

- Spec: `docs/superpowers/specs/2026-06-23-figma-snapshot-enrich-design.md`
- Plan: `docs/superpowers/plans/2026-06-23-figma-snapshot-enrich.md` (Tasks 1–3)

## Notes

Skill SKILL.md rewrite is out of scope (interactive ticket, blocked on this landing).
