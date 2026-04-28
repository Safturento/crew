# Visual testing via Playwright MCP — design

> **Purpose of this document.** A spec for adding visual-testing capability to crew-dispatched agents via Microsoft's Playwright MCP server. Captures the decisions reached during brainstorming so the implementation plan can be written against a settled design. Implementation breakdown is laid out below as an Epic + child tickets, but actual ticket creation in Jira happens in the next phase.
>
> Read [`docs/plans/architecture.md`](../../plans/architecture.md) first for system context. This spec assumes familiarity with crew's existing run-ticket flow, per-project TOML config, per-worktree docker bringup, and prompt template.

## 1. Goal & scope

When `crew run <KEY>` dispatches an agent on a UI ticket, the agent should be able to drive a real browser against the running app — taking screenshots, exercising the golden path, and (where appropriate) authoring committed Playwright tests — without bespoke per-project setup outside what crew's per-project TOML already covers.

**In scope:**

- A `[visual_testing]` opt-in section in the per-project TOML config.
- A per-worktree generated `.mcp.json` that wires in `@playwright/mcp` only when the project opts in.
- Lifecycle changes so that docker-backed apps stay running for the agent (today they're stopped after bringup).
- Conditional prompt sections instructing the agent to do (a) smoke verification and (b) authored Playwright tests against the live URL.
- README documentation for users opting a project in.

**Out of scope (explicit non-goals):**

- Crew installing `@playwright/test` or `playwright.config.ts` into target repos. Repos own their test-runner setup; crew validates the contract and fails fast when missing.
- User-scope MCP server registration. Crew controls visibility per-worktree; ad-hoc interactive use is the user's choice.
- A unified app-lifecycle abstraction. Crew already orchestrates docker; we extend the docker path and let the agent run a `start_command` for non-docker projects.
- Per-worktree port hashing for non-docker dev servers. Multiple simultaneous worktree dev servers may collide on Vite defaults; revisit if it bites.
- Pre-warming the Playwright browser binary. First-run download is tolerable; a `crew install-mcp-deps` command can come later if needed.
- A unified abstraction over headed/headless. Crew always generates `--headless` for dispatched agents; users wanting headed in interactive sessions add their own user-scope MCP entry.

## 2. Decisions reached during brainstorming

| #   | Question                                         | Decision                                                                                      |
| --- | ------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| 1   | Which projects get visual testing?               | Per-project opt-in via TOML `[visual_testing]` section.                                       |
| 2   | Smoke verification or authored tests?            | Both, as separate tickets in one epic.                                                        |
| 3   | Who runs the app?                                | Hybrid: docker stack stays running when present; agent runs `start_command` otherwise.        |
| 4   | Who installs `@playwright/test` in target repos? | Target repos own setup; crew declares the contract and fails fast on missing prereqs.         |
| 5   | MCP install scope?                               | Per-worktree generated `.mcp.json`; agents on backend tickets see no Playwright tools at all. |

## 3. Architecture

```
~/.config/crew/projects/<name>.toml
        │
        │  [visual_testing] section (optional)
        ▼
┌─────────────────────────────────────────┐
│ crew run <KEY>                          │
├─────────────────────────────────────────┤
│ 1. Load + validate project config       │
│ 2. If visual_testing.enabled:           │
│    a. Compute live appUrl               │
│       (docker → from worktree .env;     │
│        else → from TOML pattern as-is)  │
│    b. Write <worktree>/.mcp.json        │
│       with playwright server config     │
│    c. Append .mcp.json to               │
│       <worktree>/.git/info/exclude      │
│ 3. If [docker]:                         │
│    docker compose up --detach           │
│      (skip the existing `stop` when     │
│       VT is enabled)                    │
│ 4. Build prompt with conditional        │
│    visual-testing fragment(s)           │
│ 5. Spawn claude in worktree as today    │
└─────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────┐
│ claude agent (in worktree)              │
├─────────────────────────────────────────┤
│ • Auto-discovers .mcp.json              │
│ • Sees mcp__playwright__* tools         │
│ • Reads appUrl from prompt              │
│ • For UI changes: smoke-verify in       │
│   browser before claiming Verify done   │
│ • If [visual_testing.authored] set,     │
│   author *.spec.ts where regression     │
│   value justifies it                    │
└─────────────────────────────────────────┘
```

**Boundaries** (matching crew's existing rules from `CLAUDE.md`):

- `shared/` gets the schema-aware URL substitution helpers and the `.mcp.json` content builder. CLI calls into shared.
- The `.mcp.json` is a generated artifact, not source — excluded via `.git/info/exclude` (a per-worktree, untracked git mechanism), not via the repo's tracked `.gitignore`.
- The prompt template stays a single base file with one `{{visualTestingBlock}}` placeholder; ticket β/γ each add a sibling fragment file consumed by the builder.
- No target-repo mutations beyond writing `.mcp.json` and appending to `info/exclude`.

## 4. TOML schema additions

> **Project-specific:** lives in `~/.config/crew/projects/<name>.toml` and is loaded by `packages/cli/src/lib/config/loader.ts`. Schema validation is Zod.

```toml
# Optional. When this section is absent, crew behaves exactly as today.
[visual_testing]
enabled = true                                          # required when section present

# URL the agent points Playwright at. Supports {httpPort}, {httpsPort},
# {postgresPort} substitution from the per-worktree docker .env when the
# [docker] section is configured. Used as-is otherwise.
app_url = "https://localhost:{httpsPort}"

# Required when there's no [docker] section. Run by the agent in the
# worktree to bring the app up before testing. Ignored when docker
# handles lifecycle.
start_command = "npm run dev --workspace=crew-dashboard"

# Optional sub-table — opts the project into authored-test workflow.
# When absent, the agent only does smoke verification.
[visual_testing.authored]
tests_dir    = "tests/e2e"
test_command = "npm run test:e2e"
```

**Validation rules** (Zod refines):

- `[visual_testing]` is optional at the top level. When present, both `enabled = true` and `app_url` are required.
- `start_command` is required _unless_ the project also has `[docker]` configured (cross-validation).
- `app_url` placeholders that reference docker-derived ports (`{httpPort}`, `{httpsPort}`, `{postgresPort}`) require the `[docker]` block to be present.
- `[visual_testing.authored]` is optional; when present, both `tests_dir` and `test_command` are required.

## 5. Per-worktree `.mcp.json` generator

> **Project-specific:** lives in a new module `packages/cli/src/lib/mcp/`, called from `runTicket()` in `packages/cli/src/commands/run.ts` after the docker `.env` write and before the agent spawn.

**File location:** `<worktree>/.mcp.json`. Claude Code auto-discovers project-scope MCP config from this path when the agent's cwd is the worktree root.

**Contents:**

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest", "--headless"],
      "env": {
        "CREW_APP_URL": "https://localhost:18443"
      }
    }
  }
}
```

`CREW_APP_URL` is the resolved `app_url` after substitution. Purely informational — the MCP itself does not read it; it's there so the eventual prompt can reference the same value the MCP was generated with, and so a human inspecting the file can see what URL crew aimed at.

**Gitignore handling:** the file is appended to `<worktree>/.git/info/exclude` (a per-worktree, untracked git exclusion mechanism). Reasoning: tracked `.gitignore` is a source file that may contain repo-wide rules; mutating it from crew is invasive and would have to be undone or upstreamed. `info/exclude` is exactly the right tool — local, ephemeral, scoped to the worktree.

**Caveat callout for the README:** if a project has a tracked `.mcp.json` of its own (e.g. the user maintains additional MCP servers there), crew's per-worktree `.mcp.json` would shadow it. We treat that as low-likelihood (no current crew-managed project has one) and warn rather than fail when overwriting.

**Public interface** (in `shared/`, since URL substitution is reusable):

```ts
// packages/shared/src/visual-testing/mcp-config.ts (new package surface)
export interface ResolvedAppUrl {
  raw: string;
  substitutions: Record<string, string>;
}

