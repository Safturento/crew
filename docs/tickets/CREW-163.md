# CREW-163 — Phase 3 soft doc-parity hook

Jira: https://safturento.atlassian.net/browse/CREW-163

## Goal

A soft `PreToolUse` hook that fires on `gh pr create` and `git commit`. For each
`.agents/<topic>.md` whose `covers:` glob overlaps a changed file, the hook
checks whether that doc was also touched in the same diff. If not, it warns with
the doc list and exits 1 (non-blocking). `CREW_DOC_PARITY_OVERRIDE=1` bypasses
the warning after the author states a reason.

## Relevant files

- `packages/cli/scripts/hooks/doc-parity-gate.sh` — the hook. Sibling to
  `visual-fidelity-pr-gate.sh`; reuses its stdin-JSON + `jq` pattern.
- `packages/cli/scripts/hooks/doc-parity-gate.test.sh` — bash test cases.
- `.claude/settings.json` — registers the hook in the `PreToolUse` / `Bash`
  matcher alongside `visual-fidelity-pr-gate`.

## Decisions

- **Soft gate, never blocks.** Violations exit 1 (warning surfaced to the
  agent), never exit 2 (which would block the tool call). Doc drift is worth a
  nudge, not a hard stop.
- **`covers:` parsing handles both quote styles.** Real `.agents/` docs mix
  single- and double-quoted globs under `covers:`. The awk extractor strips
  both via octal escapes (`\042`, `\047`) so the awk program embeds cleanly in
  a single-quoted shell string.
- **Exact-line match for the "doc touched?" check.** Uses `grep -Fxq` rather
  than a regex `^doc$`, since doc paths contain `.` and `/`.
- **`gh pr create` diffs merge-base..HEAD; `git commit` diffs the index.** When
  no merge base can be found the hook skips (exit 0) rather than guessing.

## Ruled out

- **Hard block (exit 2).** Would stop PRs on stale-doc drift — too aggressive
  for a parity _nudge_; the visual-fidelity gate already owns the hard-block
  role for its concern.

## Notes

`covers:` patterns are single-glob-only — no brace expansion. The hook matches
with bash `[[ == ]]`, which never expands `{...}`, so a brace glob would leave
the hook blind for that doc. This is now enforced: `validate-agents-frontmatter`
(run by `npm run lint:agents`) rejects any `covers:` entry containing `{` or
`}` with a message telling the author to split it into separate list entries.
`dispatch.md`'s former single brace entry was expanded into five plain entries
as part of this change.

## Plan reference

`docs/superpowers/plans/2026-05-13-agent-progressive-disclosure-system.md` —
"Ticket #10 — Phase 3 Soft doc-parity hook" (Steps 1–7).

## Verification

- `bash packages/cli/scripts/hooks/doc-parity-gate.test.sh` — 6/6 ok (4 named
  AC cases + the warning-names-doc and override-bypass assertions).
- `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm run test:run`
  — pass.
- Manual smoke: ran the hook against this branch's own diff with a fake
  `gh pr create` payload; confirmed it warns on the docs covering changed code
  and that `CREW_DOC_PARITY_OVERRIDE=1` turns the warning into a pass.
