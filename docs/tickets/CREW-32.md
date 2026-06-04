# CREW-32 — Port `normalize-line-endings` (re-normalize CRLF working trees)

Jira: https://safturento.atlassian.net/browse/CREW-32

## Goal

A `crew normalize-line-endings` subcommand that re-normalizes CRLF working-tree
files to LF, porting the deliberate two-pass design of Recipes'
`scripts/normalize-line-endings.sh`. Refuses on a dirty tree, prints before/after
CRLF counts, and surfaces the exact `git commit` hint when normalizations land in
the index.

## Relevant files

- `packages/cli/src/commands/normalize-line-endings.ts` — thin Commander wrapper; resolves cwd, renders output, exits 1 on a dirty tree.
- `packages/cli/src/lib/normalize-line-endings/index.ts` — `runNormalizeLineEndings` orchestration (the two passes, stat-cache refresh, reporting).
- `packages/cli/src/lib/git/index.ts` — added `getRepoRoot`, `parseLsFilesEol` (pure), `listCrlfWorkingTreeFiles`. Reused existing `hasUncommittedChanges`.
- `packages/cli/src/index.ts` — registers the command.

## Decisions

- **Logic lives in `lib/normalize-line-endings/`, not the command.** Matches the cli package rule (commands are thin wrappers) and lets the orchestration be tested directly with a result object.
- **The CRLF-listing parser is a pure function (`parseLsFilesEol`).** Per the ticket: a TypeScript helper is far easier to unit-test than the bash `awk '$1 ~ /w\/crlf/'` one-liner. Splits each `git ls-files --eol` line on the first tab; the path follows (paths can contain spaces).
- **Pass 2 strips `\r` via `content.replace(/\r(?=\n|$)/g, '')`.** Mirrors `sed 's/\r$//'` exactly (only CR before a newline or EOF), sidestepping the BSD/GNU `sed -i` portability split — a stated non-goal.
- **`git add -u` after both passes** refreshes git's stat cache (writeFileSync bumps mtime, which otherwise leaves clean files reported as modified) and stages real normalizations. `--cached --quiet` → commit hint; `--quiet` only → content-drift warning.
- **Works from any repo, no project config.** Resolves the repo root via `git rev-parse --show-toplevel` from cwd; unlike most subcommands it does not call `discoverProjectConfig`.

## Tests

Real temp git repos (no execa mocks) — the value is the interaction with git's
smudge/checkout machinery. Scenarios, all confirmed empirically first:

- No-op on an already-LF repo (`No CRLF working-tree files found.`).
- CRLF working copy + LF index + `eol=lf` attr → pass 1 (`checkout-index`) fixes it.
- CRLF index+working, no text attr, `autocrlf=false` → pass 1 misses, pass 2 strips, index change → commit hint.
- Dirty tree → refuse, exit non-zero, working tree untouched.

Plus pure-parser unit tests in `git.test.ts` and a command-wrapper test driving
Commander `parseAsync` against a real repo (stands in for a CLI smoke — tsx can't
run inside the crew sandbox: it fails binding an IPC unix socket).

## Ruled out

- `--check` / dry-run mode — explicit non-goal, deferred to a possible follow-up.
- Editing `.gitattributes` for the user — non-goal; they commit that themselves first.

## Notes

CLI/git-only change: no HTTP route (no `.bru` updates) and no dashboard UI
(no Playwright/visual-fidelity). Bruno smoke run as a daemon-liveness sanity check.
Unblocks the Recipes-side follow-up to delete `scripts/normalize-line-endings.sh`
(with CREW-31, the two prerequisites to removing Recipes' `scripts/`).
