---
description: Patterns and rules for the crew-shared package
last_updated: 2026-05-13
---

# crew-shared

The leaf of the dependency graph. Types, transcript parsers, project config, Jira/GitHub clients, docker introspection.

## Rules specific to this package

- **No imports from `cli/`, `daemon/`, or `dashboard/`.** This package is the leaf — anything it depends on must be external.
- Types-only files go in `src/<concern>/types.ts`. Runtime code goes in named modules.
- Tests live alongside source: `foo.ts` + `foo.test.ts`.

## When you need it

| Doing                      | Read                      |
| -------------------------- | ------------------------- |
| Adding a new shared module | `.agents/architecture.md` |
| Running verification       | `.agents/commands.md`     |

## Common gotchas

_To be populated._
