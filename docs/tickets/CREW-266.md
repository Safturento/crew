# CREW-266 — pr_created hook: match `gh pr create` anywhere + gate on PR URL

Jira: https://safturento.atlassian.net/browse/CREW-266

## Goal

The `pr_created` PostToolUse hook fires for a successful `gh pr create` in **any**
command position — bare, `;`/`&&`/`|`-chained, newline-separated (`cd <wt>⏎gh pr
create`), and heredoc-bodied — so dispatched runs that open their PR multi-line
transition to `pr_open` instead of falling through to `idle`.

## Relevant files

- `hooks/state-events/pr-create-postuse.mjs` — the matcher. Replaced the
  position-anchored `PR_CREATE` regex with a word-boundaried `\bgh pr create\b`.
- `hooks/state-events/pr-create-postuse.test.mjs` — test matrix.

## Decisions

- **Drop position-anchoring; keep a `gh pr create` command check + the PR-URL gate.**
  The anchoring (`(^|&&|;|\|)\s*gh pr create\b`) was a transcript-parsing-era
  holdover for rejecting `echo "... gh pr create ..."` decoys. The hook now has a
  stronger discriminator — a real GitHub PR URL in stdout (`URL_RE`) — so the
  anchoring was redundant and the source of a recurring bug class (CREW-251 added
  `;`/`&&`; this fixes newline). New contract: command mentions `gh pr create`
  (word-boundaried, so the past-tense `gh pr created` doesn't fire) **and** stdout
  carries a PR URL.
- **Word boundary, not anchor.** `\bgh pr create\b` matches every positional
  variant at once while still excluding `gh pr created`.
- **PR URL stays read off stdout.** Live evidence (CREW-264: bare `gh pr create`
  → `pr_created` → `pr_open`) confirms gh prints the URL to stdout in this
  context; no need to widen `URL_RE` to stderr.

## Notes

- The echo-decoy test was updated to the new contract: a realistic `echo "... gh
pr create ..."` prints the literal mention (no PR URL), so the URL gate rejects
  it. An _artificial_ echo paired with a real PR URL in stdout would now emit —
  accepted, since that combination isn't a real-world decoy.
- Negatives added to the matrix: `gh pr create --help` (mentions create, no URL),
  `gh pr view`/`gh pr list` (print a PR URL but aren't a create), and the
  past-tense `gh pr created` word-boundary guard.
- Backend-only (a dependency-free `.mjs` hook): no UI, HTTP route, or Bruno change.
