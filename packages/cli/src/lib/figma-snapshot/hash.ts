import { createHash } from 'node:crypto';
import type { FigmaNode } from './client.js';

/**
 * Recursively rewrite `value` with object keys sorted, so that two structurally
 * identical node trees serialize byte-for-byte identically regardless of the
 * key order Figma's API happened to return. Array order is preserved — Figma
 * layer order is meaningful content.
 */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/**
 * Content hash of a captured Figma node tree. Used as the freshness baseline
 * for `crew figma-snapshot --check`: a hash recorded at export time is compared
 * against a freshly fetched node tree, so the check is scoped to the captured
 * nodes' actual content rather than the whole-file save counter.
 */
export function hashNode(node: FigmaNode): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(node)))
    .digest('hex');
}
