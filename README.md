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

A few one-time setup items before `crew` can do everything it's meant to.

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

### Visual testing (per project, optional)

Crew can give the dispatched agent a Playwright-driven browser pointed at the project's running app, so it can smoke-verify UI changes (and optionally author committed Playwright tests). Off by default. Opt in by adding a `[visual_testing]` section to the project's TOML at `~/.config/crew/projects/<name>.toml`:

```toml
[visual_testing]
enabled = true
app_url = "https://localhost:{httpsPort}"   # placeholders {httpPort}, {httpsPort}, {postgresPort} are substituted from the docker .env when [docker] is present
start_command = "npm run dev"               # required when [docker] is not configured
```

When enabled, `crew run`:

- Generates `<worktree>/.mcp.json` declaring the [`@playwright/mcp`](https://github.com/microsoft/playwright-mcp) server (`--headless`). The agent auto-discovers it.
- Adds `.mcp.json` to `<worktree>/.git/info/exclude` so it's never committed.
- Leaves the docker stack **running** (today's default is to stop it after bringup) so the agent has a live URL to test against. You can hit the same URL from your own browser during the run.

When disabled (no `[visual_testing]` section), behaviour is unchanged.

**At agent runtime.** The dispatched agent's prompt instructs it (when `[visual_testing]` is enabled) to navigate to `app_url` after implementing UI-related changes, take a screenshot, and verify the change visually before claiming "Verify" complete. Backend-only changes skip the smoke step with an explicit note in the PR description.

**Authoring committed Playwright tests.** Add a `[visual_testing.authored]` sub-table to opt the project into authored-test workflow:

```toml
[visual_testing.authored]
tests_dir    = "tests/e2e"
test_command = "npm run test:e2e"
```

Crew does **not** install `@playwright/test` for you — the target repo must have it set up (config + script + folder) before the agent can run authored tests. When the prerequisite is missing, the agent surfaces it in the PR description rather than silently skipping. This matches the convention of keeping target-repo dependencies as a target-repo concern.

**Headed sessions for ad-hoc browsing.** The generated `.mcp.json` always uses `--headless`. If you want a headed browser when *you* invoke MCP browser tools interactively in a worktree, register a user-scope server (`claude mcp add -s user playwright -- npx -y @playwright/mcp@latest`) — your user-scope settings will take precedence in your interactive session, but the dispatched agent still uses the worktree-scoped headless config.

### Jira API credentials (once per machine)
`crew finish` transitions the ticket to Done after the PR merges. It reads `CREW_JIRA_EMAIL` and `CREW_JIRA_API_TOKEN` directly from `process.env` — there's no `.env` loading, so dropping them in a repo `.env` won't work. If they aren't set, the transition step is skipped with a warning. Keep them outside any repo. A common pattern is `~/.secrets`, sourced from your shell rc:                        

```sh
# ~/.secrets                        
export CREW_JIRA_EMAIL="you@example.com"
export CREW_JIRA_API_TOKEN="..."
```

```sh                
chmod 600 ~/.secrets
echo '[ -f ~/.secrets ] && source ~/.secrets' >> ~/.bashrc
```

Open a new shell (or `source ~/.bashrc`) and verify with `echo $CREW_JIRA_EMAIL`. The token is the same Atlassian API token the MCP server uses, so you can reuse it.

### Bruno smoke tests (per project, optional)

Crew can run a [Bruno](https://www.usebruno.com/) HTTP smoke check as part of the dispatched agent's verification step, and ensures the agent keeps `.bru` files in sync when endpoints change. Off by default. Opt in by adding a `[bruno_smoke]` section to the project's TOML at `~/.config/crew/projects/<name>.toml`:

```toml
[bruno_smoke]
enabled = true
base_url = "https://localhost:{httpsPort}"   # placeholders {httpPort}, {httpsPort}, {postgresPort} are substituted from the docker .env when [docker] is present
collection_dir = "bruno"                     # optional; defaults to "bruno"

# Optional. Supplies test-user creds for the smoke run's login flow. Omit when
# the API has no auth or the runner injects its own credentials.
[bruno_smoke.smoke_user]
email    = "smoke@example.com"
username = "smoke"
password = "hunter2"
```

When enabled, `crew run` (and `crew fix-pr`):

- Generates `<worktree>/<collection_dir>/environments/<envName>.bru` containing a `vars { baseUrl, testUser.* }` block. `<envName>` is the lowercased worktree basename (e.g. `recipes-app-kan-99` for the KAN-99 worktree).
- Exports `CREW_BRUNO_ENV=<envName>` in the agent's spawn env. The project's `npm run bruno:smoke` script reads it (e.g. `bru run --env "$CREW_BRUNO_ENV" flows/login.bru flows/main-smoke.bru`).
- Leaves the docker stack **running** (composed with `[visual_testing]`'s lifecycle gate) so the agent has a live API to hit.

When disabled (no `[bruno_smoke]` section), behaviour is unchanged.

**Bootstrap a new project's Bruno collection.** Crew does **not** ship the Bruno collection — the project owns it. Per-project bootstrap (one-time, by hand):

1. Create `<repo>/<collection_dir>/` (default `<repo>/bruno/`) and run `bru init` (or copy a sibling project's collection).
2. Add `<repo>/<collection_dir>/.gitignore` containing `environments/` so generated env files never get committed.
3. Author at least `flows/login.bru` (uses `vars.testUser.*` to authenticate and stashes the token via `vars:post-response { token: res.body.token }`) and `flows/main-smoke.bru` (the project's golden-path API call sequence).
4. Add an npm script:
   ```json
   "scripts": {
     "bruno:smoke": "bru run --env \"$CREW_BRUNO_ENV\" flows/login.bru flows/main-smoke.bru"
   }
   ```
5. Install the Bruno CLI as a dev dep: `npm install --save-dev @usebruno/cli`.

Once these are in place, `crew run` against a backend ticket will do the rest.

**The `bruno-collection-maintenance` skill.** The agent automatically picks up the user-scope `bruno-collection-maintenance` skill at `~/.claude/skills/bruno-collection-maintenance/`. The skill teaches the file-naming conventions, the `vars:post-response` chaining pattern, and the "update `.bru` when touching endpoints" rule.

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
