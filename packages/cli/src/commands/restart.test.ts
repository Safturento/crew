import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./reset.js', () => ({ runReset: vi.fn() }));
vi.mock('./resume.js', () => ({ runResume: vi.fn() }));
vi.mock('./run.js', () => ({ runRun: vi.fn() }));

import { runReset } from './reset.js';
import { runResume } from './resume.js';
import { runRun } from './run.js';
import { runRestart } from './restart.js';

describe('runRestart', () => {
  beforeEach(() => {
    vi.mocked(runReset).mockReset();
    vi.mocked(runResume).mockReset();
    vi.mocked(runRun).mockReset();
  });

  it('default: calls reset (hard=false) then resume', async () => {
    await runRestart('KAN-1', {});
    expect(runReset).toHaveBeenCalledWith('KAN-1', { hard: false });
    expect(runResume).toHaveBeenCalledWith('KAN-1', expect.objectContaining({}));
    expect(runRun).not.toHaveBeenCalled();
  });

  it('--hard: calls reset (hard=true) then run', async () => {
    await runRestart('KAN-1', { hard: true });
    expect(runReset).toHaveBeenCalledWith('KAN-1', { hard: true });
    expect(runRun).toHaveBeenCalledWith('KAN-1', expect.objectContaining({}));
    expect(runResume).not.toHaveBeenCalled();
  });

  it('passes -m through to the underlying command (default mode → resume)', async () => {
    await runRestart('KAN-1', { hard: false, message: 'try Y' });
    expect(runResume).toHaveBeenCalledWith('KAN-1', expect.objectContaining({ message: 'try Y' }));
  });

  it('passes -m through to the underlying command (--hard → run)', async () => {
    await runRestart('KAN-1', { hard: true, message: 'try Y' });
    expect(runRun).toHaveBeenCalledWith('KAN-1', expect.objectContaining({ message: 'try Y' }));
  });

  it('threads --skip-docker through to the underlying command', async () => {
    await runRestart('KAN-1', { hard: true, skipDocker: true });
    expect(runRun).toHaveBeenCalledWith('KAN-1', expect.objectContaining({ skipDocker: true }));
  });

  it('runs reset before resume in default mode (sequence matters)', async () => {
    const callOrder: string[] = [];
    vi.mocked(runReset).mockImplementation(async () => {
      callOrder.push('reset');
    });
    vi.mocked(runResume).mockImplementation(async () => {
      callOrder.push('resume');
    });
    await runRestart('KAN-1', {});
    expect(callOrder).toEqual(['reset', 'resume']);
  });
});
