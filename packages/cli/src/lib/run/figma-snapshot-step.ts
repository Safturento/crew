import type { ProjectConfig } from 'crew-shared';
import {
  runFigmaSnapshot,
  type FigmaSnapshotDeps,
  type FigmaSnapshotResult,
} from '../../commands/figma-snapshot.js';

export type PreDispatchFigmaSnapshotResult =
  | { kind: 'skipped' }
  | { kind: 'ok'; nodesExported: number; outDir?: string }
  | { kind: 'warning'; reason: string };

export interface PreDispatchFigmaSnapshotOptions {
  worktree: string;
  config: ProjectConfig;
  log: (msg: string) => void;
  warn: (msg: string) => void;
  /** Test seam. Defaults to the real runFigmaSnapshot from the figma-snapshot command. */
  snapshotter?: (deps: FigmaSnapshotDeps) => Promise<FigmaSnapshotResult>;
}

/**
 * Pre-dispatch hook for `crew run`. When the project's config has a
 * [visual_fidelity] block, generate the Figma snapshot into the worktree so
 * the dispatched agent's visual-fidelity-check skill has ground truth to
 * compare against. Failures are non-fatal — the dispatched agent's skill
 * becomes a no-op when the snapshot is missing.
 */
export async function runPreDispatchFigmaSnapshot(
  opts: PreDispatchFigmaSnapshotOptions,
): Promise<PreDispatchFigmaSnapshotResult> {
  if (!opts.config.visual_fidelity) {
    return { kind: 'skipped' };
  }

  const snapshotter = opts.snapshotter ?? runFigmaSnapshot;

  let result: FigmaSnapshotResult;
  try {
    result = await snapshotter({
      worktree: opts.worktree,
      config: opts.config,
      log: opts.log,
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    opts.warn(`figma-snapshot failed: ${reason}. Continuing without snapshot.`);
    return { kind: 'warning', reason };
  }

  if (!result.ok) {
    const reason = result.reason ?? 'figma-snapshot failed';
    opts.warn(`figma-snapshot failed: ${reason}. Continuing without snapshot.`);
    return { kind: 'warning', reason };
  }

  const nodesExported = result.nodesExported ?? 0;
  opts.log(
    `figma-snapshot: exported ${nodesExported} nodes${result.outDir ? ` → ${result.outDir}` : ''}`,
  );

  // Surface the Plugin-API enrichment outcome. A skipped/degraded enrichment
  // still leaves a usable REST-only snapshot — the run continues — but the
  // visual-fidelity enrichment tier (componentProperties, boundVariables,
  // componentInstances) is missing, so it must not pass silently. (CREW-172.)
  const enrichment = result.enrichment;
  if (enrichment) {
    if (enrichment.kind === 'ok') {
      opts.log(`figma-snapshot: enrichment populated ${enrichment.enrichedNodeCount} nodes`);
    } else {
      opts.warn(
        `figma-snapshot: enrichment ${enrichment.kind} (${enrichment.reason}) — ` +
          'snapshot is REST-only, enrichment tier unavailable',
      );
    }
  }

  return { kind: 'ok', nodesExported, outDir: result.outDir };
}
