/**
 * The answers a `crew init` wizard (CREW-229 / T6) collects, and the input
 * contract every scaffolder in this directory consumes. Kept prompt-agnostic:
 * the wizard maps `@inquirer/prompts` answers onto this shape, and the
 * playwright/bruno health-check `fix()`s (CREW-227 / T4) build it from a loaded
 * `ProjectConfig`. Scaffolders never read `process.cwd()` or prompt — they take
 * this object plus an explicit destination dir.
 */
export interface InitAnswers {
  /** Project name; also the `<name>.toml` filename and COMPOSE base. */
  name: string;
  /** Absolute path to the repo this config governs. */
  repoPath: string;
  /** Git default branch. Defaults to `main` when omitted. */
  defaultBranch?: string;
  jira: { projectKey: string; site: string };
  github: { repo: string };
  /** Present when the project runs a Docker stack. */
  docker?: { canonicalWorktree: string };
  /** Sandbox allow-list for crew dispatches. */
  sandbox?: { allowedDomains: string[] };
  /** Present when Playwright is opted in. */
  playwright?: {
    /**
     * `app_url` template written to the TOML. Defaults to `${APP_URL}` (resolved
     * per-worktree from `env.toml`). Pass a literal only for non-env-driven apps.
     */
    appUrl?: string;
    /** MCP-driven smoke flow (`[playwright.smoke]`). */
    smoke?: boolean;
    /** Authored e2e suite (`[playwright.authored]`). */
    authored?: { testsDir: string; testCommand: string };
  };
  /** Present when Bruno smoke is opted in. */
  brunoSmoke?: {
    /** `base_url` template. Defaults to `${DAEMON_URL}`. */
    baseUrl?: string;
    /** Collection dir, relative to the repo. Defaults to `bruno`. */
    collectionDir?: string;
  };
}
