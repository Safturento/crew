# Compact `figma-snapshot` enrichment output

**Date:** 2026-06-24
**Status:** Design (brainstormed 2026-06-24) — standalone interactive Task to be created
**Source:** `docs/followups.md` → Daemon, CLI & Dispatch → "2026-06-23 — Compact `use_figma` enrichment output + auto-batch sizing". Follow-on to Epic CREW-280 (its explicit out-of-scope).

## Problem / purpose

The `figma-snapshot-refresh` skill enriches each snapshot node by running `enrichment-script.js` via `use_figma`, which returns a `{ nodeId: enrichment }` map the agent merges with `crew figma-snapshot --enrich`. The enrichment object is verbose — every `componentInstances[]` entry carries a `path` array, a full `resolvedStyles` block, and several fields that are routinely null or empty.

Two concrete pains, surfaced doing a real full refresh on 2026-06-24:

1. **A single node can hit the `use_figma` ~20 KB response cap.** Node `665:864` ("Brainstorm — Timeline Filter Rework (Option B)", ~55 near-identical nested instances) measured **20,329 bytes** of enrichment — essentially at the cap, with zero headroom and unable to share a batch with anything. A node only modestly larger would truncate, breaking enrichment for it entirely. This makes compaction a **correctness fix**, not just an optimization.
2. **Round-trip count.** At the verbose size, a ~51-node full refresh packs ~6 nodes/batch ⇒ ~9–10 `use_figma` round-trips. Smaller payloads pack denser ⇒ fewer round-trips.

## Goal

Reshape the enrichment payload emitted by `enrichment-script.js` to drop null/empty/unread fields, so (a) no single deliverable node's enrichment approaches the cap, and (b) more nodes fit per batch. Keep the on-disk shape human-readable and the consumer (`visual-fidelity-check`) fully functional with no flag-day migration.

## What changes — and what doesn't

- **Changes:** `enrichment-script.js` (the `figma-snapshot-refresh` skill asset) — the only producer of the shape.
- **Unchanged — `mergeEnrichment` (`packages/cli/src/lib/figma-snapshot/merge.ts`):** its validation requires only `source === 'plugin-api'` and `Array.isArray(componentInstances)`, both retained below; it writes the entry pass-through. No CLI code change, no test change.
- **`visual-fidelity-check`:** it reads `componentInstances` → `{ mainComponentSetId, variantOverrides, componentPropertyOverrides, resolvedStyles{…tokenAlias} }` and top-level `boundVariables`. It never reads `depthWarnings` or `capturedAt`. **Correction (found in implementation):** it *did* read the per-instance `path` as tier 2 of its nested-instance disambiguation ladder (Label → **Path** → Position). Since `path` is the single biggest per-instance saving and keeping it puts the worst node back at ~19.6 KB, this work **drops `path` and removes that tier**, collapsing the consumer's ladder to **Label → Position** (positional matching already covers most label collisions). `workflow.md` is updated accordingly.

This is therefore a **single interactive ticket** — skill-file edits only. (Skill files under a project's own `.claude/skills/` can't be written by `crew run` dispatch.)

## Compaction rules

Build the enrichment object as today, then strip noise before returning. **Omit** a field rather than emitting it null/empty. Key names are unchanged — the shape just loses clutter.

**Top-level enrichment object:**

| Field | Rule |
|---|---|
| `source` | **always keep** (`'plugin-api'`) — `mergeEnrichment` validation depends on it |
| `componentInstances` | **always keep** (even if `[]`) — validation depends on it being an array |
| `capturedAt` | keep (provenance; negligible size) |
| `componentProperties` | omit when `null` (i.e. node is not an INSTANCE) |
| `mainComponent` | omit when `null` |
| `boundVariables` | omit when `[]` |
| `depthWarnings` | omit when `[]` (kept when non-empty — it signals truncation) |

**Each `componentInstances[]` entry:**

| Field | Rule |
|---|---|
| `id`, `name` | keep |
| `mainComponentSetId` | keep (consumer anchors on it) |
| `path` | **drop entirely** — biggest per-instance saving. Consumer's tier-2 disambiguation by `path` is removed (Label → Position only); see the correction above |
| `variantOverrides` | omit when `null` |
| `componentPropertyOverrides` | omit when `{}` |
| `resolvedStyles.fills` / `.strokes` | omit when `[]` |
| `resolvedStyles.textColor` | omit when `null` |
| `resolvedStyles` | omit wholesale when `fills`, `strokes`, and `textColor` are all empty/null |

**Explicitly not doing:** key-shortening (cryptic on disk, brittle for the consumer) and instance de-duplication (loses per-instance identity, which the consumer diffs against). Both were considered and rejected for brittleness; compaction alone is projected to clear the cap.

## Backward / forward compatibility

A null-checking reader treats "field absent" and "field empty/null" identically. So:

- A compact file (omitting `resolvedStyles.fills`) reads the same as a verbose one (with `fills: []`).
- During the transition, the **committed verbose snapshot still reads correctly** alongside any newly compacted nodes — no flag-day. The next full refresh rewrites everything to the compact shape naturally.

The producer change carries no schema-version bump; the consumer is shape-tolerant by construction.

## Out of scope

- **Per-node chunking** (splitting one node's `componentInstances` across multiple `use_figma` calls with an append-merge). Only needed if a single node exceeds the cap *after* compaction; projected not to. The skill will note: if the sizing probe still shows a single node near the cap, that is the signal to revisit chunking. (YAGNI until measured.)
- **Auto-batch sizing** (CLI/skill computes batch groupings from the probe). A separate ergonomic improvement; deferred. The manual "size with the probe, ~5–8 nodes" guidance stays, updated only to note that compact payloads pack denser.
- **Page hygiene** — whether scratch/brainstorm frames (`665:864`, `660:859`, `699:1039`) belong in `figma_pages` at all is a separate config question, not addressed here.
- **`mergeEnrichment` / CLI / tests** — no change.

## Verification

Empirical (matches CREW-282's validation style — no code tests change):

1. After editing `enrichment-script.js`, re-run the **sizing probe** across all snapshot node IDs and confirm every node — `665:864` in particular — is comfortably under the cap (target: < ~15 KB, leaving batch headroom).
2. Run one real enrich → `crew figma-snapshot --enrich` round-trip on a representative node and confirm a compact `enrichment` field lands, `raw` intact, exit 0.
3. Spot-check that a compacted per-node file still carries everything `visual-fidelity-check` reads (`componentInstances` with `mainComponentSetId`, `variantOverrides` where non-default, `resolvedStyles` where styled, top-level `boundVariables` where present).

## Affected files

- `.claude/skills/figma-snapshot-refresh/enrichment-script.js` — emit the compact shape (the substantive change).
- `.claude/skills/figma-snapshot-refresh/SKILL.md` — note the compact output in step 4; add the "single node still near cap ⇒ revisit chunking" signal to the red-flags / notes.
- `.claude/skills/visual-fidelity-check/workflow.md` — remove the tier-2 `path` disambiguation step (collapse the ladder to Label → Position). The `examples/` snippets don't reference `path`, so they need no change.
