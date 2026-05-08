# Agent-shell e2e reliability — design

> **Purpose.** Make `npm run test:e2e` (in any common form) succeed when invoked from a dispatched agent's shell against the worktree's docker dashboard. The current state — surfaced by [PR #133 (CREW-103)](https://github.com/Safturento/crew/pull/133) — is that the agent runs the command sandboxed (because the `excludedCommands` exact-match doesn't accept `--workspace=…` and pipe variations), Playwright then spawns its own Vite at the wrong port via `webServer`, and the suite times out polling `baseURL`. Five linked changes plus an empirical-verification gate fix the failure end-to-end.
>
> Read [PR #133](https://github.com/Safturento/crew/pull/133)'s test-plan section for the surface symptom, the agent transcript at `~/.claude/projects/-home-safturento-Repos-crew-CREW-103/86332977-a060-460f-923a-e5f72520a02c.jsonl` for the actual failure mode (the agent ran `npm run test:e2e --workspace=crew-dashboard 2>&1 | tail -25`, Playwright booted Vite at `localhost:5173`, timed out 120s polling `baseURL`), and the [Claude Code sandboxing docs](https://code.claude.com/docs/en/sandboxing) for the wildcard hint (`docker *` is the docs' single example of an `excludedCommands` entry; the matching algorithm is otherwise undocumented).
>
> **Scope boundary.** Crew-only fix. No Recipes-side changes — Recipes' Playwright config is independent and its agent dispatch path uses crew-side prompts that this spec already updates.

## 1. Background

### 1.1 The bug

PR #133 (CREW-103, dashboard `AgentDrawer` work) landed with a test-plan checkbox left unchecked: `npm run test:e2e — could not be run from the agent shell`. The PR body cited [`docs/tickets/CREW-111.md`](../../tickets/CREW-111.md) as documenting the same blocker, but that's a misdiagnosis — CREW-111's blocker was `docker compose up` failing on the docker socket (since fixed by [CREW-114](https://safturento.atlassian.net/browse/CREW-114)), a genuinely different problem from `npm run test:e2e` failing.

The actual transcript shows the agent issued three variations:

```
npm run test:e2e --workspace=crew-dashboard 2>&1 | tail -25
npm run test:e2e --workspace=crew-dashboard -- agent-drawer.spec.ts 2>&1 | tail -40
npm run test:e2e --workspace=crew-dashboard -- dashboard.spec.ts 2>&1 | tail -30
```

None matched the `excludedCommands` entry `"npm run test:e2e"` (matching is exact or near-exact, not prefix), so all ran sandboxed. Inside the sandbox, `bwrap --unshare-net` isolates loopback, and Playwright's `webServer` block — `command: 'npm run dev'`, `url: baseURL`, `reuseExistingServer: !process.env.CI` — spawned a fresh Vite at `localhost:5173` while polling whatever `baseURL` resolved to (either 5173 from the fallback, or the worktree port from `CREW_APP_URL`, both unreachable from inside the sandboxed netns). Playwright timed out at 120s.

### 1.2 Why the existing pieces don't compose

The current architecture has three independent partial mitigations that look like they should work together but don't:

1. **`<repo>/.claude/settings.json` `excludedCommands`** lists `"npm run test:e2e"`, intended to bypass the sandbox so the runner reaches host loopback. Defeated by exact-match: any flag, pipe, or wrapper falls through.
2. **`run.ts:397-402` plumbs `CREW_APP_URL` into the agent's env**, intended to give Playwright the right port via the `process.env.CREW_APP_URL` fallback in `playwright.config.ts:3-4`. Defeated when the runner is sandboxed (port unreachable regardless) and silently dropped to `localhost:5173` when `CREW_APP_URL` doesn't propagate through `npm run --workspace`.
3. **`playwright.config.ts` has a `webServer` block** that spawns its own Vite, intended to make tests work in any context where the docker stack is missing. Counterproductive in crew's actual deployment model — the docker stack is always the source of truth, and `webServer` masks the real failure (couldn't reach docker stack) by introducing a second, equally broken target.

Each mitigation alone wasn't enough; together they obscured the root cause and made the failure look like a sandbox issue when it's a coupling-of-three-leaky-pieces issue.

### 1.3 Why now

Every dashboard-touching ticket from here forward will need the e2e suite to pass from the agent shell. Without this fix, every such ticket repeats CREW-103's test-plan workaround (visual smoke via Playwright MCP, leave the `npm run test:e2e` checkbox unchecked, hand-verify in a separate session). That trades a real verification gate for an imitation of one, and accumulates "merged on visual smoke alone" tech debt fastest where the dashboard is moving fastest.

## 2. Scope

### 2.1 In scope

1. **Empirical wildcard probe** — first plan task, before changing settings. Test which glob form (`"foo*"`, `"foo *"`, `"foo**"`, etc.) actually bypasses the sandbox on a known-failing sandboxed Bash call. Document the result in this spec file (live edit) before writing the production change.
2. **Update `<repo>/.claude/settings.json`** `excludedCommands` to use the verified wildcard form for all three entries (`bruno:smoke`, `test:e2e`, `docker compose`). Update `packages/cli/src/lib/preflight/verify-excluded-commands.ts` (and tests) to require the verified form.
3. **Drop the `webServer` block from `packages/dashboard/playwright.config.ts`.** Tests target the worktree docker stack only. Inline comment documents the rationale so the block doesn't get re-added.
4. **Make `baseURL` deterministic via the materialized `.env`.** Replace the `process.env.PLAYWRIGHT_BASE_URL ?? process.env.CREW_APP_URL ?? 'http://localhost:5173'` chain with a function that walks up to repo root, reads the worktree's `<repo>/.env` (materialized by `crew env init`/`crew env refresh` from `env.toml`), picks `APP_URL`, and fails loudly if absent. Keep `PLAYWRIGHT_BASE_URL` env-var override (escape hatch for ad-hoc debugging); drop `CREW_APP_URL` and the literal fallback. Note: `env.toml` is the *spec*; `.env` is the resolved values written by the materializer. Reading `.env` avoids re-running the materializer and removes the need for a TOML parser dep in the dashboard package.
5. **Plumb `PLAYWRIGHT_BASE_URL` in `run.ts:397-402`** alongside the existing `CREW_APP_URL`. Belt-and-suspenders for callers that don't go through `npm run` (e.g. a future agent invoking `npx playwright test` directly).
6. **Update `packages/cli/src/lib/prompts/templates/sandbox-network-note.md`** with two edits:
   - **Atomic followup resolution:** replace the `crew restart {{key}} --hard` line (which destroys the worktree) with `docker compose up --build --wait` from the worktree. Move the `2026-05-07 — sandbox-network-note.md recommends crew restart --hard…` followup entry from Active to Resolved in the same diff.
   - **New warning:** explain that `excludedCommands` is glob-matched (using whatever semantics the §1 probe verifies), and show the literal forms agents should use. Specifically warn against `cd <dir> && npm run test:e2e`, `--workspace=…`, and `2>&1 | tail -N` shell pipes if the verified glob doesn't cover them. Recommend bare command + logfile + `Read` tool over pipes for output capture.

### 2.2 Out of scope

- **Generated `.claude/settings.json` from project TOML.** Tracked as followup `2026-05-04 — Crew sandbox/preflight self-opt-in`. Architectural piece on its own; not blocking this fix.
- **Per-block URL config consolidation.** Followup `2026-05-04 — `[sandbox]`/`[docker]`/etc. URL/port duplication`. Touches `crew-shared` schema and every project's TOML; not in this scope.
- **Recipes-side parallel work.** Recipes uses its own Playwright config and its own dispatch path; the crew-side prompt update will benefit it transitively (via the `sandbox-network-note.md` template), but Recipes' `playwright.config.ts` is its own concern.
- **Replacing `webServer` with a different bringup mechanism.** Out of scope. The fix is "delete it"; if a future caller needs a non-docker dashboard for e2e (e.g., a CI environment without docker), they file a ticket and pick from real alternatives.
- **Auditing other places `excludedCommands` matching could bite.** This spec narrows to the three current entries; if a future entry hits the same exact-match pitfall, the doc + verified-wildcard convention from this work makes the fix mechanical.
- **Generalizing `env.toml` parsing into a shared helper.** The first call site is `playwright.config.ts`. If a second call site emerges (`vite.config.ts`?), factor out then; today, inline parsing keeps the dashboard package's coupling to crew minimal and explicit.

## 3. Design

### 3.1 The empirical probe

Before changing any production setting, the implementing agent runs a one-shot probe on its own sandboxed shell to determine which glob form bypasses the sandbox.

**Method.** Pick a known-failing sandboxed command (e.g. `curl -s http://localhost:21559/healthz`, which fails ECONNREFUSED inside `bwrap --unshare-net`). Wrap it as `npm run test:probe` in `packages/dashboard/package.json` temporarily (or use an existing whitelisted command form). Add a candidate entry to `<repo>/.claude/settings.json` `excludedCommands`. Run a sandboxed Bash invocation that *would* match the entry under each glob hypothesis. Record outcome: "matched (un-sandboxed)" vs "not matched (sandboxed)".

**Probe results (run 2026-05-08, against worktree at `localhost:21114`):**

| Candidate entry | Invocation form | Result | Notes |
| --- | --- | --- | --- |
| (none — baseline) | `npm run probe:loopback --workspace=crew-dashboard` | NO MATCH | confirms sandbox isolates loopback (`PROBE_FAIL`) |
| `"npm run probe:loopback*"` | `npm run probe:loopback --workspace=crew-dashboard` | MATCH | concatenated glob accepts trailing args |
| `"npm run probe:loopback*"` | `npm run probe:loopback` (bare, in workspace dir) | MATCH | trailing `*` is zero-or-more |
| `"npm run probe:loopback*"` | `npm run probe:loopback --workspace=crew-dashboard 2>&1 \| tail -5` | MATCH | shell pipe / redirect does **not** defeat matching |
| `"npm run probe:loopback*"` | `cd /tmp && npm --prefix <dir> run probe:loopback 2>&1 \| tail -5` | NO MATCH | `cd && …` and `npm --prefix …` wrappers defeat the prefix match |
| `"npm run probe:loopback*"` | `sh -c "npm run probe:loopback"` | NO MATCH | `sh -c …` wrapper is the entry that gets matched, not the inner |
| `"npm run probe:loopback **"` | `npm run probe:loopback --workspace=crew-dashboard` | MATCH | space + double-star equivalent to `*` for our purposes |
| `"npm run probe:loopback *"` | `npm run probe:loopback` (bare) | MATCH | space + single-star also matches the empty trailing |
| `"npm run probe:loopback"` (exact, control) | `npm run probe:loopback --workspace=crew-dashboard` | NO MATCH | reproduces the CREW-103 failure mode |

**Conclusion:** matching is **leading-substring (prefix) with `*` glob semantics**. `command*` and `command *` are equivalent — both match `command` alone, `command --flag=…`, and `command --flag=… 2>&1 | tail -N` (pipes/redirects ride along because the entry only constrains the leading bytes). Wrappers that prepend something **before** the matched prefix (`cd … &&`, `sh -c "…"`, `npm --prefix … run …` instead of `npm run …`) defeat the match.

**Canonical form selected:** `command*` (concatenated, no whitespace). Equivalent to `command *` but minimal. `**` adds nothing.

**Implications for §3.2:** the three production entries become `"npm run bruno:smoke*"`, `"npm run test:e2e*"`, `"docker compose*"`.

**Implications for §3.6:** pipes/redirects do **not** need a warning — they ride along. The prompt warning calls out `cd <dir> && …` and other wrappers (`sh -c "…"`, `npm --prefix … run …`) as the actual hazards.

### 3.2 Sandbox settings update

> **Project-specific:** filenames and line numbers in this section reference crew's current layout. Generic guidance: write the verified glob form into the sandbox config; update the wrapper-side preflight that enforces required entries to use the same form.

**File: `<repo>/.claude/settings.json`** — replace the three exact-match entries with their verified-glob equivalents. Example assuming the probe confirms `command*` form:

```json
"excludedCommands": [
  "npm run bruno:smoke*",
  "npm run test:e2e*",
  "docker compose*"
]
```

**File: `packages/cli/src/lib/preflight/verify-excluded-commands.ts`** — `requiredEntries(config)` (lines 13-28 today) should emit the verified glob form. The exact-match check at line 67-70 stays exact-match — committed entry vs required entry must match identically; what changes is *what* the required entry is.

Update existing tests in `packages/cli/src/lib/preflight/verify-excluded-commands.test.ts` to use the new entry shape. Add a regression test: a project committing the old exact-match form (e.g. `"npm run test:e2e"` without the glob suffix) fails the preflight with a clear error pointing at the canonical form.

### 3.3 Drop `webServer` from playwright config

**File: `packages/dashboard/playwright.config.ts`** — remove the `webServer` block entirely. Inline comment explaining why the block is intentionally absent:

```ts
// Intentionally no webServer: tests run against the worktree's docker dashboard
// stack only. See docs/superpowers/specs/2026-05-08-agent-shell-e2e-reliability-design.md
// for why a fallback Vite spawn here was masking real failures.
```

If `process.env.CI` was the only consumer of the `reuseExistingServer` gate (it is — grep for it), nothing else needs to change. Existing e2e tests that ran against the docker stack are unaffected; ones that relied on a Vite-spawned dev server will fail loudly, which is the intended behavior (those paths weren't testing what they claimed).

### 3.4 `baseURL` from the materialized `.env`

**File: `packages/dashboard/playwright.config.ts`** — replace lines 3-4:

```ts
const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ?? process.env.CREW_APP_URL ?? 'http://localhost:5173';
```

with a small inline resolver:

```ts
function resolveBaseURL(): string {
  if (process.env.PLAYWRIGHT_BASE_URL) {
    return process.env.PLAYWRIGHT_BASE_URL;
  }
  // Walk up to repo root, read .env, return APP_URL.
  // .env is materialized from env.toml by `crew env init`/`crew env refresh`.
  // Fail loud if missing — no localhost:5173 fallback. The docker stack
  // (or an explicit PLAYWRIGHT_BASE_URL override) is the only source of
  // truth for where the worktree dashboard lives.
  const repoRoot = findRepoRoot(__dirname);
  const envPath = join(repoRoot, '.env');
  let envContents: string;
  try {
    envContents = readFileSync(envPath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(
        `playwright.config.ts: ${envPath} not found. ` +
          `Run 'crew env init' (canonical worktree) or 'crew env refresh' (other worktrees), ` +
          `or set PLAYWRIGHT_BASE_URL explicitly.`,
      );
    }
    throw err;
  }
  const match = envContents.match(/^APP_URL=(.+)$/m);
  if (!match) {
    throw new Error(
      `playwright.config.ts: ${envPath} has no APP_URL line. ` +
        `Re-run 'crew env refresh', or set PLAYWRIGHT_BASE_URL explicitly.`,
    );
  }
  return match[1].trim();
}

const baseURL = resolveBaseURL();
```

`findRepoRoot` walks up from `__dirname` looking for a `.git` directory (handles both regular checkouts and worktrees, where `.git` is a file, not a directory — `existsSync` covers both). No TOML parser needed — `.env` is plain `KEY=value` lines.

### 3.5 `run.ts` env plumbing

**File: `packages/cli/src/commands/run.ts:397-402`** — add `PLAYWRIGHT_BASE_URL` next to `CREW_APP_URL`:

```ts
env: {
  ...childEnv,
  GH_TOKEN: ghToken,
  ...(resolvedAppUrl ? { CREW_APP_URL: resolvedAppUrl } : {}),
  ...(resolvedAppUrl ? { PLAYWRIGHT_BASE_URL: resolvedAppUrl } : {}),
  ...(brunoEnvName ? { CREW_BRUNO_ENV: brunoEnvName } : {}),
},
```

Same logic for the parallel injection point in `crew fix-pr`'s `prepareAgentEnvironment` if it has one (the implementing agent greps for the second site).

### 3.6 `sandbox-network-note.md` updates

**File: `packages/cli/src/lib/prompts/templates/sandbox-network-note.md`** — two diffs in one PR:

**A. Replace destructive recovery instruction** (resolves followup `2026-05-07 — sandbox-network-note.md recommends crew restart --hard…`):

> If `{{e2eCommand}}` fails with `ECONNREFUSED`, that's a real signal: the docker stack is not serving at the expected port. Investigate `/tmp/crew-docker-{{key}}.log` and consider running `docker compose up --build --wait` from the worktree to bring the stack back up.

(Replaces the `crew restart {{key}} --hard` recommendation, which destroys the worktree.)

**B. Add a new section warning about command form** (form depends on §3.1 probe results). Skeleton:

> ## Excluded-command matching is form-sensitive
>
> Crew's whitelisted commands (`{{whitelistedCommands}}`) match `<repo>/.claude/settings.json`'s `excludedCommands` entries by glob. The current entries match `<verified-glob-form>`. **Wrappers and shell redirections may break the match,** in which case the command runs sandboxed and won't reach host loopback even though it looks like it should.
>
> Specifically, if matching is form-sensitive in your setup:
>
> - **Run the bare command:** `npm run test:e2e` (not `cd <dir> && npm run test:e2e`).
> - **Avoid `--workspace=…` and other flag suffixes** unless the verified glob covers them.
> - **Don't pipe to `tail` / `head` / etc.** (`2>&1 | tail -25` may defeat the match — depends on whether the runtime evaluates the rule against the first command or the whole pipeline). Capture full output and use a logfile + the `Read` tool to extract the parts you want.
>
> A failed `{{e2eCommand}}` that produced `ECONNREFUSED` while the same flow works via Playwright MCP is the signature of a wrapper-defeated match.

The implementing agent fills in the verified specifics from §3.1 (e.g. exactly which forms break the match, exactly which forms preserve it).

### 3.7 Followup entry resolution

**File: `<repo>/docs/followups.md`** — atomic update in the same PR as §3.6:

1. Cut the entry `### 2026-05-07 — sandbox-network-note.md recommends crew restart --hard for docker recovery, but --hard nukes the worktree` from `## Active`.
2. Paste it under `## Resolved` with a one-line `**Resolved 2026-05-08:** Replaced the destructive `crew restart --hard` recommendation with `docker compose up --build --wait` as part of CREW-XXX (this ticket).` addendum.
3. Update the ToC links in `## Contents` to move the entry's link from the Active sub-list to the Resolved sub-list.
4. Remove the `**Ticket:**` line from the entry body if one was added (this followup didn't get one — it's being resolved without ever being individually ticketed, since it's a one-liner co-located with this work).

## 4. Failure modes / edge cases

- **Probe inconclusive — no glob form matches all common variations.** Fall back to:
  - Pick the most permissive form that matches a useful subset (probably `command*`).
  - Document the gap explicitly in `sandbox-network-note.md` and have agents avoid the variations that don't match.
  - File a followup to revisit if Claude Code's documented matching algorithm becomes more permissive in a future release.
- **`.env` missing in the worktree.** Expected for a fresh clone before `crew env init` runs. The fail-loud error in §3.4 names the fix (`crew env init` / `crew env refresh` / `PLAYWRIGHT_BASE_URL=…`). No silent fallback; fail-fast is the design.
- **`.env` has no `APP_URL` line.** Same handling as missing file — the resolver checks for the regex match and throws with a "re-run `crew env refresh`" hint.
- **CI runs e2e (no docker stack, just static deployment).** Out of scope for this spec — CI sets `PLAYWRIGHT_BASE_URL` explicitly, which the resolver honors first. Verified by §5's CI check.
- **Agent runs the e2e suite while the docker dashboard is still warming up.** Existing behavior preserved — Playwright navigates to `baseURL`, gets a connection error (since dashboard isn't up yet), retries per its built-in `waitForLoadState` semantics. If the stack genuinely never comes up, the test fails fast with a real error. Better than the current behavior (timing out for 120s on a wrong-port webServer).
- **Worktree's `APP_URL` differs from canonical's.** Per the per-worktree docker isolation rule (`CLAUDE.md` "Per-worktree docker isolation"), each worktree's `env.toml` has its own port. The resolver picks the right one by reading the worktree's own file. Never reads canonical's.

## 5. Testing

### 5.1 Unit / contract

- **`verify-excluded-commands.test.ts`** — existing tests pass with updated entry shapes. New regression test: a project committing the old exact-match form (e.g. `"npm run test:e2e"`) fails the preflight with a clear "use the canonical glob form" error.
- **`playwright.config.ts` resolver** — small inline test (or a separate `playwright.config.test.ts`):
  - `PLAYWRIGHT_BASE_URL` set → returns it.
  - `.env` present with `APP_URL=…` → returns the value.
  - `.env` present, `APP_URL` missing → throws with the "re-run `crew env refresh`" hint.
  - `.env` absent → throws with the diagnostic message naming `crew env init` / `crew env refresh`.
- **`run.ts` env plumbing** — the existing run-command test suite (if it covers env injection) gets a new assertion that `PLAYWRIGHT_BASE_URL` is present and equal to `CREW_APP_URL`. If no such suite exists, no new test scaffolding required — this is a one-line config addition.

### 5.2 Empirical (manual + automated)

1. **Probe (§3.1).** Run the wildcard probe before any production change. Record results in this spec file.
2. **Sandbox bypass.** With the new `excludedCommands` form, run a sandboxed Bash test that issues `npm run test:e2e --workspace=crew-dashboard 2>&1 | tail -25`. Confirm it bypasses the sandbox (e.g. `curl http://localhost:<worktree-port>/healthz` succeeds where the same curl from a normal sandboxed Bash returns ECONNREFUSED).
3. **`.env` path.** Run `npm run test:e2e` from a fresh worktree shell (not the agent's). Confirm Playwright targets the worktree's `APP_URL`, not 5173.

### 5.3 Integration (the gate that actually matters)

Dispatch a follow-up agent on a small dashboard-touching ticket (or rerun CREW-103's e2e suite directly via `crew restart CREW-103 --soft` or equivalent). Confirm:

- The agent runs `npm run test:e2e` (in any of the common forms) and the run is un-sandboxed.
- Playwright targets the worktree's `APP_URL` from `env.toml`.
- The suite executes and either passes (best case) or fails on real test assertions (acceptable — proves the runner reached the dashboard).
- The agent's PR test plan checks the `npm run test:e2e` checkbox without an asterisk.

## 6. Open questions

None blocking. The probe in §3.1 settles the only remaining technical uncertainty (wildcard semantics) before any production change is committed.

## 7. Links

- Triggering PR: [PR #133 (CREW-103)](https://github.com/Safturento/crew/pull/133) — "Test plan e2e checkbox left unchecked: 'could not be run from the agent shell.'"
- Misdiagnosed predecessor: [CREW-111](https://safturento.atlassian.net/browse/CREW-111) — different blocker (`docker compose up` on the docker socket), already fixed by [CREW-114](https://safturento.atlassian.net/browse/CREW-114).
- Sandbox-config followup absorbed: `docs/followups.md` `2026-05-07 — sandbox-network-note.md recommends crew restart --hard for docker recovery, but --hard nukes the worktree`.
- Out-of-scope adjacencies: `docs/followups.md` `2026-05-04 — Crew sandbox/preflight self-opt-in`, `2026-05-04 — `[sandbox]`/`[docker]`/`[playwright]`/`[bruno_smoke]`/`[db_clone]` URL/port duplication`.
- Reference: [Claude Code sandboxing docs](https://code.claude.com/docs/en/sandboxing) (the `docker *` glob example is the canonical hint).
- Reference: agent transcript for failure mode at `~/.claude/projects/-home-safturento-Repos-crew-CREW-103/86332977-a060-460f-923a-e5f72520a02c.jsonl`.
