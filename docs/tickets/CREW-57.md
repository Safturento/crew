# CREW-57 — Phase 0 empirical validation for Playwright integration

Jira: https://safturento.atlassian.net/browse/CREW-57

## Goal

Run the three Phase 0 empirical checks from the [Playwright integration spec](../superpowers/specs/2026-04-29-playwright-integration-design.md) §7 and capture verbatim outcomes in [`2026-04-29-playwright-integration-phase-0-findings.md`](../superpowers/specs/2026-04-29-playwright-integration-phase-0-findings.md). Apply spec amendments only if the empirical results contradict the design's assumptions.

## Relevant files

- `docs/superpowers/specs/2026-04-29-playwright-integration-phase-0-findings.md` — output of this ticket
- `docs/superpowers/specs/2026-04-29-playwright-integration-design.md` §7 — defines the three checks
- `docs/superpowers/plans/2026-04-29-playwright-integration.md` Tasks 1–4 — procedural shape of each check

## Decisions

- **Run from inside an autonomous `crew run CREW-57` agent rather than as an interactive operator.** The plan's procedures assume a human dispatching a separate sandboxed `crew run` against Recipes. From an autonomous run that's not feasible (would compete with the running agent, no in-sandbox observability of a sub-agent). Recorded what was empirically observable and clearly flagged the deferred portions.
- **No spec amendments.** All three findings either confirm the design or have small "deferred to β's manual gate" tails that the existing plan Task 16 already covers.
- **Did not edit `recipes.toml`.** Plan Task 1 Step 1 prescribes a temporary `[visual_testing]` block; in this autonomous-run context that produces no observable signal (no sub-agent dispatch). Skipped to keep config drift at zero.

## Open questions

- [ ] Should crew's own `.claude/settings.json` enable the sandbox so that future autonomous CREW-\* runs can themselves observe sandbox-policy-level behavior? Touches §10.4 follow-up territory ("Crew owns `.claude/settings.json`"). Not in CREW-57 scope; flagged in the findings doc.

## Ruled out

- Running `npx playwright install chromium` and a full e2e launch inside this autonomous run as an in-situ P0.1+P0.2+P0.3 super-test. The launch failure surfaces a different (and useful) signal — the missing `libnspr4`/`libnss3` system libs — but doesn't substitute for the in-sandbox observation the plan describes. Recorded the finding, did not extend the experiment to apt-install the libs (would require sudo and is β's job per spec §6.1).

## Notes

Empirical surprise worth resurfacing: the host machine is missing `libnspr4.so` and `libnss3` entirely. KAN-35's "Chromium system libs missing" footnote is reproducible on this developer machine right now without any ceremony. Spec §6.1's `install.sh` changes are therefore non-defensive — they fix a real, present gap. β should add Task 16's first run as the natural validation that the apt block lands successfully.
