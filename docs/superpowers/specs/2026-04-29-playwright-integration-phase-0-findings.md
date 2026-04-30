# Playwright integration — Phase 0 findings

> Empirical validation of the three load-bearing assumptions in the [Playwright integration spec](./2026-04-29-playwright-integration-design.md). Run on `2026-04-30` against `3e60f91`.

## Run context

These checks were executed inside an autonomous `crew run CREW-57` agent on the crew repo (worktree `~/Repos/crew-CREW-57`). The autonomous run is **not** itself inside a Claude Code sandbox — the crew worktree does not ship a `.claude/settings.json` enabling `sandbox.enabled`, so filesystem writes outside the repo and HTTPS to out-of-allowlist domains both succeed:

```
$ touch /home/safturento/.crew-57-write-test     # ~/ outside the repo
WRITE-OK
$ curl -s -o /dev/null -w 'HTTP=%{http_code}\n' https://example.com/   # not in any allowedDomains list
HTTP=200
```

That has two consequences for these findings:

1. P0.2 (filesystem writes triggered by Playwright launch) is fully observable — the question is OS-level and doesn't require sandbox enforcement.
2. P0.1 (does the Playwright MCP server work inside the sandbox?) and P0.3 (is loopback network exempt from `allowedDomains`?) cannot be conclusively answered from this run, because the run isn't sandboxed. Both record what _can_ be observed (server bootstrap, OS-level loopback) and flag the sandbox-specific portion as deferred to β's manual gate (plan Task 16).

## P0.1 — Does `mcp__playwright__*` work in the sandbox today?

**Outcome:** Bootstrap works outside the sandbox — server starts cleanly and advertises 24 tools. Inside-sandbox behavior **deferred** to β's manual gate.

**Evidence:**

Sent a hand-rolled JSON-RPC `initialize` + `tools/list` over stdio to `npx -y @playwright/mcp@latest --headless`:

```
{"result":{"protocolVersion":"2024-11-05","capabilities":{"tools":{}},"serverInfo":{"name":"Playwright","version":"1.60.0-alpha-2026-04-27"}},"jsonrpc":"2.0","id":1}
{"result":{"tools":[{"name":"browser_close",...},{"name":"browser_navigate",...},{"name":"browser_take_screenshot",...},...]}}
RC=0
```

Full tool list (truncated for brevity): `browser_close`, `browser_resize`, `browser_console_messages`, `browser_handle_dialog`, `browser_evaluate`, `browser_file_upload`, `browser_drop`, `browser_fill_form`, `browser_press_key`, `browser_type`, `browser_navigate`, `browser_navigate_back`, `browser_network_requests`, `browser_run_code`, `browser_take_screenshot`, `browser_snapshot`, `browser_click`, `browser_drag`, `browser_hover`, `browser_select_option`, `browser_tabs`, `browser_wait_for`, plus a couple more.

The server bootstraps without browser-install, system-libs, or sandbox-write errors because `tools/list` doesn't launch a browser — it just enumerates capabilities. Errors only surface when a tool that actually drives Chromium (`browser_navigate`, `browser_take_screenshot`) is invoked. That's where the spec's β phase becomes load-bearing: the new `npx playwright install chromium` preflight runs before the agent boots, so by the time MCP tool calls arrive, the binary + libs are in place.

The full sandbox-side test as written in the plan (dispatch `crew run KAN-<n>` with `[visual_testing]` enabled and watch tool calls) would require dispatching a parallel sandboxed agent against Recipes. From inside an autonomous crew run, that's not feasible — and Recipes' canonical worktree on `main` doesn't currently have any `[visual_testing]` config, `playwright.config.ts`, or `tests/e2e/` (KAN-35 is still in-flight as PR Recipes#29 and not yet merged).

**Spec impact:** None. No β amendments. Recommendation: when β's manual gate (plan Task 16) runs the first end-to-end flow, confirm there that MCP tool calls succeed against the freshly browser-installed cache. If they don't, fold the additional fix into a follow-up; the spec's architecture is unaffected.

## P0.2 — Does Playwright write to `~/.cache/ms-playwright` at launch?

**Outcome:** No. Playwright does not write to `~/.cache/ms-playwright` at launch time.

**Evidence:**

Snapshotted `~/.cache/ms-playwright` before and after a Playwright test run, using a minimal scratch project at `/tmp/crew-57-validation/p02/`:

```
$ find ~/.cache/ms-playwright -type f -printf '%T@ %s %p\n' | sort > before.txt
$ wc -l before.txt
601 before.txt
$ npx playwright test --reporter=list   # see launch failure below
$ find ~/.cache/ms-playwright -type f -printf '%T@ %s %p\n' | sort > after.txt
$ wc -l after.txt
601 after.txt
$ diff before.txt after.txt
(empty)
```

The cache is identical before and after. Two pieces of corroborating evidence:

