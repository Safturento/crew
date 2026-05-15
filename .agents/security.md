---
name: security
description: Secrets handling, sandbox model + known limitations
last_updated: 2026-05-14
covers:
  - '**/.env*'
  - '**/secrets/**'
  - '.claude/settings*.json'
---

# Security

## Secrets

Don't read files whose name contains `secret`, `secrets`, `credentials`, `token`, or `.env*`, or that you have reason to suspect contain secrets (private keys, API tokens, passwords). The rule applies to every tool that surfaces file contents (`Read`, `Bash` with `cat`/`head`/`tail`/`grep`, `Edit` against an unread file). Listing paths (`ls`, `find` without `-exec cat`) is fine.

If a task requires inspecting one, ask the user to paste the relevant lines with sensitive values masked. The only override is an explicit user instruction ("go ahead and read it", "open the secrets file"); don't infer authorization from the surrounding task.

Full rule + reasoning lives in the user-level `~/.claude/CLAUDE.md` "Secrets" section. Do **not** duplicate it here.

## Sandbox model

`crew run` / `crew fix-pr` / `crew finish` dispatches run the `claude` subprocess inside Claude Code's sandbox (bubblewrap-style on Linux/WSL2). The sandbox blocks operations that would let the agent affect the host beyond its worktree.

The crew wrapper itself runs un-sandboxed. Anything the wrapper does — port allocation, env materialization, daemon-client requests, transcript streaming — has full host access. The sandbox applies only once the dispatched `claude` subprocess starts.

The per-repo baseline lives in [`.claude/settings.json`](../.claude/settings.json):

- `sandbox.excludedCommands` — commands that bypass the sandbox entirely (host loopback, docker socket).
- `sandbox.network.allowedDomains` — HTTPS allowlist for outbound calls.
- `sandbox.filesystem.allowWrite` — extra write paths beyond the worktree.

## Workaround-able restrictions

These can be loosened per-project via `.claude/settings.json` entries. Each row names the operation that fails sandboxed, the setting that loosens it, and the entry shape.

| Operation                                                          | Setting                          | Entry                    | Why required                                                                                                                |
| ------------------------------------------------------------------ | -------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Host loopback HTTP from `npm run bruno:smoke`                      | `sandbox.excludedCommands`       | `"npm run bruno:smoke*"` | Bruno hits the worktree app port; sandboxed `bwrap --unshare-net` isolates loopback.                                        |
| Host loopback HTTP from `npm run test:e2e`                         | `sandbox.excludedCommands`       | `"npm run test:e2e*"`    | Playwright e2e hits the worktree app port; same isolation issue.                                                            |
| Docker socket (`/var/run/docker.sock`)                             | `sandbox.excludedCommands`       | `"docker compose*"`      | Step 0.5 of fix-pr brings up the stack; sandbox blocks the socket. The trailing `*` covers `up`, `down`, `logs`, `ps`, etc. |
| Anthropic / GitHub / Atlassian / npm registry HTTPS                | `sandbox.network.allowedDomains` | hostname per call site   | Sandboxed agents need these for their own tooling (Claude API, MCP servers, gh CLI, npm install).                           |
| Writes under `~/.npm`, `~/.cache/node`, `~/.cache/claude*`, `/tmp` | `sandbox.filesystem.allowWrite`  | path                     | npm install + Claude Code internals write here.                                                                             |

Entries use the verified glob form `command*` (prefix + zero-or-more trailing chars) so flag/wrapper variants like `npm run test:e2e --workspace=...` and shell pipes like `... 2>&1 | tail -25` still bypass the sandbox. The wrapper-side preflight check ([`packages/cli/src/lib/preflight/verify-excluded-commands.ts`](../packages/cli/src/lib/preflight/verify-excluded-commands.ts)) enforces an exact-string match against canonical entries; a project that commits a stricter (longer) entry works at runtime but the preflight fails until the canonical entry is used.

## Hard limits

Enforced by Claude Code's hardcoded checks regardless of `settings.json`. Cannot be loosened per-project. If the agent needs the operation, route it through the un-sandboxed wrapper or skip and surface the gap.

- **Writes anywhere under `~/.claude/`.** Blocked even with `--dangerously-skip-permissions`. User-level skill files, global `CLAUDE.md`, and global `settings.json` must be authored manually, not via `crew run`.
- **Writes to in-worktree `.claude/settings.json`.** Same hardcoded protection extends to repo-level `.claude/`. The agent cannot fix a missing `excludedCommands` entry from inside its own session — that's why `verify-excluded-commands` lives wrapper-side and runs before spawn (`runResumePreflight` for `fix-pr`, `runPreflight` for `crew run`).

## Refuse to clobber generated files

Files crew generates (per-worktree `bruno/environments/<env>.bru`, per-worktree docker `.env`, prompt-template renderings) carry a `# generated by crew` header. **Never overwrite a file with that header without preserving the marker, and never delete one without an explicit user instruction.** The marker is the contract — if a file in a generated path lacks it, treat it as user-owned and ask before touching.

## When designing a new agent prompt

If the prompt asks the agent to run a host-level operation (Unix socket, system service, exclusive port, path outside the worktree):

1. Check the workaround-able table — is there already an entry for this class of operation? If yes, ensure the project has it (`verify-excluded-commands` should require it).
2. If no entry exists, add one to the table above. Then add the corresponding clause to `requiredEntries(config)` in [`packages/cli/src/lib/preflight/verify-excluded-commands.ts`](../packages/cli/src/lib/preflight/verify-excluded-commands.ts) so the preflight enforces it.
3. If the operation is in **hard limits**, the agent cannot do it. Route through the wrapper or design the prompt to abort + document.
4. If none of the above and the agent hits permission errors at runtime, document the new restriction here first, then design the fix.

## When you discover a new restriction

Signal: an agent reports an environmental error mid-run for an operation the wrapper used to handle. Add a row to the workaround-able table (or the hard-limits list) in the same PR that fixes the symptom. The doc is the durable artifact; the fix is incidental to it.
