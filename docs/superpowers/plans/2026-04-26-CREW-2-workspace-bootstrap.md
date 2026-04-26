# CREW-2 — Workspace Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the crew monorepo's tooling baseline — typecheck, lint, format, test all green on an empty CLI package — so every subsequent CREW-N ticket starts from a working scaffold.

**Architecture:** npm workspaces with placeholders for `cli`, `daemon`, `dashboard`, `shared`. Phase 1 only populates `cli`. Root holds shared tsconfig / eslint / prettier / vitest configs. CLI runs via `tsx` at invocation time — no build step. Bin entry `bin/crew.js` uses Node's `--import tsx` flag to load TS source directly.

**Tech Stack:** Node 22+, TypeScript, tsx, commander, execa, picocolors, ora, listr2, cli-table3, @inquirer/prompts, zod, smol-toml, vitest, eslint (flat config) + typescript-eslint, prettier.

**Spec:** `docs/plans/architecture.md` (Tech Stack table).

---

## File Structure

**New files at repo root:**

- `tsconfig.base.json` — shared TypeScript compiler options
- `eslint.config.js` — flat ESLint config covering all packages
- `.prettierrc` — Prettier formatting rules
- `vitest.config.ts` — Vitest defaults

**Modified at repo root:**

- `package.json` — adds scripts (`lint`, `format`, `typecheck`, `test`, `test:run`) + dev deps via `npm install`

**New per-package files:**

- `packages/daemon/package.json` — empty placeholder
- `packages/dashboard/package.json` — empty placeholder
- `packages/shared/package.json` — empty placeholder
- `packages/cli/package.json` — bin entry + Phase 1 deps
- `packages/cli/tsconfig.json` — extends `tsconfig.base.json`
- `packages/cli/bin/crew.js` — node shebang launcher (loads tsx, imports `src/index.ts`)
- `packages/cli/src/index.ts` — commander entry; produces help output
- `packages/cli/src/index.test.ts` — placeholder vitest test

---

## Task 1: Add base TypeScript config

**Files:**

- Create: `tsconfig.base.json`
- Create: `packages/cli/tsconfig.json`

- [ ] **Step 1: Create `tsconfig.base.json` at repo root**

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2023"],
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "verbatimModuleSyntax": true,
    "noEmit": true
  }
}
```

- [ ] **Step 2: Create `packages/cli/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Commit**

```bash
git add tsconfig.base.json packages/cli/tsconfig.json
git commit -m "feat(CREW-2): add base TypeScript config + cli tsconfig"
```

---

## Task 2: Add ESLint flat config

**Files:**

- Create: `eslint.config.js`

- [ ] **Step 1: Create `eslint.config.js` at repo root**

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**'],
  },
  prettier,
);
```

- [ ] **Step 2: Commit**

```bash
git add eslint.config.js
git commit -m "feat(CREW-2): add eslint flat config"
```

---

## Task 3: Add Prettier config

**Files:**

- Create: `.prettierrc`

- [ ] **Step 1: Create `.prettierrc`**

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

- [ ] **Step 2: Commit**

```bash
git add .prettierrc
git commit -m "feat(CREW-2): add prettier config"
```

---

## Task 4: Add Vitest config

**Files:**

- Create: `vitest.config.ts`

- [ ] **Step 1: Create `vitest.config.ts` at repo root**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add vitest.config.ts
git commit -m "feat(CREW-2): add vitest config"
```

---

## Task 5: Create placeholder package.jsons for daemon/dashboard/shared

These workspaces stay unpopulated through Phase 1. They need a `package.json` for the workspace declaration to resolve.

**Files:**

- Create: `packages/daemon/package.json`
- Create: `packages/dashboard/package.json`
- Create: `packages/shared/package.json`

- [ ] **Step 1: Create `packages/daemon/package.json`**

```json
{
  "name": "crew-daemon",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "description": "Placeholder for crew's state-tracking daemon. Populated in Phase 2."
}
```

- [ ] **Step 2: Create `packages/dashboard/package.json`**

