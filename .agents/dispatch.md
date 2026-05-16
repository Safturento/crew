---
name: dispatch
description: crew run prompt-build, skills injection, verification gates
last_updated: 2026-05-15
covers:
  - 'packages/cli/src/lib/run/**'
  - 'packages/cli/src/lib/prompts/**'
  - 'packages/cli/src/lib/mcp-config/**'
  - '.claude/skills/**'
  - 'packages/cli/src/lib/preflight/**'
  - 'packages/cli/src/lib/figma-snapshot/**'
---

# Dispatch

How `crew run <KEY>` turns a Jira key into a sandboxed agent on a fresh worktree, and the contracts each step holds. If you're editing any of: worktree creation, env materialization, docker bringup, MCP write, skills/snapshot injection, prompt build, transcript streaming, or post-run gates — this is the doc.

The companion commands `crew fix-pr` (resume from PR feedback) and the gate-driven resume in `runVerifyGate` share most of the same pieces; differences are called out where they matter.

## End-to-end flow

`packages/cli/src/commands/run.ts` is the orchestrator. The steps below are in execution order; each is owned by code under `packages/cli/src/lib/`. Edit the orchestrator only when the cross-cutting _order_ changes; otherwise edit the owning module.

1. **Resolve project config.** `discoverProjectConfig(process.cwd())` walks parents for `~/.config/crew/projects/<name>.toml`. Fail-fast if absent.
2. **Tool preflight.** `preflightTools(['claude','gh','jq','bwrap'], PATH)` — bare-binary existence check; no version logic.
3. **Worktree create.** `git fetch origin <default_branch>` then `git worktree add -b <KEY> <worktree> origin/<default_branch>`. Worktree path is `worktreePathFor(repoPath, KEY)` — sibling dir `<repo>-<KEY>`. The sibling layout matters: the docker port allocator hashes the basename, so `-<KEY>` deterministically produces a distinct port set per worktree.
4. **GH token copy.** Read-only source at `<repo>/.claude/secrets/gh-token` → `<worktree>/.claude/secrets/gh-token` (chmod 0600). Passed as `GH_TOKEN` env to the agent's claude process — never written into the prompt.
5. **Env materialization.** `bringUpWorktreeEnv()` in `commands/run.ts`. Prefers `env.toml` via `env-spec/` (`loadEnvSpec` → `materialize` → `emit`); falls back to legacy `writeDockerEnv` when no `env.toml` exists. Output is `<worktree>/.env` consumed by docker-compose; the resolved `base` map is also returned for downstream URL resolution.
6. **Bruno env write.** When `[bruno_smoke].enabled`, `writeBrunoEnvFile()` writes `bruno/environments/crew-<key-lower>.bru` with `baseUrl` (resolved from `APP_URL` / docker ports) and (if configured) a `smokeUser` block. `CREW_BRUNO_ENV` is passed to the agent's env.
7. **`prepareAgentEnvironment` (fresh mode).** In `lib/run/agent-environment.ts`. Resolves the playwright app URL, starts docker bringup blocking-await in fresh mode (`startDockerBringup` → `await proc`), installs Chromium via `installPlaywrightBrowsers`, then runs `runPreflight(buildPreflightChecks(config))` — see Preflight below.
8. **MCP file write.** `writeMcpFile(worktree, { playwright?, chrome?, warn })` writes `<worktree>/.mcp.json` when `[playwright]` is enabled and smoke is on, **or** when `[visual_fidelity]` is configured (chrome-only is a valid configuration). The file carries a `playwright` server entry (when playwright wiring is on), a `chrome` server entry (when `[visual_fidelity]` is set — resolved from the `superpowers-chrome` plugin cache via `resolveSuperpowersChrome`, code under `lib/mcp-config/`), or both. A missing `superpowers-chrome` plugin emits exactly one yellow warning and omits the `chrome` entry; the dispatch continues. Order matters: write happens **after** `prepareAgentEnvironment` so the Chromium binary is on disk before `--executable-path` is resolved (CREW-70 regression bug — earlier writes captured a non-existent path and MCP silently fell back to system Chrome).
9. **Figma snapshot.** When `[visual_fidelity]` is configured: `runPreDispatchFigmaSnapshot(...)` exports `<worktree>/<snapshot_path>/` and then runs Plugin-API enrichment via a nested `claude -p` subprocess. Failures are non-fatal (returns `warning`); the visual-fidelity-check skill becomes a no-op rather than blocking dispatch.
10. **Skill injection.** `runSkillInjection(...)` copies dispatcher-managed skills (`<repo>/.claude/skills/<name>/`) into `<worktree>/.claude/skills/<name>/`. See Skills below.
11. **Build prompt.** `buildTicketPrompt({ key, githubRepo, jiraSite, playwright, brunoSmoke, visualFidelity, userMessage, dockerUnavailable })`. See Prompts below.
12. **Launch claude.** `execa('claude', ['--dangerously-skip-permissions','-p', prompt], { cwd: worktree, env: { ...childEnv, GH_TOKEN, CREW_APP_URL, PLAYWRIGHT_BASE_URL, CREW_BRUNO_ENV } })`. stdout/stderr both pipe to `/tmp/crew-run-<KEY>.log`. **stdin is `'ignore'`, not the file stream** — execa v9 rejects WriteStream stdio whose fd hasn't been assigned yet; the workaround pipes after spawn.
13. **Transcript discovery + stream.** `findNewestTranscript(claudeProjectDirFor(worktree))` polls for the first `.jsonl` to appear; once found, `streamTranscript(...)` tails it line-by-line through `tailTranscript` and renders each event via `parseToolCall` / `parseAssistantText`. Aborted via the `AbortController` when the claude process exits (with a 400ms drain delay).
14. **Daemon registration.** `crewDaemonClientFromEnv(process.env).registerRun({...})` / `completeRun(runId, ...)` brackets the streaming window so the dashboard can show the run.
15. **Post-run e2e gate.** `maybeRunE2eGate(...)` — see Verification gates below.

