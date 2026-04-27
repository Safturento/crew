# CLAUDE.md

Conventions for agents working on `crew` itself. Universal Node + documentation conventions live in `~/.claude/conventions/`; this file covers crew-specific rules only. The full architectural design is in [`docs/plans/architecture.md`](./docs/plans/architecture.md) — read that first before any non-trivial change.

## Repo layout

npm workspaces monorepo. Each package lives under `packages/`:

```
crew/
├── packages/
│   ├── cli/         # the `crew` command users invoke
│   ├── daemon/      # long-running state-tracking process
│   ├── dashboard/   # React + Vite web UI
│   └── shared/      # types, transcript parsing, project config, jira/github clients
└── docs/
```

The `--workspace` flag takes the package's `name` (e.g. `crew-cli`, `crew-daemon`), not the directory name.

## Architecture rules

These flow from `docs/plans/architecture.md`:

- **The CLI never embeds business logic that belongs in `shared/`.** Subcommands should be thin wrappers: parse args, call shared, render output.
- **The daemon never reads from disk for things the CLI can pass.** State queries go through the daemon's API; the CLI passes the question.
- **`shared/` has no CLI / daemon / dashboard imports.** It's the leaf of the dependency graph.
- **No business logic in the dashboard.** It's a view over the daemon's API.
- **Per-project config is the only place project-specific knowledge lives.** Don't hardcode "Recipes-App" anywhere; everything's parameterised on the loaded project config.

## Per-worktree docker isolation

When generating a docker `.env` for a worktree, hash the worktree basename to derive non-default ports so multiple worktrees coexist without collision. The canonical worktree (`canonical_worktree` in project config) keeps the standard ports.
