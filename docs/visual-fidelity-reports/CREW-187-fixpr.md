# visual-fidelity-check report — 2026-05-23 (fix-pr round)

**Branch:** CREW-187
**Base:** main
**Touched components (fix-pr):** TimelineSection, SearchBar, Filters, Timeline.tsx, AgentRow, DrawerHeader, daemon seed (`dev.ts`), new `ui/state-icon.tsx` primitive.
**Findings:** 0 high · 0 medium · 1 low (intentional — carryover from initial PR)

## Resolved findings from initial-PR report

- **M-1 (search input bg/border)** — RESOLVED. `Timeline/SearchBar.tsx` now passes `border-slate-600 bg-slate-1100`, matching Figma `558:483`'s opaque slate-1100 fill + slate/600 stroke exactly. Reviewer correctly noted this wasn't pre-existing for the drawer Timeline.
- **TimelineSection border (carryover from CREW-185 M-1)** — RESOLVED. Replaced `rounded-[5px] border` with `border-l-2`; corner radius dropped, all-around border collapsed to a single left state-color stripe. Matches Figma `558:477` section frames.
- **Section header metadata right-alignment** — RESOLVED. Timestamp / duration / event count / token sum cluster wrapped in `ml-auto flex` div so it pushes to the right edge, chevron + state badge stay on the left.
- **Filters Tools section default-empty UX trap** — RESOLVED via inverted-checkbox semantics. State shape renames `tools: Set<string>` → `excludedTools: Set<string>`. A row reads as checked when its alias is **not** in the exclusion set; default (empty exclusion set) renders every tool checked. Predicate now: pass iff `category match AND (event has no tool_use OR every tool_use's alias is not in excludedTools)`. "All checked = see everything; unchecking subtracts" — matches every other checkbox-filter UI on the web.
- **Docker URL pill missing for fixture agents** — RESOLVED at the seed layer. `packages/daemon/src/seeds/dev.ts` `PROJECT_TOML_FIXTURES.crew` now includes `[playwright] app_url = "http://localhost:29649"` (plus the schema-required `start_command` + `[playwright.smoke]` block). `seedProjectFixtures` is idempotent — running stacks with existing TOMLs already on disk are unaffected — but a fresh `crew run` dispatch now lights up the docker pill for CREW-* fixtures via `AgentsService.deriveAppUrl(cfg)`. Note: the host-mounted `crew.toml` in this dispatch's running stack still uses the `${APP_URL}` template (unrelated bug tracked separately in `docs/followups.md` 2026-05-22 entry); the seed change is exercised by the daemon's `dev.test.ts` `seedProjectFixtures` test.
- **StateBadge circle inconsistency** — RESOLVED. Extracted the canonical `<StateIcon />` (filled-disc with `strokeWidth=6 absoluteStrokeWidth`) from `AgentRow.tsx` into `packages/dashboard/src/components/ui/state-icon.tsx`. `DrawerHeader.tsx` and `Timeline/TimelineSection.tsx` swapped from bare `<Circle aria-hidden />` to `<StateIcon />`; AgentRow now imports the shared primitive too. All three call sites now render the same thick filled disc.

## Standing finding

### L-1 — Filters pill adds chevron-down + numeric divergence badge not present in Figma `558:478`

Unchanged from initial-PR report. Spec-mandated badge + UX-affordance chevron — accepted as intentional addition. Surfaced in PR description.

## Verification gaps

- **Filters popover content has no Figma counterpart.** Still open; implementation follows the ticket's prose specification. A future Figma pass should add a designed counterpart.
- **Docker URL pill in this dispatch's running stack** still renders the literal `${APP_URL}` template because the host's `crew.toml` (read-only mount, predates this PR's seed change) carries `app_url = "${APP_URL}"` and `deriveAppUrl` returns the template unexpanded. Separately tracked.

## Structural matches (no new findings)

- **TimelineSection** (`Timeline/TimelineSection.tsx`): left state-color border, no radius, metadata right-aligned — matches Figma `558:477`.
- **SearchBar** (`Timeline/SearchBar.tsx`): `h-8 border-slate-600 bg-slate-1100 font-mono text-xs` with leading `lucide/search` icon — matches Figma `558:483`.
- **StateIcon usage** in AgentRow / DrawerHeader / TimelineSection — single shared primitive, consistent stroke treatment.

## Step 5 — live DOM check

Playwright MCP screenshots in this dispatch confirm:
- TimelineSection renders with left-only state-color border, no rounded corners ✓
- Section metadata cluster pushed right to the edge ✓
- SearchBar visibly darker bg + lighter border ✓
- Filters popover Tools section all default-checked ✓
- State badge circles consistent thick disc across AgentRow + DrawerHeader + TimelineSection ✓