export function resolveAppUrl(
  template: string,
  ports?: { httpPort: number; httpsPort: number; postgresPort: number },
): ResolvedAppUrl;

export function buildMcpConfig(opts: { appUrl: string }): McpConfig;
```

CLI does the file writing and the `info/exclude` append; shared owns the resolution and the JSON shape.

## 6. App lifecycle changes

The current `startDockerBringup()` ends with `docker compose stop`. With VT enabled the stack must stay running for the agent.

```ts
function buildDockerBringupScript(repoPath: string, opts: { stopAfterBringup: boolean }): string {
  // ... up + db-clone unchanged
  if (opts.stopAfterBringup) {
    // existing `docker compose stop` behavior
  } else {
    // skip the stop; log "leaving stack running for visual testing"
  }
}
```

Caller passes `stopAfterBringup = !visualTestingEnabled`. No teardown logic — `crew finish` already cleans up the worktree, and the user's existing `docker:down` workflow handles container cleanup if desired.

**Non-docker projects:** crew does _not_ run `start_command` itself. The prompt instructs the agent to run it before testing. Crew's responsibilities stay narrow; the agent already manages other long-running processes during its run.

## 7. Prompt template additions

The current renderer (`packages/cli/src/lib/prompts/render.ts`) is plain `{{var}}` substitution. We keep it that way and use small fragment files with composition done in the builder:

> **Project-specific:**
>
> ```
> packages/cli/src/lib/prompts/templates/
> ├── ticket.md                     (existing base; +1 line: {{visualTestingBlock}})
> ├── ticket-visual-smoke.md        (new in CREW-β)
> └── ticket-visual-authored.md     (new in CREW-γ)
> ```

`ticket.ts` builds the `visualTestingBlock` string before rendering the base template:

- VT off → empty string.
- VT on → render `ticket-visual-smoke.md` with `{appUrl}` and `{startCommandHint}` substituted.
- VT on + authored → append `ticket-visual-authored.md` rendered with `{testsDir}` and `{testCommand}`.

The block is slotted in just before the existing "Verify" step, so the workflow reads as "Execute → smoke-verify in browser → optionally author test → Verify (lint/format/typecheck/test:run)."

**Smoke fragment** (`ticket-visual-smoke.md`):

```markdown
## Visual smoke verification

