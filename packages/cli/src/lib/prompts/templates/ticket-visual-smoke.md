
## Visual smoke verification

This project's UI runs at **{{appUrl}}**. If your changes touch the frontend (any file under a frontend/dashboard package, anything that renders to a DOM, or a backend change a user can observe), you must verify the change end-to-end in a browser before claiming "Verify" complete.

1. Make sure the app is running. {{startCommandHint}}
2. Use the `mcp__playwright__*` tools to navigate to {{appUrl}} and exercise the golden path you changed. Take a screenshot at the relevant state.
3. Inspect the screenshot. If the change is invisible or broken, return to step 7 (Execute) — it isn't done yet.

If your change is _clearly_ backend-only (no observable user effect), say so explicitly in the PR description and skip this step.
