# CREW-72 — Stream `assistant.text` inline in the tool-call tail

Jira: https://safturento.atlassian.net/browse/CREW-72

## Goal

The live tail used by `crew run` / `resume` / `restart` / `fix-pr` should keep
producing output during the agent's prose wrap-up — not just during tool-call
phases. Add inline rendering for `assistant.text` and `pr-link` events; leave
tool-call rendering and every other event type untouched.

## Relevant files

- `packages/cli/src/lib/run/stream-transcript.ts` — the loop that today only
  renders tool calls. New event branches plug in here.
- `packages/cli/src/lib/run/stream-transcript.test.ts` — existing coverage to
  extend with the new event types.
- `packages/shared/src/transcripts/types.ts` — needs an `AssistantTextContent`
  union member and a `PrLinkEvent` type so the new parsers are typed.
- `packages/shared/src/transcripts/parser.ts` + `parser.test.ts` — home for the
  new `parseAssistantText` / `formatAssistantText` and `parsePrLink` /
  `formatPrLink` helpers.

## Decisions

- **Parser/formatter pair lives in `crew-shared`, mirroring tool calls.**
  Keeps the CLI's `streamTranscript` thin (parse → if non-null, write) and
  matches the ticket's "parallel to `parseToolCall` / `formatToolCall`"
  suggestion.
- **Visual prefixes:** `· ` for `assistant.text`, `↪ ` for `pr-link`. Both
  share the `HH:MM:SS  ` time prefix that tool calls use, so columns line up.
- **Truncate `assistant.text` to ~120 chars.** Newlines are replaced with
  `⏎` (matches existing `Bash` summarizer convention) so a multi-paragraph
  PR-body block never blows past one line.
- **Skip empty `assistant.text` events.** Some assistant messages are
  pure-tool-use with an empty leading text block; emitting a blank prefix
  line would be noise.
- **Render every `pr-link` we see — including duplicates.** The reference
  KAN-40 transcript emits the same `pr-link` twice (once on the run that
  authored the PR, once on the wrap-up reply). The user wants the line, the
  duplicate is harmless, and dedupe state would be the only reason to add
  cross-event memory to the loop.

## Out of scope

- Rendering `assistant.thinking`, `queue-operation`, `system`, or the
  outer `user` event type. Per ticket — noisy, low signal.
- Removing `runRun`'s post-stream footer (the `────…` block). Ticket flags
  this as a follow-up.
- Idle-heartbeat indicators during silent stretches.

## Notes

Acceptance criteria from the Jira ticket:

- `assistant.text` events render a single-line, truncated, prefixed snippet.
- `pr-link` events render a line with PR number + URL.
- Replaying the KAN-40 transcript past the `21:49:56` TodoWrite cutoff yields
  visible output (the "## Summary" snippet + a PR-link line).
- Existing tool-call rendering unchanged.
- Unit test asserts a multi-paragraph `assistant.text` collapses to one line
  and is truncated.
- `npm run test:run`, `npm run lint`, `npm run typecheck`, `npm run format:check`
  all pass. PR opened against `main`.