`crew fix-pr` skips steps 3–6 (worktree already exists), runs the slim `runResumePreflight` (only `verify-excluded-commands`), and dispatches via `spawnClaudeResume` instead of a fresh launch. The `runVerifyGate` resume path uses the same shape.

## Preflight

`buildPreflightChecks(config)` in `lib/preflight/build-checks.ts` is the dispatch table. Two checks today:

| Check                  | When                                                      | What it does                                                                                                                                                                                                                                      | Failure mode                                                      |
| ---------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `app-url-reachability` | `[docker]` + (`[playwright]` ∨ `[bruno_smoke]`)           | `probeUrl()` retries with exponential backoff against the resolved `app_url` / `base_url`.                                                                                                                                                        | Throws `PreflightError`; renders structured remediation; exits 1. |
| `excluded-commands`    | `[bruno_smoke].enabled` ∨ `[playwright].authored.enabled` | Compares `<worktree>/.claude/settings.json`'s `sandbox.excludedCommands` against required entries: `npm run bruno:smoke*`, `<test_command>*`, `docker compose*`. Exact string equality on the _committed_ entry vs the canonical `command*` form. | Throws `PreflightError`.                                          |

The `command*` glob shape is verified — `npm run test:e2e --workspace=...` and `... 2>&1 \| tail` both stay matched because `*` is a leading-substring rule. **Wrappers** (`cd ... &&`, `sh -c`, `npm --prefix`) break the match; the prompt's sandbox-network block (below) warns the agent about this.

In resume mode (`runResumePreflight`), only `verify-excluded-commands` runs and failures are warnings — Step 0 of the resume prompt re-rebases on `origin/main`, which pulls in any current `settings.json` and self-heals stale-worktree drift.

## Prompt builder

`lib/prompts/` is template-driven. `render(name, vars)` reads `lib/prompts/templates/<name>.md` and substitutes `{{var}}` placeholders. Every var must be passed — missing vars throw.

`buildTicketPrompt(opts)` in `lib/prompts/ticket.ts` composes the dispatch prompt by stitching these blocks into `templates/ticket.md`:

| Slot                     | Source                                                                             | Renders when                                                                                                      |
| ------------------------ | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `userMessageBlock`       | `lib/prompts/user-message.ts`                                                      | `-m` flag passed                                                                                                  |
| `dockerUnavailableBlock` | inline string in `ticket.ts`                                                       | docker daemon probe failed pre-dispatch                                                                           |
| `playwrightBlock`        | `templates/ticket-playwright-smoke.md` + `templates/ticket-playwright-authored.md` | `[playwright]` enabled (smoke/authored independently)                                                             |
| `brunoSmokeBlock`        | `templates/ticket-bruno-smoke.md`                                                  | `[bruno_smoke].enabled`                                                                                           |
| `sandboxNetworkBlock`    | `buildSandboxNetworkBlock` → `templates/sandbox-network-note.md`                   | bruno OR authored playwright present                                                                              |
| `visualFidelityBlock`    | `templates/ticket-visual-fidelity.md`                                              | `[visual_fidelity]` present                                                                                       |

