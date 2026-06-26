# Dispatch GitHub Auth via MCP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a dispatched `crew run` agent open PRs through the GitHub MCP *or* a per-repo gh-token (MCP preferred), with a fail-fast pre-flight gate when neither is configured and the `pr_created` state hook firing on whichever channel the agent used.

**Architecture:** Introduce a shared `lib/github-auth/` resolver that reports which GitHub-auth channels are configured (per-repo token, user-level MCP). The run-path pre-flight gate and the `crew doctor` health check both consume it (OR-logic: configured when ≥1 channel present). `GH_TOKEN` injection into the dispatched agent becomes conditional on the token existing; the dispatch prompt steers PR creation to the MCP; the `pr_created` PostToolUse hook gains a second branch that recognises `mcp__github__create_pull_request` alongside `gh pr create`.

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), Node, Vitest, Commander CLI. Dependency-free `.mjs` for the shipped hook.

**Spec:** `docs/superpowers/specs/2026-06-26-dispatch-github-mcp-auth-design.md`

## Global Constraints

- **ESM import specifiers** end in `.js` even for `.ts` sources (e.g. `import { x } from './resolve.js'`).
- **TDD**: write the failing test first, watch it fail, implement minimally, watch it pass, commit. One logical change per commit, referencing the ticket key.
- **Secret-safe**: never read the gh-token's *contents* (only `existsSync` + `statSync().size`); never echo `~/.claude.json` contents (it may hold an MCP `Authorization` token) — read it in code for presence checks only, and use **fixture files** in tests, never the real `~/.claude.json`.
- **No pre-commit hooks** — run verification manually: `npm run lint`, `npm run typecheck`, `npm run test:run` (TS + hooks), targeted `npx vitest run <file>`, hook-only `npm run test:hooks`.
- **Push is SSH** (`origin` = `git@github.com:…`) — never reintroduce a token dependency for `git push`.
- **`source: 'hook-pr-create'`** stays the event source for both hook branches (the daemon reduces it the same way).
- **Branch per Epic-child ticket**; never commit on `main`.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `packages/cli/src/lib/github-auth/resolve.ts` (new) | Channel resolver: `hasRepoToken`, `userMcpHasGithubServer`, `resolveGithubAuth`, `requireGithubAuth` | 1 |
| `packages/cli/src/lib/github-auth/index.ts` (new) | Barrel re-export | 1 |
| `packages/cli/src/commands/run.ts` (modify) | Call `requireGithubAuth`; conditional `GH_TOKEN` copy/read/inject | 2 |
| `packages/cli/src/lib/run/preconditions.ts` (modify) | Drop `requireGhToken` (keep `requireWorktreeAvailable`) | 2 |
| `packages/cli/src/lib/prompts/templates/ticket.md` (modify) | MCP-first PR instruction (step 11) | 3 |
| `hooks/state-events/pr-create-postuse.mjs` (modify) | Add `mcp__github__create_pull_request` detection branch | 4 |
| `packages/cli/src/lib/run/state-event-hook-injection.ts` (modify) | Broaden PostToolUse matcher to fire on the MCP tool too | 5 |
| `packages/cli/src/lib/health/checks/github-auth-present.ts` (new, replaces `gh-token-present.ts`) | `crew doctor` OR-check | 6 |
| `packages/cli/src/lib/health/registry.ts` (modify) | Swap the registered check | 6 |
| `packages/cli/src/lib/init/scaffold-gh-token.ts` + `run-init.ts` (modify) | Soften: placeholder no longer "blocking"; init message offers both channels | 7 |
| `README.md`, `.agents/dispatch.md` (modify) | Doc the MCP-or-token model | 8 |

**Epic-child grouping** (for ticketing): **A** = Tasks 1–2 (gate + injection), **B** = Tasks 3–5 (prompt + hook), **C** = Tasks 6–8 (health + init + docs).

---

### Task 1: GitHub-auth channel resolver

**Files:**
- Create: `packages/cli/src/lib/github-auth/resolve.ts`
- Create: `packages/cli/src/lib/github-auth/index.ts`
- Test: `packages/cli/src/lib/github-auth/resolve.test.ts`

