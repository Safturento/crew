# Sandbox limitations

When `crew run` / `crew fix-pr` / `crew finish` dispatches an agent, the agent runs inside Claude Code's sandbox (bubblewrap-style on Linux/WSL2; see Claude Code's docs for the host-level model). The sandbox blocks operations that would otherwise let an agent affect the host beyond its worktree. This doc catalogs the limitations we've hit so the next agent-prompt design doesn't relitigate them.

The wrapper itself runs un-sandboxed. Anything the wrapper does — port allocation, `.env` materialization, docker bringup pre-CREW-113, daemon-client requests, transcript streaming — has full host access. The sandbox only applies once the dispatched `claude` subprocess starts.

## Workaround-able restrictions

These can be loosened per-project via entries in `<repo>/.claude/settings.json`. Each row names the operation that fails sandboxed, the setting that loosens it, and the entry shape.

| Operation                                                          | Setting                          | Entry                       | Why required                                                                                                                     |
| ------------------------------------------------------------------ | -------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Host loopback HTTP from `npm run bruno:smoke`                      | `sandbox.excludedCommands`       | `"npm run bruno:smoke"`     | Bruno hits the worktree app port; sandboxed `bwrap --unshare-net` isolates loopback.                                             |
| Host loopback HTTP from `npm run test:e2e`                         | `sandbox.excludedCommands`       | `"npm run test:e2e"`        | Playwright e2e hits the worktree app port; same isolation issue.                                                                 |
| Docker socket (`/var/run/docker.sock`)                             | `sandbox.excludedCommands`       | `"docker compose"` (prefix) | Agent's Step 0.5 (CREW-113) brings up the stack; sandbox blocks the socket. Prefix entry covers `up`, `down`, `logs`, `ps`, etc. |
| Anthropic / GitHub / Atlassian / npm registry HTTPS                | `sandbox.network.allowedDomains` | hostname per call site      | Sandboxed agents need these for their own tooling (Claude API, MCP servers, gh CLI, npm install).                                |
| Writes under `~/.npm`, `~/.cache/node`, `~/.cache/claude*`, `/tmp` | `sandbox.filesystem.allowWrite`  | path                        | npm install + Claude Code internals write here.                                                                                  |

`excludedCommands` accepts prefix-style entries at runtime — a list entry of `"docker compose"` matches `docker compose up --build --wait`, `docker compose down`, etc. The wrapper-side `verify-excluded-commands` check in `packages/cli/src/lib/preflight/verify-excluded-commands.ts` enforces an _exact-string_ match against the canonical entries it requires; if a project commits a stricter (longer) entry, the runtime works but the preflight check fails until the canonical entry is used.

## Hard limits

These are enforced by Claude Code's hardcoded checks regardless of `settings.json`. They cannot be loosened per-project; if the agent needs the operation, the design has to route around it (typically by having the un-sandboxed wrapper do the work and pass the result through, or by skipping the operation entirely and surfacing the gap to the user).

- **Writes to `~/.claude/**`.** Blocked even with `--dangerously-skip-permissions`. User-level skill / global CLAUDE.md edits / global settings.json tweaks must be authored manually, not via `crew run`. Source: user-level `CLAUDE.md` "Don't ticket — handle manually" section.
- **Writes to in-worktree `.claude/settings.json`.** Same protection extends to repo-level `.claude/`. The agent likely cannot fix a missing `excludedCommands` entry from inside its own session — that's why `verify-excluded-commands` lives wrapper-side and runs _before_ spawn (in `runResumePreflight` for fix-pr and `runPreflight` for crew run).

## When you're designing a new agent prompt

If the prompt asks the agent to run a host-level operation (anything that touches a Unix socket, a system service, an exclusive port, or a path outside the worktree):

1. Check the workaround-able table — is there already an entry for this class of operation? If yes, ensure the project has it (the `verify-excluded-commands` preflight should require it).
2. If no entry exists, add one to the table. Then add the corresponding clause to `requiredEntries(config)` in `packages/cli/src/lib/preflight/verify-excluded-commands.ts` so the preflight enforces it.
3. If the operation is in the hard-limits list, the agent **cannot** do it. Route the operation through the wrapper instead, or design the prompt to abort + document.
4. If the operation is none of the above and the agent is hitting permission errors at runtime — that's the signal to first document the new restriction here, _then_ design the fix.

## When you discover a new restriction

The signal is usually "agent reports an environmental error mid-run and the operation worked fine when the wrapper used to do it." Add a row to the table in the same PR that fixes the symptom. The doc is the durable artifact; the fix is incidental to it.
