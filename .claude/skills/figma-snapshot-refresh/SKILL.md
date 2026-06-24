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
  `figma_file_key`. The script returns `{ nodeId: enrichmentObject }`. The
  output is **compact** (null/empty fields omitted, per-instance `path`
  dropped), so payloads are well under the ~20 KB response cap and pack denser
  than the old rule of thumb.

  - For **partial refresh**, the ID list is exactly what you passed to
    `--node-id`. Usually a single `use_figma` call.
  - For **full refresh**, the ID list is every key of
    `.crew/figma-snapshot/index.json`. Split into batches sized so each result
    stays under ~20 KB and call `use_figma` once per batch — merging each batch
    (step 5) before fetching the next so only one batch sits in context at a
    time. To size batches precisely, first run a sizing probe: the same script
    with the final line changed to `out[id] = JSON.stringify(enrichment).length;`
    returns one byte count per node in a single small response. With compact
    output, ~10–15 small nodes per batch is realistic; let the probe drive it.
    If the probe shows a **single node** at/over the cap even compacted (a huge
    nested frame), enrich it **alone** in its own batch — and if even solo it
    exceeds ~20 KB, STOP: per-node chunking is not yet built, so surface it
    rather than fetch a truncated result.

- [ ] **5. Merge.** Write the `use_figma` result (the `{ nodeId: enrichment }`
  object) **verbatim** to a temp file, then run
  `crew figma-snapshot --enrich <file>`. The command maps each node to its
  per-node JSON via `index.json`, sets the top-level `enrichment` field
  (leaving `raw` untouched), and writes **atomically**. One invocation per
  batch — write the batch's result, enrich it, then fetch the next batch. Do
  **not** hand-edit the per-node JSON files; `--enrich` is the only merge path.

  On success it prints `✓ figma-snapshot enrichment merged (N node(s))`.
  Partial refresh touches only the named nodes' files; siblings stay untouched.
  (`--enrich` does not update `meta.json` — same as `--node-id`.)

- [ ] **6. Verify — fail closed (the command enforces it).** `--enrich` is
  atomic and fail-closed: if any node carries an `{ error }`, is absent from
  `index.json`, or has a malformed payload, it writes **nothing** and exits
  non-zero with `✗ enrichment failed: <id> (<reason>), …`. A zero-node file
  also fails. A non-zero exit means the batch did **not** merge — fix the
  cause and re-run the whole batch. (If `use_figma` itself errored you have no
  file to pass — re-run step 4.) Never commit a REST-only or partially-enriched
  snapshot.

- [ ] **7. Commit.** `git add .crew/figma-snapshot/` then commit.

## Red flags — STOP

| Thought | Reality |
|---|---|
| "The export ran, just commit it" | A bare `crew figma-snapshot` is REST-only. Without enrichment (steps 4–6) the snapshot has no `enrichment` field and `visual-fidelity-check` can't use it. |
| "use_figma half-failed — I'll commit what enriched" | You can't — `--enrich` is atomic. One bad node ⇒ zero writes + non-zero exit. Fix the cause, re-run the whole batch. |
| "I'll hand-edit the per-node JSON instead of running --enrich" | Don't. The command does the validation, the atomic write, and the fail-closed check. Hand-editing bypasses all three and risks a half-merged snapshot. |
| "`--check` said fresh but I'll regenerate anyway" | Fresh means current. Stop at step 1. |
| "I'll partial-refresh and update meta.json myself" | Don't. meta.json's staleness is the safe signal that siblings may have drifted. Full refresh is the way to clear stale. |
| "One node is ~20 KB even compacted — I'll just batch it anyway" | A single node at/over the cap can't share a batch and may truncate solo. Enrich it alone; if it still exceeds the cap, STOP and surface it — per-node chunking isn't built. |
