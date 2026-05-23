import { describe, it, expect } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { claudeProjectDirFor, parseProjectConfig, parseTranscript } from 'crew-shared';
import { createDb, runMigrations } from '../db.js';
import { useTmpDir } from '../test/tmpdir.js';
import {
  seedFixtures,
  seedProjectFixtures,
  seedStateTransitionFixtures,
  seedTranscriptFixtures,
} from './dev.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, '..', 'migrations');

const tmp = useTmpDir('crew-seed-test-');

async function migratedDb(): Promise<ReturnType<typeof createDb>> {
  const db = createDb(join(tmp(), 'state.db'));
  await runMigrations(db, MIGRATIONS_DIR);
  return db;
}

describe('seedFixtures', () => {
  it('seeds projects, agents, runs, and tool_calls into an empty migrated DB', async () => {
    const db = await migratedDb();
    try {
      await seedFixtures(db);

      const agents = await db.selectFrom('agents').selectAll().execute();
      const runs = await db.selectFrom('runs').selectAll().execute();
      const toolCalls = await db.selectFrom('tool_calls').selectAll().execute();

      expect(agents.length).toBeGreaterThanOrEqual(4);
      expect(runs.length).toBeGreaterThanOrEqual(4);
      expect(toolCalls.length).toBeGreaterThanOrEqual(4);

      // At least one agent ends up `pr_open` — modeled by setting `pr_url`
      // and including a `gh pr create` Bash tool_call (drives derived state).
      expect(agents.some((a) => a.pr_url !== null)).toBe(true);
      expect(
        toolCalls.some(
          (tc) => tc.tool_name === 'Bash' && tc.input_summary?.startsWith('gh pr create'),
        ),
      ).toBe(true);
    } finally {
      await db.destroy();
    }
  });

  it('seeds project TOMLs whose names match the seeded agents (so dashboard groups land)', () => {
    const dir = join(tmp(), 'projects');
    mkdirSync(dir, { recursive: true });

    seedProjectFixtures(dir);

    expect(existsSync(join(dir, 'crew.toml'))).toBe(true);
    expect(existsSync(join(dir, 'recipes.toml'))).toBe(true);

    // Each TOML must parse cleanly through ProjectsService's loader, otherwise
    // /api/projects silently skips it and the dashboard re-acquires the empty
    // state this seed exists to prevent.
    const crewCfg = parseProjectConfig(readFileSync(join(dir, 'crew.toml'), 'utf8'));
    const recipesCfg = parseProjectConfig(readFileSync(join(dir, 'recipes.toml'), 'utf8'));
    expect(crewCfg.name).toBe('crew');
    expect(recipesCfg.name).toBe('recipes');
  });

  it('seedProjectFixtures is idempotent — re-running does not overwrite existing files', () => {
    const dir = join(tmp(), 'projects');
    mkdirSync(dir, { recursive: true });

    // Pre-existing TOML with a non-default name should be preserved on re-run
    // (idempotency: don't clobber state a previous boot or operator left).
    const stamped = '# user-edited fixture\nname = "crew"\nrepo_path = "/edited"\n';
    writeFileSync(join(dir, 'crew.toml'), stamped, 'utf8');

    seedProjectFixtures(dir);
    seedProjectFixtures(dir);

    expect(readFileSync(join(dir, 'crew.toml'), 'utf8')).toBe(stamped);
    // recipes was missing on first run — gets seeded; second run is a no-op.
    expect(existsSync(join(dir, 'recipes.toml'))).toBe(true);
  });

  it('is idempotent — running twice does not duplicate rows', async () => {
    const db = await migratedDb();
    try {
      await seedFixtures(db);
      await seedStateTransitionFixtures(db);
      const firstAgents = (await db.selectFrom('agents').selectAll().execute()).length;
      const firstRuns = (await db.selectFrom('runs').selectAll().execute()).length;
      const firstToolCalls = (await db.selectFrom('tool_calls').selectAll().execute()).length;
      const firstTransitions = (await db.selectFrom('state_transitions').selectAll().execute())
        .length;

      await seedFixtures(db);
      await seedStateTransitionFixtures(db);
      const secondAgents = (await db.selectFrom('agents').selectAll().execute()).length;
      const secondRuns = (await db.selectFrom('runs').selectAll().execute()).length;
      const secondToolCalls = (await db.selectFrom('tool_calls').selectAll().execute()).length;
      const secondTransitions = (await db.selectFrom('state_transitions').selectAll().execute())
        .length;

      expect(secondAgents).toBe(firstAgents);
      expect(secondRuns).toBe(firstRuns);
      expect(secondToolCalls).toBe(firstToolCalls);
      expect(secondTransitions).toBe(firstTransitions);
    } finally {
      await db.destroy();
    }
  });

  // CREW-186: groupEventsByState renders one section per state_transitions row,
  // so the seeded agent must have ≥2 transitions for the redesigned drawer to
  // mount multiple TimelineSection components. seedFixtures + the dedicated
  // seedStateTransitionFixtures together populate the trail; other fixture
  // agents fall back to a single section via the empty-transitions branch.
  it('seeds state_transitions for the demo agent so the drawer renders multiple sections', async () => {
    const db = await migratedDb();
    try {
      await seedFixtures(db);
      await seedStateTransitionFixtures(db);
      const transitions = await db
        .selectFrom('state_transitions')
        .selectAll()
        .where('agent_key', '=', 'CREW-102')
        .orderBy('ts', 'asc')
        .execute();
      expect(transitions.length).toBeGreaterThanOrEqual(2);
      const toStates = transitions.map((t) => t.to_state);
      expect(toStates).toContain('running');
      expect(toStates).toContain('pr_open');
    } finally {
      await db.destroy();
    }
  });

  // CREW-186: an existing-data DB (the daemon was first booted with the old
  // seed) must still pick up new state_transitions on the next reload. The
  // dedicated seeder is idempotent on its own — gates per agent_key — and
  // serve.ts calls it independently of `seedFixtures`'s agents-existence gate.
  it('seedStateTransitionFixtures backfills transitions independently of seedFixtures', async () => {
    const db = await migratedDb();
    try {
      // Pre-populate agents directly so seedFixtures's gate triggers, then
      // call the state-transition seeder on its own and assert it lands.
      await db
        .insertInto('agents')
        .values({
          key: 'CREW-102',
          project_name: 'crew',
          ticket_title: 'demo',
          worktree_path: '/home/dev/Repos/crew-CREW-102',
          branch: 'CREW-102',
          pr_url: null,
          created_at: '2026-05-04T10:00:00Z',
        })
        .execute();

      await seedStateTransitionFixtures(db);
      const transitions = await db
        .selectFrom('state_transitions')
        .selectAll()
        .where('agent_key', '=', 'CREW-102')
        .execute();
      expect(transitions.length).toBeGreaterThanOrEqual(2);

      // Idempotent: re-running with existing rows is a no-op.
      const before = transitions.length;
      await seedStateTransitionFixtures(db);
      const after = (
        await db
          .selectFrom('state_transitions')
          .selectAll()
          .where('agent_key', '=', 'CREW-102')
          .execute()
      ).length;
      expect(after).toBe(before);
    } finally {
      await db.destroy();
    }
  });

  // CREW-186: TokensByTool requires ≥5 distinct tool_name rows for the
  // ticket's "TokensByTool populates with ≥5 rows" acceptance. Verified at
  // the seed layer so regressions surface here rather than via the dashboard.
  it('seeds enough distinct tool_names for the demo agent to fill TokensByTool', async () => {
    const db = await migratedDb();
    try {
      await seedFixtures(db);
      const distinctTools = await db
        .selectFrom('tool_calls as tc')
        .innerJoin('runs as r', 'r.id', 'tc.run_id')
        .select('tc.tool_name')
        .where('r.agent_key', '=', 'CREW-102')
        .groupBy('tc.tool_name')
        .execute();
      expect(distinctTools.length).toBeGreaterThanOrEqual(5);
    } finally {
      await db.destroy();
    }
  });
});

