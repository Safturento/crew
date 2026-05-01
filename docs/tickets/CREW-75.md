# CREW-75 — Remove `pr-link` rendering

Jira: https://safturento.atlassian.net/browse/CREW-75

## Goal

Stop rendering `pr-link` transcript events in the live tail. claude emits one
per _URL mention_ (not per PR-creation), so today the same `↪ PR #N <url>`
line prints multiple times per dispatch. CREW-73's mandated final
`echo "→ PR <url>"` already gives the user the canonical end-of-run signal,
so the `pr-link` renderer is redundant — and rendering on a wrongly-named
event is the bug worth removing, not papering over with a dedupe set.

## Relevant files

- `packages/cli/src/lib/run/stream-transcript.ts` — the loop that calls
  `parsePrLink` / `formatPrLink`. Branch + the matching imports get deleted.
- `packages/shared/src/transcripts/parser.ts` — home of `parsePrLink` /
  `formatPrLink`. Functions removed.
- `packages/shared/src/transcripts/types.ts` — `PrLink` (the parsed-output
  type) gets removed; `PrLinkEvent` (the on-disk event shape) stays so the
  parser still knows the union member exists.
- `packages/shared/src/transcripts/parser.test.ts` — drop the
  `describe('parsePrLink')` / `describe('formatPrLink')` blocks.
- `packages/cli/src/lib/run/stream-transcript.test.ts` — drop the
  "renders pr-link events with PR number and URL" test.

## Decisions

- **Keep `PrLinkEvent` in `types.ts`.** The transcript still contains these
  events; `TranscriptEvent` needs the union member or the parser's
  exhaustive narrowing breaks. We just stop _rendering_ them.
- **Delete the `PrLink` parsed-output type.** Once `parsePrLink` /
  `formatPrLink` are gone there are no consumers; leaving it as dead code
  invites the same wrongly-named abstraction to come back.
- **No dedupe / smart-detection alternative.** Considered a
  `Set<prUrl>` in `streamTranscript` — rejected. Special-cases a wrongly-
  semantic event forever and adds cross-event state to a stateless loop.

## Out of scope

- Investigating whether claude's own `pr-link` emission semantics could be
  configured upstream. Not our codebase.
- Building a smarter "PR was just opened" signal. CREW-73's final echo is
  the canonical channel.
- `assistant.text` and tool-call rendering both stay as-is.

## Notes

Verification: replaying the KAN-40 transcript through the patched tail must
produce zero `↪ PR` lines (today: 8). `npm run test:run`, `npm run lint`,
`npm run typecheck`, `npm run format:check` all pass.
