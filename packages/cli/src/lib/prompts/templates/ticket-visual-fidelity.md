8. **Visual fidelity gate** (this project's UI work). Invoke the `visual-fidelity-check` skill. The skill compares your rendered work against the Figma snapshot at **`{{snapshotPath}}`** (an `index.json` plus per-component PNG + JSON) and reports structural / caller / visual mismatches across **`{{componentDir}}`** (including any new or modified `.figma.tsx` files). Fix any high-severity findings before proceeding; surface medium/low findings in the PR description. The skill reads the snapshot from disk — no Figma network access is required from inside the sandbox.

   **Fail-closed:** if the snapshot is missing, or the comparison can't run, stop and surface the blocker. Do not treat "couldn't run" as "passed."

   This step is required IN ADDITION TO step 9 (Verify) — that step covers tests, lint, and build correctness; this one covers visual fidelity. They are not interchangeable. Running one does not replace the other.
