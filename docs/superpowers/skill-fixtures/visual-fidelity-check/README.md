# visual-fidelity-check skill fixtures

Calibration harness for the user-scoped `visual-fidelity-check` skill (lives at `~/.claude/skills/visual-fidelity-check/`). Each fixture captures a known UI-component implementation + its Figma source-of-truth + ground-truth findings the skill should produce.

The `superpowers:writing-skills` skill drives the skill's *authoring* (frontmatter shape, description, examples, loophole-closing language). This harness covers the question writing-skills can't answer empirically: **does the skill actually detect the visual mismatches it claims to detect?**

## Fixture structure

Each fixture is a folder:

```
<fixture-name>/
├── description.md       # what's wrong in this fixture (ground truth)
├── snapshot/            # Figma snapshot at the time of the fixture
├── rendered/            # captured screenshots of the actual rendered output
├── expected/            # what the skill SHOULD report
│   └── findings.md
└── runs/                # actual skill outputs from each iteration
    ├── 2026-05-12-run-01.md
    └── ...
```

## Adding a fixture

1. Copy `_template/` to `<new-fixture-name>/`.
2. Fill in `description.md` — name the regressions, link to the source (PR, commit, manual capture).
3. Populate `snapshot/` — hand-capture Figma data using the existing crew Figma MCP access (`mcp__plugin_figma_figma__get_screenshot` for PNGs + `use_figma` for structural JSON). Match the shape the `crew figma-snapshot` CLI produces (once that lands via CREW-139): `composites/<node-id>.{png,json}` + `screens/<node-id>.{png,json}` + `index.json`.
4. Populate `rendered/` — boot the dashboard against the code state being tested, screenshot the affected components.
5. Populate `expected/findings.md` — what the skill should flag. Be specific: name the component, name the property, expected vs actual.

## Running the skill against a fixture

```
1. Open a chat session.
2. Invoke the `visual-fidelity-check` skill with the fixture's path as input.
3. Skill produces a findings report → save to `<fixture>/runs/YYYY-MM-DD-run-NN.md`.
4. Compare to `<fixture>/expected/findings.md`. For each finding:
   - **Hit** — matches an entry in expected
   - **Miss** — an expected finding the skill did not catch
   - **False positive** — a finding not in expected (could still be valid, flag for review)
5. If accuracy is low, edit the skill (SKILL.md + workflow.md) to address misses or false positives.
6. Re-run, save as run-NN+1, compare again.
7. Loop until accuracy is acceptable (user judgment).
```

## Why this exists

CREW-135 (PR #177) shipped with visual regressions because the dispatched agent had no source-of-truth Figma reference to compare its rendered output against. The Epic CREW-138 builds three pieces to close that gap:

1. **Figma snapshot generator** (CREW-139) — exports Figma to disk at dispatch time
2. **`visual-fidelity-check` skill** (in-chat manual work) — agent uses the snapshot as a reference
3. **This harness** — calibrates the skill against known-bad cases

Without the harness, "the skill exists" doesn't mean "the skill works". The harness gives us a closed loop: real failure → skill output → human review → skill refinement.

## Current fixtures

- **crew-135** — T1 Pill primitives PR #177. Outline missing, wrong icons, off padding. First calibration target.
