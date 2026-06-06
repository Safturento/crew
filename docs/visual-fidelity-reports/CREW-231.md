# visual-fidelity-check report — 2026-06-05

**Branch:** CREW-231
**Base:** main
**Touched components:** 1 (`TranscriptRow`) + 1 non-visual (`Timeline` eventKey helper) + 1 logic-only (`eventClassification`)
**Findings:** 0 high, 0 medium, 0 low (0 from this PR)

## Summary

CREW-231 makes two changes:

- **#5 (Timeline.tsx)** — `eventKey` React-key fallback. Pure render-key logic, no
  DOM/style output. Not a visual surface.
- **#2 (eventClassification.ts + TranscriptRow.tsx)** — a `tool_use` named `Skill`
  is now classified as `skills` and rendered like a skill **attachment**.

The visual-relevant change is the new Skill branch in `specForAssistantBlock`
(`TranscriptRow.tsx`). It returns a `RowSpec` that is byte-for-byte equivalent to
the existing, already-validated skill-attachment `RowSpec` produced by
`specForAttachment` for `invoked_skills`:

| Field       | Skill tool_use (new)                  | Skill attachment (existing) |
| ----------- | ------------------------------------- | --------------------------- |
| `category`  | `hooks-and-skills`                    | `hooks-and-skills`          |
| `tagLabel`  | `Skill invoked`                       | `Skill invoked`             |
| `toolColor` | _(none)_                              | _(none)_                    |
| Tag color   | `initializing` (via `CATEGORY_COLOR`) | `initializing`              |

## Structural check

No styling files were touched (`git diff` against `origin/main`: no `ui/tag.tsx`,
`pill-variants.ts`, `tool-colors.ts`, `event-palette.ts`, `index.css`, or
`CATEGORY_COLOR` change). The Skill row reuses the `'hooks-and-skills'` →
`'initializing'` Tag palette validated when skill attachments + the `Tag`
component (`ui/tag.figma.tsx`) shipped. No new Tailwind classes are emitted and no
new variant is introduced, so there is nothing new to diverge from Figma.

The Figma `TranscriptRow` node (`9FeJPriqdsdA4n9R5Xsrr8?node-id=553-445`) is a
flat anatomy that derives its tag/text/timestamp/tokens from the event — there is
no Figma "Skill" variant; the design intent (per the ticket) is explicitly that a
Skill row "reads identically to a skill attachment row," which this change
satisfies by construction.

## Caller check

`TranscriptRow`'s only caller is `Timeline.tsx`, which passes a raw `event`
through unchanged. No variant props are involved at the call site, so there is no
caller-side variant mismatch to check.

## Visual check (live DOM)

Dashboard reachable at `http://localhost:30808`; agent drawer (`CREW-102`)
Timeline rendered correctly via both Playwright MCP and Chrome MCP. Startup, tool,
and result rows render with their expected tags/palettes. The #5 fix was verified
live: an expanded `Preflight` startup row stayed open across ~3 ticks of the 1s
active-section runtime ticker (previously the `Math.random()` key remounted and
collapsed it).

## Verification gaps

- The dev seed fixtures contain **no `Skill` tool_use event**, so a Skill row could
  not be rendered live in the browser. Coverage for #2's rendering is provided by
  the unit test `TranscriptRow.test.tsx > renders a Skill tool_use like a skill
attachment` (asserts `data-category="hooks-and-skills"`, tag `Skill invoked`,
  text from the skill input) plus the structural-equivalence argument above. The
  Chrome MCP `eval` return value did not surface in-band (captured-to-file quirk);
  the rendered screenshots were used instead.