```json
{
  "name": "crew-dashboard",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "description": "Placeholder for crew's web dashboard. Populated in Phase 3."
}
```

- [ ] **Step 3: Create `packages/shared/package.json`**

```json
{
  "name": "crew-shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "description": "Placeholder. Phase 1 lives in cli/src/lib/; this package gets populated in Phase 1.5 when the daemon needs the same modules."
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/daemon/package.json packages/dashboard/package.json packages/shared/package.json
git commit -m "feat(CREW-2): add placeholder package.jsons for unused workspaces"
```

---

## Task 6: Create cli/package.json

**Files:**

- Create: `packages/cli/package.json`

- [ ] **Step 1: Create `packages/cli/package.json`**

```json
{
  "name": "crew-cli",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "description": "The crew CLI.",
  "bin": {
    "crew": "./bin/crew.js"
  },
  "scripts": {
    "typecheck": "tsc -p tsconfig.json",
    "test": "vitest",
    "test:run": "vitest run"
  },
  "dependencies": {}
}
```

`dependencies` stays empty here — Task 8 populates it via `npm install --workspace=cli ...`. That's the canonical path so `package-lock.json` records actual installed versions.

- [ ] **Step 2: Commit**

```bash
git add packages/cli/package.json
git commit -m "feat(CREW-2): add cli package.json with bin entry"
```

---

## Task 7: Create cli bin script + src entry + placeholder test

**Files:**

- Create: `packages/cli/bin/crew.js`
- Create: `packages/cli/src/index.ts`
- Create: `packages/cli/src/index.test.ts`

- [ ] **Step 1: Create `packages/cli/bin/crew.js`**

```js
#!/usr/bin/env -S node --import tsx
import('../src/index.ts');
```

The shebang uses `env -S` to pass extra arguments; `node --import tsx` registers tsx as the ESM loader before user code runs, which lets the dynamic `import('../src/index.ts')` work without any build step.

- [ ] **Step 2: Make `packages/cli/bin/crew.js` executable**

```bash
chmod +x packages/cli/bin/crew.js
git update-index --add --chmod=+x packages/cli/bin/crew.js
```

The repo has `core.filemode = false`, so `chmod` alone doesn't propagate to the index — `git update-index --chmod=+x` is required for the executable bit to land in commits.

- [ ] **Step 3: Create `packages/cli/src/index.ts`**

```ts
import { Command } from 'commander';

const program = new Command();

program
  .name('crew')
  .description('CLI for orchestrating Claude Code agents on tickets')
  .version('0.0.0');

program.parse(process.argv);
```

This produces commander's default help output when invoked with `--help` or no args.

- [ ] **Step 4: Create `packages/cli/src/index.test.ts`**

```ts
import { describe, it, expect } from 'vitest';

describe('crew cli', () => {
  it('placeholder — vitest wiring works', () => {
    expect(true).toBe(true);
  });
});
```

This proves the test runner is wired up. Real tests land in CREW-3 onwards.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/bin/crew.js packages/cli/src/index.ts packages/cli/src/index.test.ts
git commit -m "feat(CREW-2): add cli bin launcher + commander entry + placeholder test"
```

---

## Task 8: Install dependencies

**Files:**

- Modify: `package.json` (devDependencies)
- Modify: `packages/cli/package.json` (dependencies)
- Create: `package-lock.json`

- [ ] **Step 1: Install root dev dependencies**

Use `--save-dev` and `@latest` per `CLAUDE.md` ("Always install the latest stable version").

```bash
cd ~/Repos/crew
npm install --save-dev \
  typescript@latest \
  tsx@latest \
  vitest@latest \
  eslint@latest \
  @eslint/js@latest \
  typescript-eslint@latest \
  eslint-config-prettier@latest \
  prettier@latest \
  @types/node@latest
```

Expected: dev deps written to root `package.json`; `package-lock.json` created with all transitive deps; `node_modules/` populated.

- [ ] **Step 2: Install cli runtime dependencies**

```bash
npm install --workspace=cli --save \
  commander@latest \
  execa@latest \
  picocolors@latest \
  ora@latest \
  listr2@latest \
  cli-table3@latest \
  '@inquirer/prompts@latest' \
  zod@latest \
  smol-toml@latest
