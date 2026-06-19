// Concrete state trigger: the only in-session emitter (CREW-256, plan Task 5).
//
// A Claude Code PostToolUse(Bash) hook injected into every dispatched session.
// When the agent runs a successful `gh pr create`, it appends a `pr_created`
// fact to ~/.crew/state-events/<key>.jsonl — the same durable per-key log the
// CLI/runner emitters write — which the daemon tails and reduces into the
// agent's state. Dependency-free on purpose: it ships in the worktree and runs
// under bare `node` at dispatch with no build step and no crew-cli import, so
// it constructs the JSONL line itself (mirroring lib/state-events/writer.ts).

import { appendFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

// Match `gh pr create` only at a command boundary — start of string, or after a
// `&&` / `;` / `|` separator — so an `echo "... gh pr create ..."` decoy that
// merely mentions it (mid-string, no boundary) does not fire.
const PR_CREATE = /(^|&&|;|\|)\s*gh pr create\b/;
const URL_RE = /https:\/\/github\.com\/[^\s]+\/pull\/\d+/;

/**
 * Append the `pr_created` event iff a successful `gh pr create` is detected in
 * the Bash tool call. Best-effort: never throws into the hook process — a
 * failed append is written to stderr, matching the writer's contract.
 *
 * @param {{tool_name?: string, tool_input?: {command?: string}, tool_response?: {stdout?: string, exitCode?: number}}} payload
 * @param {string} key   the dispatched agent's key (templated in at injection)
 * @param {string} [home] override for ~ (tests)
 */
export function handlePostToolUse(payload, key, home = homedir()) {
  if (payload?.tool_name !== 'Bash') return;
  const command = payload.tool_input?.command ?? '';
  if (!PR_CREATE.test(command)) return;
  if (payload.tool_response?.exitCode !== 0) return;

  const stdout = payload.tool_response?.stdout ?? '';
  const prUrl = (stdout.match(URL_RE) ?? [])[0];

  const file = join(home, '.crew', 'state-events', `${key}.jsonl`);
  const event = {
    eventId: randomUUID(),
    key,
    event: 'pr_created',
    ts: new Date().toISOString(),
    source: 'hook-pr-create',
    ...(prUrl ? { prUrl } : {}),
  };
  try {
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, `${JSON.stringify(event)}\n`, 'utf8');
  } catch (err) {
    process.stderr.write(`crew hook: failed to emit pr_created for ${key}: ${err}\n`);
  }
}

// CLI entrypoint: Claude Code pipes the PostToolUse payload as JSON on stdin;
// the agent key comes from CREW_AGENT_KEY, templated into the hook command at
// injection time (see lib/run/state-event-hook-injection.ts).
if (import.meta.url === `file://${process.argv[1]}`) {
  let raw = '';
  process.stdin.on('data', (c) => (raw += c));
  process.stdin.on('end', () => {
    try {
      handlePostToolUse(JSON.parse(raw), process.env.CREW_AGENT_KEY ?? 'unknown');
    } catch (err) {
      process.stderr.write(`crew hook: ${err}\n`);
    }
  });
}
