# CREW-171 — Batch the figma-snapshot /images REST call to avoid render timeout

Jira: https://safturento.atlassian.net/browse/CREW-171

## Goal

`crew figma-snapshot` against the crew project (~36 nodes across both
`figma_pages`) must complete without Figma's `/images` render endpoint timing
out, and must always emit complete per-node metadata even when image rendering
fails. "Done" = `getImages` issues bounded batches with a halving retry on
render-timeout, and `emitSnapshot` writes all JSON + `index.json` before the
(now non-fatal) image pass.

## Relevant files

- `packages/cli/src/lib/figma-snapshot/client.ts` — `FigmaRestClient.getImages`
  now chunks `ids` into batches of `IMAGE_BATCH_SIZE` (5), issues one `/images`
  request per batch sequentially, and merges the results. A 400 render-timeout
  on a batch triggers a recursive halving retry down to size 1; a size-1 node
  that still times out is recorded with a `null` image (non-fatal).
- `packages/cli/src/lib/figma-snapshot/emit.ts` — `emitSnapshot` reordered: all
  per-node JSON + `index.json` are written before the image pass. The image
  pass (including the `getImages` call) is wrapped so failures warn and skip
  the PNG instead of aborting the snapshot.

## Decisions

- **Halving retry instead of a fixed "safe" batch size** — Figma's render
  budget depends on frame size, not node count. Small component frames and
  large full-screen frames can't share one safe constant; recursive halving
  self-adjusts.
- **`FigmaRenderTimeoutError` class** — `getImages` needs to distinguish a
  render-timeout (retryable by splitting) from any other API error (fatal).
  A dedicated error class is cleaner than regex-matching a generic message.
- **Call site unchanged** — `getImages(fileKey, ids, scale)` keeps its
  signature; batching is entirely internal to the client.

## Notes

Backend/CLI-only change — no HTTP route, no UI, no schema change. Blocks
CREW-152 (its pre-dispatch snapshot on the crew project must succeed).
