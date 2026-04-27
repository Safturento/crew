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

## Install

```sh
git clone git@github.com:Safturento/crew.git
cd crew
./scripts/install.sh
```

Symlinks `~/.local/bin/crew` to the repo's `packages/cli/bin/crew`, runs `npm install`, and installs the system packages `crew run` needs for sandboxing (`bubblewrap`, `socat`) via `sudo apt-get`. Re-run the script after a fresh clone or if `node_modules` is wiped.

## Setup

Two one-time setup items before `crew run` can do anything useful.

### Atlassian MCP (once per machine)

Crew's agent prompts call Jira tools via the prefix `mcp__atlassian__*`, which resolves to the [`sooperset/mcp-atlassian`](https://github.com/sooperset/mcp-atlassian) community server running in Docker. The server name in your Claude Code config **must be `atlassian`** — the prefix is hardcoded in the prompt templates.

Prereqs:
- Docker available on PATH. On WSL2, enable Docker Desktop's WSL Integration for this distro: Settings → Resources → WSL Integration → toggle the distro on.
- An Atlassian API token from id.atlassian.com → Security → API tokens.

Register the server (user scope so it's available in any project):

```sh
claude mcp add atlassian --scope user \
  -e JIRA_URL=https://YOUR-SITE.atlassian.net \
  -e JIRA_USERNAME=you@example.com \
  -e JIRA_API_TOKEN=YOUR_TOKEN \
  -e CONFLUENCE_URL=https://YOUR-SITE.atlassian.net/wiki \
  -e CONFLUENCE_USERNAME=you@example.com \
  -e CONFLUENCE_API_TOKEN=YOUR_TOKEN \
  -- docker run --rm -i \
    -e JIRA_URL -e JIRA_USERNAME -e JIRA_API_TOKEN \
    -e CONFLUENCE_URL -e CONFLUENCE_USERNAME -e CONFLUENCE_API_TOKEN \
    ghcr.io/sooperset/mcp-atlassian:latest
```

Verify with `claude mcp list` — `atlassian` should report `✓ Connected`.

### GitHub token (once per project)

`crew run` injects a GitHub token into the agent so it can push branches and open PRs. Each registered project needs one at `<repo>/.claude/secrets/gh-token`:

```sh
mkdir -p .claude/secrets
gh auth token > .claude/secrets/gh-token
chmod 600 .claude/secrets/gh-token
```

The `.claude/secrets/` path is gitignored. Re-run after a token rotation.

## Status

Pre-MVP. See [`docs/plans/architecture.md`](./docs/plans/architecture.md) for the design and phased rollout.

## Why it's its own project

`crew` is project-agnostic. The Recipes-App scripts encoded conventions for one repo (Jira project key, branch naming, docker layout). `crew` reads a per-project config so it can drive any Claude Code workflow on any repo.
