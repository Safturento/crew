# CREW-227 — T4: Remaining health checks (machine + scaffold)

Jira: https://safturento.atlassian.net/browse/CREW-227
Parent Epic: [CREW-223](https://safturento.atlassian.net/browse/CREW-223) — crew init / crew doctor

## Goal

Complete the `lib/health/` check inventory beyond the P1 seed checks (`config-valid`,
`env-materialized`). Six new `HealthCheck`s, each added to `registry.ts`'s `ALL` array,
each unit-tested for detect (ok/warn/fail) and — where present — `fix()` idempotency.

This is **Phase 3** of the plan (`docs/superpowers/plans/2026-06-05-crew-init-doctor.md`).

## Scope (the six checks)

| Check | Scope | detect | fix |
| --- | --- | --- | --- |
| `playwright-config` | project | when `playwright` opted-in, require `playwright.config.ts` + `tests/e2e/` | `scaffoldPlaywright` (T2) |
| `chromium-installed` | machine | when playwright opted-in, Playwright Chromium present | `npx playwright install chromium` — **confirm-gated** |
| `bruno-skeleton` | project | when `bruno_smoke` opted-in, require `bruno/` collection | `scaffoldBruno` (T2) |
| `docker-socket` | machine | `docker info` reachable | none |
| `apt-deps` | machine | required apt packages present; **skip gracefully** (ok+note) off-apt | report-only (never sudo non-interactively) |
| `baseline-present` | project, **warn-level** | `AGENTS.md` + `.agents/` exist; **warn** never fail | none |

## Relevant files

- `packages/cli/src/lib/health/checks/` — the new check modules land here
- `packages/cli/src/lib/health/registry.ts` — append the six to `ALL` (conflict point w/ T3 — merge sequentially)
- `packages/cli/src/lib/init/scaffold-playwright.ts`, `scaffold-bruno.ts` — single-source scaffolders the fixes reuse (T2)
- `packages/cli/src/lib/run/agent-environment.ts`, `lib/mcp-config/install-browsers.ts` — `installPlaywrightBrowsers` (`npx playwright install chromium`); `lib/mcp-config/mode-flags.ts` `playwrightEnabled`
- `packages/cli/src/lib/docker/daemon-reachable.ts` — `dockerDaemonReachable` reused by `docker-socket`

## Decisions

- **Factory-with-default-deps for host-probing machine checks** — `docker-socket`, `chromium-installed`,
  `apt-deps` probe the host, which is non-deterministic in unit tests. Each exports a
  `create<Name>Check(deps = {})` factory (deps default to the real probes) plus a default
  instance `export const <name> = create<Name>Check()`. The registry imports the default;
  tests drive the factory with injected fakes. Avoids global `vi.mock('execa')` and keeps
  detect/fix pure for testing. Project (fs-based) checks need no injection — they read real
  files under `ctx.worktree` (tmpdir in tests).
- **`chromium-installed` fix is confirm-gated via an injectable `confirm` dep** — defaults to an
  interactive `@inquirer/prompts` confirm. `fix()` installs only when confirm resolves `true`;
  otherwise no-ops. The `--yes`/non-interactive wiring is the doctor command's concern (CREW-228);
  the factory makes it swappable. Spec §8 lean: gate large/network fixes even under `--fix`.
- **"opted-in" derivation** — playwright has no `enabled` flag in the schema; use
  `playwrightEnabled(config)` (`playwright.smoke?.enabled || playwright.authored?.enabled`).
  Bruno uses `config.bruno_smoke?.enabled` (schema `z.literal(true)`).
- **`apt-deps` skips gracefully off-apt** — returns `ok` with a note when `apt-get` isn't on PATH
  (spec §8 lean). Never runs `sudo` non-interactively; fix is report-only.

## Notes

- Blocked-by T1 (registry core) — merged into base. T2 scaffolders — merged into base.
- Shares `registry.ts` with T3 (preflight migration); build parallel, merge sequentially.
- Out of scope: the `doctor`/`init` commands (T5/T6) and the preflight adapter (T3).
