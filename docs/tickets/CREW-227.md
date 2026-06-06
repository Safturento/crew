# CREW-227 — T4: Remaining health checks (machine + scaffold)

Jira: https://safturento.atlassian.net/browse/CREW-227
Parent Epic: [CREW-223](https://safturento.atlassian.net/browse/CREW-223) — crew init / crew doctor

## Goal

Complete the `lib/health/` check inventory beyond the P1 seed checks (`config-valid`,
`env-materialized`). Six new `HealthCheck`s, each added to `registry.ts`'s `ALL` array,
each unit-tested for detect (ok/warn/fail) and — where present — `fix()` idempotency.

This is **Phase 3** of the plan (`docs/superpowers/plans/2026-06-05-crew-init-doctor.md`).

## Scope (the six checks)

| Check                | Scope                   | detect                                                                    | fix                                                   |
| -------------------- | ----------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------- |
| `playwright-config`  | project                 | when `playwright` opted-in, require `playwright.config.ts` + `tests/e2e/` | `scaffoldPlaywright` (T2)                             |
| `chromium-installed` | machine                 | when playwright opted-in, Playwright Chromium present                     | `npx playwright install chromium` — **confirm-gated** |
| `bruno-skeleton`     | project                 | when `bruno_smoke` opted-in, require `bruno/` collection                  | `scaffoldBruno` (T2)                                  |
| `docker-socket`      | machine                 | `docker info` reachable                                                   | none                                                  |
| `apt-deps`           | machine                 | required apt packages present; **skip gracefully** (ok+note) off-apt      | report-only (never sudo non-interactively)            |
| `baseline-present`   | project, **warn-level** | `AGENTS.md` + `.agents/` exist; **warn** never fail                       | none                                                  |

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

## Open questions

- [ ] **BLOCKED: cannot rebase `CREW-227` onto `origin/main` inside this dispatched worktree —
      `.claude/settings.json` is a read-only bind mount that `origin/main` has diverged.**
      A fix-pr session was asked to rebase onto `origin/main` (which gained T3 / CREW-226 PR #327
      and the doc-parity-gate cleanup PR #323) and apply review feedback. The rebase cannot run:
  - `origin/main` (commit `ea78680`, PR #323) **removed 4 lines** from `.claude/settings.json`
    (the `doc-parity-gate.sh` hook registration). Rebasing therefore requires git to rewrite the
    worktree's `.claude/settings.json`.
  - In this worktree, `.claude/settings.json` is a **read-only bind mount** (`/proc/mounts`:
    `/dev/sdd … .claude/settings.json ext4 ro,…`). Any `unlink`/replace of it fails with
    `Device or resource busy`, so `git rebase` aborts at the "detach HEAD" checkout.
  - Workarounds attempted and ruled out: `git update-index --skip-worktree` (dropped when rebase
    resets the index to `origin/main`, so the write is re-attempted); `sparse-checkout` (enabling
    it must itself remove the mounted file → same `unlink` failure); a secondary writable worktree
    (the final step still has to move _this_ live worktree's `settings.json` → same RO-mount write).
    Every rebase/merge path requires materializing `origin/main`'s `settings.json` into the worktree,
    which the RO mount forbids. This is a **crew-setup gap**, not a code conflict — aborted cleanly,
    nothing pushed, no review feedback applied (there was no inline feedback beyond "rebase and push").
  - **The only real content conflict is `registry.ts`** — and the rebase is otherwise clean.
    **Verified** on 2026-06-05 by replaying all 10 branch commits onto `origin/main` (`ebbac6f`) in a
    throwaway worktree under `/tmp` (where `settings.json` is writable). Result: `registry.ts` was the
    _only_ conflict (once per check commit); `git diff origin/main..rebased` is exactly this branch's
    15 files (+888/−2, no cross-contamination); and on the rebased tree **`npm run lint` ✓,
    `npm run typecheck` ✓, and `crew-cli` tests pass 831/1-skip (all 14 `health/` files, 75 tests)**.
    Rebased tip in that throwaway worktree was `213fcaf` (worktree since removed; ref not moved).
  - **The resolved `registry.ts` (the union to apply during the local rebase):**

    ```ts
    import type { HealthCheck } from './types.js';
    import { configValid } from './checks/config-valid.js';
    import { envMaterialized } from './checks/env-materialized.js';
    import { excludedCommands } from './checks/excluded-commands.js'; // from T3 (CREW-226)
    import { appUrlResolves } from './checks/app-url-resolves.js'; // from T3 (CREW-226)
    import { playwrightConfig } from './checks/playwright-config.js';
    import { brunoSkeleton } from './checks/bruno-skeleton.js';
    import { baselinePresent } from './checks/baseline-present.js';
    import { dockerSocket } from './checks/docker-socket.js';
    import { aptDeps } from './checks/apt-deps.js';
    import { chromiumInstalled } from './checks/chromium-installed.js';

    const ALL: HealthCheck[] = [
      configValid,
      envMaterialized,
      excludedCommands,
      appUrlResolves,
      playwrightConfig,
      brunoSkeleton,
      baselinePresent,
      dockerSocket,
      aptDeps,
      chromiumInstalled,
    ];
    ```

  - **Resolution for the user / harness (pick one):** (a) rebase `CREW-227` onto `origin/main`
    locally outside the sandbox, apply the `registry.ts` union above, and `git push --force-with-lease`
    (verified clean — should be a 2-minute mechanical resolution); or (b) have the fix-pr harness
    mount `.claude/settings.json` read-write (or skip mounting it) when the target branch has diverged
    that file; or (c) have the harness refresh the mounted `settings.json` to `origin/main`'s content
    before dispatch so the rebase is a no-op for it.

## Notes

- Blocked-by T1 (registry core) — merged into base. T2 scaffolders — merged into base.
- Shares `registry.ts` with T3 (preflight migration); build parallel, merge sequentially.
- Out of scope: the `doctor`/`init` commands (T5/T6) and the preflight adapter (T3).
