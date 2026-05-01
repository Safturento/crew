import { describe, it, expect } from 'vitest';

/**
 * Smoke tests that exercise the real module-load graph for every
 * subcommand. Per-command unit tests use vi.mock to satisfy imports,
 * which means a typo in an import path passes unit tests while the
 * binary fails at startup. These tests load the real modules and
 * confirm the registered commands look correct.
 */
describe('crew subcommand registry (real-module load smoke)', () => {
  it('every command exports a registered Command with the expected name', async () => {
    const expected: Array<[string, string]> = [
      ['./commands/run.js', 'run'],
      ['./commands/fix-pr.js', 'fix-pr'],
      ['./commands/finish.js', 'finish'],
      ['./commands/list.js', 'list'],
      ['./commands/reset.js', 'reset'],
      ['./commands/restart.js', 'restart'],
      ['./commands/resume.js', 'resume'],
      ['./commands/status.js', 'status'],
      ['./commands/docker-env.js', 'docker-env'],
      ['./commands/db-clone.js', 'db-clone'],
      ['./commands/daemon.js', 'daemon'],
    ];

    for (const [modPath, name] of expected) {
      const mod = (await import(modPath)) as Record<string, { name?(): string }>;
      const cmd = Object.values(mod).find(
        (v) => v && typeof v === 'object' && typeof v.name === 'function',
      );
      expect(cmd, `${modPath} should export a Command`).toBeDefined();
      expect(cmd!.name!()).toBe(name);
    }
  });
});
