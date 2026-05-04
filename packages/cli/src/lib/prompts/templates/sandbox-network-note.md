
## Sandboxed-curl is misleading

Your Bash tool runs in a sandbox with its own loopback, isolated from the host's. Direct `curl` / `wget` / Node `fetch` calls from your shell to **{{appUrl}}** will always return `ECONNREFUSED` — that is **not** evidence the stack is down. Crew has whitelisted {{whitelistedCommands}} to run un-sandboxed, and those are the only valid reachability tests for the docker stack.

If `npm run bruno:smoke` succeeds, that confirms the daemon is up — but it says nothing about the worktree app port. If `{{e2eCommand}}` fails with `ECONNREFUSED`, that's a real signal: the docker stack is not serving at the expected port. Investigate `/tmp/crew-docker-{{key}}.log` and consider `crew restart {{key}} --hard`.