describe('seedTranscriptFixtures', () => {
  it('materialises a parseable JSONL transcript at the expected path', () => {
    const home = join(tmp(), 'seeded-transcripts');
    seedTranscriptFixtures(home);

    const path = join(
      claudeProjectDirFor('/home/dev/Repos/crew-CREW-102', home),
      'sess-c102-a.jsonl',
    );
    expect(existsSync(path)).toBe(true);

    const raw = readFileSync(path, 'utf8');
    const events = parseTranscript(raw);
    expect(events.length).toBeGreaterThanOrEqual(30);

    const types = new Set(events.map((e) => e.type));
    expect(types.has('assistant')).toBe(true);
    expect(types.has('user')).toBe(true);
    expect(types.has('attachment')).toBe(true);
    expect(types.has('system')).toBe(true);
    expect(types.has('pr-link')).toBe(true);

    // Zod-failure events surface in the `unknown` variant — none should
    // appear if the fixture matches the canonical schemas.
    expect(types.has('unknown')).toBe(false);
  });

  it('is idempotent — re-running does not overwrite an existing transcript', () => {
    const home = join(tmp(), 'seeded-transcripts');
    seedTranscriptFixtures(home);
    const path = join(
      claudeProjectDirFor('/home/dev/Repos/crew-CREW-102', home),
      'sess-c102-a.jsonl',
    );
    const stamped = '# pretend an operator hand-edited this\n';
    writeFileSync(path, stamped, 'utf8');

    seedTranscriptFixtures(home);

    expect(readFileSync(path, 'utf8')).toBe(stamped);
  });
});
