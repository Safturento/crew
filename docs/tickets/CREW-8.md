# CREW-8 — `crew list` + `crew status` (read-only views)

Jira: https://safturento.atlassian.net/browse/CREW-8

## Goal

Two CLI subcommands that surface what agent sessions exist on disk without
hand-grepping JSONL files:

- `crew list [--all] [--running] [--project <name>]` — table of sessions for the
  active project (or `--project <name>`).
- `crew status <KEY> [--project <name>]` — detailed panel for the most recent
  session whose `gitBranch == <KEY>` (or whose worktree matches `<KEY>`).

Phase 1: read transcripts directly from `~/.claude/projects/*/`. Phase 2 will
swap to a daemon API; the surface stays the same.

## Relevant files

- `packages/cli/src/lib/transcripts/types.ts` — add the top-level `gitBranch`,
  `cwd`, `sessionId` fields that real Claude Code transcripts carry.
- `packages/cli/src/lib/sessions/discovery.ts` (new) — scan
  `~/.claude/projects/*/` for sessions whose path matches a registered repo
  (the repo itself or sibling `<basename>-<KEY>` worktrees), parse each into a
  `SessionSummary` (mtime, tool count, output-token total, branch, last tool
  call, running heuristic).
- `packages/cli/src/lib/sessions/status.ts` (new) — turn a transcript into a
  detailed status view: full timeline, token totals broken down by tool,
  runtime, current step, and supporting paths.
- `packages/cli/src/commands/list.ts` (new) — wraps `listSessionsForRepo`,
  applies `--all` / `--running` filters, renders a table (`cli-table3`).
- `packages/cli/src/commands/status.ts` (new) — wraps `getSessionStatus`, fetches
  PR URL via the existing `getPrForBranch`, prints a status panel.
- `packages/cli/src/index.ts` — wire the two new commands.

## Decisions

- **Match worktrees by encoded prefix.** A repo at `/home/u/Repo` and any
  sibling worktree `Repo-<KEY>` both encode to a project directory beginning
  with `-home-u-Repo`. Treating that as a prefix catches the main repo and all
  per-ticket worktrees in one pass without the loader having to enumerate
  `git worktree list`.
- **"Running" heuristic = recent mtime.** Phase 1 has no daemon to ask.
  `pgrep -f <sessionId>` doesn't reliably hit the `claude` process (sessionId
  isn't in argv). The `last-prompt` event we initially considered turns out
  to be written on every turn (it's a resume marker), not at session end —
  so it can't gate "is this still running?". mtime within the last 60s is the
  pragmatic choice: false positives only happen for sessions edited
  concurrently for some other reason, which is fine for a read-only listing.
- **`--all` window: last 24h.** Matches the ticket spec ("from the past day").
  The default view is "running + last 5 finished by mtime".
- **`KEY` derivation = the `gitBranch` field.** Don't try to parse the worktree
  basename; the branch is recorded in every transcript event.
- **Use the existing `cli/src/lib/` location.** `shared/` extraction is a
  Phase 1.5 task; per the architecture plan we don't move things until the
  daemon needs them.
- **Skip the docker-stack URL in `crew status` (Phase 1).** The `appUrl` is in
  `.env`, but that file may not exist for `--skip-docker` runs and parsing it
  back out is out-of-scope churn for a read-only view. Surface the
  worktree path; the user can hop in and run docker themselves.

## Open questions

None.

## Notes

Real Claude Code transcripts carry `cwd` and `gitBranch` as top-level fields on
every assistant/user/system event (verified against
`~/.claude/projects/-home-safturento-Repos-Recipes-App-KAN-23/*.jsonl`).
Existing fixture `packages/cli/test/fixtures/transcript-sample.jsonl` lacks
these, so the discovery module's tests build their own fixtures with
`gitBranch` populated.

**Workflow note:** the CREW Jira board only has To Do / In Progress / Done
transitions — there is no "In Review" status to flip to after the PR is
opened. The branch is left In Progress; PR is the source of truth.
