# Visual fidelity setup (per-contributor)

Crew runs the `visual-fidelity-check` skill on autonomous `crew run CREW-*` dispatches when the project's `[visual_fidelity]` block is configured. The block lives in **`~/.config/crew/projects/crew.toml`** (user-local, machine-specific), so each contributor wires this themselves — there's nothing to land in the repo to turn the gate on.

The Figma snapshot the skill validates against is a **committed artifact** at `.crew/figma-snapshot/` — it is git-tracked and checked into the repo. `crew run` no longer generates it; dispatched agents read it straight from disk. You only need the token + config below to regenerate the snapshot or to run the freshness check.

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

You also need a Figma personal access token with read scope exported as `FIGMA_API_TOKEN` in your shell (e.g. via `~/.secrets`, the same convention `CREW_JIRA_API_TOKEN` uses). Generate one at <https://www.figma.com/developers/api#access-tokens>. It is used by the manual `crew figma-snapshot` REST export and by `crew figma-snapshot --check` — not by any dispatch.

## The snapshot is committed — you don't generate it per-run

`.crew/figma-snapshot/` is checked into the repo: `index.json`, a `meta.json` sidecar, and per-component PNG/JSON files. A `crew run` dispatch consumes that committed tree directly — it does **not** regenerate it. So in normal contribution you don't run anything here; the snapshot is already present.

The snapshot only needs regenerating when the Crew Figma design itself changes. That is the job of the interactive **`figma-snapshot-refresh`** skill: invoked in an interactive Claude session at the design→code handoff, it runs the REST export, enriches each node via the Figma MCP (`componentProperties`, `boundVariables`, `componentInstances` — data the REST API can't expose), verifies, and commits the updated `.crew/figma-snapshot/`. Regeneration is interactive because the Figma MCP enrichment works reliably only in an interactive session.

## Check whether the committed snapshot is stale

From the crew repo root:

```sh
crew figma-snapshot --check
```

This fetches only the live Figma file version (a cheap `depth=1` metadata request) and compares it to the `figmaFileVersion` recorded in the committed `.crew/figma-snapshot/meta.json`. It prints `fresh` and exits 0 when they match, or `STALE` and exits non-zero when the Figma file has moved ahead of the committed snapshot — your cue to run the `figma-snapshot-refresh` skill.

## Manual REST export

```sh
crew figma-snapshot
```

`crew figma-snapshot` is a REST-only export: it writes `index.json`, `meta.json`, and per-component PNG/JSON files to `.crew/figma-snapshot/`. It is a contributor convenience for confirming your token and config resolve correctly, and the first stage the `figma-snapshot-refresh` skill builds on. On its own it does **not** add the `enrichment` field — that is the skill's enrichment stage. Don't commit a REST-only snapshot as the artifact; use the skill, which exports, enriches, verifies, and commits as one fail-closed step.

## Why a REST token

`crew figma-snapshot` and `crew figma-snapshot --check` talk to Figma's **REST API**, which authenticates only with a personal access token — that is the `FIGMA_API_TOKEN` stage. A plain HTTP fetch for the node tree, screenshots, and file-version metadata is cheap and deterministic.

The enrichment stage (run inside the `figma-snapshot-refresh` skill) instead drives the **Figma MCP / Plugin API**, which the interactive session authenticates on its own — no token. So the token covers only the REST half: bulk export + the freshness check.

## Why this isn't a per-machine commit

The project config (`crew.toml`) lives in `~/.config/crew/projects/` rather than the repo because individual contributors may run with different Figma file forks, snapshot paths, or environments. The `figma_file_key` above points at the canonical Crew design file and is safe to share, but the broader pattern is "crew config in `~/.config/crew/`, not in the repo." This doc is the bridge — it carries the paste-ready snippet so each contributor's local config lines up with the canonical setup without having to commit a per-machine file. The snapshot artifact itself, by contrast, *is* committed — it is shared ground truth, not per-machine state.
