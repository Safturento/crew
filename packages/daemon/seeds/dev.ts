import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Insertable, Kysely } from 'kysely';
import type { AgentsTable, DaemonDatabase, RunsTable, ToolCallsTable } from '../src/db.js';

const PROJECT_TOML_FIXTURES: { name: string; toml: string }[] = [
  {
    name: 'crew',
    toml: `name = "crew"
repo_path = "/home/dev/Repos/crew"

[jira]
project_key = "CREW"
site = "https://example.atlassian.net"

[github]
repo = "Safturento/crew"
`,
  },
  {
    name: 'recipes',
    toml: `name = "recipes"
repo_path = "/home/dev/Repos/Recipes-App"

[jira]
project_key = "KAN"
site = "https://example.atlassian.net"

[github]
repo = "Safturento/Recipes-App"
`,
  },
];

const FIXTURE_AGENTS: Omit<Insertable<AgentsTable>, 'created_at'>[] = [
  {
    key: 'CREW-101',
    project_name: 'crew',
    ticket_title: 'Add agent state-history endpoint',
    worktree_path: '/home/dev/Repos/crew-CREW-101',
    branch: 'CREW-101',
    pr_url: null,
  },
  {
    key: 'CREW-102',
    project_name: 'crew',
    ticket_title: 'Refactor IngestService chokidar wiring',
    worktree_path: '/home/dev/Repos/crew-CREW-102',
    branch: 'CREW-102',
    pr_url: 'https://github.com/Safturento/crew/pull/1234',
  },
  {
    key: 'KAN-201',
    project_name: 'recipes',
    ticket_title: 'Profile macro meters',
    worktree_path: '/home/dev/Repos/Recipes-KAN-201',
    branch: 'KAN-201',
    pr_url: null,
  },
  {
    key: 'KAN-202',
    project_name: 'recipes',
    ticket_title: 'Recipe-list filter persistence',
    worktree_path: '/home/dev/Repos/Recipes-KAN-202',
    branch: 'KAN-202',
    pr_url: null,
  },
  {
    key: 'KAN-203',
    project_name: 'recipes',
    ticket_title: 'Macros chart legend',
    worktree_path: '/home/dev/Repos/Recipes-KAN-203',
    branch: 'KAN-203',
    pr_url: 'https://github.com/Safturento/Recipes-App/pull/4321',
  },
];

const FIXTURE_RUNS: Insertable<RunsTable>[] = [
  {
    agent_key: 'CREW-101',
    command: 'run',
    session_id: 'sess-c101-a',
    started_at: '2026-05-04T10:00:00Z',
    completed_at: null,
    exit_code: null,
  },
  {
    agent_key: 'CREW-102',
    command: 'run',
    session_id: 'sess-c102-a',
    started_at: '2026-05-04T11:30:00Z',
    completed_at: '2026-05-04T11:55:00Z',
    exit_code: 0,
  },
  {
    agent_key: 'KAN-201',
    command: 'run',
    session_id: 'sess-k201-a',
    started_at: '2026-05-05T08:15:00Z',
    completed_at: null,
    exit_code: null,
  },
  {
    agent_key: 'KAN-202',
    command: 'fix-pr',
    session_id: 'sess-k202-fpr',
    started_at: '2026-05-05T09:00:00Z',
    completed_at: '2026-05-05T09:18:00Z',
    exit_code: 0,
  },
  // KAN-203 exercises the CREW-116 fix: an agent that opened a PR and then
  // had `crew finish` run cleanly. The original `gh pr create` is in its
  // tool_calls (so cross-run `has_pr_create` would return true forever),
  // but the completed finish run shifts state to `finished`.
  {
    agent_key: 'KAN-203',
    command: 'run',
    session_id: 'sess-k203-run',
    started_at: '2026-05-06T08:00:00Z',
    completed_at: '2026-05-06T08:25:00Z',
    exit_code: 0,
  },
  {
    agent_key: 'KAN-203',
    command: 'finish',
    session_id: 'finish-KAN-203-fixture',
    started_at: '2026-05-06T08:35:00Z',
    completed_at: '2026-05-06T08:36:00Z',
    exit_code: 0,
  },
];

interface FixtureToolCall extends Omit<Insertable<ToolCallsTable>, 'run_id'> {
  agent_key: string;
  /** Optional: when an agent has multiple seeded runs, pick the one with
   *  this `command`. Defaults to the first inserted run for the agent. */
  run_command?: 'run' | 'fix-pr' | 'finish';
}

