import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pino, type Logger } from 'pino';
import type { Kysely } from 'kysely';
import { buildApp, type DaemonApp } from '../app.js';
import { parseDaemonConfig } from '../config.js';
import { createDb, runMigrations, type DaemonDatabase } from '../db.js';
import { useTmpDir } from '../test/tmpdir.js';
import {
  signPayload,
  pullRequestClosedPayload,
} from '../services/github/webhook-fixtures.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, '..', 'migrations');

const tmp = useTmpDir('crew-webhook-route-');
const silentLogger: Logger = pino({ level: 'silent' });

const REPO = 'Owner/repo';
const SECRET = 'top-secret';
const HOOK_ID = '999';
const PR_URL = `https://github.com/${REPO}/pull/1`;

const crewToml = `
name = "crew"
repo_path = "/code/crew"

[jira]
project_key = "CREW"
site = "https://example.atlassian.net"

[github]
repo = "${REPO}"
webhook_hook_id = "${HOOK_ID}"
`;

async function setup(): Promise<{ app: DaemonApp; db: Kysely<DaemonDatabase> }> {
  const root = tmp();
  const projectsDir = join(root, 'projects');
  mkdirSync(projectsDir, { recursive: true });
  writeFileSync(join(projectsDir, 'crew.toml'), crewToml);

  const secretsFile = join(root, 'github-webhook-secrets.toml');
  writeFileSync(secretsFile, `["${REPO}"]\nsecret = "${SECRET}"\n`);

  const config = parseDaemonConfig({
    CREW_CONFIG_DIR: projectsDir,
    CREW_DB_FILE: ':memory:',
    CREW_GITHUB_WEBHOOK_SECRETS_FILE: secretsFile,
  });
  const db = createDb(config.dbFile);
  await runMigrations(db, MIGRATIONS_DIR);
  const app = await buildApp({ config, logger: silentLogger, db });
  return { app, db };
}

async function seedOpenPrAgent(db: Kysely<DaemonDatabase>): Promise<void> {
  await db
    .insertInto('agents')
    .values({
      key: 'CREW-1',
      project_name: 'crew',
      ticket_title: 'CREW-1 title',
      worktree_path: '/x/CREW-1',
      branch: 'CREW-1',
      pr_url: PR_URL,
      created_at: '2026-06-19T12:00:00Z',
    })
    .execute();
  await db
    .insertInto('state_transitions')
    .values({ agent_key: 'CREW-1', from_state: null, to_state: 'pr_open', ts: Date.now() })
    .execute();
}

describe('POST /api/webhooks/github', () => {
  it('verifies the signature over the raw body and transitions the agent', async () => {
    const { app, db } = await setup();
    try {
      await seedOpenPrAgent(db);
      const raw = JSON.stringify(pullRequestClosedPayload({ repo: REPO, htmlUrl: PR_URL }));
      const res = await app.inject({
        method: 'POST',
        url: '/api/webhooks/github',
        headers: {
          'content-type': 'application/json',
          'x-github-event': 'pull_request',
          'x-github-hook-id': HOOK_ID,
          'x-hub-signature-256': signPayload(raw, SECRET),
        },
        payload: raw,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ matched: true, changed: true });

      const latest = await db
        .selectFrom('state_transitions')
        .select('to_state')
        .where('agent_key', '=', 'CREW-1')
        .orderBy('id', 'desc')
        .executeTakeFirst();
      expect(latest?.to_state).toBe('pr_merged');
    } finally {
      await app.close();
      await db.destroy();
    }
  });

  it('401s when the body is tampered after signing', async () => {
    const { app, db } = await setup();
    try {
      await seedOpenPrAgent(db);
      const signed = JSON.stringify(pullRequestClosedPayload({ repo: REPO, htmlUrl: PR_URL }));
      const sig = signPayload(signed, SECRET);
      const tampered = signed.replace('pull/1', 'pull/2');
      const res = await app.inject({
        method: 'POST',
        url: '/api/webhooks/github',
        headers: {
          'content-type': 'application/json',
          'x-github-event': 'pull_request',
          'x-github-hook-id': HOOK_ID,
          'x-hub-signature-256': sig,
        },
        payload: tampered,
      });
      expect(res.statusCode).toBe(401);

      // The tampered delivery must not have transitioned the agent.
      const latest = await db
        .selectFrom('state_transitions')
        .select('to_state')
        .where('agent_key', '=', 'CREW-1')
        .orderBy('id', 'desc')
        .executeTakeFirst();
      expect(latest?.to_state).toBe('pr_open');
    } finally {
      await app.close();
      await db.destroy();
    }
  });

  it('200 { matched: false } for a verified delivery targeting an unknown PR', async () => {
    const { app, db } = await setup();
    try {
      const raw = JSON.stringify(
        pullRequestClosedPayload({ repo: REPO, htmlUrl: `https://github.com/${REPO}/pull/999999` }),
      );
      const res = await app.inject({
        method: 'POST',
        url: '/api/webhooks/github',
        headers: {
          'content-type': 'application/json',
          'x-github-event': 'pull_request',
          'x-github-hook-id': HOOK_ID,
          'x-hub-signature-256': signPayload(raw, SECRET),
        },
        payload: raw,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ matched: false });
    } finally {
      await app.close();
      await db.destroy();
    }
  });
});
