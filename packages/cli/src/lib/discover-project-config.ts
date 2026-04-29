import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execa } from 'execa';
import { defaultProjectConfigDir, parseProjectConfig, type ProjectConfig } from 'crew-shared';

/**
 * Auto-discover the project config that matches the current cwd. Walks up to
 * find a `.git` directory, reads the origin URL, and returns the first config
 * in `~/.config/crew/projects/*.toml` whose `github.repo` matches. Returns
 * null if no match.
 *
 * CLI-local because it shells out via `execa`; the daemon receives a project
 * name from the CLI and uses `loadProjectConfigByName` directly.
 */
export async function discoverProjectConfig(cwd: string): Promise<ProjectConfig | null> {
  const remoteUrl = await execa('git', ['-C', cwd, 'remote', 'get-url', 'origin'])
    .then((r) => r.stdout.trim())
    .catch(() => '');
  if (!remoteUrl) return null;

  const repoSlug = parseGithubSlug(remoteUrl);
  if (!repoSlug) return null;

  const configDir = defaultProjectConfigDir();
  if (!existsSync(configDir)) return null;
  for (const file of readdirSync(configDir)) {
    if (!file.endsWith('.toml')) continue;
    try {
      const config = parseProjectConfig(readFileSync(join(configDir, file), 'utf8'));
      if (config.github.repo === repoSlug) return config;
    } catch {
      // skip files that don't parse
    }
  }
  return null;
}

function parseGithubSlug(remoteUrl: string): string | null {
  // git@github.com:owner/repo.git → owner/repo
  // https://github.com/owner/repo.git → owner/repo
  const match = remoteUrl.match(/github\.com[:/]([^/]+\/[^/.]+)(\.git)?$/);
  return match?.[1] ?? null;
}