// Tool calls are pinned to specific agents so the AgentsService state
// derivation lands on the documented mix: CREW-101 / KAN-201 → running
// (open run + tool calls), CREW-102 → pr_open (completed run + a
// `gh pr create` Bash row), KAN-202 → finished (completed run, no
// `gh pr create`).
const FIXTURE_TOOL_CALLS: FixtureToolCall[] = [
  {
    agent_key: 'CREW-101',
    tool_name: 'Read',
    input_summary: 'packages/daemon/src/serve.ts',
    output_tokens: 1840,
    input_tokens: 45,
    cache_read_tokens: 0,
    cache_creation_tokens: 0,
    occurred_at: '2026-05-04T10:05:00Z',
  },
  {
    agent_key: 'CREW-101',
    tool_name: 'Bash',
    input_summary: 'npm run test:run',
    output_tokens: 320,
    input_tokens: 12,
    cache_read_tokens: 0,
    cache_creation_tokens: 0,
    occurred_at: '2026-05-04T10:08:00Z',
  },
  {
    agent_key: 'CREW-102',
    tool_name: 'Edit',
    input_summary: 'packages/daemon/src/services/IngestService.ts',
    output_tokens: 280,
    input_tokens: 220,
    cache_read_tokens: 1500,
    cache_creation_tokens: 0,
    occurred_at: '2026-05-04T11:45:00Z',
  },
  {
    agent_key: 'CREW-102',
    tool_name: 'Bash',
    input_summary: 'gh pr create --title "feat: ingest tweaks" --body ...',
    output_tokens: 510,
    input_tokens: 220,
    cache_read_tokens: 800,
    cache_creation_tokens: 0,
    occurred_at: '2026-05-04T11:54:00Z',
  },
  {
    agent_key: 'KAN-201',
    tool_name: 'Edit',
    input_summary: 'apps/web/src/profile/macros.ts',
    output_tokens: 240,
    input_tokens: 110,
    cache_read_tokens: 600,
    cache_creation_tokens: 0,
    occurred_at: '2026-05-05T08:20:00Z',
  },
  {
    agent_key: 'KAN-202',
    tool_name: 'Bash',
    input_summary: 'npm run test:e2e',
    output_tokens: 510,
    input_tokens: 18,
    cache_read_tokens: 800,
    cache_creation_tokens: 0,
    occurred_at: '2026-05-05T09:10:00Z',
  },
  {
    agent_key: 'KAN-203',
    run_command: 'run',
    tool_name: 'Bash',
    input_summary: 'gh pr create --title "feat: macros legend" --body ...',
    output_tokens: 410,
    input_tokens: 180,
    cache_read_tokens: 720,
    cache_creation_tokens: 0,
    occurred_at: '2026-05-06T08:24:00Z',
  },
];

/**
 * Seed deterministic fixture data into a migrated, empty DB. Worktree-stack
 * daemon containers call this after migrations when `CREW_SEED_FIXTURES=1`
 * so the dashboard renders against realistic state instead of an empty
 * agents list.
 *
 * Idempotent: gates on `agents` already containing rows. Running twice is
 * a no-op rather than a duplicate-key crash.
 */
export async function seedFixtures(db: Kysely<DaemonDatabase>): Promise<void> {
  const existing = await db.selectFrom('agents').select('key').limit(1).execute();
  if (existing.length > 0) return;

  const createdAt = new Date().toISOString();
  await db
    .insertInto('agents')
    .values(FIXTURE_AGENTS.map((a) => ({ ...a, created_at: createdAt })))
    .execute();

  const insertedRuns = await db
    .insertInto('runs')
    .values(FIXTURE_RUNS)
    .returning(['id', 'agent_key', 'command'])
    .execute();

  const runIdByAgentFirst = new Map<string, number>();
  for (const r of insertedRuns) {
    if (!runIdByAgentFirst.has(r.agent_key)) runIdByAgentFirst.set(r.agent_key, r.id);
  }
  const runIdByAgentCommand = new Map<string, number>(
    insertedRuns.map((r) => [`${r.agent_key}::${r.command}`, r.id]),
  );

  const toolCallRows = FIXTURE_TOOL_CALLS.map(({ agent_key, run_command, ...tc }) => {
    const run_id =
      run_command !== undefined
        ? runIdByAgentCommand.get(`${agent_key}::${run_command}`)
        : runIdByAgentFirst.get(agent_key);
    if (run_id === undefined) {
      throw new Error(
        `fixture tool_call references unknown agent_key/run_command: ${agent_key}/${run_command ?? 'first'}`,
      );
    }
    return { ...tc, run_id };
  });

  await db.insertInto('tool_calls').values(toolCallRows).execute();
}

/**
 * Write the project TOMLs the seeded agents reference (`crew.toml` and
 * `recipes.toml`) into `configDir`. ProjectsService reads these on
 * `/api/projects`; without them the dashboard's `byProject.has(p.name)` filter
 * drops every fixture agent and renders an empty grid.
 *
 * Per-file idempotent: skips any TOML that already exists so a re-boot, or an
 * operator who hand-edited one of the files, doesn't get clobbered.
 */
export function seedProjectFixtures(configDir: string): void {
  for (const { name, toml } of PROJECT_TOML_FIXTURES) {
    const path = join(configDir, `${name}.toml`);
    if (existsSync(path)) continue;
    writeFileSync(path, toml, 'utf8');
  }
}