**Interfaces:**
- Produces:
  - `hasRepoToken(tokenPath: string): boolean` — `true` iff the file exists and is non-empty.
  - `userMcpHasGithubServer(homeDir?: string): boolean` — `true` iff `~/.claude.json` declares a GitHub-targeting MCP server. Presence only.
  - `resolveGithubAuth(opts: { tokenPath: string; homeDir?: string }): { hasToken: boolean; hasMcp: boolean; ok: boolean }`
  - `requireGithubAuth(opts: { tokenPath: string; homeDir?: string }): void` — throws when neither channel is present.

- [ ] **Step 1: Write the failing test**

```ts
// packages/cli/src/lib/github-auth/resolve.test.ts
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  hasRepoToken,
  userMcpHasGithubServer,
  resolveGithubAuth,
  requireGithubAuth,
} from './resolve.js';

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'gh-auth-'));
}

/** Write a fake home dir with a ~/.claude.json containing `mcpServers`. */
function homeWithMcp(servers: Record<string, unknown>): string {
  const home = tmp();
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ mcpServers: servers }));
  return home;
}

describe('hasRepoToken', () => {
  it('false when the file is missing', () => {
    expect(hasRepoToken(join(tmp(), 'gh-token'))).toBe(false);
  });
  it('false when the file is empty', () => {
    const p = join(tmp(), 'gh-token');
    writeFileSync(p, '');
    expect(hasRepoToken(p)).toBe(false);
  });
  it('true when the file is non-empty', () => {
    const p = join(tmp(), 'gh-token');
    writeFileSync(p, 'github_pat_x');
    expect(hasRepoToken(p)).toBe(true);
  });
});

describe('userMcpHasGithubServer', () => {
  it('false when ~/.claude.json is absent', () => {
    expect(userMcpHasGithubServer(tmp())).toBe(false);
  });
  it('false when the file is malformed', () => {
    const home = tmp();
    writeFileSync(join(home, '.claude.json'), '{not json');
    expect(userMcpHasGithubServer(home)).toBe(false);
  });
  it('false when no github server is present', () => {
    expect(userMcpHasGithubServer(homeWithMcp({ playwright: { command: 'npx' } }))).toBe(false);
  });
  it('true when a server is keyed "github"', () => {
    expect(userMcpHasGithubServer(homeWithMcp({ github: { command: 'docker' } }))).toBe(true);
  });
  it('true when a server URL targets githubcopilot.com', () => {
    expect(
      userMcpHasGithubServer(homeWithMcp({ gh: { url: 'https://api.githubcopilot.com/mcp/' } })),
    ).toBe(true);
  });
});

describe('resolveGithubAuth / requireGithubAuth', () => {
  it('ok via token only', () => {
    const p = join(tmp(), 'gh-token');
    writeFileSync(p, 'tok');
    const r = resolveGithubAuth({ tokenPath: p, homeDir: tmp() });
    expect(r).toEqual({ hasToken: true, hasMcp: false, ok: true });
    expect(() => requireGithubAuth({ tokenPath: p, homeDir: tmp() })).not.toThrow();
  });
  it('ok via MCP only', () => {
    const home = homeWithMcp({ github: { command: 'docker' } });
    const r = resolveGithubAuth({ tokenPath: join(tmp(), 'gh-token'), homeDir: home });
    expect(r).toEqual({ hasToken: false, hasMcp: true, ok: true });
  });
  it('throws when neither channel is present', () => {
    expect(() =>
      requireGithubAuth({ tokenPath: join(tmp(), 'gh-token'), homeDir: tmp() }),
    ).toThrow(/no GitHub credential/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/cli/src/lib/github-auth/resolve.test.ts`
Expected: FAIL — `Cannot find module './resolve.js'`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/cli/src/lib/github-auth/resolve.ts
import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** True iff the gh-token file exists and is non-empty. Never reads its contents. */
export function hasRepoToken(tokenPath: string): boolean {
  return existsSync(tokenPath) && statSync(tokenPath).size > 0;
}

/** The `mcpServers` map from a parsed ~/.claude.json, or {} if absent/shaped wrong. */
function extractMcpServers(parsed: unknown): Record<string, unknown> {
  if (parsed && typeof parsed === 'object' && 'mcpServers' in parsed) {
    const servers = (parsed as { mcpServers?: unknown }).mcpServers;
    if (servers && typeof servers === 'object') return servers as Record<string, unknown>;
  }
  return {};
}

