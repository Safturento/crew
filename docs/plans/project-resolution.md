# Project resolution from any directory

> **Status:** Stub. Context is real; options/recommendation/implementation are sketched and need fleshing out before this drives any code.

## Context

A CLI that operates against multiple registered projects has to answer one question on every invocation: *which project is this command for?* Two common signals:

1. **The current working directory** — if cwd lives inside a registered project's tree, that's the project.
2. **An identifier the user passes** — typically a ticket key (`ABC-123`), where the prefix maps to a project's tracker key.

Tools that rely solely on (1) force the user to `cd` before every command, which is fine when work is project-bound but breaks down the moment a non-cwd surface needs to invoke the same operations — for example, a web dashboard, a global hotkey, a cron job, or an editor integration. Those callers don't have a "current project" in the cwd sense; they have a ticket and need the tool to figure out the rest.

Once a tool grows a dashboard or any non-CLI entry point, project resolution can no longer be cwd-implicit. Either the cwd path becomes one signal among several, or it gets replaced entirely by an explicit project identifier on every command. Picking the right blend early avoids re-plumbing every subcommand later.

> **Project-specific:** crew today auto-discovers the project by walking up from cwd to find a registered `repo_path` (see `docs/plans/architecture.md` line 167), and *errors out* when the cwd-detected project doesn't match the ticket's tracker key. The triggering incident: running `crew run <KAN-ticket>` from inside the `crew` repo failed with a wrong-project error instead of just resolving `KAN-` to the recipes-app project. The Phase 3 dashboard will trigger the same operations (`run`, `fix-pr`, `finish`, `status`) from a process that has no meaningful cwd. Between the friction today and the dashboard's needs tomorrow, the CLI should support project-by-ticket *now* so the dashboard inherits a working code path instead of a parallel one.

## Options considered

### A. Extract project from the ticket key prefix

Every ticket key is `<TRACKER_KEY>-<num>` (`KAN-23`, `CREW-9`). Each project's config already declares its tracker key. Lookup is a hash from tracker key → project config.

- **Pros:** Zero extra arguments. Most subcommands already take a ticket key, so resolution is free. Same code path works from any cwd and from non-CLI callers.
- **Cons:** Requires tracker keys to be unique across registered projects (likely true in practice but not enforced). Subcommands that don't take a ticket key (`crew daemon status`, `crew list`) need a different signal.

### B. Explicit `--project <name>` flag, required when not in a registered repo

User passes `--project recipes-app` when outside the repo; cwd auto-detect kicks in when inside.

- **Pros:** Unambiguous. Works for every subcommand uniformly, including ones without a ticket key.
- **Cons:** Verbose for the common case. Two resolution paths (cwd-based and flag-based) means two sets of edge cases.

### C. Default project in per-user config, override via flag or cwd

`~/.config/crew/config.toml` declares `default_project = "recipes-app"`. Cwd or `--project` overrides.

- **Pros:** Cheap for solo devs who mostly work on one project. No flag noise in the common case.
- **Cons:** Magic. The project a command runs against depends on hidden state. Easy to footgun when juggling two projects.

### D. Hybrid: ticket-key resolution + cwd + explicit flag, in priority order

`--project` wins; otherwise extract from ticket key if present; otherwise fall back to cwd auto-detect; otherwise error with a list of registered projects.

- **Pros:** Each signal handles its natural case. CLI users in-repo get today's behavior unchanged. Non-CLI callers (dashboard, scripts) get a deterministic flag path. Ticket-key inference covers the "I'm in a different repo and want to run a quick command" case without typing a flag.
- **Cons:** Three resolution paths to document and test. Precedence has to be obvious or it confuses users.

## Recommendation by context

> TODO — write up which option fits which context (single-project vs multi-project, solo vs team, CLI-only vs CLI+UI).

Initial leaning: **D (hybrid)** for any tool that already supports cwd-based resolution and is adding a non-CLI entry point. **A (key prefix)** is enough if the tool is greenfield and every command takes a key.

## Chosen approach

> TODO — pick one and explain the reasoning that tipped it for this project.

> **Project-specific:** Likely D, because crew already has cwd auto-discover working and we don't want to break the muscle memory of `crew run KAN-23` from inside `Recipes-App/`. The dashboard's calls would always pass `--project` (or its API equivalent), and ad-hoc CLI use from a different repo would lean on the ticket-key prefix.

## Implementation outline

> TODO — flesh out once chosen approach is locked.

Rough sketch:

1. **Project registry lookup helper** in `shared/config/` (currently `cli/src/lib/config/`): given a ticket key, return the matching project config; given a `--project` name, ditto. Surface a single `resolveProject({ key?, projectName?, cwd? })` entry point so subcommands don't each reinvent precedence.
2. **Audit subcommands.** Every command that today assumes cwd needs to call `resolveProject` instead. Some take a ticket key already (`run`, `fix-pr`, `finish`, `status`); some don't (`list`, `daemon status`).
3. **Error messaging.** When resolution fails, list registered projects with their tracker keys so the user can pick the right one.
4. **Dashboard contract.** The daemon's REST API takes `project` as an explicit field on every request that needs one; the CLI's resolver and the daemon's resolver share the same `shared/` helper.
5. **Tests.** Unit-test the resolver with each precedence case (flag-only, key-only, cwd-only, conflicts, none).

## Verification

> TODO

Smoke-test ideas:

- `cd /tmp && crew run KAN-23` — resolves to `recipes-app` via tracker key.
- `cd ~/Repos/crew && crew status CREW-9` — resolves to `crew` via cwd.
- `crew --project recipes-app list` — explicit flag works from anywhere.
- Ambiguous case (two projects share a tracker key) — fails loudly with a list.
- Dashboard `POST /agents { project, key }` ends up in the same `resolveProject` path.

## Non-goals

- **Discovering projects automatically.** Projects must still be registered explicitly via their TOML config. This plan is about resolution, not discovery.
- **Cross-project commands.** No `crew list --all-projects` aggregation in this plan; that's a separate decision.
- **Ticket-key syntax changes.** Tracker keys remain `<KEY>-<num>` exactly as Jira issues them.

## Forward path

If the registry grows past a handful of projects, add a `crew projects` subcommand to list/inspect/select. If tracker-key collisions become real (two clients both using `KAN`), introduce a per-project alias prefix or require `--project` when ambiguous. The resolver's single-entry-point design means those changes land in one place.
