# `crew figma-snapshot` selective export — design

**Date:** 2026-05-19
**Status:** Draft for review
**Branch:** `docs/figma-snapshot-selective-export-spec`

## Context

`crew figma-snapshot` today supports only `--check` (boolean staleness probe) and a
full page-walk export. Every refresh re-fetches the entire Figma file, re-emits
per-node JSON + PNGs for every exportable node on every configured page, and then
the `figma-snapshot-refresh` skill enriches each node via the Plugin API in
batched `use_figma` calls. A single-component Figma edit — e.g. flipping
AgentRow's quick-action buttons from `xs` to `sm` — invalidates the snapshot in
exactly one place but still forces the full export + multi-batch enrichment
dance.

Most refreshes in practice are single-node touch-ups: a design-system component
gets a property tweak, a token bound to one set of nodes changes, an icon is
swapped. The full-document cost compounds as the design system grows.

This work adds a `--node-id <ids>` flag (with an optional `--page <name>` escape
hatch for unknown IDs) so the CLI can fetch and emit only the named nodes,
skipping the full file fetch entirely. The `figma-snapshot-refresh` skill grows
a decision step that steers single-node refreshes through this faster path.

## Inputs

- Existing snapshot-refresh skill: `.claude/skills/figma-snapshot-refresh/SKILL.md` + `enrichment-script.js`
- Existing CLI: `packages/cli/src/commands/figma-snapshot.ts`, `packages/cli/src/lib/figma-snapshot/{emit,client}.ts`
- Figma REST API docs (relevant endpoint: `/v1/files/{file_key}/nodes?ids=...`)
- Sourcing followup: `docs/followups.md` 2026-05-19 entry — surfaces this work as a hard prereq for the AgentRow card-redesign `crew run` (the `xs→sm` Figma edit needs to land in the committed snapshot before `visual-fidelity-check` validates the rewritten code)

## Non-goals

1. **Auto-detection of changed nodes is forward-path only.** Figma REST does not
   expose per-node `lastModified`; auto-detection requires hash-diffing the full
   document, which still pays the heavy fetch cost. The forward-path section
   below describes the eventual shape; this design does not ship it.
2. **No `raw` subtree size reduction.** The 632 KB AgentRow composite JSON
   problem is tracked separately in the 2026-05-12 followup (updated this
   session). Selective export changes *which* JSONs you regenerate; subtree
   reduction changes the per-file size. Complementary, not the same work.
3. **No new project-config fields.** The flag is CLI-only; nothing in
   `[visual_fidelity]` or any TOML changes.
4. **No bootstrap via partial.** You can't initialize a snapshot with
   `--node-id` — partial refresh always reads the committed `index.json` for
   page assignment lookups, so a full export must run first.

## CLI surface

Two new flags on the existing `crew figma-snapshot` command:

```
--node-id <ids>     Comma-separated Figma node IDs to refresh. Each ID must
                    already exist in the committed snapshot's index.json, OR
                    --page must be supplied for unknown IDs. Cannot be combined
                    with --check.

--page <name>       Page name for any unknown IDs in --node-id. Must match a
                    configured page in [visual_fidelity].figma_pages. Ignored
                    when every --node-id value is already known (the node's
                    existing page assignment is reused).
```

**Validation order** (fail-fast before any network call):

1. Mutual exclusion: `--node-id` + `--check` → reject (`error: --check and --node-id are mutually exclusive`).
2. `discoverProjectConfig(cwd)` — same gate as today.
3. `[visual_fidelity]` block present — same gate as today.
4. Committed `index.json` exists at `<snapshot_path>/index.json` — partial refresh needs it for known-ID lookups. Missing → `error: no committed snapshot at <path> — run \`crew figma-snapshot\` first (full export)`.
5. Parse `--node-id` (split on `,`, trim, drop empties). Empty result → `error: --node-id requires at least one node ID`.
6. Classify IDs against committed `index.json`: partition into `known` and `unknown`.
7. Unknown-ID gate:
   - `unknown.length > 0 && !--page` → `error: node(s) X, Y not in committed snapshot — pass --page <name> to add them, or run \`crew figma-snapshot\` for a full export`.
   - `--page <name>` not in `[visual_fidelity].figma_pages` → `error: page '<name>' not in [visual_fidelity].figma_pages (configured: <list>)`.
8. Page-mismatch gate: `--page` present AND any `known` ID's existing entry has `page !== <name>` → `error: node X is on page '<existing>', not '<name>'; partial refresh does not move nodes between pages`.