/** Heuristic: does this MCP server entry target GitHub? Name- and URL-based, no secrets echoed. */
function looksLikeGithub(name: string, entry: unknown): boolean {
  if (/github/i.test(name)) return true;
  if (entry && typeof entry === 'object') {
    const url = (entry as { url?: unknown }).url;
    if (typeof url === 'string' && /github(copilot)?\.com|github\.com/i.test(url)) return true;
    const command = (entry as { command?: unknown }).command;
    const args = (entry as { args?: unknown }).args;
    const blob = `${typeof command === 'string' ? command : ''} ${Array.isArray(args) ? args.join(' ') : ''}`;
    if (/github-mcp-server|github\/github-mcp/i.test(blob)) return true;
  }
  return false;
}

/**
 * True when ~/.claude.json declares an MCP server that targets GitHub. Presence
 * check only — never validates the credential, never echoes the file (it may
 * carry an Authorization token). Malformed / missing file → false.
 */
export function userMcpHasGithubServer(homeDir: string = homedir()): boolean {
  const configPath = join(homeDir, '.claude.json');
  if (!existsSync(configPath)) return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch {
    return false;
  }
  return Object.entries(extractMcpServers(parsed)).some(([name, entry]) =>
    looksLikeGithub(name, entry),
  );
}

export interface GithubAuthResolution {
  hasToken: boolean;
  hasMcp: boolean;
  ok: boolean;
}

/** Resolve which GitHub-auth channels are configured for a dispatch. */
export function resolveGithubAuth(opts: {
  tokenPath: string;
  homeDir?: string;
}): GithubAuthResolution {
  const hasToken = hasRepoToken(opts.tokenPath);
  const hasMcp = userMcpHasGithubServer(opts.homeDir);
  return { hasToken, hasMcp, ok: hasToken || hasMcp };
}

/** Throw a fail-fast error when no GitHub-auth channel is configured. */
export function requireGithubAuth(opts: { tokenPath: string; homeDir?: string }): void {
  if (resolveGithubAuth(opts).ok) return;
  throw new Error(
    `no GitHub credential configured for dispatch — the agent can't open a PR.\n` +
      `       Configure one of:\n` +
      `       • a GitHub MCP server in ~/.claude.json (preferred), or\n` +
      `       • a PAT at ${opts.tokenPath} (chmod 600).`,
  );
}
```

```ts
// packages/cli/src/lib/github-auth/index.ts
export * from './resolve.js';
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/cli/src/lib/github-auth/resolve.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Verify the empirical predicate against your real config (no secrets echoed)**

Confirm `looksLikeGithub` matches *your* actual GitHub MCP entry shape **without printing the file**:

