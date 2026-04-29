import { describe, it, expect } from 'vitest';
import { startCommandHint } from './start-command-hint.js';

describe('startCommandHint', () => {
  it('returns the docker hint when no startCommand is provided', () => {
    const hint = startCommandHint({ appUrl: 'https://localhost:18443', startCommand: undefined });
    expect(hint).toContain('docker stack is already running');
    expect(hint).toContain('https://localhost:18443');
  });

  it('returns the start_command hint when a startCommand is provided', () => {
    const hint = startCommandHint({
      appUrl: 'http://localhost:5173',
      startCommand: 'npm run dev',
    });
    expect(hint).toContain('npm run dev');
    expect(hint).toContain('Wait for the dev server to be reachable');
  });
});
