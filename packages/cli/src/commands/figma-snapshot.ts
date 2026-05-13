import { Command } from 'commander';
import pc from 'picocolors';
import { discoverProjectConfig, type ProjectConfig } from '../lib/index.js';

export interface FigmaSnapshotDeps {
  worktree: string;
  config: ProjectConfig;
  log: (msg: string) => void;
}

export interface FigmaSnapshotResult {
  ok: boolean;
  reason?: string;
  nodesExported?: number;
}

export async function runFigmaSnapshot(deps: FigmaSnapshotDeps): Promise<FigmaSnapshotResult> {
  const vf = deps.config.visual_fidelity;
  if (!vf) {
    return {
      ok: false,
      reason: `no [visual_fidelity] block in project config '${deps.config.name}' — nothing to snapshot`,
    };
  }
  if (vf.skip_snapshot) {
    return { ok: true, reason: 'skip_snapshot=true; no-op', nodesExported: 0 };
  }
  return { ok: false, reason: 'not implemented yet' };
}

export const figmaSnapshotCommand = new Command('figma-snapshot')
  .description(
    "export the project's Figma file to <worktree>/.crew/figma-snapshot/ for agent visual verification",
  )
  .action(async () => {
    const cwd = process.cwd();
    const config = await discoverProjectConfig(cwd);
    if (!config) {
      console.error(pc.red('✗'), `no crew project config matches ${cwd}`);
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
    console.log(
      pc.green('✓'),
      `figma-snapshot complete (${result.nodesExported ?? 0} nodes)`,
    );
  });
