# CREW-186 — daemon(seed): materialise transcript events for a seeded agent

Jira: https://safturento.atlassian.net/browse/CREW-186

## Goal

The dev seed (`packages/daemon/seeds/dev.ts`) inserts `agents` / `runs` / `tool_calls` rows but never materialises the JSONL transcript files that `useTimeline` actually reads. Every seeded agent's drawer renders "No timeline events yet." which blocks `visual-fidelity-check` from comparing a populated state against Figma.

After this change, at least one seeded agent (CREW-102) shows ≥2 `TimelineSection` components with content, ≥5 `TokensByTool` rows, and a transcript with prose / thinking / hook / tool-call diversity.

## Relevant files

- `packages/daemon/src/seeds/dev.ts` — moved from `packages/daemon/seeds/` so the daemon's `tsx watch` bind-mount of `src/` picks up changes without an image rebuild. Adds extra tool_calls for CREW-102, a `seedStateTransitionFixtures` helper, and a `seedTranscriptFixtures` helper that materialises a 33-event composite JSONL transcript.
- `packages/daemon/src/config.ts` — adds `CREW_TRANSCRIPTS_HOME` env var with a `transcriptsHome` field. Defaults to `undefined` (resolver falls back to `homedir()`).
- `packages/daemon/src/serve.ts` — redirects `transcriptsHome` to `<dirname(dbFile)>/seeded-transcripts` and invokes the two new seeders. Both are guarded by `typeof` checks so an older in-image `seeds/dev.js` doesn't crash the daemon.
- `packages/daemon/src/services/resolveJsonlPath.ts` — accepts a `transcriptsHome` override that maps onto `claudeProjectDirFor(worktree, home)`.
- `packages/daemon/src/container.ts` — threads `config.transcriptsHome` into `TimelineService`'s resolver.
- `packages/daemon/tsconfig.json` — drops the now-empty `seeds/**/*` include.
- `.agents/local-dev.md` — updated covers glob + seed-step description.

## Decisions

- **Move `seeds/` under `src/`.** The daemon's docker bind-mount only covers `src/`, so seed changes under the old `seeds/` directory required an image rebuild. Moving makes the seed hot-reloadable for the dev loop and unblocks in-place verification on a worktree dispatched before the change.
- **Split state_transitions and transcripts into independent idempotent seeders.** `seedFixtures` still gates on agents being empty (avoids duplicate-key crashes), but `seedStateTransitionFixtures` and `seedTranscriptFixtures` use their own per-agent / per-file gates so a running daemon whose DB was populated by an older image picks up the new content on the next reload.
- **Refactor `resolveJsonlPath` to accept a `transcriptsHome`** rather than mounting `~/.claude/projects` writable. The host bind-mount stays read-only (the real-agent safety boundary); fixture mode redirects to a sibling-of-`dbFile` path that lives on the `crew-state` volume.
- **One seeded agent populated to spec.** Scope says "at least one"; CREW-102 (PR-open) is the most demonstrative — runs through `init → running → pr_open` state windows with 33 events spanning the 25-minute run window. Other fixture agents fall back to a single section via the empty-transitions branch in `groupEventsByState`.

## Notes

- Daemon container has `HOME=/root`, so the default-mode resolver returns `/root/.claude/projects/-home-dev-Repos-crew-CREW-102/sess-c102-a.jsonl` — mounted RO from host's `~/.claude/projects/...`. The redirected fixture home becomes a sibling of `CREW_DB_FILE` (`/state`), so the seed writes JSONL to `/state/seeded-transcripts/.claude/projects/...`.
- `IngestService.start()` only tails OPEN runs; CREW-102's run is `completed_at != null`, so the seeded JSONL won't be re-processed into `tool_calls`. That's fine — `tool_calls` come from the existing fixture seed; the JSONL only needs to exist for `TimelineService.getTimeline` to read it on demand.
