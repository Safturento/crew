# `figma-snapshot` slim `raw` (drop recursive `children`) — design

**Date:** 2026-05-21
**Status:** Draft for review
**Branch:** `fix/figma-snapshot-slim-raw`

## Context

`packages/cli/src/lib/figma-snapshot/emit.ts` writes a per-node JSON for every
exported Figma node containing `{ id, name, type, page, raw }`, where `raw`
is the entire Figma subtree returned by the REST API — recursively, including
every child, every child's paints, every grandchild's bound variables, and so
on. For a composite-set like AgentRow (7 state variants × nested pill + meta
icons + action buttons) the recursive subtree dominates the file.

The 2026-05-19 AgentRow brainstorm confirmed the cost concretely:
`.crew/figma-snapshot/composites/212-910.json` is **632 KB**, which exceeds
the Read tool's 256 KB limit. Agents (and Claude) doing snapshot-driven
design work fall back to `grep` instead of ingesting the file — losing
context that the JSON's structure would otherwise provide. The cost
compounds as the design system grows.

Exploration confirms the recursive subtree is **never read** by any consumer:

- `visual-fidelity-check` skill is the only consumer of per-node JSON.
- The skill's normal path reads `enrichment.*` exclusively — never `raw`.
- The skill's REST-only fallback path reads `raw.fills`, `raw.strokes`, and
  basic top-level geometry. No `raw.children` access anywhere.
- `figma-snapshot-refresh` is fail-closed on enrichment (step 6 of the
  procedure), so the fallback path is purely defensive — it never triggers
  on a properly committed snapshot.
- No other consumers in `packages/`, `.claude/skills/`, or `scripts/`.

This work slims `raw` to a top-level projection that drops the recursive
`children` subtree. The skill's fallback contract is preserved verbatim
because every field the fallback reads survives the projection.

## Inputs

- Existing code: `packages/cli/src/lib/figma-snapshot/emit.ts`,
  `packages/cli/src/lib/figma-snapshot/emit.test.ts`
- Existing skill: `.claude/skills/visual-fidelity-check/SKILL.md` +
  `workflow.md` (the only documented consumer)
- Sourcing followup: 2026-05-12 entry in `docs/followups.md`, augmented
  2026-05-19 with the 632 KB AgentRow evidence

## Non-goals

1. **Schema change for `enrichment`.** That field already carries the data
   the consumer actually uses (`componentInstances`, `componentProperties`,
   `boundVariables`, `mainComponent`). No restructuring needed.
2. **Auto-detection / hash-based change tracking.** Separate forward-path
   item from the 2026-05-19 spec (`figma-snapshot-selective-export`).
3. **A migration script for existing snapshots in other repos.** Other repos
   regenerate naturally on their next `crew figma-snapshot` (full export).
   Old fat snapshots stay compatible because the consumer only reads fields
   that survive both shapes.
4. **`PAGE_DIR_MAP` into project config.** Separate 2026-05-12 followup.
5. **`index.json.screenshotPath` honesty.** Separate 2026-05-17 followup.
6. **Per-file size budget enforcement.** Once `raw` is slim, files are small;
   no budget needed.

## The change

### `emit.ts` — projection on both export paths

Two call sites in `emit.ts` write the per-node JSON: the full export
(`emitSnapshot`) and the partial export (`emitPartialSnapshot`, added in
#248). Both currently write `raw: t.node` or `raw: node`. Both change to
write `{ ...node, children: undefined }`.

`undefined` keys are dropped by `JSON.stringify`, so the serialized payload
omits `children` while every other top-level Figma property (fills, strokes,
absoluteBoundingBox, layoutMode, paddings, cornerRadius, effects,
boundVariables on top-level paints, characters/style for TEXT nodes, etc.)
survives unchanged.

Expected file size for AgentRow's `composites/212-910.json`: ~5–10 KB,
down from 632 KB.

### `emit.test.ts` — explicit assertions

The existing happy-path test asserts `componentJson.raw.id` to confirm the
field exists. That assertion stays. Two additions:

1. Assert `componentJson.raw.children` is `undefined` (the new behavior).
2. Assert a top-level field that survives the projection — e.g.
   `componentJson.raw.type` — to lock the contract that top-level data is
   preserved.

### `visual-fidelity-check` skill — doc clarification

The skill's prose currently says "use `raw` for canonical structure" without
specifying which fields. Update `workflow.md` Step 4 and `SKILL.md`'s data-
tiers paragraph to clarify:

- `raw` carries top-level node properties only (fills, strokes, geometry,
  layout, effects).
- Nested instance data lives in `enrichment.componentInstances`.
- The fallback contract (read `raw.fills` / `raw.strokes` etc. when
  `enrichment` is absent) is unchanged.

No behavior change in the skill — just doc accuracy so future agents don't
expect to access `raw.children`.

### Snapshot regeneration in the implementing PR

The implementing PR runs a full `crew figma-snapshot` against this repo's
committed snapshot after the emitter change lands, then runs the
`figma-snapshot-refresh` skill's enrichment step to merge `enrichment` back
into each per-node JSON. The result: every per-node JSON in
`.crew/figma-snapshot/composites/` and `.crew/figma-snapshot/screens/`
shrinks by ~95% (varies by composite complexity). The PR diff carries
this as visible evidence.

Other repos consuming the crew CLI get the new shape on their next natural
`crew figma-snapshot` invocation. No migration script needed — the consumer
treats both shapes identically (extra fields in old snapshots are ignored).

## Verification

- `npm run test:run --workspace=crew-cli` — full suite green including the
  two new assertions in `emit.test.ts`.
- `npm run typecheck --workspace=crew-cli` — clean.
- `npm run lint` — clean.
- File-size sanity: `wc -c .crew/figma-snapshot/composites/212-910.json` is
  under 256 KB (Read tool limit) and ideally under ~10 KB.
- Skill smoke: spot-check one per-node JSON has `raw.fills`,
  `raw.strokes`, `raw.absoluteBoundingBox` present and no `raw.children`.
- `crew figma-snapshot --check` reports `fresh` after the regen.

## Forward path

1. **Per-file size budget.** If a future composite design legitimately needs
   the recursive subtree (unlikely given current consumer needs), introduce a
   `--include-children` opt-in flag rather than re-enabling the heavy default.
2. **Schema versioning.** If `raw` shape evolves further, add a `schemaVersion`
   field to `meta.json` so consumers can branch behavior. Not needed today —
   the projection is a strict subset of the old shape.

## Followup resolution

The 2026-05-12 entry in `docs/followups.md` ("Cap or filter `raw` subtree
size in figma-snapshot per-component JSON") moves to **Resolved** as part of
the implementing PR with a one-line addendum naming the projection that
shipped.