The sandbox-network block is the load-bearing one for sandbox-aware behavior: it tells the agent which commands are crew-whitelisted (`excludedCommands`), and why a sandboxed `curl localhost:<port>` returns `ECONNREFUSED` (the sandbox has its own loopback, isolated from the host's). Edit `templates/sandbox-network-note.md` when adding a new whitelisted command.

The `verifyAfterRun` flag on `playwright.authored` adds the "Crew runs `<test_command>` externally" disclosure — telling the agent crew will run e2e from the host after handoff so it doesn't need to reach for tools that can't reach the docker stack from inside the sandbox.

`buildFixPrPrompt` (in `fix-pr.ts`) and `buildResumePrompt` (in `resume.ts`) share the same template engine but use different top templates (`fix-pr.md`, `resume.md`) tuned to the resume-with-feedback shape.

## Skills

crew owns three skills, committed in-repo at `<repo>/.claude/skills/<name>/` and version-controlled: `agents-doc-parity-check`, `bruno-collection-maintenance`, `visual-fidelity-check`. The list is the hardcoded `CREW_OWNED_SKILLS` constant in `lib/run/skill-injection.ts`, exposed via `crewOwnedSkills()`.

`runSkillInjection` (`lib/run/skill-injection-step.ts`) copies all three — unconditionally, on every dispatch — from `<repo>/.claude/skills/<name>/` into `<worktree>/.claude/skills/<name>/`. There is no per-skill config gate: each skill self-gates via its own `description`, so injecting a non-applicable one is harmless. Per-skill copy failures are non-fatal (the gate degrades naturally when the skill isn't present).

`runSkillInjection` also injects the plugin-sourced `browsing` skill — copied from the installed `superpowers-chrome` plugin cache (via `resolveSuperpowersChrome().skillsRoot`), **not** from `<repo>/.claude/skills/` — when the project has `[visual_fidelity]` set and the plugin resolves. `browsing` is deliberately absent from `CREW_OWNED_SKILLS`: it is borrowed from a plugin rather than owned by crew, has a different source root, and is gated on plugin presence. A failed or skipped `browsing` copy is non-fatal — `writeMcpFile` has already warned about a missing plugin (step 8), so the injection branch stays silent on that condition to avoid a double warning.

Claude Code discovers `.claude/skills/` natively (cwd-relative), so the injected skills are available to the dispatched agent with no prompt plumbing. The dispatch templates (`templates/ticket.md`, `templates/fix-pr.md`, `templates/resume.md`) list the three crew-owned skills as static required bullets in their `## Skills` section, alongside the `superpowers:*` skills.

Add a new crew-owned skill by:

1. Author the skill at `<repo>/.claude/skills/<name>/SKILL.md` (+ supporting files). Do this **interactively** — a `crew run` dispatch cannot write the current project's `.claude/skills/` (the command sandbox masks it read-only).
2. Add its name to `CREW_OWNED_SKILLS` in `lib/run/skill-injection.ts`.
3. Add it as a static bullet in the `## Skills` section of `templates/ticket.md`, `templates/fix-pr.md`, and `templates/resume.md`.
4. Add fixtures + tests at `lib/run/skill-injection.test.ts` and `lib/run/skill-injection-step.test.ts`.

## Figma snapshot

`runPreDispatchFigmaSnapshot` (in `lib/run/figma-snapshot-step.ts`) delegates to `runFigmaSnapshot` (in `commands/figma-snapshot.ts`). The pipeline:

1. **REST emit** (`figma-snapshot/emit.ts`): `FigmaRestClient` fetches per-page node trees and images; `emitSnapshot` writes `index.json` + per-component PNG/JSON files under `<worktree>/<visual_fidelity.snapshot_path>/`.
2. **Plugin-API enrichment** (`figma-snapshot/plugin-api-enrichment.ts`): spawns a nested `claude -p <enrichment_prompt>` subprocess (default 90s timeout) with no sandbox restrictions. The subprocess uses the figma-MCP Plugin API (the _REST_ API doesn't expose component property metadata or computed effects) to enrich each node's JSON in place. Output: a trailing JSON line on stdout containing `{ enrichedNodeCount, errors[] }`.

All failures are non-fatal — `runFigmaSnapshot` returns `{ ok: true, enrichment: { kind: 'warning' | 'skipped' } }` rather than throwing. The downstream visual-fidelity-check skill reads the snapshot from disk and degrades to "could not run" when the snapshot is incomplete.

`skip_snapshot=true` in `[visual_fidelity]` short-circuits both stages — useful for projects that have a manually-curated snapshot or for crew's own dogfooding before the snapshot pipeline is fully wired.

## Verification gates

**Pre-PR (visual-fidelity-pr-gate hook).** `packages/cli/scripts/hooks/visual-fidelity-pr-gate.sh`, wired into `<repo>/.claude/settings.json` as a `PreToolUse` hook on `Bash`. Fires only on `gh pr create*`. Walks the active session transcript for a `Skill` tool_use whose `input.skill` is `visual-fidelity-check`; blocks the PR if absent **and** the project has `.crew/visual-fidelity.json` (or `[visual_fidelity]` in any `.crew/*.toml`). Fail-closed: missing transcript / unreadable cwd → exit 2, surface warning. Edit when changing the visual-fidelity gating contract.

**Post-PR (e2e gate, `maybeRunE2eGate`).** When `[playwright].authored.verify_after_run = true`, after the agent's stream resolves, the host runs `<test_command>` from the worktree (`runVerifyGate` → `runTestCommand`). On non-zero exit, `runVerifyGateLoop` resumes the agent with the captured output (`spawnClaudeResume` + `buildFixPrPrompt`) up to `verify_max_attempts` retries. Pre-dispatch baseline check: `checkE2eBaseline` compares `~/.cache/crew/baselines/<project>` to `origin/<default_branch>` — gate disables if baseline is non-green, because a red baseline can't distinguish "agent broke it" from "main is broken".

Skip rules (in `computeGateSkip`): `verify_after_run=false`, `--skip-docker`, docker unavailable, zero commits ahead, or non-green baseline.

**Pre-PR (doc-parity-gate hook).** Planned for CREW-163 (Phase 3). Sibling shell hook to `visual-fidelity-pr-gate`; walks the diff and warns when a `.agents/<topic>.md`'s `covers:` glob overlaps a changed path without the doc being touched in the same commit. Not yet wired.

## Logs

| Path                              | Owner                         | Purpose                                                 |
| --------------------------------- | ----------------------------- | ------------------------------------------------------- |
| `/tmp/crew-run-<KEY>.log`         | `claudeProcess` stdout+stderr | Full claude session output (also printed at end of run) |
| `/tmp/crew-docker-<KEY>.log`      | `startDockerBringup`          | Background docker-compose output                        |
| `/tmp/crew-playwright-<KEY>.log`  | `installPlaywrightBrowsers`   | Chromium install output                                 |
| `/tmp/crew-verify-gate-<KEY>.log` | `runVerifyGate` resume        | Output of each gate-driven agent resume                 |

All paths constructed by helpers in `lib/run/paths.ts` — use those rather than rebuilding the strings.

## Failure modes worth knowing

- **Transcript never appears.** `findNewestTranscript` aborts when the claude process exits without writing a `.jsonl`. The orchestrator prints the captured log and exits with claude's rc. Common cause: claude failed to spawn (bad PATH, missing creds).
- **Docker bringup hangs.** Post-stream wait is capped at 120s. Beyond that, the run continues but `dockerFailed = true` disables the e2e gate.
- **`render()` throws "missing var '...'".** A template variable wasn't passed. Every slot in `ticket.md` must be in `buildTicketPrompt`'s call site — empty string is fine, missing is not.
- **Worktree dir already exists.** `requireWorktreeAvailable` fails fast before `git worktree add`. Run `crew restart <KEY>` or remove the dir.
- **Excluded-commands check rejects a settings.json.** The entry must be the canonical `command*` form (e.g. `npm run bruno:smoke*`) — `command` alone or `command **` will be rejected even when they'd work behaviorally. The check is exact-string.

## Pointers

Historical context — read when the above isn't enough:

- `docs/superpowers/specs/2026-05-03-agent-dispatch-preflight-design.md` — original preflight + structured-error design.
- `docs/superpowers/specs/2026-05-07-sandbox-limitations-and-docker-compose-exclusion-design.md` — `excludedCommands` glob shape, the empirical probe matrix, wrapper-defeated matches.
- `docs/superpowers/specs/2026-04-28-dynamic-skill-discovery-design.md` — the original dynamic-discovery design (`discoverSkills` / `renderDiscoveredSkillsBlock`). Superseded: that prompt-rendering half was removed once Claude Code's native `.claude/skills/` discovery was confirmed; see `docs/superpowers/specs/2026-05-15-skill-storage-and-agents-autoload-design.md`.
- `docs/superpowers/specs/2026-05-12-agent-visual-verification-design.md` — visual-fidelity-check skill + pre-dispatch snapshot pipeline.
- `docs/superpowers/specs/2026-05-13-figma-snapshot-plugin-api-enrichment-design.md` — REST+Plugin-API two-stage snapshot rationale.
- `docs/superpowers/specs/2026-05-13-visual-fidelity-skill-enforcement.md` — the PreToolUse hook design.
- `docs/superpowers/plans/2026-05-08-agent-shell-e2e-reliability.md` — sandbox-network note's empirical basis.
