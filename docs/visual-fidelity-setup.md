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

## Why this isn't committed to the repo

The project config (`crew.toml`) lives in `~/.config/crew/projects/` rather than the repo because individual contributors may run with different Figma file forks, snapshot paths, or environments. The `figma_file_key` above points at the canonical Crew design file and is safe to share, but the broader pattern is "crew config in `~/.config/crew/`, not in the repo." This doc is the bridge — it carries the paste-ready snippet so each contributor's local config lines up with the canonical setup without having to commit a per-machine file.
