// Mock data for crew dashboard prototype.
// Realistic ticket titles, plausible tool calls, edge cases for every state.

const NOW = new Date('2026-04-26T14:51:00');

// ── Projects ────────────────────────────────────────────────────────────────
const MOCK_PROJECTS = [
  {
    name: 'kanban-api',
    repo_path: '~/code/kanban-api',
    default_branch: 'main',
    jira_project_key: 'KAN',
    docker_compose: 'docker-compose.dev.yml',
    test_command: 'pnpm test',
    activeRuns: 4,
    registered: '2026-02-12',
  },
  {
    name: 'crew',
    repo_path: '~/code/crew',
    default_branch: 'main',
    jira_project_key: 'CREW',
    docker_compose: 'docker-compose.yml',
    test_command: 'pnpm -r test',
    activeRuns: 2,
    registered: '2026-01-05',
  },
  {
    name: 'lighthouse',
    repo_path: '~/code/lighthouse',
    default_branch: 'develop',
    jira_project_key: 'LH',
    docker_compose: 'compose.yml',
    test_command: 'cargo test',
    activeRuns: 1,
    registered: '2026-03-20',
  },
  {
    name: 'mailer-svc',
    repo_path: '~/code/mailer-svc',
    default_branch: 'main',
    jira_project_key: 'MAIL',
    docker_compose: 'docker-compose.yml',
    test_command: 'go test ./...',
    activeRuns: 0,
    registered: '2026-02-28',
  },
];

// ── Open Jira tickets per project (for New Run modal) ───────────────────────
const MOCK_TICKETS = {
  KAN: [
    { key: 'KAN-31', title: 'Drag-and-drop reordering keeps stale board state after WS reconnect', priority: 'High' },
    { key: 'KAN-32', title: 'Add bulk-archive action to swimlane context menu', priority: 'Medium' },
    { key: 'KAN-33', title: 'Card detail modal traps focus inside attachment grid', priority: 'Low' },
    { key: 'KAN-34', title: 'Optimistic update for label color change flickers on slow networks', priority: 'Medium' },
    { key: 'KAN-35', title: 'Migrate legacy /v1/cards endpoint consumers to /v2', priority: 'High' },
  ],
  CREW: [
    { key: 'CREW-19', title: 'Daemon should expose state-history endpoint per agent', priority: 'High' },
    { key: 'CREW-20', title: 'Sticky favicon badge survives across browser tab restore', priority: 'Medium' },
    { key: 'CREW-21', title: 'Truncate transcript output > 50KB with "show more" affordance', priority: 'Medium' },
    { key: 'CREW-22', title: 'Add /jobs/finish endpoint and wire into UI', priority: 'High' },
  ],
  LH: [
    { key: 'LH-08', title: 'Latency histogram aggregator drops samples under load', priority: 'High' },
    { key: 'LH-09', title: 'Probe runner panics on malformed cron expression', priority: 'Medium' },
  ],
  MAIL: [
    { key: 'MAIL-14', title: 'Bounce-handler retry uses linear backoff instead of exponential', priority: 'Medium' },
    { key: 'MAIL-15', title: 'SMTP credentials rotated mid-run causes silent send failures', priority: 'High' },
  ],
};

// ── Transcript factories ────────────────────────────────────────────────────
const tool = (name, summary, ts, tokens, output) => ({
  type: 'tool', name, summary, ts, tokens, output,
});
const seg = (state, startedAt, label) => ({ type: 'segment', state, startedAt, label });

