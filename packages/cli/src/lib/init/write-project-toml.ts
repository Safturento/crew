import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stringify as stringifyToml } from 'smol-toml';
import type { InitAnswers } from './types.js';

/**
 * Emit a project config TOML matching the current `projectConfigSchema` shape.
 *
 * `playwright.app_url` / `bruno_smoke.base_url` are written as `${VAR}` refs
 * (resolved per-worktree from `env.toml`), never literal URLs — so a single
 * checked-in config works across every worktree. Only opted-in blocks are
 * written; omitted optionals stay absent so the schema's defaults apply.
 *
 * Writing this file *is* registration: `discoverProjectConfig` matches a repo
 * to its config by `repo_path`, so there is no separate registry step.
 *
 * @param answers   the wizard answers / health-check-derived config
 * @param projectsDir the dir to write `<name>.toml` into (e.g. `~/.config/crew/projects`)
 * @returns the absolute path written
 */
export function writeProjectToml(answers: InitAnswers, projectsDir: string): string {
  const obj: Record<string, unknown> = {
    name: answers.name,
    repo_path: answers.repoPath,
    default_branch: answers.defaultBranch ?? 'main',
    jira: { project_key: answers.jira.projectKey, site: answers.jira.site },
    github: { repo: answers.github.repo },
  };

  if (answers.docker) {
    obj.docker = { canonical_worktree: answers.docker.canonicalWorktree };
  }

  if (answers.sandbox) {
    obj.sandbox = { allowed_domains: answers.sandbox.allowedDomains };
  }

  if (answers.playwright) {
    const pw: Record<string, unknown> = {
      app_url: answers.playwright.appUrl ?? '${APP_URL}',
    };
    if (answers.playwright.smoke) {
      pw.smoke = { enabled: true };
    }
    if (answers.playwright.authored) {
      pw.authored = {
        enabled: true,
        tests_dir: answers.playwright.authored.testsDir,
        test_command: answers.playwright.authored.testCommand,
      };
    }
    obj.playwright = pw;
  }

  if (answers.brunoSmoke) {
    obj.bruno_smoke = {
      enabled: true,
      base_url: answers.brunoSmoke.baseUrl ?? '${DAEMON_URL}',
      collection_dir: answers.brunoSmoke.collectionDir ?? 'bruno',
    };
  }

  mkdirSync(projectsDir, { recursive: true });
  const dest = join(projectsDir, `${answers.name}.toml`);
  writeFileSync(dest, `${stringifyToml(obj)}\n`, 'utf8');
  return dest;
}
