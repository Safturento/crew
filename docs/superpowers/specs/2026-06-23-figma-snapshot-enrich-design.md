# `crew figma-snapshot --enrich` — programmatic enrichment merge

**Date:** 2026-06-23
**Status:** Design (brainstormed 2026-06-23) — Epic/tickets to be created
**Source:** reminder `figma-snapshot-enrichment-friction` (friction hit during CREW-247)

## Problem / purpose

The `figma-snapshot-refresh` skill regenerates the committed visual-fidelity snapshot at `.crew/figma-snapshot/`. Its enrichment phase (skill steps 4–6) has a **data-to-disk gap**:

- **Step 4** calls `use_figma` with `enrichment-script.js`. The result — a `{ nodeId: enrichmentObject }` map — lands in the *agent's context*, not on disk.
- **Step 5** asks the agent to open each per-node file (`<page>/<id>.json`) and hand-merge that node's `enrichment` object into it.
- **Step 6** is a fail-closed verify the agent self-polices.

For a full 51-node refresh, the ~20 KB `use_figma` response cap forces ~9 batches, and each batch's JSON must be hand-carried into N per-node files. CREW-247's 8-node *partial* refresh already cost 3 batches + 3 hand-written temp files + a throwaway `merge-enrichment.mjs`. The per-node hand-merge is slow, token-heavy, and error-prone, and the fail-closed verify depends on the agent not fluffing a checklist.

## Root constraint (what bounds the fix)

Enrichment **must** flow through `use_figma` into the agent's context:

- It needs the **Figma Plugin API** (`figma.variables.getVariableByIdAsync` alias-chain resolution; the nested `componentInstances` tree walk). The REST API the CLI already uses for the snapshot export cannot produce it — that is the entire reason for the two-phase (REST export → Plugin-API enrich) design.
- The Figma plugin sandbox **cannot write to the local filesystem**.
- The agent's only persist mechanism is `Write`.

Therefore **one `Write` per batch is the irreducible floor** — the batch blob has to pass through the agent regardless. What is *not* irreducible, and what this work removes, is the fiddly part: N per-node read-modify-write merges plus a hand-policed verify.

## Goal

A `crew figma-snapshot --enrich <file>` mode that ingests the raw `{ nodeId: enrichment }` map the agent dumped from `use_figma` and merges it into the per-node snapshot files programmatically, with the fail-closed verify enforced mechanically. The agent loop collapses to: `use_figma` batch → `Write` the blob to a temp file → `crew figma-snapshot --enrich <file>` → repeat per batch → commit.

## Non-goals

- **Eliminating the transcription floor.** One `Write` per batch is irreducible (see root constraint). This work removes the per-node merge, not the blob hand-off.
- **Compact enrichment output / auto-batch sizing.** Reshaping `enrichment-script.js` to emit smaller JSON (fewer round-trips) and computing batches from the sizing probe automatically are real wins but change the file format / skill flow. Parked as a followup, not in scope.
- **Touching `meta.json`.** `--enrich` is a post-export merge only. `meta.json` freshness remains owned by the full REST export; `--check` semantics are unchanged. (Consistent with `--node-id` partial refresh, which also leaves `meta.json` alone.)
- **stdin ingest.** Decided against — a temp-file path avoids Bash heredoc escaping pain.
- **Multi-file / batch-accumulating ingest.** One invocation merges one file (one batch). The agent calls it once per batch so only one batch sits in context at a time.

## Design

### CLI surface

`--enrich <file>` is a **mode flag** on the existing flat `figma-snapshot` command, a sibling to `--check` and `--node-id` (matches the current shape — no restructuring into subcommands).

```
crew figma-snapshot --enrich /tmp/.../batch1.json
```

- **Mutually exclusive** with `--check` and `--node-id` — extend the existing `--check && --node-id` guard to a three-way exclusivity check.
- **Success:** `✓ enriched N node(s)`.
- **Node failure:** `✗ enrichment failed: <id> (<reason>), …` + exit 1. No disk writes (see atomicity).
- **Fatal** (bad `<file>` path, unparseable JSON, missing `index.json`): clean `✗ …` message + exit 1, matching the existing paths' `try/catch` handling.

### Merge semantics — the heart of it

A new lib module **`packages/cli/src/lib/figma-snapshot/merge.ts`** owns the logic; the command file stays a thin wrapper (per `packages/cli/AGENTS.md` — no business logic in subcommands).

