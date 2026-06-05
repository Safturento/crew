import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { InitAnswers } from './types.js';

const DEFAULT_COLLECTION_DIR = 'bruno';
const DEFAULT_DAEMON_PORT = 7773;

const ENV_CONTENTS = (port: number): string => `vars {
  baseUrl: http://localhost:${port}
}
`;

const HEALTH_CONTENTS = `meta {
  name: GET /health
  type: http
  seq: 1
}

get {
  url: {{baseUrl}}/health
}

assert {
  res.status: eq 200
}
`;

const FLOW_CONTENTS = `meta {
  name: smoke — health
  type: http
  seq: 1
}

get {
  url: {{baseUrl}}/health
}

assert {
  res.status: eq 200
}

docs {
  Minimal smoke flow scaffold. Replace with the real chained checks for this
  project, then run via the 'bruno:smoke' npm script.
}
`;

/**
 * Scaffold a Bruno collection skeleton into a worktree: the `bruno.json`
 * manifest, a `local` environment, a `GET /health` endpoint, and a minimal
 * smoke flow. Written under `<collection_dir>/` (default `bruno`). Writes
 * unconditionally — the `bruno-skeleton` health-check `fix()` (CREW-227) and
 * the `crew init` wizard (CREW-229) decide *when* to scaffold.
 *
 * @param answers  the wizard answers (`name`, `brunoSmoke.collectionDir`, `ports.daemon`)
 * @param worktree the repo root to scaffold into
 * @returns the absolute paths written: manifest, environment, endpoint, flow
 */
export function scaffoldBruno(answers: InitAnswers, worktree: string): string[] {
  const collectionDir = answers.brunoSmoke?.collectionDir ?? DEFAULT_COLLECTION_DIR;
  const port = answers.ports?.daemon ?? DEFAULT_DAEMON_PORT;
  const root = join(worktree, collectionDir);

  const manifest = join(root, 'bruno.json');
  const env = join(root, 'environments', 'local.bru');
  const health = join(root, 'endpoints', 'health', 'get.bru');
  const flow = join(root, 'flows', 'smoke.bru');

  mkdirSync(join(root, 'environments'), { recursive: true });
  mkdirSync(join(root, 'endpoints', 'health'), { recursive: true });
  mkdirSync(join(root, 'flows'), { recursive: true });

  const manifestJson = {
    version: '1',
    name: answers.name,
    type: 'collection',
    ignore: ['node_modules', '.git'],
  };

  writeFileSync(manifest, `${JSON.stringify(manifestJson, null, 2)}\n`, 'utf8');
  writeFileSync(env, ENV_CONTENTS(port), 'utf8');
  writeFileSync(health, HEALTH_CONTENTS, 'utf8');
  writeFileSync(flow, FLOW_CONTENTS, 'utf8');

  return [manifest, env, health, flow];
}
