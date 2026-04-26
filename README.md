# crew

CLI + dashboard for orchestrating Claude Code agents on tickets.

Started as a pile of bash scripts under `Recipes-App/scripts/` — `run-ticket.sh`, `fix-pr.sh`, `finish-ticket.sh`, etc — that grew into something complicated enough to deserve its own home.

## What it does

You hand `crew` a Jira ticket key. It:

- Sets up a fresh git worktree for the branch
- Generates per-worktree docker config so multiple stacks coexist
- Hands off to a sandboxed Claude Code agent with a self-contained prompt: pull the ticket, plan, implement, verify, push, open a PR, transition Jira
- Surfaces live progress via a CLI watcher and (eventually) a web dashboard
- Handles the post-merge cleanup with one command

The agent runs unattended. You watch the dashboard, review the PR, leave comments, run `crew fix-pr` to apply feedback, merge, run `crew finish` to clean up.

## Status

Pre-MVP. See [`docs/plans/architecture.md`](./docs/plans/architecture.md) for the design and phased rollout.

## Why it's its own project

`crew` is project-agnostic. The Recipes-App scripts encoded conventions for one repo (Jira project key, branch naming, docker layout). `crew` reads a per-project config so it can drive any Claude Code workflow on any repo.