Run: `node -e "const c=require('os').homedir()+'/.claude.json';const j=JSON.parse(require('fs').readFileSync(c));console.log(Object.keys(j.mcpServers||{}))"`
Expected: an array of server *names* (keys only) including a github-ish one. If the github entry's key is *not* github-ish and it's URL-keyed, eyeball just that entry's `url` host (not headers) and confirm `looksLikeGithub` would catch it; widen the heuristic if needed and re-run Step 4.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/lib/github-auth/
git commit -m "feat(github-auth): channel resolver for token-or-MCP dispatch auth (CREW-XXX)"
```

---

### Task 2: Pre-flight gate + conditional GH_TOKEN injection in `run.ts`

**Files:**
- Modify: `packages/cli/src/commands/run.ts` (lines ~247-257, ~331-336, ~349, ~565, ~633, and the preflight summary ~276)
- Modify: `packages/cli/src/lib/run/preconditions.ts` (remove `requireGhToken`)
- Test: `packages/cli/src/lib/run/preconditions.test.ts` (remove the `requireGhToken` describe block)

**Interfaces:**
- Consumes: `requireGithubAuth`, `hasRepoToken` (Task 1).

- [ ] **Step 1: Remove `requireGhToken` and update its test**

Delete the `requireGhToken` function from `preconditions.ts` (keep `requireWorktreeAvailable`). In `preconditions.test.ts`, delete the entire `describe('requireGhToken', …)` block and the `requireGhToken` import.

- [ ] **Step 2: Run the precondition test to verify it still passes (worktree case intact)**

Run: `npx vitest run packages/cli/src/lib/run/preconditions.test.ts`
Expected: PASS (only `requireWorktreeAvailable` cases remain).

- [ ] **Step 3: Wire the gate into `run.ts`**

Replace the import:
```ts
// was: import { requireGhToken, requireWorktreeAvailable } from '../lib/run/preconditions.js';
import { requireWorktreeAvailable } from '../lib/run/preconditions.js';
import { requireGithubAuth, hasRepoToken } from '../lib/github-auth/index.js';
```

Replace the gate block (currently `requireGhToken(ghTokenSource)` in the try/catch around line 248):
```ts
const ghTokenSource = join(config.repo_path, '.claude', 'secrets', 'gh-token');
try {
  requireGithubAuth({ tokenPath: ghTokenSource });
} catch (err) {
  failStartupPhase(
    key,
    'crew_startup_preflight',
    preflightStartedAt,
    err instanceof Error ? err.message : String(err),
  );
}
```

Update the preflight completed summary (line ~276):
```ts
summary: `project=${config.name}; tools ok; github auth ok`,
```

- [ ] **Step 4: Make the token copy conditional**

Wrap the worktree copy (currently lines ~331-335) so it only runs when the source token exists:
```ts
if (hasRepoToken(ghTokenSource)) {
  const secretsDir = join(worktree, '.claude', 'secrets');
  mkdirSync(secretsDir, { recursive: true });
  const ghTokenDest = join(secretsDir, 'gh-token');
  copyFileSync(ghTokenSource, ghTokenDest);
  chmodSync(ghTokenDest, 0o600);
}
```

- [ ] **Step 5: Make the read + injection conditional**

Replace the unconditional read (line ~565):
```ts
const ghTokenDest = join(worktree, '.claude', 'secrets', 'gh-token');
const ghToken = hasRepoToken(ghTokenDest) ? readFileSync(ghTokenDest, 'utf8').trim() : undefined;
```

Replace the env injection (line ~633) with a conditional spread, matching the existing `resolvedAppUrl` pattern:
```ts
env: {
  ...childEnv,
  ...(ghToken ? { GH_TOKEN: ghToken } : {}),
  ...(resolvedAppUrl ? { CREW_APP_URL: resolvedAppUrl } : {}),
  ...(resolvedAppUrl ? { PLAYWRIGHT_BASE_URL: resolvedAppUrl } : {}),
  ...(brunoEnvName ? { CREW_BRUNO_ENV: brunoEnvName } : {}),
},
```

- [ ] **Step 6: Typecheck + full test run**

Run: `npm run typecheck && npm run test:run`
Expected: PASS. (No `requireGhToken` references remain; `run.ts` compiles with the conditional injection.)

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/commands/run.ts packages/cli/src/lib/run/preconditions.ts packages/cli/src/lib/run/preconditions.test.ts
git commit -m "feat(run): gate dispatch on token-or-MCP, inject GH_TOKEN only when present (CREW-XXX)"
```

---

### Task 3: MCP-first PR instruction in the dispatch prompt

**Files:**
- Modify: `packages/cli/src/lib/prompts/templates/ticket.md` (step 11, lines ~40-45)
- Test (regen): `packages/cli/src/lib/prompts/__snapshots__/builders.test.ts.snap`

**Interfaces:** none (template + snapshot).

- [ ] **Step 1: Edit the template**

Replace step 11 (lines 40-45) with:
```markdown
11. **Push and open the PR.**

    Push the branch over SSH, then open the PR through the **GitHub MCP** —
    call the `mcp__github__create_pull_request` tool (owner/repo from the
    `origin` remote, `base: main`, `head: {{key}}`, a title, and a body with
    Summary + Test Plan). If the GitHub MCP is unavailable, fall back to
    `gh pr create`:

    ```
    git push -u origin {{key}}
    # then: mcp__github__create_pull_request  (base main, head {{key}})
    # fallback if no MCP:
    gh pr create --base main --head {{key}} --title "<title>" --body "<Summary + Test Plan>"
    ```
```

- [ ] **Step 2: Run the prompt-builder test to see the snapshot mismatch**

Run: `npx vitest run packages/cli/src/lib/prompts/builders.test.ts`
Expected: FAIL — snapshot mismatch on the changed step 11 text.

- [ ] **Step 3: Regenerate the snapshot**

Run: `npx vitest run packages/cli/src/lib/prompts/builders.test.ts -u`
Expected: snapshot updated.

- [ ] **Step 4: Re-run to confirm green**

