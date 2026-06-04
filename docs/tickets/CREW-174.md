# CREW-174 — figma-snapshot --check: content-scoped freshness signal

Jira: https://safturento.atlassian.net/browse/CREW-174

## Goal

`crew figma-snapshot --check` reports STALE only when a _captured_ node's content genuinely changed — not on whole-file churn (idle autosaves, edits to unrelated pages). The freshness baseline is content-scoped to the captured nodes instead of the whole-file `figmaFileVersion` save counter.

## Relevant files

- `packages/cli/src/lib/figma-snapshot/hash.ts` — new. `hashNode` (canonical-JSON sha256 of a node's full tree).
- `packages/cli/src/lib/figma-snapshot/check.ts` — new. `checkSnapshotFreshness` — fetches captured node trees via `getFileNodes`, hashes, compares to `meta.json.nodeHashes`; returns `fresh` / `stale` (with named drifted nodes) / `no-baseline`.
- `packages/cli/src/lib/figma-snapshot/emit.ts` — `emitSnapshot` now records `nodeHashes` (hash of each captured node's full tree, before `raw` is slimmed) into `meta.json`.
- `packages/cli/src/lib/figma-snapshot/client.ts` — removed now-orphaned `getFileMeta` (the old `depth=1` whole-file probe).
- `packages/cli/src/commands/figma-snapshot.ts` — `--check` delegates to `checkSnapshotFreshness`; names drifted nodes via `index.json`.
- `.agents/dispatch.md` — Figma-snapshot section rewritten for the new behavior.

## Decisions

- **Hash the full node tree, not the slimmed `raw`.** The committed PNG reflects the full rendered tree, so a deep change (e.g. a nested text label) must be detectable. `hashNode` runs on the full tree captured from the API; the on-disk `raw` slimming is unrelated.
- **Variable-value drift is a documented narrower gap, not covered by the baseline.** A variable redefinition changes resolved hex but not a node's tree (the node references the variable by id). Resolved variable values are only available via the REST `/variables` endpoint, which requires a Figma Enterprise plan — crew is on **Pro**. So folding variable values into the baseline is infeasible in the REST-only `--check` path. Documented in `.agents/dispatch.md`; the interactive `figma-snapshot-refresh` enrichment pass is where token-value drift surfaces.
- **`figmaFileVersion` kept as informational only.** Still recorded in `meta.json` for debugging; no longer drives `--check`.
- **Removed `getFileMeta`.** It was the old whole-file probe and is now dead code.

## Notes

- The committed `.crew/figma-snapshot/meta.json` predates `nodeHashes`, so `--check` will report `no-baseline` (exit non-zero, prompting a refresh) until a real `figma-snapshot-refresh` regenerates it. Populating it requires Figma API access (network + `FIGMA_API_TOKEN`), unavailable in the dispatch sandbox — so it lands in the next interactive refresh.
- Backend/CLI-only change: no dashboard/UI surface, so visual smoke, e2e, and visual-fidelity-check are inert.
- **Integration-confidence caveat (verify at next refresh):** the baseline is hashed from `getFile`'s full-document tree at export; `--check` re-hashes from `getFileNodes`' subtree. Unit tests prove the hash/compare logic but cannot prove the two Figma endpoints serialize an *unchanged* node byte-identically (in-sandbox has no Figma access). When the next interactive `figma-snapshot-refresh` populates `nodeHashes`, run `crew figma-snapshot --check` immediately against the untouched file and confirm it reports `fresh`. If a field ordering or derived-field difference between the endpoints causes a false STALE, normalize it in `hash.ts`'s `canonicalize`.
