// Concrete state trigger: the only in-session emitter (CREW-256, plan Task 5).
//
// A Claude Code PostToolUse hook injected into every dispatched session, firing
// on both `Bash` and `mcp__github__create_pull_request`. When the agent opens a
// PR — via a successful `gh pr create` or the GitHub MCP — it appends a
// `pr_created` fact to ~/.crew/state-events/<key>.jsonl — the same durable per-key log the
// CLI/runner emitters write — which the daemon tails and reduces into the
// agent's state. Dependency-free on purpose: it ships in the worktree and runs
// under bare `node` at dispatch with no build step and no crew-cli import, so
// it constructs the JSONL line itself (mirroring lib/state-events/writer.ts).

import { appendFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

// Match `gh pr create` anywhere in the command (word-boundaried, so the
// past-tense `gh pr created` does not fire). Position-anchoring used to gate
// against `echo "... gh pr create ..."` decoys, but that was a holdover from the
// transcript-parsing world and was the source of a recurring bug class — it
// missed every positional variant it didn't enumerate (notably the newline-
// separated `cd <wt>⏎gh pr create`, CREW-246/CREW-251/CREW-266). The PR-URL gate
// below (`URL_RE` against stdout) is the real, stronger discriminator: a decoy
// echo, `--help`, or `gh pr view`/`gh pr list` either prints no PR URL or isn't
// a `create` at all. So the command check only needs to confirm a real
// `gh pr create` invocation; the URL gate confirms it succeeded.
const PR_CREATE = /\bgh pr create\b/;
const URL_RE = /https:\/\/github\.com\/[^\s]+\/pull\/\d+/;

/**
 * Build the stderr line for a failed append. On a permission error
 * (EACCES/EPERM — the `nobody`-owned-dir footgun, CREW-263) the chown
 * remediation is appended so a perms regression is loud and self-explanatory
 * rather than a swallowed no-op. Mirrors `emitFailureLine` in
 * lib/state-events/writer.ts (duplicated, not imported — this hook is
 * dependency-free).
 *
 * @param {string} dir   the state-events dir the append targeted
 * @param {string} key   the dispatched agent's key
 * @param {unknown} err  the caught error
 */
export function prCreateFailureLine(dir, key, err) {
  const code = err && typeof err === 'object' ? err.code : undefined;
  const remediation =
    code === 'EACCES' || code === 'EPERM'
      ? `\nstate-events dir ${dir} is not writable by the current user — ` +
        `Docker likely created it as 'nobody'. ` +
        `Fix ownership with: sudo chown -R "$(id -u):$(id -g)" ${dir}`
      : '';
  return `crew hook: failed to emit pr_created for ${key}: ${err}${remediation}`;
}

/**
 * Extract a PR URL from an `mcp__github__create_pull_request` tool_response.
 * Prefers an explicit top-level `html_url` field (the github-mcp-server
 * `create_pull_request` success shape), then falls back to scanning the whole
 * serialized response. The fallback is load-bearing, not just a rename guard:
 * Claude Code commonly wraps an MCP result as a content-block envelope
 * (`{ content: [{ type: 'text', text: '<serialized PR object>' }] }`) with no
 * top-level `html_url`, and the scan still finds the PR URL nested inside. The
 * `tool_response` may also arrive as a JSON string rather than an object.
 *
 * @param {unknown} resp  the PostToolUse `tool_response`
 * @returns {string | undefined} the first PR URL found, or undefined
 */
export function extractMcpPrUrl(resp) {
  if (!resp) return undefined;
  if (typeof resp === 'object' && typeof resp.html_url === 'string') {
    const m = resp.html_url.match(URL_RE);
    if (m) return m[0];
  }
  const serialized = typeof resp === 'string' ? resp : JSON.stringify(resp);
  return (serialized.match(URL_RE) ?? [])[0];
}

/**
 * Append the `pr_created` event iff a successful PR creation is detected — via
 * either a `gh pr create` Bash invocation or an `mcp__github__create_pull_request`
 * MCP tool call. Best-effort: never throws into the hook process — a failed
 * append is written to stderr, matching the writer's contract.
 *
 * @param {{tool_name?: string, tool_input?: {command?: string}, tool_response?: unknown}} payload
 * @param {string} key   the dispatched agent's key (templated in at injection)
 * @param {string} [home] override for ~ (tests)
 */
export function handlePostToolUse(payload, key, home = homedir()) {
  const toolName = payload?.tool_name;
  let prUrl;

  if (toolName === 'Bash') {
    const command = payload.tool_input?.command ?? '';
    if (!PR_CREATE.test(command)) return;
    // Claude Code's PostToolUse(Bash) payload does NOT expose an exit code
    // (`tool_response` carries only stdout/stderr/interrupted/isImage/
    // noOutputExpected — empirically captured, CREW-261). So success is keyed off
    // the parsed PR URL instead: a successful `gh pr create` prints the PR URL to
    // stdout; a failed one does not. The parsed URL is therefore a self-validating
    // success signal — no exitCode gate.
    const stdout = payload.tool_response?.stdout ?? '';
    prUrl = (stdout.match(URL_RE) ?? [])[0];
  } else if (toolName === 'mcp__github__create_pull_request') {
    // The MCP success response carries the new PR's URL; a failed call (bad
    // creds, validation error) carries no PR URL, so the same URL gate that
    // discriminates a successful `gh pr create` works here too.
    prUrl = extractMcpPrUrl(payload.tool_response);
  } else {
    return;
  }

  if (!prUrl) return;

  const file = join(home, '.crew', 'state-events', `${key}.jsonl`);
  const event = {
    eventId: randomUUID(),
    key,
    event: 'pr_created',
    ts: new Date().toISOString(),
    source: 'hook-pr-create',
    prUrl,
  };
  try {
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, `${JSON.stringify(event)}\n`, 'utf8');
  } catch (err) {
    process.stderr.write(`${prCreateFailureLine(dirname(file), key, err)}\n`);
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
