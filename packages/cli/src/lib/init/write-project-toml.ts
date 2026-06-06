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
 * Caller preconditions (enforced by `projectConfigSchema` on read, not here):
 * when `answers.playwright` is present it must enable at least one of `smoke` /
 * `authored`, and must supply `startCommand` if there is no `docker` block.
 *
 * @param answers   the wizard answers / health-check-derived config
 * @param projectsDir the dir to write `<name>.toml` into (e.g. `~/.config/crew/projects`)
 * @returns the absolute path written
 */
/**
 * Render the project config TOML to a string without writing it. The single
 * source of truth for the file's content; `writeProjectToml` writes its output,
 * and `crew init`'s converge step renders prospective content here to diff
 * against the on-disk file before deciding whether to (re)write.
 */
export function renderProjectToml(answers: InitAnswers): string {
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
    if (answers.playwright.startCommand) {
      pw.start_command = answers.playwright.startCommand;
    }
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

  return `${stringifyToml(obj)}\n`;
}

export function writeProjectToml(answers: InitAnswers, projectsDir: string): string {
  mkdirSync(projectsDir, { recursive: true });
  const dest = join(projectsDir, `${answers.name}.toml`);
  writeFileSync(dest, renderProjectToml(answers), 'utf8');
  return dest;
}
