import { execSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Execute a shell command and return its trimmed stdout. Used for
 * `source = "generate"` entries (e.g. `openssl rand -base64 32`).
 *
 * Errors include the exit code, stderr, and the command itself so a failing
 * generator is debuggable.
 */
export function runGenerator(command: string): string {
  try {
    const out = execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return out.trim();
  } catch (err) {
    const e = err as { status?: number; stderr?: Buffer | string; message: string };
    const stderr = (e.stderr ?? '').toString().trim();
    throw new Error(
      `generator command failed (exit ${e.status ?? '?'}): \`${command}\`\n${stderr || e.message}`,
    );
  }
}

export interface RunFileGeneratorOptions {
  path: string;
  generator: string;
  /** What to substitute for ${path} in the generator command. Usually equal to `path`. */
  pathSubstitution: string;
}

/**
 * Run a `[files.*]` generator. Skips the generator entirely if `path` already
 * exists — file-generators are one-shot and cached on disk, not re-run on
 * every materialization.
 */
export function runFileGenerator(opts: RunFileGeneratorOptions): void {
  if (existsSync(opts.path)) return;
  mkdirSync(dirname(opts.path), { recursive: true });
  const cmd = opts.generator.replace(/\$\{path\}/g, opts.pathSubstitution);
  execSync(cmd, { stdio: ['ignore', 'inherit', 'inherit'] });
  if (!existsSync(opts.path)) {
    throw new Error(
      `file generator did not produce expected path \`${opts.path}\` — check the generator command writes there.`,
    );
  }
}