// Realistic transcripts per agent. Each is an array of segments + tool calls.
function transcript_KAN_23() {
  return [
    seg('initializing', '14:30:02', 'Initializing'),
    tool('Bash', 'docker compose -f docker-compose.dev.yml up -d', '14:30:04', 180, 'Creating network kanban-api_default\nCreating kanban-api_db_1\nCreating kanban-api_redis_1\nCreating kanban-api_web_1\n[+] Running 4/4'),
    tool('Bash', 'pnpm install', '14:30:18', 95, 'Lockfile is up to date, resolution step is skipped\nProgress: resolved 1247, reused 1247, downloaded 0, added 0\nDone in 3.4s'),
    seg('running', '14:30:24', 'Running'),
    tool('Read', '/home/x/repo/src/board/dnd.ts', '14:30:26', 1200),
    tool('Read', '/home/x/repo/src/board/sync.ts', '14:30:28', 980),
    tool('Grep', "'reconnect' in src/", '14:30:31', 220, 'src/board/sync.ts:42:  socket.on(\'reconnect\', () => {\nsrc/board/sync.ts:78:  // TODO: re-emit pending mutations on reconnect\nsrc/lib/ws.ts:14:  reconnectionDelay: 500,'),
    tool('Read', '/home/x/repo/src/lib/ws.ts', '14:30:34', 640),
    tool('Edit', 'src/board/sync.ts (+34 −12)', '14:30:51', 2100, "@@ -75,7 +75,12 @@\n   socket.on('reconnect', () => {\n-    log.info('reconnected');\n+    log.info('reconnected, replaying %d pending mutations', queue.length);\n+    for (const m of queue) {\n+      socket.emit('mutate', m);\n+    }\n+    queue.length = 0;\n   });"),
    tool('Bash', 'pnpm test board/sync', '14:31:14', 850, 'PASS  src/board/sync.test.ts\n  ✓ replays pending mutations on reconnect (118 ms)\n  ✓ does not duplicate mutations on rapid reconnect (94 ms)\nTests: 2 passed, 2 total'),
    tool('Edit', 'src/board/dnd.ts (+8 −2)', '14:31:33', 540),
    tool('Bash', 'pnpm test', '14:31:48', 1820, 'Test Suites: 47 passed, 47 total\nTests: 312 passed, 312 total\nSnapshots: 18 passed\nTime: 24.118 s'),
    seg('waiting', '14:38:22', 'Waiting on me'),
    tool('Question', 'Should reconnect-replay be gated behind feature flag REPLAY_QUEUE_V2?', '14:38:22', 90),
  ];
}

function transcript_CREW_19() {
  return [
    seg('initializing', '14:42:10', 'Initializing'),
    tool('Bash', 'docker compose up -d', '14:42:12', 80),
    seg('running', '14:42:30', 'Running'),
    tool('Read', 'packages/daemon/src/server.ts', '14:42:32', 720),
    tool('Read', 'packages/daemon/src/agents/store.ts', '14:42:35', 1100),
    tool('Grep', "'state-history' in packages/", '14:42:38', 60, 'No matches found.'),
    tool('Edit', 'packages/daemon/src/agents/store.ts (+22 −0)', '14:42:55', 1400),
    tool('Edit', 'packages/daemon/src/server.ts (+18 −1)', '14:43:11', 880),
    tool('Bash', 'pnpm -r typecheck', '14:43:30', 320, 'Tasks:    8 successful, 8 total\nCached:    7 cached, 8 total\nTime:    4.118s'),
    tool('Read', 'packages/daemon/src/agents/store.test.ts', '14:43:42', 540),
    tool('Edit', 'packages/daemon/src/agents/store.test.ts (+45 −0)', '14:44:03', 1900),
    tool('Bash', 'pnpm test daemon/agents/store', '14:44:18', 720, 'PASS  packages/daemon/src/agents/store.test.ts\n  state-history\n    ✓ records every transition (32 ms)\n    ✓ returns history sorted by ts asc (18 ms)\n    ✓ caps history at 1000 entries (44 ms)\nTests: 3 passed'),
  ];
}

function transcript_KAN_31() {
  return [
    seg('initializing', '14:18:00', 'Initializing'),
    seg('running', '14:18:14', 'Running'),
    tool('Read', '/home/x/repo/src/board/dnd.ts', '14:18:18', 1200),
    tool('Read', '/home/x/repo/src/board/dnd.test.ts', '14:18:21', 880),
    tool('Edit', 'src/board/dnd.ts (+18 −4)', '14:18:42', 1100),
    tool('Bash', 'pnpm test board/dnd', '14:19:01', 480, 'FAIL  src/board/dnd.test.ts\n  ● dnd › preserves order across WS reconnect\n    expect(received).toEqual(expected) // deep equality\n    Expected: [\'a\', \'b\', \'c\', \'d\']\n    Received: [\'a\', \'b\', \'d\', \'c\']'),
    tool('Edit', 'src/board/dnd.ts (+6 −2)', '14:19:30', 540),
    tool('Bash', 'pnpm test board/dnd', '14:19:48', 460, 'PASS  src/board/dnd.test.ts'),
    tool('Bash', 'pnpm test', '14:20:08', 1820),
    tool('Bash', 'gh pr create --fill', '14:20:42', 220, 'https://github.com/x/kanban-api/pull/847'),
    seg('pr_open', '14:20:44', 'PR open'),
  ];
}

