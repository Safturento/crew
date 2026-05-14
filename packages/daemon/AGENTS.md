---
description: Patterns and rules for the crew-daemon package
last_updated: 2026-05-13
---

# crew-daemon

Long-running state-tracking process. Watches transcripts, persists run state to SQLite, exposes REST + SSE for CLI and dashboard.

## Rules specific to this package

- Stack: Fastify + `fastify-type-provider-zod`, Kysely + `kysely-better-sqlite3`, `@fastify/awilix` for DI, pino for logging, chokidar for FS watching.
- Routes are thin: parse + validate input (Zod), call service, return result. No business logic in `routes/`.
- Services own the business logic. One service per domain (`AgentsService`, `ProjectsService`, etc).
- Migrations are numbered TypeScript files in `src/migrations/`. New migration = new number; never edit a shipped migration.
- The daemon never reads from disk for things the CLI can pass via API. Trust the CLI to send what it knows.

## When you need it

| Doing                                        | Read                                                                        |
| -------------------------------------------- | --------------------------------------------------------------------------- |
| Writing a new route or service               | `.agents/architecture.md`, user-level `reaching-for-backend-patterns` skill |
| Adding a Bruno endpoint to cover a new route | `.agents/testing.md`, `bruno-collection-maintenance` skill                  |
| Schema changes / new migration               | `.agents/architecture.md`                                                   |
| Running verification                         | `.agents/commands.md`                                                       |

## Common gotchas

_To be populated._
