# Followups — Abandoned

> Items explicitly decided against; the reason is in each body. Index: [`../followups.md`](../followups.md).


## 2026-06-16 — `hasPrCreateInvocation` still misses `gh pr create` chained on one line with `&&`

**Abandoned 2026-06-19:** State-path concern obsolete. `pr_open` is hook-driven now — the PostToolUse `pr_created` hook, hardened by CREW-266 to match `gh pr create` anywhere and gate on a real PR URL — and CREW-257 removed transcript parsing from the state path entirely. The underlying `hasPrCreateInvocation` chained-command gap survives only in `computeRunMetrics` (PR-create undercount) and `deriveStateFromToolCalls` (historical-agent backfill projection) — both minor and off the critical path. The stopgap ticket CREW-251 was closed unimplemented (superseded). Reopen if metrics accuracy for chained commands ever matters.

**Confirmed 2026-06-18 (CREW-243):** the open question below is answered — this is a real behavior bug, not doc-only cleanup. The CREW-243 agent ran `cd /home/safturento/Repos/crew-CREW-243; gh pr create …` (a single-line `;` chain — an even plainer case than the `&&` in the title) and stuck in `running`; PR #365 opened but the badge never advanced. Verified empirically against the real parser (`;`- and `&&`-chained → `false`; newline-separated and bare → `true`; the `echo` decoy → `false`). Stopgap ticketed as CREW-251; superseded longer-term by the Concrete State Triggers Epic (spec PR #366), which removes transcript parsing from the state path entirely.

**What:** `hasPrCreateInvocation` (`packages/shared/src/transcripts/parser.ts`) detects the PR-create signal by splitting on `\n`/`⏎` and testing each line with `startsWith('gh pr create')`. A command that chains the push and the PR on a single line — `git push -u origin FOO && gh pr create …` — produces one line that starts with `git push`, so the predicate returns false and the agent never transitions to `pr_open`. The predicate's own doc comment explicitly claims it tolerates this `git push && …` form, but it does not; only the newline-separated form is actually handled (and that's the only chain case the parser tests cover).

**Why noticed:** While fixing the CREW-237/CREW-241 stuck-in-`running` bug (detection was running against the 140-char truncated summary instead of the raw command — fixed by feeding `toolUse.input.command` into the predicate). The raw-command fix resolves the heredoc case that actually bit those two tickets, but reading the predicate surfaced this adjacent gap: even with the raw command in hand, a single-line `&&` chain still slips through. Not what stranded CREW-237/241 (both used heredoc-then-`gh pr create`-on-its-own-line), so it's deferred rather than folded into that fix.

**Anchors:**

- `packages/shared/src/transcripts/parser.ts` — `hasPrCreateInvocation` (per-line `startsWith`) + its misleading `git push && …` comment
- `packages/shared/src/transcripts/parser.test.ts` — `hasPrCreateInvocation` cases (only newline-separated chain covered)
- `packages/daemon/src/services/IngestService.ts` — `computeNextState` + `pendingPrCreates` gate, the two callers

**What's been considered:** Either (a) widen the per-line tokenization to also split on `&&` / `;` / `|` shell separators before the `startsWith` test, or (b) switch to a word-boundary regex anchored to a command position (`(^|&&|;|\n|⏎)\s*gh pr create\b`) — (b) keeps the `echo "… gh pr create …"` carve-out the per-line approach was built for. Either way, also correct the doc comment to match reality.

**Open questions:** Are there real agent transcripts using the single-line `&&` form, or do crew's prompts always emit `gh pr create` on its own line? If the latter, this may be doc-comment-only cleanup rather than a behavior fix — worth a quick grep across `~/.claude/projects` before sizing.

## 2026-05-12 — Re-link 8 detached AgentRow tiles in modal-overlay screen backgrounds

**Abandoned 2026-05-21:** Modal-overlay screens (`18:2` Edit, `23:2` Delete) likely don't need standalone canvases — the design intent is "Project page + Modal X overlaid," which renders correctly without rebuilding the background AgentRow tiles. The 8 detached FRAMEs (named "AgentRow (detached)" during the 2026-05-12 polish pass) are inert documentation artifacts; converting them to instance overrides would require extracting per-tile agent data and isn't justified. If those modals ever ship as code overlays, the modal screens themselves go away (rendered on top of whatever route was previously visible).

## 2026-05-09 — Manual rename of Figma screens file to "Crew Dashboard Screens"

**Abandoned 2026-05-21:** Made moot by the 2026-05-12 DS consolidation — the screens file is now the single Crew file (`9FeJPriqdsdA4n9R5Xsrr8`) and its display slug is `Crew`, not `Document`. The original "Crew Dashboard Screens" name was scoped to a separate file that no longer exists. The plain `Crew` name is correct for the consolidated file.

## 2026-04-27 — Dashboard mobile responsive layout polish

**Abandoned 2026-05-21:** Superseded by post-CREW-176 dashboard direction. AgentRow is now a flex card (not a table grid) per the 2026-05-20 card redesign, so the original `<768px` collapse spec from UI design §4 no longer maps to the current layout. Mobile shape needs re-derivation from the current direction, not the original spec — file as a fresh followup when mobile becomes a real priority.
