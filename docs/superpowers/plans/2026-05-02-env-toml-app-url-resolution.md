# `env.toml`-aware app URL resolution — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the regression that surfaced after CREW-78/79/80 shipped: when a project has `env.toml`, `crew run`'s `bringUpWorktreeEnv` env-spec branch returns no port data, so downstream `resolveAppUrl` calls (for `[playwright].app_url` and `[bruno_smoke].base_url`) explode on the legacy `{httpsPort}` placeholder. Fix it by extending `resolveAppUrl` to accept materialized env vars alongside legacy ports, and by introducing a modern `${VAR}` syntax in project TOML that points at any env-toml-declared variable. Backwards compatible: legacy `{httpsPort}` keeps working for projects without `env.toml`; projects WITH `env.toml` must use `${VAR}` syntax (clear error otherwise).

**Architecture:** `resolveAppUrl(template, ports, envVars)` — three sources, dual placeholder syntax. `{httpPort}` / `{httpsPort}` / `{postgresPort}` resolve from `ports` (existing behavior, unchanged for legacy projects). `${VAR}` resolves from `envVars` (the materialized base map from `materialize()`). `bringUpWorktreeEnv`'s env-spec variant returns the base map; `runRun` passes it through to every `resolveAppUrl` callsite. A clear error fires when the template uses a syntax for a source that wasn't supplied (e.g. `${APP_URL}` with no `envVars`, or `{httpsPort}` for an env.toml project where ports aren't tracked in the legacy shape).

**Tech Stack:** TypeScript ESM, Vitest (existing test infra). No new deps.

**Spec:** [`docs/superpowers/specs/2026-05-02-cross-project-env-setup-design.md`](https://github.com/Safturento/Recipes/blob/main/docs/superpowers/specs/2026-05-02-cross-project-env-setup-design.md) (in the Recipes repo). The design originally treated `APP_URL` as a first-class env-toml variable but didn't follow through to crew's app-URL resolution path; this plan completes the integration.

**Recipes counterpart:** None as a repo PR. The user updates `~/.config/crew/projects/recipes.toml` manually after this lands — change `[playwright].app_url` and `[bruno_smoke].base_url` from `"https://localhost:{httpsPort}"` to `"${APP_URL}"`. Documented as a user-action step in the rollout below.

---

## File Structure

**Modified:**
- `packages/cli/src/lib/playwright/resolve-app-url.ts` — extend `resolveAppUrl` signature with optional `envVars`; support `${VAR}` syntax alongside existing `{xxxPort}` placeholders; clearer errors when a syntax is used without its source.
- `packages/cli/src/lib/playwright/resolve-app-url.test.ts` — add tests for `${VAR}` syntax, mixed-syntax templates, and missing-source error cases.
- `packages/cli/src/commands/run.ts` — `BringUpWorktreeEnvResult`'s env-spec variant carries the materialized base map; `runRun` passes it as the third argument to every `resolveAppUrl` callsite. Add a clear error when env.toml is present but project TOML uses legacy `{xxxPort}` placeholders.
- `packages/cli/src/commands/run.test.ts` — add an integration test that exercises the env-spec → `resolveAppUrl` path end-to-end (the test gap that allowed this regression to ship).
- `README.md` — extend the "Project setup with `env.toml`" section to document the dual placeholder syntaxes, recommend `${VAR}` for env.toml projects, note the legacy `{xxxPort}` is for pre-env.toml projects only.
- `docs/followups.md` — amend the existing `2026-04-30 — Unified crew init / crew doctor onboarding helper` entry: the wizard scaffolds project TOMLs with `${APP_URL}`-style syntax, never legacy `{httpsPort}` placeholders, even though crew still supports the legacy form.

**Untouched:**
- `packages/cli/src/lib/env-spec/*` — env.toml schema, parser, materializer all stay as-is. The fix is at the consumer layer.
- `packages/cli/src/lib/docker/env.ts` (`writeDockerEnv`) — legacy path stays intact for projects without env.toml.

---

## Task 1: Extend `resolveAppUrl` for `${VAR}` syntax

**Files:**
- Modify: `packages/cli/src/lib/playwright/resolve-app-url.ts`
- Modify: `packages/cli/src/lib/playwright/resolve-app-url.test.ts`

The function gains an optional third parameter `envVars: Record<string, string> | undefined`. Templates can use either syntax; both can coexist in one template (rare in practice but supported). Errors are explicit about which source was missing.

- [ ] **Step 1: Write failing tests for `${VAR}` syntax**

Append to `packages/cli/src/lib/playwright/resolve-app-url.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveAppUrl } from './resolve-app-url.js';

describe('resolveAppUrl — ${VAR} syntax', () => {
  it('substitutes ${VAR} from envVars', () => {
    const result = resolveAppUrl('${APP_URL}', undefined, { APP_URL: 'https://localhost:443' });
    expect(result.raw).toBe('https://localhost:443');
    expect(result.substitutions).toEqual({ '${APP_URL}': 'https://localhost:443' });
  });

  it('substitutes ${VAR} embedded in a longer template', () => {
    const result = resolveAppUrl('${APP_URL}/health', undefined, { APP_URL: 'https://x.test' });
    expect(result.raw).toBe('https://x.test/health');
  });

  it('throws when ${VAR} is used but envVars is undefined', () => {
    expect(() => resolveAppUrl('${APP_URL}', undefined, undefined)).toThrow(
      /\$\{APP_URL\} used but env vars were not provided/i,
    );
  });

  it('throws when ${VAR} references an unknown key in envVars', () => {
    expect(() => resolveAppUrl('${MISSING}', undefined, { OTHER: 'x' })).toThrow(
      /\$\{MISSING\} used but no such variable in materialized env/i,
    );
  });

  it('supports both syntaxes in one template (mixed)', () => {
    const result = resolveAppUrl(
      '${BASE}:{httpsPort}',
      { httpPort: 80, httpsPort: 8443, postgresPort: 5432 },
      { BASE: 'https://example.test' },
    );
    expect(result.raw).toBe('https://example.test:8443');
  });

  it('preserves existing {xxxPort} behavior when envVars is omitted', () => {
    const result = resolveAppUrl('https://localhost:{httpsPort}', {
      httpPort: 80,
      httpsPort: 443,
      postgresPort: 5432,
    });
    expect(result.raw).toBe('https://localhost:443');
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
cd /home/safturento/Repos/crew
npm run test:run --workspace=cli -- packages/cli/src/lib/playwright/resolve-app-url.test.ts
```

Expected: the new tests fail (current `resolveAppUrl` only knows the `{xxxPort}` placeholder regex).

- [ ] **Step 3: Implement the extended resolver**

Replace `packages/cli/src/lib/playwright/resolve-app-url.ts` with:

```ts
export interface ResolvedAppUrl {
  raw: string;
  substitutions: Record<string, string>;
}

export interface DockerPorts {
  httpPort: number;
  httpsPort: number;
  postgresPort: number;
}

const PLACEHOLDER_TO_PORT_KEY = {
  '{httpPort}': 'httpPort',
  '{httpsPort}': 'httpsPort',
  '{postgresPort}': 'postgresPort',
} as const;

const LEGACY_PLACEHOLDER_RE = /\{[a-zA-Z]+Port\}/g;
const ENV_VAR_RE = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

/**
 * Resolve placeholders in `template` using one or two sources:
 *
 * - Legacy `{httpPort}` / `{httpsPort}` / `{postgresPort}` substitute from
 *   `ports` (the `writeDockerEnv` shape; for projects without `env.toml`).
 * - `${VAR}` substitutes from `envVars` (the materialized base map produced
 *   by `materialize()`; for projects with `env.toml`).
 *
 * Both syntaxes can coexist in one template. Throws with a specific message
 * when a placeholder is used but its source wasn't supplied.
 */
export function resolveAppUrl(
  template: string,
  ports: DockerPorts | undefined,
  envVars: Record<string, string> | undefined = undefined,
): ResolvedAppUrl {
  const substitutions: Record<string, string> = {};

  let raw = template.replace(LEGACY_PLACEHOLDER_RE, (match) => {
    const key = PLACEHOLDER_TO_PORT_KEY[match as keyof typeof PLACEHOLDER_TO_PORT_KEY];
    if (!key) {
      throw new Error(`resolveAppUrl: unknown placeholder ${match}`);
    }
    if (!ports) {
      throw new Error(
        `resolveAppUrl: ${match} used but ports were not provided. ` +
          `Projects with env.toml should use \${VAR} syntax instead — see the README.`,
      );
    }
    const value = String(ports[key]);
    substitutions[match] = value;
    return value;
  });

  raw = raw.replace(ENV_VAR_RE, (match, name: string) => {
    if (!envVars) {
      throw new Error(
        `resolveAppUrl: ${match} used but env vars were not provided. ` +
          `${match} is only valid for projects with env.toml.`,
      );
    }
    if (!(name in envVars)) {
      throw new Error(
        `resolveAppUrl: ${match} used but no such variable in materialized env. ` +
          `Available: ${Object.keys(envVars).sort().join(', ')}`,
      );
    }
    const value = envVars[name]!;
    substitutions[match] = value;
    return value;
  });

  return { raw, substitutions };
}
```

- [ ] **Step 4: Run tests, expect pass**

```bash
npm run test:run --workspace=cli -- packages/cli/src/lib/playwright/resolve-app-url.test.ts
```

Expected: all tests pass (existing legacy ones plus the 6 new ones).

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/lib/playwright/resolve-app-url.ts packages/cli/src/lib/playwright/resolve-app-url.test.ts
git commit -m "feat(playwright): resolveAppUrl supports \${VAR} syntax for env.toml projects"
```

---

## Task 2: `BringUpWorktreeEnvResult` carries the materialized base map

**Files:**
- Modify: `packages/cli/src/commands/run.ts:66-68` (the result type)
- Modify: `packages/cli/src/commands/run.ts:97` (the env-spec return)

- [ ] **Step 1: Locate the existing return type**

```bash
grep -n "BringUpWorktreeEnvResult\|kind: 'env-spec'" packages/cli/src/commands/run.ts
```

Confirm it's at line 66 (type) and line 97 (return value).

- [ ] **Step 2: Update the type and the return**

In `packages/cli/src/commands/run.ts`, change:

```ts
export type BringUpWorktreeEnvResult =
  | { kind: 'env-spec' }
  | { kind: 'legacy'; legacy: WriteDockerEnvResult };
```

to:

```ts
export type BringUpWorktreeEnvResult =
  | { kind: 'env-spec'; base: Record<string, string> }
  | { kind: 'legacy'; legacy: WriteDockerEnvResult };
```

And in the env-spec branch of `bringUpWorktreeEnv`, change:

```ts
emit({ worktreeRoot: opts.worktree, base: result.base, contexts: result.contexts });
return { kind: 'env-spec' };
```

to:

```ts
emit({ worktreeRoot: opts.worktree, base: result.base, contexts: result.contexts });
return { kind: 'env-spec', base: result.base };
```

- [ ] **Step 3: Typecheck — must surface every consumer site**

```bash
npm run typecheck --workspace=cli
```

Expected: TS errors at every place that destructures `BringUpWorktreeEnvResult` and treats env-spec as data-less. Note the locations — they're the next task's targets.

- [ ] **Step 4: Commit (tests come in Task 3 alongside the consumer-site fix)**

```bash
git add packages/cli/src/commands/run.ts
git commit -m "feat(run): bringUpWorktreeEnv env-spec result carries base map"
```

---

## Task 3: Pass `envVars` through `resolveAppUrl` callsites in `runRun`

**Files:**
- Modify: `packages/cli/src/commands/run.ts:246-298` (`dockerPorts` setup + `resolveAppUrl` calls)
- Modify: `packages/cli/src/commands/run.test.ts` (integration test for env-spec → `resolveAppUrl`)

This is where the regression happens — env-spec branch left `dockerPorts` undefined and never tracked the materialized base map. Now we track both: `dockerPorts` for legacy projects, `envVars` for env-spec projects, and pass whichever applies to every `resolveAppUrl` call.

- [ ] **Step 1: Write the failing integration test**

Append to `packages/cli/src/commands/run.test.ts`:

```ts
describe('crew run + env.toml: app URL resolution', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'crew-run-appurl-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('resolves \${APP_URL} from the materialized env-spec base map', async () => {
    const canonical = join(dir, 'fake-project');
    mkdirSync(canonical);
    writeFileSync(
      join(canonical, 'env.toml'),
      `
schema = 1
[orchestration]
HTTPS_PORT = { kind = "port", default = 443 }
APP_URL    = { kind = "template", value = "https://localhost:\${HTTPS_PORT}" }
[app]
`,
    );

    const { bringUpWorktreeEnv } = await import('./run.js');
    const result = await bringUpWorktreeEnv({
      worktree: canonical,
      canonicalWorktreeName: 'fake-project',
      projectName: 'fake-project',
    });

    expect(result.kind).toBe('env-spec');
    if (result.kind !== 'env-spec') return; // narrow for TS
    expect(result.base.APP_URL).toBe('https://localhost:443');
    expect(result.base.HTTPS_PORT).toBe('443');

    // Sanity-check: the base map is shaped right for resolveAppUrl.
    const { resolveAppUrl } = await import('../lib/playwright/resolve-app-url.js');
    const resolved = resolveAppUrl('${APP_URL}/health', undefined, result.base);
    expect(resolved.raw).toBe('https://localhost:443/health');
  });

  it('errors clearly when project TOML uses {httpsPort} on an env.toml project', async () => {
    const canonical = join(dir, 'fake-project-mixed');
    mkdirSync(canonical);
    writeFileSync(
      join(canonical, 'env.toml'),
      `
schema = 1
[orchestration]
HTTPS_PORT = { kind = "port", default = 443 }
[app]
`,
    );

    const { bringUpWorktreeEnv } = await import('./run.js');
    const result = await bringUpWorktreeEnv({
      worktree: canonical,
      canonicalWorktreeName: 'fake-project-mixed',
      projectName: 'fake-project-mixed',
    });
    expect(result.kind).toBe('env-spec');

    // Caller passes legacy template → no `ports` (env-spec path doesn't
    // populate them) → resolveAppUrl errors with the clear migration message.
    const { resolveAppUrl } = await import('../lib/playwright/resolve-app-url.js');
    expect(() =>
      resolveAppUrl('https://localhost:{httpsPort}', undefined, result.kind === 'env-spec' ? result.base : undefined),
    ).toThrow(/should use \$\{VAR\} syntax/i);
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
npm run test:run --workspace=cli -- packages/cli/src/commands/run.test.ts
```

Expected: FAIL — the typecheck warnings from Task 2 are still in `runRun` (legacy-only `dockerPorts` handling).

- [ ] **Step 3: Wire `envVars` through `runRun`**

In `packages/cli/src/commands/run.ts` around line 246, change the existing block:

```ts
let dockerPorts: { httpPort: number; httpsPort: number; postgresPort: number } | undefined;
if (config.docker) {
  const result = await bringUpWorktreeEnv({...});
  if (result.kind === 'legacy') {
    const env = result.legacy;
    dockerPorts = { httpPort: env.caddyHttpPort, httpsPort: env.caddyHttpsPort, postgresPort: env.postgresPort };
    // ... existing logging
  } else {
    console.log(pc.dim(`→ materialized ${join(worktree, '.env')} from env.toml`));
  }
}
```

to also track the env-spec base map:

```ts
let dockerPorts: { httpPort: number; httpsPort: number; postgresPort: number } | undefined;
let envVars: Record<string, string> | undefined;
if (config.docker) {
  const result = await bringUpWorktreeEnv({...});
  if (result.kind === 'legacy') {
    const env = result.legacy;
    dockerPorts = { httpPort: env.caddyHttpPort, httpsPort: env.caddyHttpsPort, postgresPort: env.postgresPort };
    console.log(pc.dim(`→ wrote ${env.envPath}`));
    console.log(pc.dim(`    project: ${env.composeProjectName}`));
    console.log(pc.dim(`    http:    ${env.caddyHttpPort}`));
    console.log(pc.dim(`    https:   ${env.caddyHttpsPort}`));
    console.log(pc.dim(`    pg:      ${env.postgresPort}`));
    console.log(pc.dim(`    url:     ${env.appUrl}`));
  } else {
    envVars = result.base;
    console.log(pc.dim(`→ materialized ${join(worktree, '.env')} from env.toml`));
    if (envVars.APP_URL) {
      console.log(pc.dim(`    url:     ${envVars.APP_URL}`));
    }
  }
}
```

Then update every `resolveAppUrl` call site in `runRun` to pass `envVars` as the third arg. Search for them:

```bash
grep -n "resolveAppUrl(" packages/cli/src/commands/run.ts
```

For each callsite (currently `config.bruno_smoke.base_url` at ~line 274 and any others under `prepareAgentEnvironment`), add `envVars`:

```ts
// before
resolveAppUrl(config.bruno_smoke.base_url, dockerPorts).raw;

// after
resolveAppUrl(config.bruno_smoke.base_url, dockerPorts, envVars).raw;
```

`prepareAgentEnvironment` likely also calls `resolveAppUrl` for `[playwright].app_url` — check `packages/cli/src/lib/run/` for it and update the signature + pass `envVars` through:

```bash
grep -rn "resolveAppUrl(" packages/cli/src/
```

Update every callsite. Update any intermediate function signatures (`prepareAgentEnvironment`, etc.) to accept and forward `envVars` alongside `dockerPorts`.

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck --workspace=cli
```

Expected: no errors.

- [ ] **Step 5: Run tests**

```bash
npm run test:run --workspace=cli -- packages/cli/src/commands/run.test.ts
```

Expected: the two new integration tests pass.

- [ ] **Step 6: Run the full CLI test suite to catch regressions**

```bash
npm run test:run --workspace=cli
```

Expected: all suites green.

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/commands/run.ts packages/cli/src/commands/run.test.ts packages/cli/src/lib/run/
git commit -m "feat(run): pass materialized envVars through resolveAppUrl callsites"
```

---

## Task 4: Documentation + setup-wizard followup amendment

**Files:**
- Modify: `README.md`
- Modify: `docs/followups.md`

- [ ] **Step 1: Extend README's "Project setup with `env.toml`" section**

After the "Materialization rules" subsection in `README.md`, add a new subsection:

````markdown
### App URL resolution in project TOML

`[playwright].app_url` and `[bruno_smoke].base_url` in your `~/.config/crew/projects/<name>.toml` resolve placeholders before crew passes the URL to the agent. Two syntaxes are supported:

- **`${VAR}`** — substitutes from the materialized `env.toml` base map. Use this for projects with an `env.toml`. Example:

  ```toml
  [playwright]
  app_url = "${APP_URL}"
  
  [bruno_smoke]
  base_url = "${APP_URL}"
  ```

  Any variable declared in the project's `env.toml` (orchestration, app, files-with-`env_var`, even built-ins like `${BASE_NAME}`) can be referenced.

- **`{httpPort}` / `{httpsPort}` / `{postgresPort}`** — legacy syntax for projects *without* `env.toml`. Substitutes from the fixed `writeDockerEnv` port shape. Don't use this for env.toml projects — crew can't populate the legacy ports map from a generic env.toml schema, and you'll get a clear error pointing you at the `${VAR}` form.

Both syntaxes can coexist in one template (e.g., `${BASE_URL}:{httpsPort}/api`), but in practice projects use one or the other. The `${VAR}` form is the modern way.
````

- [ ] **Step 2: Amend the setup-wizard followup**

Edit `docs/followups.md`. Find the entry `### 2026-04-30 — Unified crew init / crew doctor onboarding helper`. The existing scaffolding bullet (added in CREW-80) already mentions `env.toml`. Tighten the language to make `${VAR}`-syntax explicit. Find:

```markdown
- **New project**: walk through writing the TOML, **scaffold an `env.toml` at the project repo root** (prompt for orchestration ports, app vars, contexts; populate sensible defaults), run `npm install -D @playwright/test` if Playwright is opted in, scaffold `playwright.config.ts` + `tests/e2e/` skeleton, scaffold Bruno collection skeleton if opted in.
```

Replace with:

```markdown
- **New project**: walk through writing the TOML, **scaffold an `env.toml` at the project repo root** (prompt for orchestration ports, app vars, contexts; populate sensible defaults). The scaffolded project TOML at `~/.config/crew/projects/<name>.toml` MUST use `${VAR}`-style references (e.g. `app_url = "${APP_URL}"`) for `[playwright].app_url` and `[bruno_smoke].base_url`, never the legacy `{httpsPort}` placeholders — `${VAR}` is the only correct syntax for env.toml projects, even though crew still accepts legacy `{httpsPort}` for projects without env.toml. Run `npm install -D @playwright/test` if Playwright is opted in, scaffold `playwright.config.ts` + `tests/e2e/` skeleton, scaffold Bruno collection skeleton if opted in.
```

- [ ] **Step 3: Commit**

```bash
git add README.md docs/followups.md
git commit -m "docs: \${VAR} syntax for project TOML + setup-wizard scaffolding mandate"
```

---

## Final verification

- [ ] **Step 1: Full test suite**

```bash
npm run test:run
```

Expected: all packages green.

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Manual end-to-end smoke against Recipes**

After this PR merges and a new crew is published, the user updates their `~/.config/crew/projects/recipes.toml`:

```toml
[playwright]
app_url = "${APP_URL}"
# (instead of "https://localhost:{httpsPort}")

[bruno_smoke]
base_url = "${APP_URL}"
# (instead of "https://localhost:{httpsPort}")
```

Then `crew run KAN-12` (or whatever frontend ticket comes next). Expected: env-spec materialization succeeds, `resolveAppUrl` produces `https://localhost:<port>` from `${APP_URL}`, agent dispatches normally, no `resolveAppUrl: ... ports were not provided` error.

- [ ] **Step 4: Push and open PR**

```bash
git push -u origin <your-branch>
gh pr create --title "fix: \${VAR} syntax in project TOML for env.toml projects" \
  --body "Closes the regression that surfaced after CREW-78/79/80: env-spec branch returned no port data, crashing resolveAppUrl. ..."
```

Cross-link the PR to KAN-44 and to whichever new CREW ticket tracks this work.

## Rollout note

This PR ships ahead of any user-side change to `recipes.toml`. After it lands and a new crew version is published, the user updates the two TOML fields manually. The Recipes repo itself doesn't need a code or PR change.