Run: `npx vitest run packages/cli/src/lib/prompts/builders.test.ts`
Expected: PASS. Manually eyeball the snapshot diff — only step 11 text changed, across all ticket-key variants (KAN-23, CREW-99, etc.).

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/lib/prompts/templates/ticket.md packages/cli/src/lib/prompts/__snapshots__/builders.test.ts.snap
git commit -m "feat(prompts): steer dispatched PR creation to the GitHub MCP (CREW-XXX)"
```

---

### Task 4: Dual-path detection in the `pr_created` hook

**Files:**
- Modify: `hooks/state-events/pr-create-postuse.mjs`
- Test: `hooks/state-events/pr-create-postuse.test.mjs`

**Interfaces:**
- The hook's `handlePostToolUse(payload, key, home?)` gains a second recognised `payload.tool_name`: `mcp__github__create_pull_request`.

- [ ] **Step 1: Write failing tests for the MCP branch**

Add to `pr-create-postuse.test.mjs` (alongside the existing Bash-branch tests):
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { handlePostToolUse } from './pr-create-postuse.mjs';

const PR_URL = 'https://github.com/Safturento/crew/pull/123';

function readEvents(home, key) {
  const f = join(home, '.crew', 'state-events', `${key}.jsonl`);
  return existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [];
}

test('MCP create_pull_request with html_url emits pr_created', () => {
  const home = mkdtempSync(join(tmpdir(), 'hook-mcp-'));
  handlePostToolUse(
    { tool_name: 'mcp__github__create_pull_request', tool_response: { html_url: PR_URL } },
    'CREW-1',
    home,
  );
  const events = readEvents(home, 'CREW-1');
  assert.equal(events.length, 1);
  assert.equal(events[0].event, 'pr_created');
  assert.equal(events[0].prUrl, PR_URL);
  assert.equal(events[0].source, 'hook-pr-create');
});

test('MCP response serialized as a string still yields the URL', () => {
  const home = mkdtempSync(join(tmpdir(), 'hook-mcp-'));
  handlePostToolUse(
    { tool_name: 'mcp__github__create_pull_request', tool_response: `{"html_url":"${PR_URL}"}` },
    'CREW-2',
    home,
  );
  assert.equal(readEvents(home, 'CREW-2')[0].prUrl, PR_URL);
});

test('MCP response with no PR URL is a no-op', () => {
  const home = mkdtempSync(join(tmpdir(), 'hook-mcp-'));
  handlePostToolUse(
    { tool_name: 'mcp__github__create_pull_request', tool_response: { error: 'bad creds' } },
    'CREW-3',
    home,
  );
  assert.equal(readEvents(home, 'CREW-3').length, 0);
});
```

- [ ] **Step 2: Run hook tests to verify the new ones fail**

Run: `npm run test:hooks`
Expected: the three MCP tests FAIL (current hook returns early for non-Bash `tool_name`).

- [ ] **Step 3: Add the MCP branch to the hook**

In `pr-create-postuse.mjs`, add a helper and restructure `handlePostToolUse` to dispatch by `tool_name`:
```js
/**
 * Extract a PR URL from an `mcp__github__create_pull_request` tool_response.
 * Prefers an explicit `html_url` field; falls back to scanning the serialized
 * response so a shape change can't silently drop the signal.
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
```

Replace the body of `handlePostToolUse` (keep the file/event-append tail identical):
```js
export function handlePostToolUse(payload, key, home = homedir()) {
  const toolName = payload?.tool_name;
  let prUrl;

  if (toolName === 'Bash') {
    const command = payload.tool_input?.command ?? '';
    if (!PR_CREATE.test(command)) return;
    // Success keyed off the PR URL in stdout (no exit code in the payload).
    const stdout = payload.tool_response?.stdout ?? '';
    prUrl = (stdout.match(URL_RE) ?? [])[0];
  } else if (toolName === 'mcp__github__create_pull_request') {
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
```

- [ ] **Step 4: Run hook tests (new + existing) to verify all pass**

Run: `npm run test:hooks`
Expected: PASS — the three new MCP tests and every existing Bash-branch test.

- [ ] **Step 5: Verify the real MCP payload shape (empirical)**

The MCP response field is asserted as `html_url`. Before closing the ticket, confirm against the real tool: from the test PR work you already saw, or by checking the github-mcp-server `create_pull_request` output schema, that the PostToolUse `tool_response` exposes `html_url` (or that the serialized-scan fallback catches it). The fallback makes this robust either way; note any deviation in the PR description.

- [ ] **Step 6: Commit**

