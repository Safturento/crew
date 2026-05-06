# CREW-95 — Exhaustive TranscriptEvent Zod schema in crew-shared

Jira: https://safturento.atlassian.net/browse/CREW-95

## Goal

Replace slice 1b's four-variant `TranscriptEvent` union in
`packages/shared/src/transcripts/` with an exhaustive ~38-variant Zod
discriminated union covering every JSONL event type empirically observed
across `~/.claude/projects/`. Each variant uses `.passthrough()` for
forward-compat with future Claude Code additions; an `unknown` variant
carries the raw JSON when a type or shape isn't recognized rather than
dropping the row. Foundation for CREW-E (timeline endpoint) and CREW-F
(state derivation in ingest).

## Relevant files

- `packages/shared/src/transcripts/schemas.ts` — NEW. Zod envelope + per-variant schemas + the union.
- `packages/shared/src/transcripts/types.ts` — replaced; re-exports `TranscriptEvent` from schemas plus legacy `ToolCall` / `AssistantText` / `AggregateUsage`.
- `packages/shared/src/transcripts/parser.ts` — adds `parseTranscriptLine`; existing helpers (`parseToolCall`, `aggregateUsage`, etc.) are tightened to handle optional `usage`.
- `packages/shared/src/transcripts/parser.test.ts` — extended with one test per variant fixture + negative cases.
- `packages/shared/src/transcripts/fixtures/*.jsonl` — one sanitized line per variant (~38 files).
- Slice 1b consumers (daemon `IngestService`, CLI `discovery.ts`, etc.) — minor adjustments where they assumed required fields that are now optional in the Zod schema.

## Decisions

- **Schema-first, type follows.** `types.ts` re-exports `TranscriptEvent = z.infer<typeof transcriptEventSchema>` from `schemas.ts`. No hand-rolled interface mirrors the union — single source of truth.
- **`.passthrough()` everywhere.** Every variant + nested content schema uses `.passthrough()` so forward-compat fields (new CC additions) land in the parsed event rather than being stripped.
- **`unknown` variant has three reasons.** `unknown_top_level` (unrecognized `type`), `unknown_subtype` (recognized type but unknown discriminator like `system.subtype`), `zod_failure` (recognized type, malformed shape). Reason is set by the parser based on which path failed.
- **`assistant.message.content[]` is itself a discriminated union with `.or(unknownContentSchema)`.** Same pattern for `user.message.content[]`. Bare-string `user.message.content` lifted to a sibling at the message-object level via `z.union`.
- **`assistantContentSchema` etc. allow extra blocks via the `unknownContentSchema` fallback.** Users with future CC content block types still parse cleanly; the unknown block carries forward all fields via `.passthrough()`.
- **Tasks 1 + 2 of the slice 1c plan land in the same PR.** Splitting is a logical commit boundary within the PR (skeleton, then variants), but a half-landed schema would break typecheck on existing slice 1b consumers.

## Out of scope

- Daemon `IngestService` changes that *use* the new variants (state derivation, PR URL extraction, SSE events). That's CREW-F.
- Migration `0002_state_transitions` and the new HTTP routes. Those are separate tickets in slice 1c.
- Dashboard-side use of the new variants.
- Fixtures need to cover *every* variant the spec enumerates, but we don't pre-emptively model variants we haven't seen.

## Notes

Acceptance criteria from the Jira ticket:

- All 12 top-level types modeled: `assistant`, `user`, `queue-operation`, `attachment`, `last-prompt`, `permission-mode`, `file-history-snapshot`, `system`, `pr-link`, `ai-title`, `custom-title`, `agent-name`.
- `system.subtype` nested union covers all 7 subtypes; `attachment.type` nested union covers all 20.
- `assistant.content[]` modeled as `tool_use` / `thinking` / `text` + unknown fallback. `user.content[]` modeled with `tool_result` / `text` + bare-string fallback at the message level.
- One sanitized fixture per variant under `fixtures/`; parser test asserts each parses to the expected discriminant.
- `parseTranscriptLine` returns `null` on malformed JSON; returns the unknown variant on unknown type or zod failure (never throws).
- `uuid` and `parentUuid` preserved on every variant via the shared envelope.
