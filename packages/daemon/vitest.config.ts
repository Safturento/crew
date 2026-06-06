import { defineConfig } from 'vitest/config';

// Daemon-local vitest config. Mirrors the repo-root config (node env) and
// adds a setup file that isolates CREW startup-event watching from the
// developer's real home dir — see src/test/setup.ts for the why.
export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
  },
});
