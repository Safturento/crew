
## Visual-fidelity verification

This project has visual-fidelity verification enabled. The Figma source-of-truth has been pre-exported into your worktree at **`{{snapshotPath}}`** (an `index.json` plus per-component PNG + JSON). Use it to verify any change under **`{{componentDir}}`** (including new or modified `.figma.tsx` files) against the design.

Before claiming any UI-touching task complete, you MUST invoke the **`visual-fidelity-check`** skill. The skill reads the snapshot from disk — no Figma network access is required from inside the sandbox.

Do not claim a UI-touching task done — and do not open a PR for one — without running the skill, even if tests pass, even if the build is clean, even if you already screenshotted the rendered output. The skill is the gate.
