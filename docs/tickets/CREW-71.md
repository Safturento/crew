# CREW-71 — Fix `crew resume` / `crew restart` (no `--hard`): no live tool-call stream

Jira: https://safturento.atlassian.net/browse/CREW-71

## Goal

`crew resume <KEY>` and `crew restart <KEY>` (without `--hard`) should stream
live tool-call output to the terminal exactly the way `crew run` does, in both
the resume-existing-session and no-prior-session paths. CtrlC must abort
cleanly: subprocess killed, tail loop drained via abort, exit 130.

## Relevant files

- `packages/cli/src/commands/resume.ts` — has the bug; spawns then `await sub` only.
- `packages/cli/src/commands/run.ts` — has the streaming loop pattern (with
  `findNewestTranscript`).
- `packages/cli/src/commands/fix-pr.ts` — has the streaming loop pattern (with
  a known `transcriptPath` and `startAtEnd: true`), plus the abort bridge.
- `packages/cli/src/lib/run/discover-transcript.ts` — `findNewestTranscript`.
- `packages/shared/src/transcripts/tail.ts` — `tailTranscript`.
- `packages/cli/src/lib/claude/spawn.ts` — `spawnClaudeResume`/`spawnClaudeFresh`.

## Decisions

- **Extract `streamTranscript` into `packages/cli/src/lib/run/stream-transcript.ts`.**
  Three near-identical copies (run/fix-pr/resume) is the regression-prevention
  step from the ticket. Caller passes either a known `transcriptPath` or a
  `projectDir` to discover one.
- **Keep `runRun`'s post-stream rendering (final-output footer, docker-bringup
  wait) in `runRun`.** The helper covers spawn-to-stream-end only; pre/post
  formatting differs per command.
- **Resume's signal handling moves to the fix-pr pattern.** `wireSignalsAndWait`
  currently `process.exit(130)`'s the SIGINT handler, which short-circuits the
  drain. Replace with the bridged AbortController pattern.

## Out of scope

- Harmonising `runLogPathFor(key)` vs `/tmp/crew-resume-<KEY>.log` paths.
- Changes to `formatToolCall` rendering or the parsed event surface.
- Adding a final-output footer to resume — leaving as-is unless requested.

## Notes

Acceptance criteria from the Jira ticket:

- resume + restart (no flag) stream live in both branches.
- restart `--hard` and `run` still stream after extraction (regression).
- `fix-pr` still streams after extraction.
- CtrlC drains and exits 130.
- `npm run test:run` / `lint` / `typecheck` / `format:check` all pass.
