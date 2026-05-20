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
- The session sandbox must allow `api.figma.com` — `crew figma-snapshot` calls the
  Figma REST API. crew's `.claude/settings.json` includes it; if `crew figma-snapshot`
  fails with a network/proxy error, that domain is missing from the active sandbox
  config (a settings change needs a session restart to take effect).

## Procedure

- [ ] **1. Freshness check.** Run `crew figma-snapshot --check`. If it reports
  `fresh`, STOP — the committed snapshot already matches the live Figma file.

- [ ] **2. Choose: full or partial refresh.**

  - **Partial refresh** when you can name the changed nodes (single-component
    edit; a few siblings; a renamed instance). Proceed to step 3p.
  - **Full refresh** when you don't know what changed, a token/variable edit
    cascaded everywhere, or you want to catch up after several edits.
    Proceed to step 3f.

  Partial is strictly faster (one REST call + one `use_figma` batch), but it
  does NOT update `meta.json`. `--check` will keep reporting stale until a
  full refresh runs. That's intentional — partial refresh fixes the named
  nodes; full refresh is the catch-all.

- [ ] **3p. Partial refresh — REST export.** Run
  `crew figma-snapshot --node-id <id>[,<id>...]`. Add `--page <name>` only if
  any ID is genuinely new (not yet in committed `index.json`). The CLI rejects
  with a clear error message if an ID is missing without `--page`. Skip to
  step 4.

- [ ] **3f. Full refresh — REST export.** Run `crew figma-snapshot` (no flag).
  Writes `index.json`, `meta.json`, and per-node `raw` JSON + PNGs to
  `.crew/figma-snapshot/`. REST-only — no `enrichment` field yet.

- [ ] **4. Enrich.** Invoke the `figma-use` skill (mandatory before any
  `use_figma` call), then call `mcp__plugin_figma_figma__use_figma` with the
  contents of `enrichment-script.js` (this skill's directory) — substitute
  `<NODE_IDS_JSON>` with a JSON array of node IDs, and pass the project's
  `figma_file_key`. The script returns `{ nodeId: enrichmentObject }`.

  - For **partial refresh**, the ID list is exactly what you passed to
    `--node-id`. Usually a single `use_figma` call (well under the ~20 KB
    response budget).
  - For **full refresh**, the ID list is every key of
    `.crew/figma-snapshot/index.json`. Split into batches sized so each result
    stays under ~20 KB (≈5–8 nodes is typical) and call `use_figma` once per
    batch — merging each batch (step 5) before fetching the next so only one
    batch sits in context at a time. To size batches precisely, first run a
    sizing probe: the same script with the final line changed to
    `out[id] = JSON.stringify(enrichment).length;` returns one byte count
    per node in a single small response.

- [ ] **5. Merge.** For each returned entry, add its enrichment object as a
  top-level `enrichment` field on that node's per-node JSON file (path is in
  `index.json`'s `metadataPath`). Do NOT modify the `raw` field. Partial
  refresh touches only the named nodes' files; siblings stay untouched.

- [ ] **6. Verify — fail closed.** Confirm every refreshed node now has an
  `enrichment` field carrying `componentInstances`. Partial refresh verifies
  only the named nodes. If `use_figma` errored, any refreshed node is
  unenriched, or the script returned `{ error }` for a node — STOP and
  surface the failure. Do **not** commit a REST-only or partially-enriched
  snapshot.

- [ ] **7. Commit.** `git add .crew/figma-snapshot/` then commit.

## Red flags — STOP

| Thought | Reality |
|---|---|
| "The export ran, just commit it" | A bare `crew figma-snapshot` is REST-only. Without enrichment (steps 4–6) the snapshot has no `enrichment` field and `visual-fidelity-check` can't use it. |
| "use_figma half-failed — I'll commit what enriched" | Partial enrichment is a broken snapshot. Fail closed at step 6. |
| "I'll hand-edit the JSON instead of re-exporting" | Don't. `raw` and `enrichment` must come from one consistent capture — run the procedure. |
| "`--check` said fresh but I'll regenerate anyway" | Fresh means current. Stop at step 1. |
| "I'll partial-refresh and update meta.json myself" | Don't. meta.json's staleness is the safe signal that siblings may have drifted. Full refresh is the way to clear stale. |