On all-passes, hand off to `emitPartialSnapshot` with pre-resolved `targets`.

## Internals

### New `FigmaRestClient.getFileNodes`

Adds a single method to `client.ts`:

```ts
export interface FigmaFileNodesResponse {
  nodes: Record<string, { document: FigmaNode } | null>;
}

async getFileNodes(fileKey: string, nodeIds: string[]): Promise<FigmaFileNodesResponse> {
  const ids = nodeIds.join(',');
  const path = `/files/${encodeURIComponent(fileKey)}/nodes?ids=${encodeURIComponent(ids)}`;
  return this.req<FigmaFileNodesResponse>(path);
}
```

Figma returns `null` for IDs it can't find (deleted nodes, bad IDs) rather than
404. The partial emitter treats this as a fail-closed condition (see below).

### New `emitPartialSnapshot`

A sibling to `emitSnapshot` in `emit.ts`. Same module, shared image-pass helper
(extracted from current `emitSnapshot`).

Signature:

```ts
export interface EmitPartialSnapshotOptions {
  fileKey: string;
  outDir: string;
  client: FigmaRestClient;
  fetchImage?: (url: string) => Promise<Buffer>;
  imageScale?: number;
  // Pre-resolved at the command layer: each entry pairs a requested node ID
  // with the page directory it belongs in. Known IDs use their existing
  // index.json entry's page; unknown IDs use the CLI-supplied --page value.
  targets: Array<{ nodeId: string; page: string; dir: string }>;
}

export interface EmitPartialSnapshotResult {
  nodesRefreshed: number;
}
```

Procedure:

1. Fetch named nodes via `client.getFileNodes(fileKey, ids)`.
2. Read existing `index.json` (CLI layer already validated it exists).
3. **Buffer all writes in memory** (atomic flush). Walk `targets`:
   - If `response.nodes[nodeId]` is `null`, record as not-found; do not buffer anything for this ID.
   - Otherwise, buffer the per-node JSON payload and the `index.json` entry update.
4. **Fail-closed gate.** If any IDs were not-found → throw with the list. No disk writes happened yet (buffered).
5. Flush all buffered writes:
   - `mkdir -p` each target's directory
   - Write each per-node JSON
   - Write the updated `index.json` (siblings preserved by passing through the in-memory object)
6. Image pass — only for refreshed nodes, via the shared `runImagePass` helper. Same lenient behavior as the full path (per-image failures warn and skip the PNG; the metadata is already on disk).

**Notable behaviors:**

- **No `meta.json` write.** `figmaFileVersion` and `capturedAt` are untouched. `--check` continues to report stale until a full refresh.
- **`index.json` updates only the named entries.** Siblings are byte-stable across the round-trip (same JSON serializer + same key order).
- **Atomic from the user's perspective.** A partial refresh either succeeds wholesale (all named nodes get new JSON + an attempt at a new PNG), or it leaves the snapshot exactly as it was.

### Existing `emitSnapshot` — minimal refactor

The image-pass block in current `emitSnapshot` extracts into the shared
`runImagePass(opts, targets)` helper. Net diff: ~10 lines in `emitSnapshot`
replaced with one call.

## `figma-snapshot-refresh` skill update

The current procedure assumes full refresh. The update inserts a decision step
between "freshness check" and "REST export" so single-node touch-ups go through
the partial path. See `.claude/skills/figma-snapshot-refresh/SKILL.md`:

```markdown
- [ ] 1. Freshness check. (unchanged)

- [ ] 2. Choose: full or partial refresh.

  - Partial when you can name the changed nodes.
  - Full when you don't know what changed (token cascade, multiple edits, etc.).

  Partial is strictly faster but does NOT update meta.json. --check keeps
  reporting stale until a full refresh.

- [ ] 3p. Partial — `crew figma-snapshot --node-id <ids> [--page <name>]`.
- [ ] 3f. Full — `crew figma-snapshot` (unchanged).

- [ ] 4. Enrich. Same enrichment-script.js call against use_figma; the ID set
  is whichever path you took (partial = the --node-id list; full = every key
  of index.json).

- [ ] 5. Merge. (unchanged) — partial refresh touches only the named files.

- [ ] 6. Verify — fail closed. (unchanged) — partial verifies only the named nodes.

- [ ] 7. Commit. (unchanged)
```

The "Red flags — STOP" table grows one row:

```
| "I'll partial-refresh and update meta.json myself" | Don't. meta.json's
                                                       staleness is the safe
                                                       signal that siblings may
                                                       have drifted. Full
                                                       refresh is the way to
                                                       clear stale. |
```

