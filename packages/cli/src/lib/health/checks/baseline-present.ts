import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ok, warn, type HealthCheck } from '../types.js';

/**
 * Warn (never fail) when a project lacks the agent-context baseline:
 * `<worktree>/AGENTS.md` and a `<worktree>/.agents/` directory.
 *
 * The baseline is orthogonal to crew's own setup — a project can be perfectly
 * crew-healthy without it — so this is `warn`-level and has no `fix()`. Stamping
 * the baseline is the `establishing-a-new-project` skill's job, which the
 * remediation points at.
 */
export const baselinePresent: HealthCheck = {
  name: 'baseline-present',
  scope: 'project',
  detect: async ({ worktree }) => {
    const agentsMd = join(worktree, 'AGENTS.md');
    const agentsDir = join(worktree, '.agents');
    const hasAgentsMd = existsSync(agentsMd);
    const hasAgentsDir = existsSync(agentsDir) && statSync(agentsDir).isDirectory();

    if (hasAgentsMd && hasAgentsDir) {
      return ok('agent-context baseline present (AGENTS.md + .agents/)');
    }

    const missing = [hasAgentsMd ? null : 'AGENTS.md', hasAgentsDir ? null : '.agents/'].filter(
      Boolean,
    );

    return warn(`agent-context baseline incomplete — missing ${missing.join(', ')}`, {
      remediation: 'run the establishing-a-new-project skill to stamp the agent-context baseline',
      details: { missing: missing.join(', ') },
    });
  },
};