function transcript_LH_08() {
  return [
    seg('initializing', '14:48:30', 'Initializing'),
    seg('running', '14:48:45', 'Running'),
    tool('Read', 'src/aggregator/histogram.rs', '14:48:48', 940),
    tool('Bash', 'cargo build --release', '14:48:55', 60),
    tool('Bash', 'cargo build --release', '14:49:42', 0, 'error[E0599]: no method named `merge_atomic` found for struct `Histogram` in the current scope\n  --> src/aggregator/histogram.rs:142:18\n   |\n142|         self.merge_atomic(other);\n   |              ^^^^^^^^^^^^ method not found'),
    seg('error', '14:49:43', 'Error'),
  ];
}

function transcript_MAIL_14() {
  return [
    seg('initializing', '13:51:02', 'Initializing'),
    seg('running', '13:51:14', 'Running'),
    tool('Read', 'internal/bounce/retry.go', '13:51:16', 540),
    tool('Edit', 'internal/bounce/retry.go (+24 −8)', '13:51:42', 1100),
    tool('Bash', 'go test ./internal/bounce/...', '13:52:01', 380, 'ok  github.com/x/mailer-svc/internal/bounce  0.412s'),
    seg('idle', '13:52:14', 'Idle'),
  ];
}

function transcript_KAN_28() {
  return [
    seg('initializing', '11:12:00', 'Initializing'),
    seg('running', '11:12:18', 'Running'),
    tool('Read', 'src/labels/color.ts', '11:12:20', 420),
    tool('Edit', 'src/labels/color.ts (+12 −3)', '11:12:48', 700),
    tool('Bash', 'pnpm test labels', '11:13:08', 320),
    tool('Bash', 'gh pr create --fill', '11:13:42', 180, 'https://github.com/x/kanban-api/pull/843'),
    seg('pr_open', '11:13:44', 'PR open'),
    seg('finished', '11:32:10', 'Finished — merged'),
  ];
}

function transcript_CREW_15() {
  return [
    seg('initializing', '09:02:00', 'Initializing'),
    seg('running', '09:02:14', 'Running'),
    tool('Edit', 'packages/cli/src/lib/transcripts/parser.ts (+14 −2)', '09:03:18', 880),
    tool('Bash', 'pnpm test', '09:03:42', 1620),
    seg('finished', '09:04:18', 'Finished'),
  ];
}

// ── Token tables ────────────────────────────────────────────────────────────
function tokens_KAN_23() {
  return [
    { tool: 'Bash', count: 18420, share: 38.4 },
    { tool: 'Read', count: 12080, share: 25.2 },
    { tool: 'Edit', count: 9640, share: 20.1 },
    { tool: 'Grep', count: 4220, share: 8.8 },
    { tool: 'Glob', count: 1840, share: 3.8 },
    { tool: 'Question', count: 1240, share: 2.6 },
    { tool: 'Write', count: 510, share: 1.1 },
  ];
}
function tokens_default(total) {
  return [
    { tool: 'Bash', count: Math.round(total * 0.36), share: 36.0 },
    { tool: 'Read', count: Math.round(total * 0.28), share: 28.0 },
    { tool: 'Edit', count: Math.round(total * 0.22), share: 22.0 },
    { tool: 'Grep', count: Math.round(total * 0.09), share: 9.0 },
    { tool: 'Glob', count: Math.round(total * 0.05), share: 5.0 },
  ];
}

