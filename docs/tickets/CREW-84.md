# CREW-84 — Check 1: app-URL reachability probe

Jira: https://safturento.atlassian.net/browse/CREW-84

## Goal

Implement Check 1 of the agent-dispatch preflight (CREW-82): a host-side
reachability probe that runs after docker bringup completes and before
`claude` spawns. Probes `[playwright].app_url` and `[bruno_smoke].base_url`
with self-signed-cert tolerance and exponential-backoff retries, throws a
structured `PreflightError` on failure pointing at the bringup log + the
`crew restart <KEY> --hard` remediation.

## Relevant files

- `packages/cli/src/lib/preflight/probe-url.ts` — single-URL probe with
  retries, undici Agent for TLS tolerance, fetch HEAD per attempt.
- `packages/cli/src/lib/preflight/probe-app-urls.ts` — Check 1 itself:
  per-URL skip rules and structured `PreflightError` shape.
- `packages/cli/src/lib/preflight/build-checks.ts` — registers the check
  when `[docker]` + (`[playwright]` or `[bruno_smoke]`) is configured.
- `packages/cli/src/lib/run/agent-environment.test.ts` — defaults
  `buildPreflightChecks` to `[]` in `beforeEach` so existing fixtures
  with placeholder URLs don't trigger a real fetch.
- `packages/cli/package.json` — adds `undici` as a direct dep.

## Decisions

- **Add `undici` as a direct dep of `crew-cli`** — the plan claimed it was
  "already a transitive dep via Node's native fetch," but `node:undici` is
  bundled into Node's runtime and not exposed as a regular import.
  `import { Agent } from 'undici'` only works because `undici` is hoisted
  into the workspace by `dashboard/jsdom` and `bruno/cheerio`. Relying on
  that hoist is fragile — declaring it explicitly costs nothing.

- **Default-stub `buildPreflightChecks` in agent-environment tests** —
  pre-existing fixtures use placeholder URLs like `'http://x'`. With Check 1
  registered, `prepareAgentEnvironment` would now `fetch('http://x')` and
  burn 31s of exponential backoff per affected test. Stubbing the registry
  to `[]` in `beforeEach` keeps those tests behavior-focused; the two
  preflight-integration tests already override the stub with their own spy.

- **Use `fetch` with undici dispatcher rather than HTTPS directly** — same
  approach as the plan. Lets us use one code path for HTTP + HTTPS, lets
  Node's native fetch handle redirects, and the `// @ts-expect-error` for
  the dispatcher option is a known pattern elsewhere.

## Notes

- Tasks 5–8 of `docs/superpowers/plans/2026-05-03-agent-dispatch-preflight.md`
  (plan lives on `docs/agent-dispatch-preflight` branch).
- Task 8 (manual smoke) was not run as part of this autonomous dispatch —
  it requires interactive verification against a project fixture (Recipes)
  with an intentionally broken stack. Flagged in the PR for follow-up.
