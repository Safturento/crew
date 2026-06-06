import { basename } from 'node:path';
import { confirm, input, number } from '@inquirer/prompts';
import pc from 'picocolors';
import type { ProjectConfig } from 'crew-shared';
import type { ConfirmOverwrite } from './run-init.js';
import type { InitAnswers } from './types.js';

const DEFAULT_DAEMON_PORT = 7773;
const DEFAULT_DASHBOARD_PORT = 5173;

/**
 * Gather the `crew init` wizard answers via `@inquirer/prompts`, pre-filling
 * every prompt from `existing` when present (converge mode). Pure I/O — the
 * scaffolding itself lives in {@link runInit}, which this feeds. `repoPath` is
 * the target `cwd` rather than a prompt; writing the config there *is*
 * registration.
 */
export async function gatherInitAnswers(
  cwd: string,
  existing: ProjectConfig | null,
): Promise<InitAnswers> {
  const name = await input({ message: 'Project name', default: existing?.name ?? basename(cwd) });

  const projectKey = await input({
    message: 'Jira project key',
    default: existing?.jira.project_key,
  });
  const site = await input({ message: 'Jira site URL', default: existing?.jira.site });
  const repo = await input({ message: 'GitHub repo (owner/name)', default: existing?.github.repo });

  const daemon =
    (await number({ message: 'Daemon port', default: DEFAULT_DAEMON_PORT })) ?? DEFAULT_DAEMON_PORT;
  const dashboard =
    (await number({ message: 'Dashboard port', default: DEFAULT_DASHBOARD_PORT })) ??
    DEFAULT_DASHBOARD_PORT;

  const answers: InitAnswers = {
    name,
    repoPath: cwd,
    jira: { projectKey, site },
    github: { repo },
    ports: { daemon, dashboard },
  };

  const wantsDocker = await confirm({
    message: 'Does this project run a Docker stack?',
    default: Boolean(existing?.docker),
  });
  if (wantsDocker) {
    const canonicalWorktree = await input({
      message: 'Canonical worktree directory name',
      default: existing?.docker?.canonical_worktree ?? basename(cwd),
    });
    answers.docker = { canonicalWorktree };
  }

  const wantsPlaywright = await confirm({
    message: 'Set up Playwright e2e?',
    default: Boolean(existing?.playwright),
  });
  if (wantsPlaywright) {
    const smoke = await confirm({
      message: 'Enable the MCP-driven smoke flow?',
      default: Boolean(existing?.playwright?.smoke),
    });
    const authored = await confirm({
      message: 'Enable an authored e2e suite?',
      default: Boolean(existing?.playwright?.authored),
    });
    answers.playwright = { smoke };
    if (authored) {
      const testsDir = await input({
        message: 'Authored tests directory',
        default: existing?.playwright?.authored?.tests_dir ?? 'tests/e2e',
      });
      const testCommand = await input({
        message: 'Authored test command',
        default: existing?.playwright?.authored?.test_command ?? 'npm run test:e2e',
      });
      answers.playwright.authored = { testsDir, testCommand };
    }
    // The schema requires start_command when Playwright runs without Docker.
    if (!wantsDocker) {
      answers.playwright.startCommand = await input({
        message: 'Command that brings the app up for the suite',
        default: existing?.playwright?.start_command ?? 'npm run dev',
      });
    }
  }

  const wantsBruno = await confirm({
    message: 'Set up Bruno smoke?',
    default: Boolean(existing?.bruno_smoke),
  });
  if (wantsBruno) {
    const collectionDir = await input({
      message: 'Bruno collection directory',
      default: existing?.bruno_smoke?.collection_dir ?? 'bruno',
    });
    answers.brunoSmoke = { collectionDir };
  }

  return answers;
}

/**
 * Interactive {@link ConfirmOverwrite}: when `crew init` would overwrite a
 * managed file that has diverged from what crew last wrote, show the on-disk vs
 * prospective content and ask before clobbering. Never silently overwrites a
 * hand-edited file.
 */
export const confirmOverwriteInteractive: ConfirmOverwrite = async (file, current, next) => {
  console.log(pc.yellow(`\n⚠ ${file} has diverged from what crew last wrote.`));
  console.log(pc.dim('── on disk ──────────────────────────────'));
  console.log(current.trimEnd());
  console.log(pc.dim('── would write ──────────────────────────'));
  console.log(next.trimEnd());
  console.log(pc.dim('─────────────────────────────────────────'));
  return confirm({ message: `Overwrite ${file}?`, default: false });
};
