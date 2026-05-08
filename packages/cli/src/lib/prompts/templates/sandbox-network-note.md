
## Sandboxed-curl is misleading

Your Bash tool runs in a sandbox with its own loopback, isolated from the host's. Direct `curl` / `wget` / Node `fetch` calls from your shell to **{{appUrl}}** will always return `ECONNREFUSED` — that is **not** evidence the stack is down. Crew has whitelisted {{whitelistedCommands}} to run un-sandboxed, and those are the only valid reachability tests for the docker stack.

If `npm run bruno:smoke` succeeds, that confirms the daemon is up — but it says nothing about the worktree app port. If `{{e2eCommand}}` fails with `ECONNREFUSED`, that's a real signal: the docker stack is not serving at the expected port. Investigate `/tmp/crew-docker-{{key}}.log` and consider running `docker compose up --build --wait` from the worktree to bring the stack back up.

## Excluded-command matching is form-sensitive

Crew's whitelisted commands ({{whitelistedCommands}}) match `<repo>/.claude/settings.json`'s `excludedCommands` entries by glob. Entries use the form `command*` (e.g. `npm run test:e2e*`) — a leading-substring match where `*` accepts zero-or-more trailing chars. **Wrappers that prepend other commands break the match,** in which case the command runs sandboxed and won't reach host loopback even though it looks like it should.

To stay matched:

- **Run the bare command:** `npm run test:e2e` (not `cd packages/dashboard && npm run test:e2e`).
- **The `--workspace=crew-dashboard` flag is covered by the glob** — `command*` accepts trailing args. You can add it.
- **Shell pipes / redirects also ride along** — `npm run test:e2e --workspace=crew-dashboard 2>&1 | tail -25` still matches because the entry only constrains the leading bytes. Use them freely if helpful.
- **Don't wrap the command:** `cd <dir> && …`, `sh -c "…"`, and `npm --prefix <dir> run …` (instead of `npm run …`) all defeat the prefix match. If you need to switch directories, use the workspace flag instead.

A failed `{{e2eCommand}}` that produced `ECONNREFUSED` while the same flow worked via Playwright MCP is the signature of a wrapper-defeated match.
