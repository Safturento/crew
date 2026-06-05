import { describe, it, expect, vi } from 'vitest';
import {
  startRunner,
  stopRunner,
  runnerStatus,
  runSupervisor,
  type StartDeps,
  type StopDeps,
  type StatusDeps,
  type SuperviseDeps,
} from './supervisor.js';

function startDeps(over: Partial<StartDeps> = {}): StartDeps {
  return {
    readPid: () => null,
    writePid: vi.fn(),
    isAlive: () => false,
    ensureLogDir: () => ({ dir: '/logs', writable: true }),
    spawnDetached: () => 4242,
    log: vi.fn(),
    ...over,
  };
}

describe('startRunner', () => {
  it('spawns a detached supervisor and records its pid when none is running', () => {
    const writePid = vi.fn();
    const result = startRunner(startDeps({ writePid, spawnDetached: () => 4242 }));
    expect(result).toEqual({ started: true, pid: 4242, alreadyRunning: false });
    expect(writePid).toHaveBeenCalledWith(4242);
  });

  it('is a no-op when a live runner already holds the pidfile', () => {
    const spawnDetached = vi.fn(() => 1);
    const result = startRunner(
      startDeps({ readPid: () => 999, isAlive: (p) => p === 999, spawnDetached }),
    );
    expect(result).toEqual({ started: false, pid: 999, alreadyRunning: true });
    expect(spawnDetached).not.toHaveBeenCalled();
  });

  it('does not record a pidfile when the spawn yields no valid pid', () => {
    const writePid = vi.fn();
    const result = startRunner(startDeps({ spawnDetached: () => -1, writePid }));
    expect(result).toEqual({ started: false, pid: -1, alreadyRunning: false });
    expect(writePid).not.toHaveBeenCalled();
  });

  it('replaces a stale pidfile (dead pid) by spawning fresh', () => {
    const writePid = vi.fn();
    const result = startRunner(
      startDeps({ readPid: () => 13, isAlive: () => false, spawnDetached: () => 77, writePid }),
    );
    expect(result.started).toBe(true);
    expect(result.pid).toBe(77);
    expect(writePid).toHaveBeenCalledWith(77);
  });

  it('aborts with a remediation message when the log dir is not writable', () => {
    const spawnDetached = vi.fn(() => 4242);
    const writePid = vi.fn();
    const result = startRunner(
      startDeps({
        ensureLogDir: () => ({ dir: '/logs', writable: false }),
        spawnDetached,
        writePid,
      }),
    );
    expect(result.started).toBe(false);
    expect(result.logDirError).toContain('/logs');
    expect(result.logDirError).toContain('chown');
    expect(spawnDetached).not.toHaveBeenCalled();
    expect(writePid).not.toHaveBeenCalled();
  });

  it('does not probe the log dir when a live runner already holds the pidfile', () => {
    const ensureLogDir = vi.fn(() => ({ dir: '/logs', writable: true }));
    startRunner(startDeps({ readPid: () => 999, isAlive: () => true, ensureLogDir }));
    expect(ensureLogDir).not.toHaveBeenCalled();
  });
});

function stopDeps(over: Partial<StopDeps> = {}): StopDeps {
  return {
    readPid: () => 500,
    isAlive: () => true,
    kill: vi.fn(),
    removePid: vi.fn(),
    log: vi.fn(),
    ...over,
  };
}

describe('stopRunner', () => {
  it('SIGTERMs the live pid and removes the pidfile', () => {
    const kill = vi.fn();
    const removePid = vi.fn();
    const result = stopRunner(stopDeps({ readPid: () => 500, kill, removePid }));
    expect(result).toEqual({ stopped: true });
    expect(kill).toHaveBeenCalledWith(500, 'SIGTERM');
    expect(removePid).toHaveBeenCalled();
  });

  it('reports not_running and signals nothing when no pidfile exists', () => {
    const kill = vi.fn();
    const result = stopRunner(stopDeps({ readPid: () => null, kill }));
    expect(result).toEqual({ stopped: false, reason: 'not_running' });
    expect(kill).not.toHaveBeenCalled();
  });

  it('cleans up a stale pidfile without signalling a dead pid', () => {
    const kill = vi.fn();
    const removePid = vi.fn();
    const result = stopRunner(
      stopDeps({ readPid: () => 9, isAlive: () => false, kill, removePid }),
    );
    expect(result).toEqual({ stopped: true });
    expect(kill).not.toHaveBeenCalled();
    expect(removePid).toHaveBeenCalled();
  });
});

describe('runnerStatus', () => {
  function statusDeps(over: Partial<StatusDeps> = {}): StatusDeps {
    return {
      readPid: () => 100,
      isAlive: () => true,
      checkDaemon: async () => true,
      ...over,
    };
  }

  it('reports running + daemon reachable', async () => {
    const report = await runnerStatus(statusDeps());
    expect(report).toEqual({ running: true, pid: 100, daemonReachable: true });
  });

  it('reports not running when the pid is dead, and nulls the pid', async () => {
    const report = await runnerStatus(
      statusDeps({ isAlive: () => false, checkDaemon: async () => false }),
    );
    expect(report).toEqual({ running: false, pid: null, daemonReachable: false });
  });
});

describe('runSupervisor', () => {
  function superviseDeps(over: Partial<SuperviseDeps> = {}): SuperviseDeps {
    return {
      spawnWorker: () => ({ exited: Promise.resolve(0) }),
      shouldStop: () => true,
      sleep: vi.fn().mockResolvedValue(undefined),
      log: vi.fn(),
      ...over,
    };
  }

  it('does not respawn after a clean worker exit', async () => {
    const spawnWorker = vi.fn(() => ({ exited: Promise.resolve(0) }));
    await runSupervisor(
      superviseDeps({
        spawnWorker,
        shouldStop: () => false,
      }),
    );
    // shouldStop starts false → spawn once → exit 0 → break.
    expect(spawnWorker).toHaveBeenCalledTimes(1);
  });

  it('respawns the worker after a crash (non-zero exit)', async () => {
    let calls = 0;
    const spawnWorker = vi.fn(() => {
      calls += 1;
      return { exited: Promise.resolve(calls === 1 ? 1 : 0) };
    });
    await runSupervisor(superviseDeps({ spawnWorker, shouldStop: () => false }));
    // crash (1) → respawn → clean (0) → stop.
    expect(spawnWorker).toHaveBeenCalledTimes(2);
  });

  it('stops respawning once shouldStop flips, even on a crash', async () => {
    let stop = false;
    const spawnWorker = vi.fn(() => {
      stop = true; // emulate SIGTERM landing during the worker's life
      return { exited: Promise.resolve(1) };
    });
    await runSupervisor(superviseDeps({ spawnWorker, shouldStop: () => stop }));
    expect(spawnWorker).toHaveBeenCalledTimes(1);
  });
});
