import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Command } from 'commander';
import pc from 'picocolors';
import {
  FigmaRestClient,
  discoverProjectConfig,
  emitPartialSnapshot,
  emitSnapshot,
  type ProjectConfig,
} from '../lib/index.js';

export interface FigmaSnapshotDeps {
  worktree: string;
  config: ProjectConfig;
  log: (msg: string) => void;
  clientFactory?: () => FigmaRestClient;
  fetchImage?: (url: string) => Promise<Buffer>;
  // Partial-export inputs. When `nodeIds` is set, runFigmaSnapshot routes to
  // the partial path instead of the full page-walk export.
  nodeIds?: string[];
  page?: string;
}

export interface FigmaSnapshotResult {
  ok: boolean;
  reason?: string;
  nodesExported?: number;
  nodesRefreshed?: number;
  outDir?: string;
}

interface IndexEntrySummary {
  name: string;
  type: string;
  page: string;
  screenshotPath: string;
  metadataPath: string;
}

function pageDirFor(name: string): string {
  // Same logic as emit.ts's pageDir. Duplicated to keep the command layer
  // free of emit-internal imports; small and stable.
  const map: Record<string, string> = {
    Composites: 'composites',
    'Dashboard Screens': 'screens',
  };
  if (map[name]) return map[name];
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function runFigmaSnapshot(deps: FigmaSnapshotDeps): Promise<FigmaSnapshotResult> {
  const vf = deps.config.visual_fidelity;
  if (!vf) {
    return {
      ok: false,
      reason: `no [visual_fidelity] block in project config '${deps.config.name}' — nothing to snapshot`,
    };
  }
  const outDir = join(deps.worktree, vf.snapshot_path);

  // Route to partial path if nodeIds was supplied.
  if (deps.nodeIds && deps.nodeIds.length > 0) {
    return runPartial(deps, vf, outDir);
  }

  try {
    const client = deps.clientFactory ? deps.clientFactory() : new FigmaRestClient();
    deps.log(`exporting pages ${vf.figma_pages.join(', ')} → ${outDir}`);
    const { nodesExported } = await emitSnapshot({
      fileKey: vf.figma_file_key,
      pages: vf.figma_pages,
      outDir,
      client,
      fetchImage: deps.fetchImage,
    });
    deps.log(`exported ${nodesExported} nodes`);
    return { ok: true, nodesExported, outDir };
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
}

async function runPartial(
  deps: FigmaSnapshotDeps,
  vf: NonNullable<ProjectConfig['visual_fidelity']>,
  outDir: string,
): Promise<FigmaSnapshotResult> {
  const indexPath = join(outDir, 'index.json');
  if (!existsSync(indexPath)) {
    return {
      ok: false,
      reason: `no committed snapshot at ${vf.snapshot_path} — run \`crew figma-snapshot\` (full export) first`,
    };
  }

  const nodeIds = deps.nodeIds ?? [];
  const index = JSON.parse(readFileSync(indexPath, 'utf8')) as Record<string, IndexEntrySummary>;
  const known = nodeIds.filter((id) => index[id] !== undefined);
  const unknown = nodeIds.filter((id) => index[id] === undefined);

  if (unknown.length > 0 && !deps.page) {
    return {
      ok: false,
      reason: `node(s) ${unknown.join(', ')} not in committed snapshot — pass --page <name> to add them, or run \`crew figma-snapshot\` for a full export`,
    };
  }

  if (deps.page && !vf.figma_pages.includes(deps.page)) {
    return {
      ok: false,
      reason: `page '${deps.page}' not in [visual_fidelity].figma_pages (configured: ${vf.figma_pages.join(', ')})`,
    };
  }

  // Page-mismatch gate: known IDs must be on the --page if --page is set.
  if (deps.page) {
    const targetPage = deps.page;
    for (const id of known) {
      const entry = index[id];
      if (entry && entry.page !== targetPage) {
        return {
          ok: false,
          reason: `node ${id} is on page '${entry.page}', not '${targetPage}'; partial refresh does not move nodes between pages`,
        };
      }
    }
  }

  const pageOverride = deps.page;
  const targets: Array<{ nodeId: string; page: string; dir: string }> = [];
  for (const id of nodeIds) {
    const existing = index[id];
    if (existing) {
      const dir = existing.metadataPath.split('/').slice(0, -1).join('/');
      targets.push({ nodeId: id, page: existing.page, dir });
    } else if (pageOverride) {
      targets.push({ nodeId: id, page: pageOverride, dir: pageDirFor(pageOverride) });
    }
    // Else: caught by the unknown-IDs gate above. Defensive — skip.
  }

  try {
    const client = deps.clientFactory ? deps.clientFactory() : new FigmaRestClient();
    deps.log(`partial refresh: ${nodeIds.length} node(s) → ${outDir}`);
    const { nodesRefreshed } = await emitPartialSnapshot({
      fileKey: vf.figma_file_key,
      outDir,
      client,
      fetchImage: deps.fetchImage,
      targets,
    });
    deps.log(
      `refreshed ${nodesRefreshed} node(s); meta.json intentionally not updated — \`--check\` will continue to report stale until a full refresh`,
    );
    return { ok: true, nodesRefreshed, outDir };
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
}

export const figmaSnapshotCommand = new Command('figma-snapshot')
  .description(
    "export the project's Figma file to <worktree>/.crew/figma-snapshot/ for agent visual verification",
  )
  .option(
    '--check',
    'report whether the committed snapshot is stale vs the live Figma file, without regenerating',
  )
  .option(
    '--node-id <ids>',
    'comma-separated Figma node IDs to refresh selectively (skips the full file fetch). Each ID must already exist in the committed snapshot OR --page must be supplied. Does NOT update meta.json; --check will keep reporting stale.',
  )
  .option(
    '--page <name>',
    'page name for unknown IDs in --node-id (must match a configured page in [visual_fidelity].figma_pages)',
  )
  .action(async (opts: { check?: boolean; nodeId?: string; page?: string }) => {
    if (opts.check && opts.nodeId) {
      console.error(pc.red('✗'), '--check and --node-id are mutually exclusive');
      process.exit(1);
    }

    const cwd = process.cwd();
    const config = await discoverProjectConfig(cwd);
    if (!config) {
      console.error(pc.red('✗'), `no crew project config matches ${cwd}`);
      process.exit(1);
    }

    if (opts.check) {
      const vf = config.visual_fidelity;
      if (!vf) {
        console.error(
          pc.red('✗'),
          `no [visual_fidelity] block in project config '${config.name}' — nothing to check`,
        );
        process.exit(1);
      }
      const metaPath = join(cwd, vf.snapshot_path, 'meta.json');
      if (!existsSync(metaPath)) {
        console.error(
          pc.red('✗'),
          `no committed snapshot at ${vf.snapshot_path} (meta.json absent)`,
        );
        process.exit(1);
      }
      const committed = JSON.parse(readFileSync(metaPath, 'utf8')) as { figmaFileVersion: string };
      const live = await new FigmaRestClient().getFileMeta(vf.figma_file_key);
      if (committed.figmaFileVersion === live.version) {
        console.log(pc.green('✓'), `snapshot is fresh (Figma version ${live.version})`);
        return;
      }
      console.error(
        pc.yellow('!'),
        `snapshot is STALE — committed ${committed.figmaFileVersion}, live ${live.version}. ` +
          'Run the figma-snapshot-refresh skill.',
      );
      process.exit(1);
    }

    const nodeIds = opts.nodeId
      ? opts.nodeId
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
      : undefined;

    if (opts.nodeId && (!nodeIds || nodeIds.length === 0)) {
      console.error(pc.red('✗'), '--node-id requires at least one node ID');
      process.exit(1);
    }

    const result = await runFigmaSnapshot({
      worktree: cwd,
      config,
      log: (msg) => console.log(pc.dim('→'), msg),
      nodeIds,
      page: opts.page,
    });
    if (!result.ok) {
      console.error(pc.red('✗'), result.reason ?? 'figma-snapshot failed');
      process.exit(1);
    }
    if (result.reason) {
      console.log(pc.dim('→'), result.reason);
    }
    if (typeof result.nodesRefreshed === 'number') {
      console.log(
        pc.green('✓'),
        `figma-snapshot partial refresh complete (${result.nodesRefreshed} node(s))`,
      );
    } else {
      console.log(pc.green('✓'), `figma-snapshot complete (${result.nodesExported ?? 0} nodes)`);
    }
  });
