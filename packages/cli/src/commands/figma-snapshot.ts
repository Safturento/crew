import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Command } from 'commander';
import pc from 'picocolors';
import {
  FigmaRestClient,
  discoverProjectConfig,
  emitSnapshot,
  type ProjectConfig,
} from '../lib/index.js';

export interface FigmaSnapshotDeps {
  worktree: string;
  config: ProjectConfig;
  log: (msg: string) => void;
  clientFactory?: () => FigmaRestClient;
  fetchImage?: (url: string) => Promise<Buffer>;
}

export interface FigmaSnapshotResult {
  ok: boolean;
  reason?: string;
  nodesExported?: number;
  outDir?: string;
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

export const figmaSnapshotCommand = new Command('figma-snapshot')
  .description(
    "export the project's Figma file to <worktree>/.crew/figma-snapshot/ for agent visual verification",
  )
  .option(
    '--check',
    'report whether the committed snapshot is stale vs the live Figma file, without regenerating',
  )
  .action(async (opts: { check?: boolean }) => {
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

    const result = await runFigmaSnapshot({
      worktree: cwd,
      config,
      log: (msg) => console.log(pc.dim('→'), msg),
    });
    if (!result.ok) {
      console.error(pc.red('✗'), result.reason ?? 'figma-snapshot failed');
      process.exit(1);
    }
    if (result.reason) {
      console.log(pc.dim('→'), result.reason);
    }
    console.log(pc.green('✓'), `figma-snapshot complete (${result.nodesExported ?? 0} nodes)`);
  });