```bash
git add hooks/state-events/pr-create-postuse.mjs hooks/state-events/pr-create-postuse.test.mjs
git commit -m "feat(hook): detect MCP-opened PRs for pr_created, keep gh-create fallback (CREW-XXX)"
```

---

### Task 5: Broaden the hook-injection matcher

**Files:**
- Modify: `packages/cli/src/lib/run/state-event-hook-injection.ts` (the `entry.matcher`, line ~73)
- Test: `packages/cli/src/lib/run/state-event-hook-injection.test.ts`

**Interfaces:**
- Consumes: the dual-path hook (Task 4) — the broadened matcher is what makes the MCP branch reachable in a real session.

- [ ] **Step 1: Write/adjust the failing test**

In `state-event-hook-injection.test.ts`, assert the emitted matcher covers both tools:
```ts
it('registers the PostToolUse hook against both Bash and the GitHub MCP tool', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hook-inject-'));
  injectStateEventHook({ worktree: dir, key: 'CREW-7', log: () => {} });
  const settings = JSON.parse(
    readFileSync(join(dir, '.claude', 'settings.local.json'), 'utf8'),
  );
  const entry = settings.hooks.PostToolUse.at(-1);
  expect(entry.matcher).toBe('Bash|mcp__github__create_pull_request');
});
```
(If an existing test asserts `matcher === 'Bash'`, update that expectation here too.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run packages/cli/src/lib/run/state-event-hook-injection.test.ts`
Expected: FAIL — current matcher is `'Bash'`.

- [ ] **Step 3: Broaden the matcher**

In `state-event-hook-injection.ts`, change the entry (line ~72-75):
```ts
const entry: HookMatcher = {
  matcher: 'Bash|mcp__github__create_pull_request',
  hooks: [{ type: 'command', command: hookCommandFor(key) }],
};
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run packages/cli/src/lib/run/state-event-hook-injection.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/lib/run/state-event-hook-injection.ts packages/cli/src/lib/run/state-event-hook-injection.test.ts
git commit -m "feat(run): fire pr_created hook on Bash or the GitHub MCP tool (CREW-XXX)"
```

---

### Task 6: Replace the `gh-token-present` health check with `github-auth-present`

**Files:**
- Create: `packages/cli/src/lib/health/checks/github-auth-present.ts`
- Delete: `packages/cli/src/lib/health/checks/gh-token-present.ts` (+ its test)
- Create: `packages/cli/src/lib/health/checks/github-auth-present.test.ts`
- Modify: `packages/cli/src/lib/health/registry.ts`, `packages/cli/src/lib/health/registry.test.ts`

**Interfaces:**
- Consumes: `resolveGithubAuth` (Task 1).

- [ ] **Step 1: Write the failing test**

```ts
// packages/cli/src/lib/health/checks/github-auth-present.test.ts
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { githubAuthPresent } from './github-auth-present.js';
import type { HealthContext } from '../types.js';

function ctxWithToken(): HealthContext {
  const worktree = mkdtempSync(join(tmpdir(), 'ga-'));
  const dir = join(worktree, '.claude', 'secrets');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'gh-token'), 'github_pat_x');
  return { worktree } as HealthContext;
}

describe('github-auth-present', () => {
  it('ok when a repo token is present', async () => {
    const r = await githubAuthPresent.detect(ctxWithToken());
    expect(r.status).toBe('ok');
  });
  it('fail when neither channel is present', async () => {
    const worktree = mkdtempSync(join(tmpdir(), 'ga-'));
    const r = await githubAuthPresent.detect({ worktree } as HealthContext);
    // Note: this asserts in an env with no github MCP in ~/.claude.json.
    expect(r.status).toBe('fail');
    expect(r.remediation).toMatch(/MCP|PAT/);
  });
});
```

> The fail-case test assumes the test environment has no GitHub MCP in `~/.claude.json`. If CI might, inject a `homeDir` override: give `githubAuthPresent.detect` an optional context `homeDir` (defaulting to `os.homedir()`) and pass a clean temp dir here. Decide during implementation; the override keeps the test hermetic.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run packages/cli/src/lib/health/checks/github-auth-present.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the check**

```ts
// packages/cli/src/lib/health/checks/github-auth-present.ts
import { join } from 'node:path';
import { resolveGithubAuth } from '../../github-auth/index.js';
import { scaffoldGhToken } from '../../init/scaffold-gh-token.js';
import { fail, ok, type HealthCheck } from '../types.js';

