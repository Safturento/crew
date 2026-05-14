---
description: Patterns and rules for the crew-cli package
last_updated: 2026-05-13
---

# crew-cli

Thin command-line wrapper. Subcommands parse args, call `shared/`, render output. No business logic in subcommands themselves.

## Rules specific to this package

- Each subcommand in `src/commands/<name>.ts` is a thin wrapper. Business logic lives in `src/lib/` or `packages/shared/`.
- Lib subdirs (`run/`, `prompts/`, `skills/`, `preflight/`, `figma-snapshot/`, `bruno-smoke/`, `db-clone/`, `jira/`, `github/`, `playwright/`) each own one concern. Don't cross-import between sibling lib subdirs without explicit reason.
- New subcommands register in `src/index.ts`; the command shape is `crew <name>`.

## When you need it

| Doing                                                   | Read                                                                  |
| ------------------------------------------------------- | --------------------------------------------------------------------- |
| Adding/modifying a subcommand                           | `.agents/architecture.md`                                             |
| Changing dispatch flow (run, prompts, skills injection) | `.agents/dispatch.md`                                                 |
| Touching anything in `bruno/`                           | `.agents/testing.md`, user-level `bruno-collection-maintenance` skill |
| Sandbox / host-network considerations in subcommands    | `.agents/local-dev.md`, `.agents/security.md`                         |
| Running verification before claiming done               | `.agents/commands.md`                                                 |

## Common gotchas

_To be populated as gotchas are surfaced in Phase 2._
