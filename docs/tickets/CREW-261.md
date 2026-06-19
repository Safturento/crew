# CREW-261 — Fix pr_created hook: exit-code gate silently kills pr_open detection

Jira: https://safturento.atlassian.net/browse/CREW-261

Child of the Concrete State Triggers epic (CREW-252). A defect in the
already-merged CREW-256 hook: the injected PostToolUse hook never emitted a
`pr_created` event, so dispatched agents stayed `running` after opening a PR —
the entire `pr_open` detection (CREW-252) was silently dead in production.

## Goal

The hook emits `pr_created` for a successful `gh pr create` without depending on
`tool_response.exitCode`, so the daemon reduces the agent to `pr_open`.

## Root cause

`hooks/state-events/pr-create-postuse.mjs:35` gated on
`payload.tool_response?.exitCode !== 0`. Claude Code's PostToolUse(Bash) payload
does **not** carry an exit code — empirically confirmed from a live session
transcript, `tool_response` is `{ stdout, stderr, interrupted, isImage,
noOutputExpected }`. So `undefined !== 0` is `true` and the hook returned early
on **every** Bash call, including a successful `gh pr create`. CREW-256's unit
test masked this by mocking `tool_response: { …, exitCode: 0 }` — encoding the
wrong payload shape.

## Fix

Drop the exit-code gate. Key success off the parsed PR URL instead: a successful
`gh pr create` prints the PR URL to stdout; a failed one does not, so the parsed
URL (already extracted via `URL_RE`) is a self-validating success signal.

```js
const prUrl = (stdout.match(URL_RE) ?? [])[0];
if (!prUrl) return;
```

`prUrl` is now guaranteed when emitting, so it's always set on the event (the
shared schema already marks it optional; the reducer maps `pr_created → pr_open`
regardless).

## Relevant files

- `hooks/state-events/pr-create-postuse.mjs` — removed the exitCode gate; gate on parsed PR URL.
- `hooks/state-events/pr-create-postuse.test.mjs` — rewritten against the real payload shape (no `exitCode` mock); adds a regression case proving a payload with no `exitCode` field still emits, and that a no-PR-URL Bash call does not.

## Verification

- Unit: `npm run test:hooks` — 9 passing.
- E2E (real entrypoint, subprocess): piping a realistic PostToolUse payload to
  `node hooks/state-events/pr-create-postuse.mjs` writes a `pr_created` line to
  `~/.crew/state-events/<key>.jsonl`; a no-URL payload writes nothing.
- Daemon reduction (`pr_created → pr_open`) is already covered by
  `packages/daemon/src/services/state-reduce.test.ts`.
