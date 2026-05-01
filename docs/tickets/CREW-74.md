# CREW-74 — `scripts/install.sh resolve_libname` misses virtual `libasound2` on Ubuntu Noble

Jira: https://safturento.atlassian.net/browse/CREW-74

## Goal

`bash scripts/install.sh` on a fresh Ubuntu 24.04 (Noble) host with no chromium
libs installed completes the apt step without "no installation candidate"
errors, with the script's resolver picking the t64 variant _directly_ for every
renamed lib (no `Note, selecting '...' instead of '...'` lines from apt).

## Relevant files

- `scripts/install.sh` — `resolve_libname` switches from `apt-cache show` (which
  succeeds for stub-entry virtuals like `libasound2` on Noble) to `apt-cache
policy` matched against `Candidate: [^(]` (a real version, not `(none)`).

## Decisions

- **Probe via `apt-cache policy`, not `apt-cache show`.** `show` returns a stub
  for virtual packages with no real provider, so the bare name passes the check
  even though `apt-get install` will fail when there are multiple providers.
  `policy` exposes `Candidate: (none)` for virtuals with no auto-pick, and a
  real version string otherwise — which is exactly the question we're asking.
- **Match `Candidate: [^(]` rather than `Candidate:` + a not-`(none)` filter.**
  Real version strings never start with `(`; the negated character class is the
  cleanest way to reject `(none)` without a second grep / extra pipeline.
- **Keep the final fallthrough returning `$base`.** If neither name has an
  install candidate (e.g. user is on a distro the script doesn't know about),
  emit the bare name — apt's resulting error message points at the real
  package, which is more useful than a silent t64 substitution.

## Out of scope

- Replacing apt-based deps with `npx playwright install --with-deps` — covered
  by the broader "crew owns the agent runtime install" pass.
- Adding font / gstreamer / icu deps from `playwright install-deps --dry-run`.

## Notes

Acceptance criteria from the Jira ticket:

- Fresh Noble host: `bash scripts/install.sh` completes; no `no installation
candidate` / `Unable to locate package`; headless chromium launches.
- The "Installing system deps" line lists the t64 names directly; apt prints no
  `Note, selecting '...' instead of '...'` lines.
- Pre-Noble (e.g. 22.04) behavior unchanged — bare names still resolve.
- Re-running on a fully-set-up host stays a no-op (`ldconfig` short-circuits).