1. **Playwright's launch command explicitly puts the writable user data dir under `/tmp`:**

   ```
   <launching> /home/safturento/.cache/ms-playwright/chromium_headless_shell-1217/chrome-headless-shell-linux64/chrome-headless-shell
       … --user-data-dir=/tmp/playwright_chromiumdev_profile-oN0twB --remote-debugging-pipe …
   ```

   Chromium's writable state (cookies, profile, devtools sockets) goes to a `/tmp/playwright_chromiumdev_profile-*` dir, not the cache. `/tmp` is already in the project's `.claude/settings.json` `allowWrite` list.

2. **The launch failed for an unrelated reason** — the host is missing `libnspr4.so` (see "Surprise finding" below). The failure happened at `dlopen` time, before the binary did any work. But that doesn't weaken the result: it confirms that the _Playwright orchestrator running in node_ also does not write to `~/.cache/ms-playwright` between `npx playwright test` starting and the binary `exec`-ing. Combined with the explicit `--user-data-dir` flag, the design's assumption holds.

**Spec impact:** None. No `allowWrite` addition for `~/.cache/ms-playwright` is needed in projects' `.claude/settings.json`. The §10.4 follow-up motivation that Phase 0 might surface ("crew owns settings.json") is **not** strengthened by P0.2.

## P0.3 — Does the sandbox allow loopback network?

**Outcome:** Loopback works at the OS level. Sandbox-policy-level test **deferred** to β's manual gate (same reason as P0.1).

**Evidence:**

```
$ curl -sk -o /dev/null -w 'HTTP=%{http_code} time=%{time_total}s\n' https://localhost:8489/
HTTP=200 time=0.816450s

$ curl -sk -o /dev/null -w 'HTTP=%{http_code} time=%{time_total}s\n' https://localhost/
HTTP=200 time=1.209518s

$ curl -s -o /dev/null -w 'HTTP=%{http_code} time=%{time_total}s\n' http://localhost:8089/
HTTP=308 time=0.001676s
```

`https://localhost:8489` is the recipes-kan-35 worktree's Caddy; `https://localhost` is canonical Recipes' Caddy on `:443`; `:8089` is the canonical-worktree HTTP redirect. All three loopback paths resolve and return.

The OS-level result is unsurprising. The interesting part of P0.3 is whether Claude Code's sandbox network policy (driven by `.claude/settings.json` `allowedDomains`) blocks `localhost`. From this autonomous run, that policy isn't engaged — the same `curl https://example.com/` returns HTTP 200 even though `example.com` is not in any `allowedDomains` list. So loopback's test against the actual sandbox is not observable here.

**Spec impact:** None pending. The assumption holds at the OS level, and the sandbox-policy-level test will be exercised the first time β runs an authored e2e flow inside a real sandboxed agent (plan Task 16). If it turns out blocked, the fix is the documented one-line addition (`localhost`, `127.0.0.1`) to `[sandbox] allowed_domains`.

## Surprise finding — host is missing Chromium system libs

While running P0.2 the launch failed with:

```
[pid=71502][err] /home/safturento/.cache/ms-playwright/chromium_headless_shell-1217/chrome-headless-shell-linux64/chrome-headless-shell:
  error while loading shared libraries: libnspr4.so: cannot open shared object file: No such file or directory
```

Direct check of the host:

```
$ ls /usr/lib/x86_64-linux-gnu/libnspr*
ls: cannot access '/usr/lib/x86_64-linux-gnu/libnspr*': No such file or directory
$ ls /usr/lib/x86_64-linux-gnu/libnss3*
ls: cannot access '/usr/lib/x86_64-linux-gnu/libnss3*': No such file or directory
$ ldconfig -p | grep -E 'libnspr4|libnss3|libatk' | head
	libatk-1.0.so.0 (libc6,x86-64) => /lib/x86_64-linux-gnu/libatk-1.0.so.0
	libatk-bridge-2.0.so.0 (libc6,x86-64) => /lib/x86_64-linux-gnu/libatk-bridge-2.0.so.0
```

This empirically validates the spec's §6.1 premise: the host's apt deps gap is real, not hypothetical, on at least this developer machine. KAN-35's "Chromium system libs missing" footnote is reproducible right now. The β phase's `crew/scripts/install.sh` apt block is therefore necessary, not just defensive.

**Spec impact:** none — §6.1 already prescribes the fix. The finding is logged here so β has a baseline expectation: after `install.sh` runs, this exact `libnspr4.so` failure should disappear, and a re-run of the P0.2 launch test (this time successful) is a useful Task 16 sanity check.

## Summary

The spec's three Phase 0 hypotheses survive empirical contact:

- **P0.1** — MCP server bootstraps fine; the in-sandbox tool-call test is deferred to β's manual gate, where it surfaces naturally.
- **P0.2** — Playwright does not write to `~/.cache/ms-playwright` at launch; runtime state goes to `/tmp/playwright_chromiumdev_profile-*` (already in `allowWrite`). No project-side settings.json change required.
- **P0.3** — Loopback works at OS level; sandbox-policy-level confirmation is deferred to β's manual gate.

The bonus finding is that the host actually is missing Chromium system libs, validating the §6.1 install.sh changes more strongly than expected.

No spec amendments needed. β can proceed as written.