// ── Agents ──────────────────────────────────────────────────────────────────
// Curated mix demoing every state + edge cases (long titles, errors, idle, finished).
const MOCK_AGENTS = [
  // KAN — kanban-api
  {
    key: 'KAN-23',
    project: 'kanban-api',
    title: 'Reconnect should replay queued mutations to prevent stale board state on slow networks',
    state: 'waiting',
    started: '14:30:02',
    runtime: '21m 14s',
    runtimeSec: 21 * 60 + 14,
    tokens: 47950,
    pr: null,
    worktree: '~/code/kanban-api/.worktrees/KAN-23',
    docker: 'http://localhost:7421',
    transcript: transcript_KAN_23(),
    tokenTable: tokens_KAN_23(),
    attention: true,
  },
  {
    key: 'KAN-31',
    project: 'kanban-api',
    title: 'Drag-and-drop reordering keeps stale board state after WS reconnect',
    state: 'pr_open',
    started: '14:18:00',
    runtime: '33m 04s',
    runtimeSec: 33 * 60 + 4,
    tokens: 38120,
    pr: 'https://github.com/x/kanban-api/pull/847',
    prNumber: 847,
    worktree: '~/code/kanban-api/.worktrees/KAN-31',
    docker: 'http://localhost:7422',
    transcript: transcript_KAN_31(),
    tokenTable: tokens_default(38120),
    attention: true,
  },
  {
    key: 'KAN-29',
    project: 'kanban-api',
    title: 'Add keyboard shortcut for archive (cmd+shift+e)',
    state: 'running',
    started: '14:46:00',
    runtime: '5m 12s',
    runtimeSec: 5 * 60 + 12,
    tokens: 8420,
    pr: null,
    worktree: '~/code/kanban-api/.worktrees/KAN-29',
    docker: 'http://localhost:7423',
    transcript: [
      seg('initializing', '14:46:00', 'Initializing'),
      seg('running', '14:46:14', 'Running'),
      tool('Read', 'src/keyboard/registry.ts', '14:46:16', 480),
      tool('Read', 'src/labels/archive.ts', '14:46:19', 320),
    ],
    tokenTable: tokens_default(8420),
    attention: false,
  },
  {
    key: 'KAN-28',
    project: 'kanban-api',
    title: 'Optimistic update for label color change flickers',
    state: 'finished',
    started: '11:12:00',
    runtime: '20m 10s',
    runtimeSec: 20 * 60 + 10,
    tokens: 22440,
    pr: 'https://github.com/x/kanban-api/pull/843',
    prNumber: 843,
    worktree: '~/code/kanban-api/.worktrees/KAN-28',
    docker: null,
    transcript: transcript_KAN_28(),
    tokenTable: tokens_default(22440),
    attention: false,
  },

  // CREW
  {
    key: 'CREW-19',
    project: 'crew',
    title: 'Daemon should expose state-history endpoint per agent',
    state: 'running',
    started: '14:42:10',
    runtime: '8m 50s',
    runtimeSec: 8 * 60 + 50,
    tokens: 14620,
    pr: null,
    worktree: '~/code/crew/.worktrees/CREW-19',
    docker: 'http://localhost:7425',
    transcript: transcript_CREW_19(),
    tokenTable: tokens_default(14620),
    attention: false,
  },
  {
    key: 'CREW-15',
    project: 'crew',
    title: 'Truncate transcript output >50KB',
    state: 'finished',
    started: '09:02:00',
    runtime: '2m 18s',
    runtimeSec: 138,
    tokens: 6420,
    pr: null,
    worktree: '~/code/crew/.worktrees/CREW-15',
    docker: null,
    transcript: transcript_CREW_15(),
    tokenTable: tokens_default(6420),
    attention: false,
  },

  // LH
  {
    key: 'LH-08',
    project: 'lighthouse',
    title: 'Latency histogram aggregator drops samples under load',
    state: 'error',
    started: '14:48:30',
    runtime: '2m 30s',
    runtimeSec: 150,
    tokens: 3120,
    pr: null,
    worktree: '~/code/lighthouse/.worktrees/LH-08',
    docker: 'http://localhost:7426',
    transcript: transcript_LH_08(),
    tokenTable: tokens_default(3120),
    attention: true,
  },

  // MAIL
  {
    key: 'MAIL-14',
    project: 'mailer-svc',
    title: 'Bounce-handler retry uses linear backoff',
    state: 'idle',
    started: '13:51:02',
    runtime: '59m 58s',
    runtimeSec: 59 * 60 + 58,
    tokens: 5840,
    pr: null,
    worktree: '~/code/mailer-svc/.worktrees/MAIL-14',
    docker: 'http://localhost:7427',
    transcript: transcript_MAIL_14(),
    tokenTable: tokens_default(5840),
    attention: false,
  },
];

// Helpers
function getAgent(key) {
  return MOCK_AGENTS.find(a => a.key === key);
}
function agentsByProject() {
  const groups = {};
  for (const p of MOCK_PROJECTS) groups[p.name] = [];
  for (const a of MOCK_AGENTS) {
    if (!groups[a.project]) groups[a.project] = [];
    groups[a.project].push(a);
  }
  return groups;
}

// Format helpers
function formatTokens(n) {
  if (n < 1000) return String(n);
  if (n < 100_000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  if (n < 1_000_000) return Math.round(n / 1000) + 'k';
  return (n / 1_000_000).toFixed(1) + 'M';
}

function formatRuntime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

Object.assign(window, {
  MOCK_PROJECTS,
  MOCK_TICKETS,
  MOCK_AGENTS,
  getAgent,
  agentsByProject,
  formatTokens,
  formatRuntime,
});