const GH_TOKEN_REL = join('.claude', 'secrets', 'gh-token');

/**
 * Dispatch is GitHub-authorized when EITHER a per-repo gh-token is present OR a
 * GitHub MCP server is configured at user level (~/.claude.json). Mirrors the
 * run-path `requireGithubAuth` gate. Presence only — never validates either
 * credential, never echoes token contents or the MCP config.
 *
 * `fix()` scaffolds the optional token slot (path/perms/gitignore); it can't
 * supply a credential, so an unconfigured machine stays red until the operator
 * sets up one channel.
 */
export const githubAuthPresent: HealthCheck = {
  name: 'github-auth-present',
  scope: 'project',
  detect: async ({ worktree }) => {
    const tokenPath = join(worktree, GH_TOKEN_REL);
    const res = resolveGithubAuth({ tokenPath });
    if (res.ok) {
      const via = res.hasMcp && res.hasToken ? 'MCP + token' : res.hasMcp ? 'MCP' : 'token';
      return ok(`GitHub auth present (${via})`);
    }
    return fail('no GitHub auth — dispatch can’t open a PR (no MCP, no token)', {
      remediation:
        `configure a GitHub MCP server in ~/.claude.json (preferred), ` +
        `or paste a PAT at ${tokenPath} (chmod 600)`,
      fixable: true,
      details: { tokenPath },
    });
  },
  fix: async ({ worktree }) => {
    scaffoldGhToken(worktree);
  },
};
```

- [ ] **Step 4: Swap the registry entry**

In `registry.ts`, replace the `ghTokenPresent` import + array member with `githubAuthPresent`:
```ts
import { githubAuthPresent } from './checks/github-auth-present.js';
// …
const ALL: HealthCheck[] = [
  // …
  appUrlResolves,
  githubAuthPresent,
];
```
Update `registry.test.ts` — the assertion that `checksFor('project')` includes `'gh-token-present'` becomes `'github-auth-present'`.

- [ ] **Step 5: Delete the old check + its test**

```bash
git rm packages/cli/src/lib/health/checks/gh-token-present.ts packages/cli/src/lib/health/checks/gh-token-present.test.ts
```

- [ ] **Step 6: Full test + typecheck**

Run: `npm run typecheck && npx vitest run packages/cli/src/lib/health/`
Expected: PASS — new check + registry tests green, no dangling `gh-token-present` reference.

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/lib/health/
git commit -m "feat(doctor): github-auth-present check (token-or-MCP), drop gh-token-present (CREW-XXX)"
```

---

### Task 7: Soften the init scaffold + message

**Files:**
- Modify: `packages/cli/src/lib/init/scaffold-gh-token.ts` (doc comments only — behavior unchanged)
- Modify: `packages/cli/src/lib/init/run-init.ts` (lines ~171-182, the message)
- Test: `packages/cli/src/lib/init/run-init.test.ts` (the message assertion, line ~184)

**Interfaces:** none new. `scaffoldGhToken` keeps its signature + `needsToken` field (now informational, not a blocking signal).

- [ ] **Step 1: Update the failing test expectation**

In `run-init.test.ts`, the scaffolds-an-empty-placeholder test asserts the log matches `/gh-token|PAT/i`. Change the expectation to assert the new dual-channel message, e.g.:
```ts
expect(logs.join('\n')).toMatch(/GitHub MCP|PAT/i);
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run packages/cli/src/lib/init/run-init.test.ts`
Expected: FAIL — current message says "dispatch can't authorize without it".

- [ ] **Step 3: Update the init message**

