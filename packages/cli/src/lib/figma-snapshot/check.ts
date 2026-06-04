import type { FigmaRestClient } from './client.js';
import { hashNode } from './hash.js';

/**
 * The `meta.json` sidecar `crew figma-snapshot` writes alongside the snapshot.
 * `nodeHashes` is the content-scoped freshness baseline (node id → tree hash);
 * `figmaFileVersion` is retained as informational only — it is the whole-file
 * save counter and no longer drives `--check` (it produced false STALE reports
 * on out-of-scope churn; see CREW-174).
 */
export interface SnapshotMeta {
  figmaFileVersion?: string;
  capturedAt?: string;
  nodeHashes?: Record<string, string>;
}

export type FreshnessStatus = 'fresh' | 'stale' | 'no-baseline';

export interface DriftedNode {
  id: string;
  /** `changed`: live tree hash differs. `missing`: node no longer in the file. */
  reason: 'changed' | 'missing';
}

export interface FreshnessResult {
  status: FreshnessStatus;
  drifted: DriftedNode[];
}

export interface CheckSnapshotFreshnessOptions {
  fileKey: string;
  meta: SnapshotMeta;
  client: FigmaRestClient;
}

/**
 * Decide whether the committed snapshot still reflects the live Figma design,
 * scoped to the captured nodes. Fetches only the captured node trees via
 * `/files/{key}/nodes` (JSON only, no image render) and compares each tree's
 * content hash to the baseline recorded at export time. Out-of-scope file
 * churn — idle autosaves, edits to unrelated pages — never moves these hashes,
 * so it no longer triggers a false STALE.
 *
 * Known narrower gap: a Figma *variable redefinition* (token value change) does
 * not alter a node's tree — the node references the variable by id — and the
 * resolved values are not available over the REST API on crew's Figma plan, so
 * `--check` cannot see token-value drift. Documented in `.agents/dispatch.md`.
 */
export async function checkSnapshotFreshness(
  opts: CheckSnapshotFreshnessOptions,
): Promise<FreshnessResult> {
  const hashes = opts.meta.nodeHashes;
  if (!hashes || Object.keys(hashes).length === 0) {
    return { status: 'no-baseline', drifted: [] };
  }

  const ids = Object.keys(hashes);
  const response = await opts.client.getFileNodes(opts.fileKey, ids);

  const drifted: DriftedNode[] = [];
  for (const id of ids) {
    const entry = response.nodes[id];
    if (!entry) {
      drifted.push({ id, reason: 'missing' });
      continue;
    }
    if (hashNode(entry.document) !== hashes[id]) {
      drifted.push({ id, reason: 'changed' });
    }
  }

  return { status: drifted.length === 0 ? 'fresh' : 'stale', drifted };
}
