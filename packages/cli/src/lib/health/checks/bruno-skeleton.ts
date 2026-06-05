import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { scaffoldBruno } from '../../init/scaffold-bruno.js';
import type { InitAnswers } from '../../init/types.js';
import { fail, ok, type HealthCheck } from '../types.js';

const DEFAULT_COLLECTION_DIR = 'bruno';

/**
 * Require the Bruno collection skeleton when a project opts into bruno smoke
 * (`config.bruno_smoke?.enabled` — the schema pins this to `true`, so presence
 * implies enabled). "Present" means the collection's `bruno.json` manifest
 * exists under the configured `collection_dir` (default `bruno`). `fix()`
 * delegates to `scaffoldBruno`, the single-source scaffolder also used by
 * `crew init`; it derives the wizard answers it needs from the loaded config.
 */
export const brunoSkeleton: HealthCheck = {
  name: 'bruno-skeleton',
  scope: 'project',
  detect: async ({ config, worktree }) => {
    if (!config.bruno_smoke?.enabled) {
      return ok('bruno smoke not enabled — nothing to scaffold');
    }

    const collectionDir = config.bruno_smoke.collection_dir ?? DEFAULT_COLLECTION_DIR;
    const manifest = join(worktree, collectionDir, 'bruno.json');

    if (existsSync(manifest)) {
      return ok(`bruno collection present at ${collectionDir}/`);
    }

    return fail(`bruno smoke opted in but ${collectionDir}/ collection is missing`, {
      remediation: 'run crew init (or crew doctor --fix) to scaffold the bruno collection',
      fixable: true,
      details: { expected: manifest },
    });
  },
  fix: async ({ config, worktree }) => {
    const answers: InitAnswers = {
      name: config.name,
      repoPath: worktree,
      jira: { projectKey: config.jira.project_key, site: config.jira.site },
      github: { repo: config.github.repo },
      brunoSmoke: { collectionDir: config.bruno_smoke?.collection_dir ?? DEFAULT_COLLECTION_DIR },
    };
    scaffoldBruno(answers, worktree);
  },
};