In `run-init.ts` (the `ghToken.needsToken` branch, ~178-182), change the message from the token-mandatory phrasing to:
```ts
if (ghToken.needsToken) {
  result.notes.push(
    `GitHub access for dispatch: configure a GitHub MCP server in ~/.claude.json ` +
      `(preferred), or paste a PAT into ${ghToken.tokenPath} (chmod 600). ` +
      `One channel is enough.`,
  );
}
```
(Match the surrounding code's actual push target — `result.notes` vs the existing `result.<field>`; keep whatever field the current line uses.)

- [ ] **Step 4: Update the scaffold doc comment**

In `scaffold-gh-token.ts`, revise the docstring that says the empty placeholder "deliberately trips the run-path `requireGhToken` gate" — that gate is gone. New wording: the placeholder is an *optional* fallback slot; dispatch is authorized by the MCP or this token (see `requireGithubAuth`). No code change.

- [ ] **Step 5: Run init tests**

Run: `npx vitest run packages/cli/src/lib/init/`
Expected: PASS — message test green; `scaffold-gh-token.test.ts` unchanged (behavior identical).

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/lib/init/
git commit -m "feat(init): present gh-token as optional fallback to the GitHub MCP (CREW-XXX)"
```

---

### Task 8: Documentation

**Files:**
- Modify: `README.md` (the "GitHub token (once per project)" section, ~line 315)
- Modify: `.agents/dispatch.md` (steps 4, 11, 61, 123, 131)

**Interfaces:** none.

- [ ] **Step 1: Rewrite the README section**

Retitle "GitHub token (once per project)" → "GitHub access for dispatch (MCP or token)". New content: a dispatched agent opens PRs through the GitHub MCP (configure once per machine in `~/.claude.json`) **or** a per-repo PAT at `<repo>/.claude/secrets/gh-token`. At least one is required; `crew run` fails fast at pre-flight if neither is configured. `git push` uses SSH and needs no token. Keep the `chmod 600` note for the token path.

- [ ] **Step 2: Update `.agents/dispatch.md`**

- Step **4** (GH token copy): now *conditional* — copied into the worktree only when the per-repo token exists; otherwise dispatch relies on the user-level GitHub MCP.
- Step **11** (`GH_TOKEN` env): injected only when the token is present (conditional spread).
- Step **61** (`gh-token-present` gate): renamed to `github-auth-present`, now an OR of token-or-MCP; the run-path `requireGithubAuth` is its parallel fast gate.
- Steps **123 / 131** (the `pr_created` hook): now dual-path — fires on a successful `gh pr create` (Bash) *or* a `mcp__github__create_pull_request` tool call; matcher is `Bash|mcp__github__create_pull_request`.

- [ ] **Step 3: Run the doc-parity + readme-freshness gates**

Invoke the `agents-doc-parity-check` skill (a change under `packages/cli/src/commands/run.ts`, the hooks, and health checks touches paths several `.agents/*.md` `covers:` globs claim) and the `readme-freshness-check` skill. Update any other doc they flag.

- [ ] **Step 4: Full verification sweep**

Run: `npm run lint && npm run typecheck && npm run test:run`
Expected: PASS across the board.

- [ ] **Step 5: Commit**

```bash
git add README.md .agents/dispatch.md
git commit -m "docs(dispatch): document the MCP-or-token GitHub auth model (CREW-XXX)"
```

---

## Self-Review

**Spec coverage:**
- Multi-channel OR model → Tasks 1, 2, 6. ✓
- `requireGithubAuth` fail-fast gate → Task 2. ✓
- Conditional `GH_TOKEN` injection (2×2 table) → Task 2. ✓
- Steer agent to MCP → Task 3. ✓
- Dual-path detection hook → Task 4. ✓
- Broadened hook matcher → Task 5. ✓
- `github-auth-present` health check → Task 6. ✓
- Scaffold softening → Task 7. ✓
- README + `.agents/dispatch.md` → Task 8. ✓
- Token-liveness nicety (spec open question #4) → **intentionally deferred** — not in any task. Decision: ship presence-only; revisit if a present-but-broken sole token proves a real annoyance. Noted here so the omission is deliberate, not a gap.
- `fix-pr` steering → out of scope per spec Non-goals (follow-up).

**Placeholder scan:** no TBD/TODO; every code step carries real code; the `CREW-XXX` in commit messages is a ticket-key placeholder resolved at ticketing time (Epic children created after this plan).

**Type consistency:** `resolveGithubAuth` / `requireGithubAuth` / `hasRepoToken` / `userMcpHasGithubServer` signatures are identical across Tasks 1, 2, 6. The hook's `extractMcpPrUrl` and `handlePostToolUse` shapes match between Task 4's implementation and tests. The matcher string `'Bash|mcp__github__create_pull_request'` is identical in Task 5's impl and test.

## Open follow-ups (not in this Epic)

- **Token-liveness check** for token-only dispatches (`gh api user`) — spec open question #4.
- **`fix-pr` / resume** GitHub interactions to the MCP for channel consistency.
- **Threads B + C** — daemon Octokit client + CREW-271 outbound webhook ingress (separate combined brainstorm).