This project's UI runs at **{appUrl}**. If your changes touch the frontend
(any file under a frontend/dashboard package, anything that renders to a
DOM, or a backend change a user can observe), you must verify the change
end-to-end in a browser before claiming "Verify" complete.

1. Make sure the app is running. {startCommandHint}
2. Use the `mcp__playwright__*` tools to navigate to {appUrl} and exercise
   the golden path you changed. Take a screenshot at the relevant state.
3. Inspect the screenshot. If the change is invisible or broken, return to
   step 7 (Execute) — it isn't done yet.

If your change is _clearly_ backend-only (no observable user effect), say
so explicitly in the PR description and skip this step.
```

`{startCommandHint}` resolves to one of:

- (docker case) `"The docker stack is already running — verify with curl ${appUrl} or just navigate."`
- (non-docker case) `"Run \`${startCommand}\` in the worktree. Wait for the dev server to be reachable, then proceed."`

**Authored-test fragment** (`ticket-visual-authored.md`):

```markdown
## Authored Playwright test

If the change has regression value (a user-facing flow that broke before
or could break again), add a Playwright test:

- Tests live in **{testsDir}/**. Mirror existing files there for style.
- Run them with `{testCommand}`. The command must pass before "Verify".
- One test per behaviour, not per assertion. Names describe user intent.
- Don't add a test just because you can. Skip when the change is
  cosmetic, throwaway, or fully covered by existing unit tests.

If `{testsDir}/` doesn't exist or `{testCommand}` fails because the
runner isn't installed, surface the problem in the PR description and
do **not** silently skip — that's a project setup gap, not your fault.
```

## 8. Failure modes & error handling

**At config load** (CREW-α):

- Schema-validation failures fail fast with the path to the bad config and the offending field.
- Cross-validation failures (e.g. `start_command` missing without `[docker]`, `{httpsPort}` referenced without `[docker]`) carry an explicit message naming the conflict.

**At worktree setup** (CREW-α):

- Pre-existing `<worktree>/.mcp.json` → overwrite with a yellow warning. (Fresh worktrees from `origin/main` shouldn't have one.)
- Failed `info/exclude` write → fail hard. Fundamental git op.
- Malformed substituted URL → not validated. Agent will see the bad URL and the connection error.

**At docker bringup** (CREW-α):

- Bringup failure → already logged today. Agent still launches and discovers the problem on first navigation.
- App never becomes reachable → agent's problem to detect via Playwright, not crew's. No pre-flight HTTP probe.

**At agent runtime** (CREW-β/γ via prompt fragments):

- First-run Playwright browser download → 30–60s on first MCP call. Tolerable; no pre-warm.
- Playwright MCP not on PATH → tool-call error from Claude Code's MCP layer. Surfaced in PR description per the prompt's instructions.
- App unreachable when navigating → Playwright's error is descriptive; agent decides whether to (re)run `start_command`.
- `test_command` fails because runner isn't installed → agent surfaces in PR description per the γ fragment. **Working as designed** — the target-repo prerequisite gap we explicitly chose not to auto-fix.

## 9. Testing strategy

**CREW-α (foundation):**

- Schema cases in the existing `loader.test.ts`: VT absent, VT enabled minimal, missing `app_url`, `start_command` required-without-docker, `{httpsPort}` without `[docker]`, partial `[visual_testing.authored]`.
- New `mcp-config.test.ts` in `shared/`: `resolveAppUrl` substitution paths, `buildMcpConfig` snapshot.
- New `mcp/write.test.ts` in `cli/`: file write + `info/exclude` idempotent append + overwrite-warning.
- `buildDockerBringupScript` flag-controlled `stop` line.
- `buildTicketPrompt` baseline snapshot (VT-off must equal today's prompt byte-for-byte).
- `runTicket` integration: extend the existing mocked-execa test to assert `.mcp.json` write happens iff VT is enabled.

**CREW-β (smoke prompt):**

- Three `buildTicketPrompt` snapshots: VT-off (matches α baseline), VT-on with docker (docker hint), VT-on without docker (`start_command` hint).
- Direct unit test for the `startCommandHint` resolver.

**CREW-γ (authored-test prompt):**

- Snapshot with `[visual_testing.authored]` populated; smoke + authored both appear in order.
- Schema cases for `[visual_testing.authored]`.

**Cross-cutting:**

- No live Playwright in crew's CI. The `.mcp.json` content is the contract; what Claude does with it is not crew's test surface.
- No live target-repo tests in crew's CI. Tmpdirs and mocked execa only.
- One manual smoke per ticket as part of acceptance criteria: α → eyeball generated `.mcp.json`; β → watch a real agent run call `mcp__playwright__navigate` on a UI ticket; γ → watch a real agent author a `.spec.ts`.

**Runtime (non-test) behavior** that is verified live, not in CI:

- Docker container stays running through the agent's lifetime.
- Agent reads the prompt URL, calls Playwright tools, drives a real browser against the deployed container, takes real screenshots.
- User can simultaneously hit the same URL in their own browser.

## 10. Documentation deliverables

A new "Visual testing (per project)" subsection under "Setup" in the crew README. Distributed across the three crew tickets:

- **CREW-α** lands the subsection's foundational paragraphs: opt-in via TOML, the `[visual_testing]` schema, what crew generates per-worktree, and the headless-vs-headed callout for interactive worktree sessions.
- **CREW-β** appends a paragraph describing what the smoke-verification step does at agent runtime so users understand why their dispatched agents now navigate to URLs.
- **CREW-γ** appends the `[visual_testing.authored]` schema, a reminder that `@playwright/test` must be installed in the target repo, and pointer to whichever target-repo ticket(s) handled that prerequisite.

## 11. Implementation breakdown — Epic + child tickets

> **Project-specific:** these will become Jira tickets in the **CREW** project under one new Epic. The "(repo)" tickets land in their own project keys (Recipes = KAN, crew dashboard = CREW for now since both repos belong to the same Jira instance).

**Epic: Visual testing via Playwright MCP** — covers the three crew implementation tickets. Target-repo prerequisite tickets are linked but live outside this epic since they're consumable independently and don't require crew changes to ship.

| Ticket               | Title                                                                                            | Blocks/blocked-by                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| **CREW-α**           | TOML schema + per-worktree `.mcp.json` generator + lifecycle (don't stop docker when VT enabled) | Blocks β, γ                                                                         |
| **CREW-β**           | Smoke-verification prompt fragment + builder branch                                              | Blocked by α; parallel with γ                                                       |
| **CREW-γ**           | Authored-test prompt fragment + schema extension                                                 | Blocked by α; parallel with β                                                       |
| **(Recipes repo)**   | Install `@playwright/test`, `playwright.config.ts`, `tests/e2e/`, `npm run test:e2e`             | Independent of crew epic; required before γ produces value in Recipes               |
| **(crew dashboard)** | Same as above but for `packages/dashboard/`                                                      | Independent of crew epic; required before γ produces value for crew's own dashboard |

**Parallelism plan** (to be confirmed in the next phase before any implementation begins):

1. CREW-α first, alone.
2. CREW-β and CREW-γ in parallel after α merges.
3. The two repo prerequisite tickets in either repo at any time; they only need to land before γ can be useful in that repo.

## 12. Open questions / things to revisit

- If multiple worktrees of the dashboard run simultaneously, Vite will pick free ports starting at 5173 — `app_url` would be wrong for the second worktree. Tolerable for now (sequential `crew run` workflow); revisit if/when that breaks. Possible fix: extend the docker-port-hashing scheme to non-docker `start_command` projects, taking a `port_hash_base` field in TOML.
- The first-run browser binary download blocks the agent's first MCP call. If this becomes a friction point, add a `crew install-mcp-deps` command that runs `npx @playwright/mcp@latest --version` once at install time to pre-warm the cache.
- The `.git/info/exclude` write is idempotent but doesn't currently check whether the `.mcp.json` line was added by crew vs the user. Low-risk; revisit only if conflicts arise.
