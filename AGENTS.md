# AGENTS.md

Conventions for agents working on `crew` itself. Universal Node + documentation conventions live in `~/.claude/conventions/`; this file covers crew-specific rules only. Architectural rules live in [`.agents/architecture.md`](./.agents/architecture.md); the rationale + history is in [`docs/rationale/architecture.md`](./docs/rationale/architecture.md).

## Repo layout

npm workspaces monorepo. Each package lives under `packages/`:

```
crew/
├── docker-compose.yml      # daemon + dashboard services (canonical + per-worktree)
├── env.toml                # per-worktree env materialization (APP_URL, DAEMON_URL, ports)
├── .claude/settings.json   # sandbox baseline + excludedCommands for crew dispatches
├── packages/
│   ├── cli/                # the `crew` command users invoke
│   ├── daemon/             # long-running state-tracking process
│   │   ├── Dockerfile      # crew-daemon image
│   │   └── seeds/dev.ts    # fixture seed for worktree DBs
│   ├── dashboard/          # React + Vite web UI
│   │   └── Dockerfile      # crew-dashboard image (vite dev server)
│   └── shared/             # types, transcript parsing, project config, jira/github clients
└── docs/
```

The `--workspace` flag takes the package's `name` (e.g. `crew-cli`, `crew-daemon`), not the directory name.

## When you need it

| Doing                                                                 | Read                                                   |
| --------------------------------------------------------------------- | ------------------------------------------------------ |
| Editing daemon services/routes                                        | `.agents/architecture.md`, `packages/daemon/AGENTS.md` |
| Adding/changing a CLI subcommand                                      | `.agents/architecture.md`, `packages/cli/AGENTS.md`    |
| Touching dispatch flow (run/fix-pr/finish, prompts, skills injection) | `.agents/dispatch.md`                                  |
| Adding or changing an HTTP route                                      | `.agents/architecture.md`, `.agents/testing.md`        |
| Adding a Bruno endpoint                                               | `.agents/testing.md`                                   |
| Sandbox / host-network / secrets behavior                             | `.agents/local-dev.md`, `.agents/security.md`          |
| Touching `docker-compose`, `env.toml`, worktree port hashing          | `.agents/local-dev.md`                                 |
| Working on dashboard components, the Figma DS, or `.figma.tsx`        | `.agents/design-system.md`                             |
| Filing followups, writing tickets/specs/plans, branching              | `.agents/workflow.md`                                  |
| Running verification (lint/typecheck/test/bruno/visual-fidelity)      | `.agents/commands.md`                                  |

See [`.agents/README.md`](.agents/README.md) for how this system works and how to extend it.

## Before claiming work complete

This repo's `.agents/<topic>.md` docs declare `covers:` frontmatter globs naming the paths each doc governs. Before reporting any task complete or opening a PR, run the `agents-doc-parity-check` skill: it matches your changes against every doc's `covers:` globs and flags docs that need updating. Required in addition to `superpowers:verification-before-completion`, not instead of it.
