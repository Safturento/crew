# Followups — Architecture & Config

> Part of the crew followups queue. Index + format: [`../followups.md`](../followups.md). Entry template, ticketing protocol, and the Active/Resolved/Abandoned lifecycle live in the user-level `~/.claude/CLAUDE.md` "Followup detection" section.

(entries below, newest at top)


## 2026-04-30 — Crew owns `.claude/settings.json` per worktree (gated on empirical bwrap/socat validation)

**What:** Today the project's `.claude/settings.json` (committed in-tree) and the crew TOML's `[sandbox]` block (per-project crew config) are two hand-maintained sources for the same truth — sandbox allowlist, allowWrite paths, etc. They drift. A spec should decide whether crew writes a generated `.claude/settings.json` per worktree using the "tag header + refuse to clobber" pattern from `docker-env.sh`.

**`sandbox.excludedCommands` MUST list the project's smoke / e2e commands when the project has a docker stack the agent will exercise** (any project with `[docker]` configured + `[playwright]` or `[bruno_smoke]` enabled). KAN-12 (Recipes, 2026-05-03) burned ~45 min of debugging on this. Initial fix attempt (PR #45 in Recipes, since reverted) added `localhost` + `127.0.0.1` to `sandbox.network.allowedDomains`. That changed nothing — `allowedDomains` is an HTTPS egress filter, while the sandbox actually wraps the agent in `bwrap --unshare-net`, giving it its own loopback distinct from the host's. Empirical test confirmed: `excludedCommands: ["npm run bruno:smoke", "npm run test:e2e"]` runs the listed commands un-sandboxed, exposing the host netns to the smoke/e2e workflow.

