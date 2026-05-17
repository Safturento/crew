# CREW-172 — Enrichment subprocess can't reach the Figma MCP

Jira: https://safturento.atlassian.net/browse/CREW-172

## Goal

`crew figma-snapshot`'s Plugin-API enrichment pass must actually run. "Done" =
`defaultRunner` spawns `claude` with `--dangerously-skip-permissions` (so the
non-interactive subprocess can call `mcp__plugin_figma_figma__use_figma`
without a permission prompt denying it), the spawn contract is single-sourced
with `lib/claude/spawn.ts`, a degraded enrichment is visible in `crew run`
output, and a test exercises the real argv.

## Relevant files

- `packages/cli/src/lib/claude/spawn.ts` — exports the shared invocation
  contract: `CLAUDE_PERMISSION_FLAG` (the `--dangerously-skip-permissions`
  constant) and `claudeSpawnEnv()` (process.env merge + `~/.local/bin` PATH
  augmentation). `spawnClaudeResume`/`spawnClaudeFresh` refactored onto both.
- `packages/cli/src/lib/figma-snapshot/plugin-api-enrichment.ts` —
  `defaultRunner` now passes `CLAUDE_PERMISSION_FLAG` and `claudeSpawnEnv()`;
  exported so its real argv is testable.
- `packages/cli/src/lib/run/figma-snapshot-step.ts` —
  `runPreDispatchFigmaSnapshot` inspects `result.enrichment.kind`: logs the
  enriched node count on `ok`, emits a visible `warn` on `skipped`/`warning`.

## Decisions

- **Single-source via two small exports, not a shared spawn function** — the
  two call sites genuinely diverge in shape (`spawn*` pipe stdio to a log file
  and return the live subprocess; `defaultRunner` captures stdout as a string
  with a 90s timeout). Forcing them through one function would mean a
  union-typed grab-bag. Extracting just the _contract that must not drift_ —
  the permission flag + PATH augmentation — keeps one source of truth without
  contorting either caller. This is the cross-import the cli `AGENTS.md` warns
  about; the explicit reason is the ticket's single-source mandate.
- **Observability logs, doesn't change the result shape** — a degraded
  enrichment still leaves a usable REST-only snapshot, so `runPreDispatch...`
  still returns `kind: 'ok'`; the warning is purely a visibility fix.

## Notes

Backend/CLI-only change — no HTTP route, no UI, no schema change. Blocks
CREW-152. Independent of CREW-171 (different files).
