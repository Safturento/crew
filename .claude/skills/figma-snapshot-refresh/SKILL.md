---
name: figma-snapshot-refresh
description: >-
  Use when you have changed the Crew Figma design this session — a `use_figma`
  write, a `figma-generate-design` / `figma-generate-library` run, or any
  design-system component or token edit — and are wrapping up before that
  design feeds into code implementation. Also use when explicitly asked to
  refresh or regenerate the figma snapshot. Regenerates the committed
  visual-fidelity snapshot so `visual-fidelity-check` is never validated against
  stale data. Run it even for a small change, even when unsure code work will
  follow — it no-ops cheaply when the snapshot is already current.
---

# figma-snapshot-refresh

Regenerates the committed Figma snapshot at `.crew/figma-snapshot/` — the ground
truth `visual-fidelity-check` compares rendered UI against. The snapshot is a
committed artifact; it goes stale the moment the Crew Figma design changes
without the snapshot being refreshed.

**Announce when invoking:** "Using figma-snapshot-refresh to regenerate the committed snapshot."

This is the **producer gate** — it runs *after* a design change, *before* that
design feeds into code. (`visual-fidelity-check` is the consumer gate, after code.)

## Prerequisites

- Run from the crew repo root, in an **interactive** session — the Figma MCP
  enrichment (step 3) works only interactively, not in a headless dispatch.
- `FIGMA_API_TOKEN` exported — the REST export and `--check` need it.
- The `figma` plugin MCP available (`mcp__plugin_figma_figma__use_figma`).

## Procedure

- [ ] **1. Freshness check.** Run `crew figma-snapshot --check`. If it reports
  `fresh`, STOP — the committed snapshot already matches the live Figma file.

- [ ] **2. REST export.** Run `crew figma-snapshot`. It writes `index.json`,
  `meta.json`, and per-node `raw` JSON + PNGs to `.crew/figma-snapshot/`.
  REST-only — no `enrichment` field yet.

- [ ] **3. Enrich.** Read the node IDs (the keys of
  `.crew/figma-snapshot/index.json`). Invoke the `figma-use` skill (mandatory
  before any `use_figma` call), then call `mcp__plugin_figma_figma__use_figma`
  with the contents of `enrichment-script.js` (this skill's directory) —
  substitute `<NODE_IDS_JSON>` with the JSON array of node IDs, and pass the
  project's `figma_file_key`. The script returns `{ nodeId: enrichmentObject }`.

- [ ] **4. Merge.** For each returned entry, add its enrichment object as a
  top-level `enrichment` field on that node's per-node JSON file (path is in
  `index.json`'s `metadataPath`). Do NOT modify the `raw` field.

- [ ] **5. Verify — fail closed.** Confirm every per-node JSON now has an
  `enrichment` field carrying `componentInstances`. If `use_figma` errored, any
  node is unenriched, or the script returned `{ error }` for a node — STOP and
  surface the failure. Do **not** commit a REST-only or partially-enriched
  snapshot.

- [ ] **6. Commit.** `git add .crew/figma-snapshot/` then commit.

## Red flags — STOP

| Thought | Reality |
|---|---|
| "The export ran, just commit it" | A bare `crew figma-snapshot` is REST-only. Without steps 3–5 the snapshot has no `enrichment` and `visual-fidelity-check` can't use it. |
| "use_figma half-failed — I'll commit what enriched" | Partial enrichment is a broken snapshot. Fail closed at step 5. |
| "I'll hand-edit the JSON instead of re-exporting" | Don't. `raw` and `enrichment` must come from one consistent capture — run the procedure. |
| "`--check` said fresh but I'll regenerate anyway" | Fresh means current. Stop at step 1. |
