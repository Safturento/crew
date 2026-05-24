import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Insertable, Kysely } from 'kysely';
import { claudeProjectDirFor } from 'crew-shared';
import type {
  AgentsTable,
  DaemonDatabase,
  RunsTable,
  StartupEventsTable,
  StateTransitionsTable,
  ToolCallsTable,
} from '../db.js';

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

# Seeded so AgentsService.deriveAppUrl returns a non-null value for fixture
# agents and the drawer's docker URL pill renders (CREW-187). [playwright]
# is the canonical source of app_url; the schema requires a sibling
# [playwright.smoke] or [playwright.authored] block and start_command.
[playwright]
app_url = "http://localhost:29649"
start_command = "npm run dev"

[playwright.smoke]
enabled = true
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
  // CREW-103 → initializing: open run with NO tool_calls yet
  // (deriveState: completedAt=null + latestHasToolCalls=false → 'initializing')
  {
    key: 'CREW-103',
    project_name: 'crew',
    ticket_title: 'Brainstorm new dashboard tabs',
    worktree_path: '/home/dev/Repos/crew-CREW-103',
    branch: 'CREW-103',
    pr_url: null,
  },
  // KAN-204 → error: completed run with exit_code != 0
  // (deriveState: completedAt set + exitCode=1 → 'error')
  {
    key: 'KAN-204',
    project_name: 'recipes',
    ticket_title: 'Migrate legacy macro schema',
    worktree_path: '/home/dev/Repos/Recipes-KAN-204',
    branch: 'KAN-204',
    pr_url: null,
  },
  // CREW-104 → pr_merged (CREW-202). Same tool-call shape as CREW-102
  // (gh pr create run) plus a `pr_merged` state_transitions row below
  // — exercises the new emerald StateBadge, "View merged PR" pill, and
  // proves the deriveState pr_merged override end-to-end.
  {
    key: 'CREW-104',
    project_name: 'crew',
    ticket_title: 'Daemon: cache parsed CLAUDE.md',
    worktree_path: '/home/dev/Repos/crew-CREW-104',
    branch: 'CREW-104',
    pr_url: 'https://github.com/Safturento/crew/pull/1235',
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
  // Open run for CREW-103, no tool_calls below → 'initializing'
  {
    agent_key: 'CREW-103',
    command: 'run',
    session_id: 'sess-c103-a',
    started_at: '2026-05-07T09:00:00Z',
    completed_at: null,
    exit_code: null,
  },
  // Completed run for KAN-204 with non-zero exit → 'error'
  {
    agent_key: 'KAN-204',
    command: 'run',
    session_id: 'sess-k204-a',
    started_at: '2026-05-07T10:00:00Z',
    completed_at: '2026-05-07T10:08:00Z',
    exit_code: 1,
  },
  // CREW-104 → pr_merged demo: completed `run` with a `gh pr create` tool
  // call below + a pr_merged state_transitions row in FIXTURE_STATE_TRANSITIONS.
  {
    agent_key: 'CREW-104',
    command: 'run',
    session_id: 'sess-c104-a',
    started_at: '2026-05-08T09:00:00Z',
    completed_at: '2026-05-08T09:20:00Z',
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
  // CREW-102 — extended fixture (CREW-186) to populate TokensByTool with at
  // least 5 distinct tool_name rows. Reads/Edits/Bash/Grep/TodoWrite/Write
  // span the init→running→pr_open windows so the redesigned drawer renders
  // realistic state-grouped sections.
  {
    agent_key: 'CREW-102',
    tool_name: 'Read',
    input_summary: 'packages/daemon/src/services/IngestService.ts',
    output_tokens: 180,
    input_tokens: 12,
    cache_read_tokens: 0,
    cache_creation_tokens: 1200,
    occurred_at: '2026-05-04T11:36:00Z',
  },
  {
    agent_key: 'CREW-102',
    tool_name: 'Grep',
    input_summary: '/chokidar/  in  packages/daemon/src',
    output_tokens: 120,
    input_tokens: 18,
    cache_read_tokens: 800,
    cache_creation_tokens: 0,
    occurred_at: '2026-05-04T11:38:00Z',
  },
  {
    agent_key: 'CREW-102',
    tool_name: 'TodoWrite',
    input_summary: '4 todos · refactor chokidar wiring',
    output_tokens: 90,
    input_tokens: 40,
    cache_read_tokens: 600,
    cache_creation_tokens: 0,
    occurred_at: '2026-05-04T11:42:00Z',
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
    input_summary: 'npm run test:run -- IngestService',
    output_tokens: 320,
    input_tokens: 20,
    cache_read_tokens: 700,
    cache_creation_tokens: 0,
    occurred_at: '2026-05-04T11:48:00Z',
  },
  {
    agent_key: 'CREW-102',
    tool_name: 'Write',
    input_summary: 'packages/daemon/src/services/IngestService.test.ts',
    output_tokens: 410,
    input_tokens: 95,
    cache_read_tokens: 1100,
    cache_creation_tokens: 0,
    occurred_at: '2026-05-04T11:51:00Z',
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
  // CREW-104 — minimal tool-call set with a `gh pr create` so hasPrCreate is
  // true; PrPoller (via FIXTURE_STATE_TRANSITIONS) then escalates to pr_merged.
  {
    agent_key: 'CREW-104',
    tool_name: 'Bash',
    input_summary: 'gh pr create --title "feat: cache CLAUDE.md" --body ...',
    output_tokens: 460,
    input_tokens: 195,
    cache_read_tokens: 800,
    cache_creation_tokens: 0,
    occurred_at: '2026-05-08T09:18:00Z',
  },
];

// CREW-186: explicit state_transitions for the agent we materialise a
// transcript for. Migration 0002's backfill runs on an empty DB before the
// seed inserts tool_calls, so we have to write the rows directly here. Other
// fixture agents fall back to a single section via groupEventsByState's
// "transitions.length === 0" path — they don't need a populated trail.
const FIXTURE_STATE_TRANSITIONS: Insertable<StateTransitionsTable>[] = [
  {
    agent_key: 'CREW-102',
    from_state: null,
    to_state: 'init',
    ts: Date.parse('2026-05-04T11:30:00Z'),
  },
  {
    agent_key: 'CREW-102',
    from_state: 'init',
    to_state: 'running',
    ts: Date.parse('2026-05-04T11:36:00Z'),
  },
  {
    agent_key: 'CREW-102',
    from_state: 'running',
    to_state: 'pr_open',
    ts: Date.parse('2026-05-04T11:54:00Z'),
  },
  // CREW-104 (CREW-202): pr_open → pr_merged path. Final to_state is what
  // AgentsService.list/getByKey reads through its state_transitions join,
  // so the dashboard surfaces this agent in pr_merged with the new
  // emerald StateBadge + "View merged PR" pill.
  {
    agent_key: 'CREW-104',
    from_state: null,
    to_state: 'pr_open',
    ts: Date.parse('2026-05-08T09:18:00Z'),
  },
  {
    agent_key: 'CREW-104',
    from_state: 'pr_open',
    to_state: 'pr_merged',
    ts: Date.parse('2026-05-08T10:30:00Z'),
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
 * Seed `state_transitions` rows for the demo agent so the redesigned drawer
 * mounts ≥2 `TimelineSection` components. Idempotent on its own (gates per
 * agent_key) so it works whether the surrounding `seedFixtures` ran on a
 * fresh DB or no-op'd against existing data. The standalone gate matters
 * because the fixture-time daemon image and the live DB may have drifted —
 * extra `state_transitions` need to slot in even when `seedFixtures` exits
 * early.
 */
export async function seedStateTransitionFixtures(db: Kysely<DaemonDatabase>): Promise<void> {
  const byAgent = new Map<string, Insertable<StateTransitionsTable>[]>();
  for (const row of FIXTURE_STATE_TRANSITIONS) {
    const list = byAgent.get(row.agent_key) ?? [];
    list.push(row);
    byAgent.set(row.agent_key, list);
  }

  for (const [agentKey, rows] of byAgent) {
    const existing = await db
      .selectFrom('state_transitions')
      .select('id')
      .where('agent_key', '=', agentKey)
      .limit(1)
      .execute();
    if (existing.length > 0) continue;
    await db.insertInto('state_transitions').values(rows).execute();
  }
}

/**
 * CREW-201: seed `startup_events` for one demo agent so the drawer
 * Timeline's Starting section renders the new per-phase rows in
 * fixture mode. Mirrors the gate pattern from
 * `seedStateTransitionFixtures`: per-agent_key idempotent so a daemon
 * reload picks up the new content without a DB wipe.
 *
 * Fixture covers the three statuses the merge can produce
 * (completed / in_flight / failed) on representative phases so a
 * visual review touches every tone branch.
 */
const FIXTURE_STARTUP_EVENTS: Insertable<StartupEventsTable>[] = [
  // CREW-102: full happy-path sequence of completed phases, then a
  // failed npm_install at the end so the dashboard's red error row is
  // visible alongside the green completed rows.
  {
    agent_key: 'CREW-102',
    subtype: 'crew_startup_preflight',
    status: 'started',
    ts: Date.parse('2026-05-04T11:30:00Z'),
    summary: 'discovering project config + checking tools',
    duration_ms: null,
    log_path: null,
  },
  {
    agent_key: 'CREW-102',
    subtype: 'crew_startup_preflight',
    status: 'completed',
    ts: Date.parse('2026-05-04T11:30:01Z'),
    summary: 'project=crew; tools ok; gh token present',
    duration_ms: 1100,
    log_path: null,
  },
  {
    agent_key: 'CREW-102',
    subtype: 'crew_startup_worktree',
    status: 'started',
    ts: Date.parse('2026-05-04T11:30:02Z'),
    summary: 'creating worktree at /home/dev/Repos/crew-CREW-102',
    duration_ms: null,
    log_path: null,
  },
  {
    agent_key: 'CREW-102',
    subtype: 'crew_startup_worktree',
    status: 'completed',
    ts: Date.parse('2026-05-04T11:30:05Z'),
    summary: 'worktree at /home/dev/Repos/crew-CREW-102 (branch CREW-102)',
    duration_ms: 2900,
    log_path: null,
  },
  {
    agent_key: 'CREW-102',
    subtype: 'crew_startup_docker',
    status: 'started',
    ts: Date.parse('2026-05-04T11:30:06Z'),
    summary: 'docker compose up --build --wait',
    duration_ms: null,
    log_path: '/tmp/crew-docker-CREW-102.log',
  },
  {
    agent_key: 'CREW-102',
    subtype: 'crew_startup_docker',
    status: 'completed',
    ts: Date.parse('2026-05-04T11:30:42Z'),
    summary: 'docker stack healthy',
    duration_ms: 36_000,
    log_path: '/tmp/crew-docker-CREW-102.log',
  },
  {
    agent_key: 'CREW-102',
    subtype: 'crew_startup_npm_install',
    status: 'started',
    ts: Date.parse('2026-05-04T11:30:43Z'),
    summary: 'npm ci in worktree',
    duration_ms: null,
    log_path: '/tmp/crew-npm-install-CREW-102.log',
  },
  {
    agent_key: 'CREW-102',
    subtype: 'crew_startup_npm_install',
    status: 'failed',
    ts: Date.parse('2026-05-04T11:30:55Z'),
    summary: 'npm ERR! 404 Not Found - GET https://registry.npmjs.org/some-pkg',
    duration_ms: 12_000,
    log_path: '/tmp/crew-npm-install-CREW-102.log',
  },
  // CREW-101: phase still in flight — shows the in_flight tone for the
  // Docker row while no terminal event has landed yet.
  {
    agent_key: 'CREW-101',
    subtype: 'crew_startup_preflight',
    status: 'started',
    ts: Date.parse('2026-05-04T12:00:00Z'),
    summary: 'discovering project config + checking tools',
    duration_ms: null,
    log_path: null,
  },
  {
    agent_key: 'CREW-101',
    subtype: 'crew_startup_preflight',
    status: 'completed',
    ts: Date.parse('2026-05-04T12:00:01Z'),
    summary: 'project=crew; tools ok; gh token present',
    duration_ms: 1100,
    log_path: null,
  },
  {
    agent_key: 'CREW-101',
    subtype: 'crew_startup_docker',
    status: 'started',
    ts: Date.parse('2026-05-04T12:00:05Z'),
    summary: 'docker compose up --build --wait',
    duration_ms: null,
    log_path: '/tmp/crew-docker-CREW-101.log',
  },
];

export async function seedStartupEventsFixtures(db: Kysely<DaemonDatabase>): Promise<void> {
  const byAgent = new Map<string, Insertable<StartupEventsTable>[]>();
  for (const row of FIXTURE_STARTUP_EVENTS) {
    const list = byAgent.get(row.agent_key) ?? [];
    list.push(row);
    byAgent.set(row.agent_key, list);
  }
  for (const [agentKey, rows] of byAgent) {
    const existing = await db
      .selectFrom('startup_events')
      .select('id')
      .where('agent_key', '=', agentKey)
      .limit(1)
      .execute();
    if (existing.length > 0) continue;
    await db.insertInto('startup_events').values(rows).execute();
  }
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

// ─── transcript fixtures (CREW-186) ────────────────────────────────────────
//
// The dashboard's `useTimeline` endpoint reads JSONL transcripts from disk;
// the SQL-side seed alone leaves the drawer empty. We materialise a realistic
// transcript for at least one seeded agent (CREW-102) so the redesigned drawer
// renders TimelineSection + populated TokensByTool against real data.
//
// Events are composed via tiny per-shape helpers below rather than hardcoded
// JSON. Each helper returns a value `parseTranscriptLine` accepts after
// JSON.stringify(), so the fixture round-trips through the canonical parser.

const C102_SESSION_ID = 'sess-c102-a';

interface TranscriptEnvelope {
  uuid: string;
  parentUuid: string | null;
  timestamp: string;
  sessionId: string;
  cwd: string;
}

function envelope(uuid: string, parentUuid: string | null, timestamp: string): TranscriptEnvelope {
  return {
    uuid,
    parentUuid,
    timestamp,
    sessionId: C102_SESSION_ID,
    cwd: '/home/dev/Repos/crew-CREW-102',
  };
}

interface UsageBlock {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}

function usage(out: number, inp = 8, cacheRead = 4000, cacheCreate = 0): UsageBlock {
  return {
    input_tokens: inp,
    output_tokens: out,
    cache_read_input_tokens: cacheRead,
    cache_creation_input_tokens: cacheCreate,
  };
}

interface AssistantTextSpec {
  type: 'text';
  text: string;
}

interface AssistantThinkingSpec {
  type: 'thinking';
  thinking: string;
}

interface AssistantToolUseSpec {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

type AssistantContent = AssistantTextSpec | AssistantThinkingSpec | AssistantToolUseSpec;

function assistant(
  env: TranscriptEnvelope,
  content: AssistantContent[],
  outputTokens: number,
): Record<string, unknown> {
  return {
    ...env,
    type: 'assistant',
    message: {
      role: 'assistant',
      model: 'claude-sonnet-4-6',
      content,
      usage: usage(outputTokens),
    },
  };
}

function userToolResult(
  env: TranscriptEnvelope,
  toolUseId: string,
  text: string,
): Record<string, unknown> {
  return {
    ...env,
    type: 'user',
    message: {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: toolUseId, content: text, is_error: false }],
    },
  };
}

function attachmentHookSuccess(
  env: TranscriptEnvelope,
  hookName: string,
  content: string,
): Record<string, unknown> {
  return {
    ...env,
    type: 'attachment',
    attachment: {
      type: 'hook_success',
      hookName,
      hookEvent: 'PostToolUse',
      content,
      stdout: content,
      stderr: '',
      exitCode: 0,
    },
  };
}

function attachmentSkillListing(env: TranscriptEnvelope): Record<string, unknown> {
  return {
    ...env,
    type: 'attachment',
    attachment: {
      type: 'skill_listing',
      content: '- using-superpowers\n- test-driven-development\n- verification-before-completion',
    },
  };
}

function systemLocalCommand(env: TranscriptEnvelope, content: string): Record<string, unknown> {
  return {
    ...env,
    type: 'system',
    subtype: 'local_command',
    content,
    level: 'info',
  };
}

function systemTurnDuration(env: TranscriptEnvelope, durationMs: number): Record<string, unknown> {
  return {
    ...env,
    type: 'system',
    subtype: 'turn_duration',
    durationMs,
    messageCount: 12,
  };
}

function prLink(env: TranscriptEnvelope, prNumber: number, prUrl: string): Record<string, unknown> {
  return {
    ...env,
    type: 'pr-link',
    prNumber,
    prUrl,
    prRepository: 'Safturento/crew',
  };
}

interface EventSpec {
  ts: string;
  build: (env: TranscriptEnvelope) => Record<string, unknown>;
}

/**
 * 37-event composite transcript for CREW-102 — spans the init / running /
 * pr_open windows seeded in `FIXTURE_STATE_TRANSITIONS`. Mix matches the
 * ticket scope: ≥1 assistant prose, ≥1 thinking, ≥1 hook event, ≥5 distinct
 * tool_name use blocks, plus surrounding system/attachment scaffolding.
 *
 * Tool-use ids are stable per fixture so the matching tool_result blocks
 * thread correctly via `tool_use_id`.
 */
const CREW_102_TRANSCRIPT: EventSpec[] = [
  // ─── init window (11:30 – 11:36) ─────────────────────────────────────────
  {
    ts: '2026-05-04T11:30:30Z',
    build: (env) => systemLocalCommand(env, 'crew run CREW-102'),
  },
  {
    ts: '2026-05-04T11:31:00Z',
    build: (env) =>
      attachmentHookSuccess(env, 'SessionStart:startup', '{"continue":true,"status":"ready"}'),
  },
  {
    ts: '2026-05-04T11:31:15Z',
    build: (env) => attachmentSkillListing(env),
  },
  {
    ts: '2026-05-04T11:32:00Z',
    build: (env) =>
      assistant(
        env,
        [
          {
            type: 'text',
            text: "Looking at the chokidar wiring in IngestService. I'll start by reading the current implementation.",
          },
        ],
        86,
      ),
  },
  {
    ts: '2026-05-04T11:33:30Z',
    build: (env) =>
      assistant(
        env,
        [
          {
            type: 'thinking',
            thinking:
              'The chokidar watcher is constructed inline. Pulling it into a named helper makes it testable and easier to swap for a fake in IngestService.test.ts.',
          },
        ],
        140,
      ),
  },
  // ─── running window (11:36 – 11:54) ──────────────────────────────────────
  {
    ts: '2026-05-04T11:36:00Z',
    build: (env) =>
      assistant(
        env,
        [
          {
            type: 'tool_use',
            id: 'toolu_c102_read_1',
            name: 'Read',
            input: { file_path: 'packages/daemon/src/services/IngestService.ts' },
          },
        ],
        180,
      ),
  },
  {
    ts: '2026-05-04T11:36:02Z',
    build: (env) =>
      userToolResult(env, 'toolu_c102_read_1', '… 320 lines of IngestService source …'),
  },
  {
    ts: '2026-05-04T11:37:30Z',
    build: (env) =>
      assistant(
        env,
        [{ type: 'text', text: 'Now searching for every chokidar reference so nothing slips.' }],
        72,
      ),
  },
  {
    ts: '2026-05-04T11:38:00Z',
    build: (env) =>
      assistant(
        env,
        [
          {
            type: 'tool_use',
            id: 'toolu_c102_grep_1',
            name: 'Grep',
            input: { pattern: 'chokidar', path: 'packages/daemon/src' },
          },
        ],
        120,
      ),
  },
  {
    ts: '2026-05-04T11:38:01Z',
    build: (env) =>
      userToolResult(
        env,
        'toolu_c102_grep_1',
        'packages/daemon/src/services/IngestService.ts:14\npackages/daemon/src/services/IngestService.test.ts:8',
      ),
  },
  {
    ts: '2026-05-04T11:40:00Z',
    build: (env) =>
      assistant(
        env,
        [
          {
            type: 'thinking',
            thinking:
              'Two call sites. Refactor extracts the watcher into a `createWatcher(deps)` factory and lets the test inject a no-op.',
          },
        ],
        130,
      ),
  },
  {
    ts: '2026-05-04T11:41:30Z',
    build: (env) =>
      attachmentHookSuccess(env, 'UserPromptSubmit:context-load', 'Loaded .agents/architecture.md'),
  },
  {
    ts: '2026-05-04T11:42:00Z',
    build: (env) =>
      assistant(
        env,
        [
          {
            type: 'tool_use',
            id: 'toolu_c102_todo_1',
            name: 'TodoWrite',
            input: {
              todos: [
                'Read IngestService',
                'Extract watcher factory',
                'Add IngestService.test.ts coverage',
                'Open PR',
              ],
            },
          },
        ],
        90,
      ),
  },
  {
    ts: '2026-05-04T11:42:01Z',
    build: (env) => userToolResult(env, 'toolu_c102_todo_1', 'Todos updated. 0/4 done.'),
  },
  {
    ts: '2026-05-04T11:43:30Z',
    build: (env) =>
      assistant(
        env,
        [{ type: 'text', text: 'Editing IngestService to extract the watcher factory.' }],
        68,
      ),
  },
  {
    ts: '2026-05-04T11:45:00Z',
    build: (env) =>
      assistant(
        env,
        [
          {
            type: 'tool_use',
            id: 'toolu_c102_edit_1',
            name: 'Edit',
            input: { file_path: 'packages/daemon/src/services/IngestService.ts' },
          },
        ],
        280,
      ),
  },
  {
    ts: '2026-05-04T11:45:02Z',
    build: (env) =>
      userToolResult(env, 'toolu_c102_edit_1', '1 hunk applied — IngestService.ts:14-58'),
  },
  {
    ts: '2026-05-04T11:46:00Z',
    build: (env) => systemTurnDuration(env, 42_500),
  },
  {
    ts: '2026-05-04T11:47:00Z',
    build: (env) =>
      assistant(
        env,
        [
          {
            type: 'thinking',
            thinking:
              'Watcher factory takes a `paths` array and an `onChange` callback. Default chokidar options stay inline; tests inject a fake factory.',
          },
        ],
        110,
      ),
  },
  {
    ts: '2026-05-04T11:48:00Z',
    build: (env) =>
      assistant(
        env,
        [
          {
            type: 'tool_use',
            id: 'toolu_c102_bash_test',
            name: 'Bash',
            input: {
              command: 'npm run test:run -- IngestService',
              description: 'run ingest tests',
            },
          },
        ],
        320,
      ),
  },
  {
    ts: '2026-05-04T11:48:01Z',
    build: (env) =>
      userToolResult(env, 'toolu_c102_bash_test', '✓ 14 passed (IngestService.test.ts)'),
  },
  {
    ts: '2026-05-04T11:49:00Z',
    build: (env) => systemLocalCommand(env, 'Tests green — 14/14 ingest specs passing.'),
  },
  {
    ts: '2026-05-04T11:50:00Z',
    build: (env) => attachmentHookSuccess(env, 'PostToolUse:test', '14 tests passed'),
  },
  {
    ts: '2026-05-04T11:51:00Z',
    build: (env) =>
      assistant(
        env,
        [
          {
            type: 'tool_use',
            id: 'toolu_c102_write_1',
            name: 'Write',
            input: { file_path: 'packages/daemon/src/services/IngestService.test.ts' },
          },
        ],
        410,
      ),
  },
  {
    ts: '2026-05-04T11:51:02Z',
    build: (env) =>
      userToolResult(
        env,
        'toolu_c102_write_1',
        'File written — IngestService.test.ts (3 new specs)',
      ),
  },
  {
    ts: '2026-05-04T11:52:00Z',
    build: (env) =>
      assistant(
        env,
        [{ type: 'text', text: 'Refactor + extra coverage in place. Opening the PR now.' }],
        58,
      ),
  },
  {
    ts: '2026-05-04T11:53:00Z',
    build: (env) =>
      attachmentHookSuccess(
        env,
        'UserPromptSubmit:context-load',
        'Loaded packages/daemon/AGENTS.md',
      ),
  },
  // ─── pr_open window (11:54+) ─────────────────────────────────────────────
  {
    ts: '2026-05-04T11:54:00Z',
    build: (env) =>
      assistant(
        env,
        [
          {
            type: 'tool_use',
            id: 'toolu_c102_bash_pr',
            name: 'Bash',
            input: {
              command: 'gh pr create --title "feat: ingest tweaks" --body ...',
              description: 'open PR for refactor',
            },
          },
        ],
        510,
      ),
  },
  {
    ts: '2026-05-04T11:54:02Z',
    build: (env) =>
      userToolResult(env, 'toolu_c102_bash_pr', 'https://github.com/Safturento/crew/pull/1234'),
  },
  {
    ts: '2026-05-04T11:54:10Z',
    build: (env) => prLink(env, 1234, 'https://github.com/Safturento/crew/pull/1234'),
  },
  {
    ts: '2026-05-04T11:54:30Z',
    build: (env) => attachmentHookSuccess(env, 'PostToolUse:gh-pr-create', 'PR #1234 opened'),
  },
  {
    ts: '2026-05-04T11:55:00Z',
    build: (env) =>
      assistant(
        env,
        [
          {
            type: 'text',
            text: 'PR #1234 is open and CI is running. Transitioning to review.',
          },
        ],
        62,
      ),
  },
  {
    ts: '2026-05-04T11:55:10Z',
    build: (env) => systemTurnDuration(env, 18_200),
  },
];

function renderTranscript(specs: readonly EventSpec[]): string {
  let lastUuid: string | null = null;
  const lines: string[] = [];
  for (let i = 0; i < specs.length; i++) {
    const uuid = `fixture-c102-${i.toString().padStart(3, '0')}`;
    const env = envelope(uuid, lastUuid, specs[i].ts);
    lines.push(JSON.stringify(specs[i].build(env)));
    lastUuid = uuid;
  }
  return lines.join('\n') + '\n';
}

interface TranscriptFixture {
  worktreePath: string;
  sessionId: string;
  content: string;
}

const TRANSCRIPT_FIXTURES: TranscriptFixture[] = [
  {
    worktreePath: '/home/dev/Repos/crew-CREW-102',
    sessionId: C102_SESSION_ID,
    content: renderTranscript(CREW_102_TRANSCRIPT),
  },
];

/**
 * Materialise JSONL transcripts for the fixture agents that have one. The
 * daemon's `TimelineService` resolves transcripts via
 * `claudeProjectDirFor(worktreePath, transcriptsHome)`; we mirror that
 * encoding so the on-disk path lines up exactly with what the resolver
 * returns.
 *
 * Per-file idempotent: skips any file that already exists so a re-boot, or
 * an operator who hand-edited a transcript, doesn't get clobbered.
 */
export function seedTranscriptFixtures(transcriptsHome: string): void {
  for (const fix of TRANSCRIPT_FIXTURES) {
    const dir = claudeProjectDirFor(fix.worktreePath, transcriptsHome);
    const path = join(dir, `${fix.sessionId}.jsonl`);
    if (existsSync(path)) continue;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, fix.content, 'utf8');
  }
}