```

Expected: `packages/cli/package.json` `dependencies` populated. Lockfile updated with cli's runtime deps.

- [ ] **Step 3: Verify the bin is symlinked**

```bash
ls -la node_modules/.bin/crew
```

Expected: a symlink pointing at `../crew-cli/bin/crew.js`.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json packages/cli/package.json
git commit -m "feat(CREW-2): install Phase 1 dependencies"
```

---

## Task 9: Verify the tooling baseline

This task is the acceptance gate. Every check must pass before declaring CREW-2 done.

Per the skills section of the agent prompt: invoke **`superpowers:verification-before-completion`** here. Run the actual commands; don't assume.

- [ ] **Step 1: typecheck**

```bash
npm run typecheck
```

Expected: zero errors. The `--workspaces --if-present` flag means only `cli` runs (others have no `typecheck` script). cli's `tsc -p tsconfig.json` is `noEmit: true` (from the base config), so it just checks types.

- [ ] **Step 2: lint**

```bash
npm run lint
```

Expected: zero warnings or errors across `packages/`. Note this command runs `eslint packages` (not `eslint packages --fix`); a fresh run on the placeholder code should be clean.

- [ ] **Step 3: format check**

```bash
npx prettier --check packages docs
```

Expected: no diffs. If anything's off, run `npm run format` once and re-check.

- [ ] **Step 4: tests**

```bash
npm run test:run
```

Expected: 1 test passes (the placeholder in `cli/src/index.test.ts`).

- [ ] **Step 5: npm link**

```bash
npm link
```

This symlinks `crew-cli`'s `bin/crew.js` into the user's global npm bin directory.

- [ ] **Step 6: verify `crew --help`**

```bash
crew --help
```

Expected output (or close to it — commander's exact format may vary):

```
Usage: crew [options] [command]

CLI for orchestrating Claude Code agents on tickets

Options:
  -V, --version  output the version number
  -h, --help     display help for command
```

- [ ] **Step 7: verify `crew --version`**

```bash
crew --version
```

Expected: `0.0.0`.

- [ ] **Step 8: Confirm clean working tree**

```bash
git status
```

Expected: nothing to commit. (If `package-lock.json` got further updates, those should already be committed in Task 8 Step 4.)

---

## Self-review

**Spec coverage:**

- ✅ Workspaces declared with placeholders for daemon/dashboard/shared (Tasks 5)
- ✅ cli populated with bin + src + test (Tasks 6, 7)
- ✅ Root tsconfig + per-package tsconfig (Task 1)
- ✅ ESLint flat config with the conventions inherited from Recipes-App (Task 2)
- ✅ Prettier config matching Recipes-App style (Task 3)
- ✅ Vitest config (Task 4)
- ✅ tsx as the runtime, no build step (Task 7's bin script + Task 8's tsx install)
- ✅ Phase 1 dependencies installed (Task 8)
- ✅ Acceptance criteria from the ticket: typecheck / lint / test / format / npm link / crew --help all verified (Task 9)

**Placeholder scan:** No "TBD" / "implement later" / unspecified-error-handling steps. Every code-changing step has full file contents. Every command step has expected output.

**Type consistency:** N/A — Phase 1 has no shared types yet. cli's `src/index.ts` only imports from `commander`, which is well-typed upstream.

**Scope:** Single workspace bootstrap for one package (`cli`) plus tooling. Right-sized for one ticket.

**Skills hooks:**

- `superpowers:verification-before-completion` invoked at Task 9 explicitly.
- `superpowers:test-driven-development` doesn't really fire here (this is config + placeholder code, no real logic to TDD); the placeholder test is just to prove the test runner works.
- `superpowers:systematic-debugging` would fire if any step's expected output differs — unlikely on greenfield setup, but the agent should invoke it rather than guess if something breaks.
- `superpowers:requesting-code-review` runs at Self-review time per the agent's `ticket-prompt.md` Step 9. Not part of this plan; the agent does it at PR time.
