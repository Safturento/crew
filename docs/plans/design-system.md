---
core_library_url: "https://www.figma.com/design/UkPJj6vd7HMKcey7M0XF4N/Core-Design-System"
project_library_url: "<TBD: filled in by CREW-124>"
screens_file_url: "https://www.figma.com/design/9FeJPriqdsdA4n9R5Xsrr8/Untitled"
handoff_doc_root: "docs/designs"
sync_command: "<TBD: filled in by Phase 5 reconciliation tooling>"
sample_data:
  project: "kanban-api"
  ticket: "KAN-23"
  user: "kanban-api operator"
core_kit_origin: "https://www.figma.com/community/file/1342715840824755935 (forked 2026-05-09)"
---

# Crew Design System

Project-specific config for the `design-with-figma` skill (lives at `~/.claude/skills/design-with-figma/`, generic across projects). The skill reads this doc's frontmatter for Figma file URLs, sample data, and conventions; the prose below is for human readers.

> **Project-specific:** This document is for the crew project. Recipes (queued next) will have its own `recipes/docs/plans/design-system.md` with its own frontmatter values and project-specific notes.

## Status

| Phase | Status |
|---|---|
| Phase 1 — Core library | In progress (CREW-121) |
| Phase 2 code — shadcn install + token migration | In progress (CREW-122) |
| Phase 2 code — add primitives | Not started (CREW-123) |
| Phase 2 Figma — Crew DS override layer | Not started (CREW-124) |
| Phase 2 — Code Connect | Not started (CREW-125) |
| Phase 3 — Migrate screens | Not started (CREW-126) |
| Phase 4 — Full Crew DS coverage | Not started (separate Epic) |
| Phase 5 — Skill v1 + reconciliation tooling | Not started (separate Epic) |

## shadcn CLI version

Pinned to **`shadcn@4.7.0`** (latest stable on 2026-05-09). The 4.x line ships with native Tailwind v4 support; CSS variables (`--css-variables`) is the default. Re-pin by running `npx -y shadcn@<new-version> init --help` from a scratch directory and checking the changelog at <https://ui.shadcn.com/docs/changelog> before bumping.

### components.json schema (v4)

`packages/dashboard/components.json` was authored manually to match the v4 init output:

* `style: "new-york"`, `baseColor: "slate"`, `cssVariables: true`, `iconLibrary: "lucide"`
* `tailwind.css: "src/index.css"` (Tailwind v4 has no separate config file; tokens live in the CSS `@theme` block)
* Aliases mirror the `@/*` tsconfig path

> **Sandbox note:** `crew run` agents can't reach `ui.shadcn.com` (the registry the CLI fetches from), so `shadcn init` and `shadcn add <primitive>` need to be run by a human (or in an unsandboxed environment) for CREW-123. The pinned version + this `components.json` shape are what the CLI will reconcile against.

## Core kit fork point

Forked from the Figma community file `UkPJj6vd7HMKcey7M0XF4N` ("shadcn ui components with variables — Tailwind classes — Updated January 2026") on 2026-05-09. The community file is the source of upstream changes; we don't auto-track. Periodically (every ~6 months) check the upstream community file for meaningful additions (new shadcn primitives, lucide updates) worth manually porting.

## Component inventory

(Populated as Phase 2-3 lands. Each Crew DS component will be listed with its Figma node ID for ticket cross-references.)

## Conventions

(Populated incrementally. Project-specific design decisions captured here so future tickets can cite them.)

### Sample data

When mocking up screens, use the canonical sample data from the frontmatter (`kanban-api` project, `KAN-23` ticket) rather than inventing new examples. Keeps screens consistent across the file and makes navigation easier.

### Fonts

Crew dashboard uses **Hanken Grotesk** (sans) + **Fira Code** (mono) per `packages/dashboard/src/index.css`. Earlier Figma frames imported via html.to.design substituted **Sora** because Hanken Grotesk wasn't available at capture time — Phase 3 migration corrects this.

### Theme

Dashboard ships dark-only as default (the `<html class="dark">` is set at app boot in `main.tsx`). Crew DS supports both Light and Dark modes via the inherited `Crew / Semantic Colors` collection; Crew screens default to Dark canvas mode.
