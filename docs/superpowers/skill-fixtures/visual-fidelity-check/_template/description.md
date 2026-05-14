# <fixture-name>

**Source:** (PR number, commit SHA, or "manual capture")

**Date captured:** YYYY-MM-DD

**What's wrong (ground truth):**

1. **<component name> — <property/affordance>.** Be specific: which variant, which property, what's expected vs what's rendered. Include the file path and line range if relevant. Example: _"`<Button color='running' intensity='mid'>` — outline missing. Figma binds `border-slate-500` (1px), code's pillSurfaceClasses emits the class correctly but the rendered button shows no border. Possible class-precedence issue at `ui/button.tsx:base`."_

2. **<component> — <property>.** (repeat for each regression)

**Out of scope for this fixture:**

(things the skill should NOT flag — clutter, intentional differences, unrelated minor visual differences. Skip this section if there are none.)