The `enrichment-script.js` asset is unchanged.

## Tests

Three layers, summarized:

**`client.test.ts`** — extend with one new test:
- `getFileNodes` builds the correct URL (`/files/{key}/nodes?ids=...`) and passes through the response.

**`emit.test.ts`** (or sibling `emit.partial.test.ts`) — partial-path coverage. Tests call `emitPartialSnapshot` directly with a pre-resolved `targets` array (the known/unknown classification + `--page` resolution is the command layer's job; tests 8–10 cover that):
1. Happy path — single target writes new JSON + updates the named `index.json` entry; siblings untouched; `meta.json` untouched.
2. Happy path — multi-target with two different page dirs in the `targets` array; each node lands in its assigned dir.
3. Fail-closed — Figma returns `null` for one ID; throws; no per-node JSON or `index.json` mutation on disk (atomic buffer flush).
4. Image-pass failure is non-fatal — JSON and `index.json` already on disk; warning emitted; partial PNGs accepted.
5. Sibling preservation — seeded `index.json` has 10 entries, partial refresh touches 2; the other 8 entries are byte-identical after the rewrite.

**`figma-snapshot.test.ts`** — command-layer validation:
6. `--node-id` + `--check` exits non-zero (mutual-exclusion).
7. `--node-id` with no committed `index.json` exits non-zero ("run full export first").
8. `--node-id <unknown>` without `--page` exits non-zero (pass-page hint).
9. `--node-id <known>` with `--page <different>` exits non-zero (page mismatch).
10. `--node-id <known>,<unknown>` with `--page <name>` calls `emitPartialSnapshot` with the right targets array.

The `figma-snapshot-refresh` skill update is markdown; no test suite. Manual
narrative-coherence skim after the edits land.

## Verification

- `npm test --workspace=crew-cli` — full crew-cli suite green
- `npm run typecheck --workspace=crew-cli` — clean
- `npm run lint` — clean
- **Real Crew Figma file smoke** — run `crew figma-snapshot --node-id 212:910` against this repo's checkout. Assert:
  - Only `composites/212-910.json` + `composites/212-910.png` change in `git status`
  - `index.json` has the same number of entries as before
  - The `212:910` entry's `name`/`type` reflect the live Figma data
  - `meta.json` is byte-identical to before
  - `crew figma-snapshot --check` still reports stale

This smoke also doubles as the snapshot refresh that gates the AgentRow
implementation `crew run` (CREW-176).

## Forward path

1. **Detection mechanism for "what changed since meta."** Add a `contentHash`
   field to each `IndexEntry`, computed at full-export time over a stable
   serialization of the node's `raw` (and eventually `enrichment`). Introduce
   `crew figma-snapshot --check --list-changed`: fetches the live file,
   recomputes hashes, diffs against committed `index.json`, prints the changed
   IDs. User pipes that into `--node-id`. Net savings: image render + enrichment
   skipped for unchanged nodes (full file fetch still pays for detection, but
   that's the cheap step compared to the Figma render endpoint and Plugin API
   batches). Lands when the manual single-node identification starts feeling
   clunky.

2. **`--check` learning about partial refreshes.** If "stale forever after
   partial refresh" trips agents — e.g., `visual-fidelity-check` calling
   `--check` and bailing on stale when the named node is actually current —
   upgrade `meta.json` to track partially-refreshed nodes:
   ```json
   {
     "figmaFileVersion": "2354949...",
     "capturedAt": "2026-05-15T...",
     "partialRefreshes": [
       { "fileVersion": "2355431...", "nodeIds": ["212:910"], "at": "2026-05-19T..." }
     ]
   }
   ```
   `--check` then reports `partial` with a per-node breakdown of fresh vs maybe-stale. **Explicit watch item for the first weeks of partial-refresh use.**

3. **`--page-all <name>`** — refresh every node currently filed under one page without enumerating IDs. Useful when a token cascade hits a whole page. YAGNI today; surface if someone hits the case.

4. **Coupling with `raw` subtree size reduction** (2026-05-12 followup). Once
   selective export ships, the per-file size question becomes the next
   bottleneck — selective export reduces which JSONs you regenerate, but each
   individual file is still potentially huge. The next figma-snapshot brainstorm
   should tackle `raw` shape; both concerns share the same module and a single
   design pass can reconcile them.

## Followup correction

The `docs/followups.md` 2026-05-19 entry "`crew figma-snapshot` has no per-node
refresh" moves to Resolved as part of the implementing PR, with a one-line
addendum noting which flag landed (`--node-id` with optional `--page`).
