import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { defaultProjectConfigDir, loadProjectConfigByName, parseProjectConfig } from 'crew-shared';
import { runEnvInit, type EnvResult } from '../../commands/env.js';
import { baselinePresent } from '../health/checks/baseline-present.js';
import type { HealthContext } from '../health/types.js';
import { renderProjectToml } from './write-project-toml.js';
import { renderEnvToml } from './write-env-toml.js';
import { scaffoldPlaywright } from './scaffold-playwright.js';
import { scaffoldBruno } from './scaffold-bruno.js';
import { writeSettingsJson } from './write-settings-json.js';
import type { InitAnswers } from './types.js';

/**
 * Decides whether to overwrite a crew-managed file that already exists on disk
 * and would change. `true` overwrites, `false` leaves it untouched. The real
 * command wires this to an `@inquirer/prompts` confirm that shows the diff;
 * tests inject a plain boolean or function. Omitted → overwrite (the
 * fresh-write / non-interactive default).
 */
export type ConfirmOverwrite =
  | boolean
  | ((file: string, currentContent: string, nextContent: string) => boolean | Promise<boolean>);

export interface RunInitOptions {
  /** The repo `crew init` is setting up (the wizard's target worktree). */
  cwd: string;
  /** Answers gathered by the wizard (or injected by tests / a `fix()` caller). */
  answers: InitAnswers;
  /**
   * Where the project TOML is written. Defaults to `~/.config/crew/projects`;
   * tests inject a tmpdir so they never touch the real config store.
   */
  projectsDir?: string;
  /** Confirm callback for diverged managed files. See {@link ConfirmOverwrite}. */
  confirmOverwrite?: ConfirmOverwrite;
  /** Progress sink. Defaults to a no-op. */
  log?: (msg: string) => void;
}

export interface InitResult {
  /** Absolute paths written (or merged) this run. */
  written: string[];
  /** Managed files left untouched because the overwrite confirm was declined. */
  skipped: string[];
  /** Set when the agent-context baseline (AGENTS.md + .agents/) is missing. */
  baselineWarning?: string;
  /** Result of `runEnvInit`; undefined when env materialization was skipped. */
  env?: EnvResult;
}

type NormalizedConfirm = (file: string, cur: string, next: string) => Promise<boolean>;

function normalizeConfirm(confirm: ConfirmOverwrite | undefined): NormalizedConfirm {
  if (confirm === undefined) return async () => true;
  if (typeof confirm === 'boolean') return async () => confirm;
  return async (file, cur, next) => confirm(file, cur, next);
}

/**
 * Write a wholesale crew-managed file, converging rather than clobbering: when
 * the file already exists and its content would change, the caller's confirm
 * decides. Identical content is an idempotent no-op (no prompt, no rewrite).
 */
async function convergeManagedFile(
  path: string,
  nextContent: string,
  confirm: NormalizedConfirm,
  result: InitResult,
  log: (msg: string) => void,
): Promise<void> {
  if (existsSync(path)) {
    const current = readFileSync(path, 'utf8');
    if (current === nextContent) {
      log(`unchanged ${path}`);
      return;
    }
    if (!(await confirm(path, current, nextContent))) {
      result.skipped.push(path);
      log(`skipped ${path} (declined overwrite)`);
      return;
    }
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, nextContent, 'utf8');
  result.written.push(path);
  log(`wrote ${path}`);
}

/**
 * The testable core of `crew init`: scaffold (or converge) a project's
 * crew-specific layer from already-gathered answers. Prompt-free by design —
 * the thin `initCommand` collects answers via `@inquirer/prompts` and calls
 * this. Writes, in order:
 *
 *  1. the project TOML (`<projectsDir>/<name>.toml` — writing it *is*
 *     registration, since discovery is a cwd match),
 *  2. the repo `env.toml`, then materializes `.env` via the existing
 *     `runEnvInit` when a `[docker]` block is configured,
 *  3. the Playwright skeleton (only when opted in and not already present),
 *  4. the Bruno collection skeleton (same gate),
 *  5. `.claude/settings.json` (array-merged — never clobbers).
 *
 * Steps 1–2 are converge-aware: a diverged on-disk file is only overwritten
 * when `confirmOverwrite` accepts. Finally it runs the `baseline-present`
 * detect and, when the agent-context baseline is missing, surfaces a warning
 * (it never creates the baseline — that is the `establishing-a-new-project`
 * skill's job).
 */
export async function runInit(options: RunInitOptions): Promise<InitResult> {
  const { cwd, answers } = options;
  const projectsDir = options.projectsDir ?? defaultProjectConfigDir();
  const confirm = normalizeConfirm(options.confirmOverwrite);
  const log = options.log ?? (() => {});
  const result: InitResult = { written: [], skipped: [] };

  // Fail fast: never let an invalid answer set produce a partial scaffold. A
  // half-written project (e.g. a `[playwright]` block with neither smoke nor
  // authored enabled) is worse than none — the very next config load would
  // throw. Validate the rendered config against the schema before writing
  // anything.
  const projectToml = renderProjectToml(answers);
  try {
    parseProjectConfig(projectToml);
  } catch (err) {
    throw new Error(
      `crew init: refusing to write an invalid project config — ${(err as Error).message}`,
    );
  }

  // 1. project TOML (registration) — converge-aware
  await convergeManagedFile(
    join(projectsDir, `${answers.name}.toml`),
    projectToml,
    confirm,
    result,
    log,
  );

  // 2. repo env.toml — converge-aware
  await convergeManagedFile(join(cwd, 'env.toml'), renderEnvToml(answers), confirm, result, log);

  // 3. Playwright skeleton — one-time bootstrap, never clobbers a real suite
  if (answers.playwright) {
    const configPath = join(cwd, 'playwright.config.ts');
    if (existsSync(configPath)) {
      log(`skipped playwright scaffold (${configPath} exists)`);
    } else {
      result.written.push(...scaffoldPlaywright(cwd));
    }
  }

  // 4. Bruno collection skeleton — same one-time gate
  if (answers.brunoSmoke) {
    const collectionDir = answers.brunoSmoke.collectionDir ?? 'bruno';
    const manifestPath = join(cwd, collectionDir, 'bruno.json');
    if (existsSync(manifestPath)) {
      log(`skipped bruno scaffold (${manifestPath} exists)`);
    } else {
      result.written.push(...scaffoldBruno(answers, cwd));
    }
  }

  // 5. .claude/settings.json — the writer array-merges, so this is always safe
  result.written.push(writeSettingsJson(answers, cwd));

  // 6. materialize .env via the existing `crew env init` path. Materialization
  //    derives a worktree id from the canonical worktree, so it only applies to
  //    docker-backed projects; env.toml is written regardless for later use.
  if (answers.docker) {
    const config = loadProjectConfigByName(answers.name, projectsDir);
    result.env = await runEnvInit({ worktree: cwd, config, log });
  }

  // 7. baseline detect → warning (never created here)
  const baseline = await baselinePresent.detect({ worktree: cwd } as HealthContext);
  if (baseline.status !== 'ok') {
    result.baselineWarning = baseline.remediation
      ? `${baseline.headline} — ${baseline.remediation}`
      : baseline.headline;
  }

  return result;
}
