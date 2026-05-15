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

> _Below this section, content is being migrated into `.agents/` during the Phase 2 rollout. Once migration completes, this file shrinks to the index above._

## Local development

Crew runs as a docker compose stack locally. See [`README.md`](./README.md) for the user-facing setup. For agents working on crew code:

- **Hot-reload is the default in worktree stacks.** Both daemon (`tsx watch`) and dashboard (vite) source-mount from the worktree, so edits are picked up without rebuild.
- **Worktree DBs are ephemeral and seeded.** `CREW_SEED_FIXTURES=1` runs `packages/daemon/seeds/dev.ts` on container start. Tests run against deterministic fixtures, not against your canonical state.
- **`<repo>/env.toml` is the source of truth for env vars** that vary per-worktree (`APP_URL`, `DAEMON_URL`, port allocator entries, `COMPOSE_PROJECT_NAME`). Always use `${VAR}` syntax, never legacy `{httpPort}`.
- **`<repo>/.claude/settings.json` declares the sandbox baseline.** `excludedCommands` lists `npm run bruno:smoke` and `npm run test:e2e` so they run un-sandboxed against the host loopback (where the worktree stack is reachable). Sandboxed `curl`/`fetch` calls to the app URL will always return ECONNREFUSED — see the agent's run-prompt sandbox-network-note section.

## Per-worktree docker isolation

When generating a docker `.env` for a worktree, hash the worktree basename to derive non-default ports so multiple worktrees coexist without collision. The canonical worktree (`canonical_worktree` in project config) keeps the standard ports.

This rule now applies to crew itself. Crew's `docker-compose.yml` + `env.toml` use the same port-hashing convention as Recipes, so concurrent CREW-\* worktree dispatches don't collide.
