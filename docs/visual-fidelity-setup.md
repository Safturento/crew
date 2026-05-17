# Visual fidelity setup (per-contributor)

Crew runs the `visual-fidelity-check` skill on autonomous `crew run CREW-*` dispatches when the project's `[visual_fidelity]` block is configured. The block lives in **`~/.config/crew/projects/crew.toml`** (user-local, machine-specific), so each contributor wires this themselves — there's nothing to land in the repo to turn the gate on.

## Paste the block

Add the following section to your `~/.config/crew/projects/crew.toml`:

```toml
[visual_fidelity]
figma_file_key = "9FeJPriqdsdA4n9R5Xsrr8"
figma_pages    = ["Composites", "Dashboard Screens"]
component_dir  = "packages/dashboard/src/components"
dashboard_url  = "${APP_URL}"
```

`snapshot_path` defaults to `.crew/figma-snapshot` and `code_connect_glob` defaults to `**/*.figma.tsx`; override either if you need to. `${APP_URL}` resolves from the repo's `env.toml` materialization layer so worktree dispatches get the correct per-worktree URL.

You also need a Figma personal access token with read scope exported as `FIGMA_API_TOKEN` in your shell (e.g. via `~/.secrets`, the same convention `CREW_JIRA_API_TOKEN` uses). Generate one at <https://www.figma.com/developers/api#access-tokens>.

## Verify

From the crew repo root:

```sh
crew figma-snapshot
```

This populates `.crew/figma-snapshot/` (gitignored) with `index.json` and per-node JSON files including the `enrichment` field. Check the output reports `nodesExported > 0`. Spot-check a per-node JSON:

```sh
ls .crew/figma-snapshot/composites/ | head
jq '.enrichment | keys' .crew/figma-snapshot/composites/$(ls .crew/figma-snapshot/composites/*.json | head -n1 | xargs basename)
```

The `enrichment` keys should include at least `boundVariables` and `componentProperties`. If they're absent on a node that should have them, the snapshot fell back to REST-only mode — investigate `crew figma-snapshot`'s stderr.

## How the token is used

`crew run` generates the Figma snapshot **on the host, before the agent is dispatched**: the pre-dispatch hook reads `FIGMA_API_TOKEN` from the environment of the `crew run` process and writes the snapshot into the worktree. The dispatched (sandboxed) agent only *reads* that snapshot — it never runs `crew figma-snapshot` and never needs the token.

So `FIGMA_API_TOKEN` must be exported in the shell where *you* run `crew run`, not inside any dispatch. The manual `crew figma-snapshot` in the Verify section above is a contributor convenience for confirming your token and config resolve correctly; it is not a step any dispatch performs.

## Why a REST token — and the alternative if it's annoying

`crew figma-snapshot` runs in two stages, and they authenticate differently:

- **Bulk export** — fetches the file's node tree and screenshots via Figma's **REST API**, which authenticates only with a personal access token. This is the `FIGMA_API_TOKEN` stage.
- **Enrichment** — adds the per-instance variant data (`componentProperties`, `boundVariables`) the REST API can't expose. This stage already runs through the **Figma MCP / Plugin API** — no token.

So the token covers only the bulk-export half. It's REST there because a plain HTTP fetch is cheap and deterministic; keeping it on REST means only the enrichment-that-REST-can't-do pays the cost of an LLM-driven `claude -p` subprocess.

**If managing a separate Figma token becomes a burden:** the bulk export *could* be moved onto the Plugin-API path too — the enrichment stage already drives it headlessly, so there's no fundamental blocker — dropping `FIGMA_API_TOKEN` entirely. It hasn't been, because that would make *every* pre-dispatch snapshot an LLM-subprocess operation: slower, costlier, and more failure-prone than a REST fetch. Revisit that tradeoff if token management across machines turns into real friction. It's a contained refactor of `packages/cli/src/lib/figma-snapshot/` — replacing the `FigmaRestClient` usage in `emit.ts` with a Plugin-API-backed export.

## Why this isn't committed to the repo

The project config (`crew.toml`) lives in `~/.config/crew/projects/` rather than the repo because individual contributors may run with different Figma file forks, snapshot paths, or environments. The `figma_file_key` above points at the canonical Crew design file and is safe to share, but the broader pattern is "crew config in `~/.config/crew/`, not in the repo." This doc is the bridge — it carries the paste-ready snippet so each contributor's local config lines up with the canonical setup without having to commit a per-machine file.