**`mergeEnrichment({ outDir, enrichmentMap })`** reads `index.json` from `outDir`, validates every entry in the `{ nodeId: enrichment }` map, then writes. Returns `{ refreshed: string[]; failed: Array<{ id: string; reason: string }> }`. Throws only on fatal setup errors (file unreadable, `index.json` absent).

Per node entry, the validation:

| Entry shape | Outcome | Reason |
|---|---|---|
| `{ error: ... }` | `failed` | `use_figma` couldn't enrich that node (e.g. `not found`) |
| nodeId not in `index.json` | `failed` | no per-node file to place it on |
| not (`source === 'plugin-api'` and `Array.isArray(componentInstances)`) | `failed` | malformed / REST-only payload |
| valid | `refreshed` | merged |

A valid entry's write: read the per-node file at `index[id].metadataPath` (joined under `outDir`), set the **top-level** `.enrichment = entry`, leave the `raw` field untouched, write the file back. Existing `enrichment` is overwritten (idempotent re-runs).

### Atomicity — fail-closed, mechanical

Validate **all** entries first. If **any** entry fails, write **nothing** and exit non-zero, listing every failure. The batch either fully merges or does not touch disk.

This is the load-bearing safety property: it turns skill step 6's "do not commit a partially-enriched snapshot" from an agent-policed checklist into a guarantee. Re-running a failed batch is cheap because the agent re-calls `use_figma` for the whole batch anyway. The git stage remains the outer gate — a non-zero exit signals the agent not to `git add`.

### `meta.json`

Not touched. `--enrich` runs *after* either a full export (`crew figma-snapshot`) or a partial export (`--node-id`), enriching whatever per-node files exist. Freshness tracking stays with the REST export; `--check` continues to report stale until a full refresh, exactly as today.

## Components & boundaries

| Unit | Responsibility | Depends on |
|---|---|---|
| `lib/figma-snapshot/merge.ts` → `mergeEnrichment` | validate + atomically write `enrichment` onto per-node files | `node:fs`, `index.json` shape |
| `commands/figma-snapshot.ts` (`--enrich` branch) | parse file, call `mergeEnrichment`, render, exit code | `merge.ts` |
| `lib/figma-snapshot/index.ts` | re-export `mergeEnrichment` | `merge.ts` |

`merge.ts` does not import sibling lib subdirs and does no network I/O — it is a pure local-filesystem transform, independently testable with fixture dirs.

## Error handling

- **Setup-fatal** (`<file>` unreadable, invalid JSON, `index.json` missing) → `mergeEnrichment` throws → command catches, prints `✗ <message>`, exit 1.
- **Per-node failures** (collected, not thrown) → command prints the aggregated list, exit 1, **no writes performed**.
- **All valid** → writes performed, `✓ enriched N node(s)`, exit 0.

## Testing

- **`merge.test.ts`** (fixture snapshot dir under a temp path):
  - valid map → `enrichment` set on each per-node file, `raw` preserved, `refreshed` lists all ids.
  - unknown id → `failed` with reason; `{ error }` entry → `failed`; malformed entry (no `source` / no `componentInstances`) → `failed`.
  - **atomicity**: a map with one bad entry → zero files mutated (assert files byte-identical to pre-state), `failed` populated.
  - missing `index.json` → throws.
- **`figma-snapshot.test.ts`**:
  - `--enrich` routes to the merge path; `--enrich` + `--check` and `--enrich` + `--node-id` each rejected by the exclusivity guard.

## Verification

`npm run lint`, `npm run typecheck`, `npm test` (CLI workspace). No HTTP route added → no Bruno endpoint. Run `agents-doc-parity-check` against the changed paths (`packages/cli/src/commands/figma-snapshot.ts`, `lib/figma-snapshot/*`) — likely touches `.agents/commands.md` and the `packages/cli/AGENTS.md` lib-subdir note only if behavior is described there.

## Scope split → tickets

Two work items with a dependency edge:

- **A — CLI (autonomous, `crew run`):** the `--enrich` flag + `merge.ts` + `index.ts` re-export + tests + doc parity. Pure CLI code, no MCP/interactive dependency.
- **B — Skill rewrite (interactive):** rewrite `figma-snapshot-refresh` SKILL.md steps 4–6 to "Write the `use_figma` blob to a temp file → `crew figma-snapshot --enrich <file>` per batch", delete the hand-merge instructions and the obsolete throwaway-`merge-enrichment.mjs` pattern. **B is blocked by A** (the skill references the shipped flag). B carries the `interactive` label — skill files cannot be written by `crew run` dispatch (the sandbox masks a project's own `.claude/skills/` read-only).

Epic-vs-two-linked-tickets to be decided at ticketing.