**`excludedCommands` is necessary but not sufficient — the dev server has to start in the same netns the runner uses.** KAN-17 (Recipes, [PR #49](https://github.com/Safturento/Recipes/pull/49), 2026-05-03) shipped with both `npm run bruno:smoke` and `npm run test:e2e` already in `excludedCommands`, and `npm run test:e2e` _still_ got `ECONNREFUSED` on `https://localhost:17253`. Likely failure mode: dev server bound to host loopback, but if the agent restarted it via a sandboxed Bash call (e.g. plain `npm run dev`), it bound to the agent's bwrap loopback. Mitigations the doctor / generator should enforce: (a) Playwright config owns dev-server lifecycle via a `webServer` block so un-sandboxed `npm run test:e2e` brings up its own server in the same netns; (b) any dev-server-start command is also in `excludedCommands`; (c) the run-time prompt to the agent calls out that ad-hoc `curl` against the app URL from sandboxed Bash will always `ECONNREFUSED`.

**Empirical prereq — validate `bwrap`/`socat` are load-bearing (folded in from 2026-04-30 sibling followup):** Crew preflights `bwrap` (and `install.sh` installs `socat`), but neither is invoked from crew's TS source — verified by grep. Hypothesis: Claude Code's built-in sandbox uses them transitively. If it silently runs un-sandboxed when they're missing, that's a finding that affects every other sandbox-related decision in this followup. One-shot empirical test: uninstall `bwrap` on a test machine, run a sandboxed agent, observe what fails / what runs un-sandboxed silently. Result feeds back into the settings.json design.

**Why noticed:** Surfaced repeatedly — §10.4 + §10.5 of the Playwright integration design spec, CREW-57's open questions, and architecture.md's open questions list.

**Anchors:**

- `docs/superpowers/specs/2026-04-29-playwright-integration-design.md` §10.4, §10.5
- `docs/tickets/CREW-57.md` open question
- `docs/rationale/architecture.md` "Settled questions"
- Reference for the tag-header pattern: `packages/cli/src/lib/docker/env.ts`
- `packages/cli/src/commands/run.ts:84` — bwrap preflight string
- `scripts/install.sh:25–27` — bubblewrap + socat install

**Shape of work:** Empirical pass on bwrap/socat first (one-shot), then design spec on settings.json ownership. Likely deliverables for the spec: (1) Decision tree: when does crew clobber? When does it warn-and-skip? What's the migration path for existing committed `settings.json`? (2) Generator that reads the TOML's `[sandbox]` and emits a tagged `.claude/settings.json` per worktree. (3) Drift-detection at `crew run` startup.

**Open questions:**

- Should the project's committed `.claude/settings.json` become source-of-truth and the TOML auto-syncs? Or vice versa? Or is the TOML a strict superset and the file is fully crew-owned?

## 2026-04-30 — Project config rationalization

**What:** The `[sandbox]` / `[docker]` / `[playwright]` / `[bruno_smoke]` / `[db_clone]` blocks have grown organically and now duplicate URL/port concepts across multiple sub-blocks. A future spec should consolidate where it makes sense — likely a top-level `[app] url = ...` shared across modes, with per-block URLs preserved as overrides for projects whose frontend and backend live at different URLs.

**Why noticed:** Spec §10.1 of the Playwright integration design. CREW-56's out-of-scope list.

**Anchors:**

- `docs/superpowers/specs/2026-04-29-playwright-integration-design.md` §10.1
- `packages/shared/src/config/schema.ts` — current config shape
- [CREW-56](https://safturento.atlassian.net/browse/CREW-56) out-of-scope list

**What's been considered:** Per-block URLs preserved as overrides. Top-level `[app] url` becomes default when sub-blocks omit theirs.

**Shape of work:** Design spec → schema migration plan → write codemod for existing TOMLs. Coordinate with the unified onboarding helper so `crew init` writes the new shape.

## 2026-04-30 — Unified `crew init` / `crew doctor` onboarding helper

**What:** A single subcommand for project setup, both new and existing:

- **New project:** walk through writing the TOML, **scaffold an `env.toml` at the project repo root** (prompt for orchestration ports, app vars, contexts). The scaffolded project TOML at `~/.config/crew/projects/<name>.toml` MUST use `${VAR}`-style references for `[playwright].app_url` and `[bruno_smoke].base_url`. Run `npm install -D @playwright/test` if Playwright opted in, scaffold `playwright.config.ts` + `tests/e2e/` skeleton, scaffold Bruno collection skeleton if opted in. **Scaffold `<repo>/.claude/settings.json` when absent**, and when the project has a docker stack populate `sandbox.excludedCommands` with smoke / e2e commands.
- **Existing project:** modify the TOML in place, run machine-wide health checks (apt deps, Chromium installed for every configured project, docker socket reachable). For existing projects with hand-authored `.claude/settings.json`, **doctor mode should diagnose missing-smoke/e2e-in-`excludedCommands`** and offer a one-command fix.

Two halves ship as one subcommand.

**Why noticed:** Spec §10.2 of the Playwright integration design. CREW-56's out-of-scope list.

**Anchors:**

- `docs/superpowers/specs/2026-04-29-playwright-integration-design.md` §10.2
- `packages/cli/src/commands/` — destination
- `~/.config/crew/projects/<name>.toml` — files this writes/edits

**Shape of work:** Design spec covering wizard question tree and diagnostic rules → implementation plan with TDD steps. Pairs with per-config-block reference docs so wizard prompts point at canonical documentation.

**Open questions:**

- One subcommand with a mode flag (`crew init --check`?) vs two thin commands sharing a library?

**Update (2026-06-05) — builds on the `establishing-a-new-project` skill.** As of 2026-06-04 a user-level `establishing-a-new-project` skill (in `~/dotfiles`, public) owns the _universal, stack-agnostic_ repo baseline: `.agents/` + `AGENTS.md` + the `CLAUDE.md` shim + a human-facing `README.md` + git hygiene (`.gitattributes`/`.gitignore`) + the `docs/` tree (followups, superpowers specs+plans). `crew init` should **build on top of** that skill — assume/invoke it for the baseline — and own only the **crew-specific, stack-coupled** layer: the project TOML at `~/.config/crew/projects/<name>.toml`, the repo `env.toml`, `<repo>/.claude/settings.json` (sandbox + `excludedCommands`), the Playwright/Bruno skeletons, project registration, and `doctor` health-checks. It must not duplicate the baseline. This also settles the **skill-vs-subcommand** split: a **subcommand** for crew onboarding (imperative, deterministic machine-state) and a **skill** for the universal baseline (agent-guided authoring). The remaining open question (one subcommand with a mode flag vs two thin commands) is unaffected.

## 2026-04-30 — Per-config-block reference docs

**What:** Every TOML option documented with its purpose, defaults, validation rules, and required project-side setup. Lives in `docs/config-reference.md` or similar.

**Why noticed:** Spec §10.3 of the Playwright integration design. CREW-56's out-of-scope list.

**Anchors:**

- `docs/superpowers/specs/2026-04-29-playwright-integration-design.md` §10.3
- `packages/shared/src/config/schema.ts` — source of truth; reference docs derive from this
- README's current per-feature subsections — partial coverage, scattered

**Shape of work:** One-shot writing pass after the config rationalization spec lands. Could potentially auto-generate from the zod schema's `.describe()` calls, but tangential.

## 2026-04-30 — CI integration of authored Playwright runs

**What:** Run authored Playwright tests as a GitHub Action in the project's CI on PR push, in addition to the agent-side `npm run test:e2e` gate. Today no CI workflow at all in this repo, so this spans two concerns: (1) introduce a baseline GitHub Actions workflow file; (2) add Playwright e2e to it.

**Why noticed:** Spec §1 of Bruno smoke design and Playwright integration spec both call out CI integration. CREW-22 explicitly notes "no GitHub Actions workflow exists yet."

**Anchors:**

- `docs/tickets/CREW-22.md` "Out of scope"
- `docs/superpowers/specs/2026-04-29-bruno-smoke-tests-design.md` §1
- `docs/superpowers/specs/2026-04-29-playwright-integration-design.md`
- `packages/dashboard/playwright.config.ts` (+ future `tests/e2e/`)
- `.github/workflows/` — currently empty

**Shape of work:** Two tickets. (1) Baseline CI workflow — typecheck/lint/test:run on push to PR branches. ~50 lines. (2) Authored Playwright in CI — extends with `npx playwright install --with-deps chromium` + `npm run test:e2e --workspace=crew-dashboard`. Decide whether CI also runs Bruno smoke.

**Open questions:** Self-hosted runner or GitHub-hosted? GitHub-hosted re-installs chromium per run; cache helps.

## 2026-04-28 — Flesh out the project-resolution design

**What:** The design exploration at `docs/rationale/project-resolution.md` is explicitly marked pre-implementation notes — "Initial leaning", "Sketched implementation outline", with no chosen approach locked in. The triggering incident — `crew run <KAN-ticket>` from inside the `crew` repo failing with a wrong-project error — is still real today. CLI partial workaround: `--project <name>` flag exists on `crew list` and `crew status` but not on `crew run` / `crew fix-pr` / `crew finish` / `crew resume`.

**Why noticed:** Doc opens with `**Status:** Pre-implementation design notes`. PR [#21](https://github.com/Safturento/crew/pull/21) merged it with the explicit intent "needs fleshing out before this drives any code." Five months of subsequent work on the daemon + dashboard sharpens the need: the dashboard's write endpoints will land project-by-name from a non-CLI surface.

**Anchors:**

- `docs/rationale/project-resolution.md`
- `.agents/local-dev.md` — current cwd-only behavior + pointer to this followup
- [PR #21](https://github.com/Safturento/crew/pull/21)
- `packages/cli/src/commands/list.ts:105`, `packages/cli/src/commands/status.ts:91` — partial `--project` flag
- `packages/cli/src/lib/discover-project-config.ts` — current cwd-only resolver
- `packages/shared/src/config/loader.ts` — `loadProjectConfigByName` exists but no key-prefix resolver

**What's been considered:** Four options (A: ticket-key prefix, B: explicit `--project`, C: per-user default, D: hybrid precedence). Initial leaning is D (hybrid).

**Shape of work:** Brainstorm → spec → implementation plan. Likely one ticket lands the shared resolver (`packages/shared/src/config/resolveProject.ts`), then a sweep migrating each command. Dashboard endpoints should consume the same resolver from day one.

## 2026-04-26 — Architecture doc open questions still unresolved

**What:** Three of the five original architecture "Open questions" are still genuinely open (the open ones now live in `.agents/architecture.md` under "Currently open architectural questions"; the settled ones are recorded in `docs/rationale/architecture.md`):

1. **Distribution past Phase 1.** Phase 1 ships via local `npm link`. Past that: `npm publish` is the easy default; Node SEA single-binary is fancier but ergonomic for shipping to multiple machines without a Node install.
2. **Auth secrets storage.** Where do gh-token, jira-token, anthropic-api-key live? Currently per-repo `.claude/secrets/`. Architecture doc proposes per-user `~/.config/crew/secrets.toml`.
3. **MCP tools or REST?** Agent uses MCP for Jira; daemon will use REST for transitions outside the agent context. Some duplication acknowledged.

The other two open questions (sandbox config drift, Phase 2 + Phase 3 separation) are subsumed by other followups and shipped slices.

**Why noticed:** Original architecture plan's "Open questions" section.

**Anchors:**

- `.agents/architecture.md` "Currently open architectural questions"
- `docs/rationale/architecture.md` "Settled questions"
- For #1: `scripts/install.sh`, README's Install section
- For #2: `~/.config/crew/.secrets.env`, `packages/cli/src/commands/finish.ts` `readJiraSecrets`, daemon's eventual JIRA client
- For #3: agent's MCP Jira config, `packages/cli/src/lib/jira/client.ts` (REST)

**Shape of work:** Each is independent. #1 punts until "we want to install crew on a machine that doesn't already have it." #2 is design-spec-then-implementation. #3 likely doesn't need its own ticket — accept the duplication.

