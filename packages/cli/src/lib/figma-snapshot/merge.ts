import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface EnrichmentEntry {
  source?: string;
  componentInstances?: unknown;
  error?: string;
  [k: string]: unknown;
}

export interface MergeEnrichmentOpts {
  /** Snapshot directory containing index.json + per-node JSON files. */
  outDir: string;
  /** The `{ nodeId: enrichment }` map produced by the use_figma enrichment script. */
  enrichmentMap: Record<string, EnrichmentEntry>;
}

export interface MergeEnrichmentResult {
  refreshed: string[];
  failed: Array<{ id: string; reason: string }>;
}

interface IndexEntry {
  metadataPath: string;
}

/**
 * Merge a use_figma enrichment map into the committed per-node snapshot files.
 *
 * Validates every entry first; if any entry fails, writes nothing (atomic /
 * fail-closed) and returns the failures. Only the top-level `enrichment` field
 * is set — `raw` is never modified. Does not touch meta.json.
 *
 * Throws only on fatal setup errors (index.json missing or unparseable).
 */
export function mergeEnrichment(opts: MergeEnrichmentOpts): MergeEnrichmentResult {
  const indexPath = join(opts.outDir, 'index.json');
  if (!existsSync(indexPath)) {
    throw new Error(`no committed snapshot at ${opts.outDir} — index.json absent`);
  }
  let index: Record<string, IndexEntry>;
  try {
    index = JSON.parse(readFileSync(indexPath, 'utf8')) as Record<string, IndexEntry>;
  } catch (err) {
    throw new Error(`index.json is not valid JSON: ${(err as Error).message}`, { cause: err });
  }

  const failed: Array<{ id: string; reason: string }> = [];
  // Stage validated writes; only flush them when the whole batch is clean.
  const staged: Array<{ id: string; absPath: string; node: Record<string, unknown> }> = [];

  for (const [id, entry] of Object.entries(opts.enrichmentMap)) {
    if (entry && entry.error) {
      failed.push({ id, reason: `use_figma error: ${entry.error}` });
      continue;
    }
    const indexEntry = index[id];
    if (!indexEntry) {
      failed.push({ id, reason: 'not in committed snapshot index.json' });
      continue;
    }
    if (!(entry && entry.source === 'plugin-api' && Array.isArray(entry.componentInstances))) {
      failed.push({ id, reason: 'malformed enrichment (missing source or componentInstances)' });
      continue;
    }
    const absPath = join(opts.outDir, indexEntry.metadataPath);
    let node: Record<string, unknown>;
    try {
      node = JSON.parse(readFileSync(absPath, 'utf8')) as Record<string, unknown>;
    } catch (err) {
      failed.push({
        id,
        reason: `cannot read per-node file ${indexEntry.metadataPath}: ${(err as Error).message}`,
      });
      continue;
    }
    node.enrichment = entry;
    staged.push({ id, absPath, node });
  }

  if (failed.length > 0) {
    return { refreshed: [], failed };
  }

  const refreshed: string[] = [];
  for (const s of staged) {
    writeFileSync(s.absPath, `${JSON.stringify(s.node, null, 2)}\n`);
    refreshed.push(s.id);
  }
  return { refreshed, failed: [] };
}
