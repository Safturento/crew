# CREW-175 — Re-aim dashboard .figma.tsx Code Connect URLs at the live Figma file

Jira: https://safturento.atlassian.net/browse/CREW-175

## Goal

Every dashboard `.figma.tsx` whose `figma.connect(...)` URL targeted the archived
Crew DS file (`DsA7QuEa2WthDATkksd1Bq`) now targets the live consolidated file
(`9FeJPriqdsdA4n9R5Xsrr8`) with a `node-id` present in `.crew/figma-snapshot/index.json`
— so `visual-fidelity-check` Step 4 resolves render composites mechanically instead of
relying on a name-based fallback.

## Relevant files

- `packages/dashboard/src/components/**/*.figma.tsx` — the 14 files pointing at the archived file
- `.crew/figma-snapshot/index.json` — authoritative component-name → node-id map (from CREW-173)
- `docs/followups.md` — the 2026-05-12 followup graduates to Resolved here

## Node-id map (archived → live)

Resolved by matching each `.figma.tsx` component name to the snapshot node with the
same `name` in `.crew/figma-snapshot/index.json`:

| `.figma.tsx`       | archived node | live node | snapshot name      |
| ------------------ | ------------- | --------- | ------------------ |
| TopNav             | 21-2          | 245-133   | TopNav             |
| AgentRow           | 21-9          | 212-910   | AgentRow           |
| AgentsList         | 21-25         | 220-227   | AgentsList         |
| AgentBody          | 24-2          | 220-246   | AgentBody          |
| BrandMark          | 19-3          | 220-211   | BrandMark          |
| ProjectSection     | 21-21         | 220-224   | ProjectSection     |
| ProjectRow         | 79-14         | 220-300   | ProjectRow         |
| ProjectHeader      | 82-15         | 220-315   | ProjectHeader      |
| ProjectConfigBlock | 83-15         | 220-318   | ProjectConfigBlock |
| StateHistoryBar    | 25-4          | 220-257   | StateHistoryBar    |
| TokenTable         | 26-4          | 220-287   | TokenTable         |
| ViewportFrame      | 27-4          | 220-292   | ViewportFrame      |

## Decisions

- **StateBadge / CountBadge left untouched** — neither has a node named `StateBadge`
  or `CountBadge` in the committed snapshot. Both were consolidated into the unified
  `Pill` set (`272:120`) during the 2026-05-12 DS work. Per the ticket's "no snapshot
  match — do NOT guess" rule, these two keep their archived URLs; flagged in the PR
  description for manual follow-up.
- **`ui/*.figma.tsx` out of scope** — the seven shadcn primitives (button, badge,
  input, label, form, dialog, separator) target the Core DS file
  (`UkPJj6vd7HMKcey7M0XF4N`), not the archived Crew DS. Untouched.
- **URL slug `Crew`** — the live file's slug, matching every other in-repo reference
  to `9FeJPriqdsdA4n9R5Xsrr8`.

## Notes

`figma connect publish` is deliberately not run — crew is on Figma Pro; `.figma.tsx`
files are inert docs read from disk by `visual-fidelity-check`.
