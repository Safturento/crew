import { describe, it, expect, afterEach } from 'vitest';
import { execa } from 'execa';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPid, writePid, removePid, isProcessAlive } from './daemon.js';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'crew-cli-test-'));
  dirs.push(d);
  return d;
}

describe('PID file helpers', () => {
  it('readPid returns null when file is absent', () => {
    expect(readPid(join(tmp(), 'missing.pid'))).toBeNull();
  });

  it('writePid + readPid round-trip', () => {
    const path = join(tmp(), 'daemon.pid');
    writePid(path, 12345);
    expect(readPid(path)).toBe(12345);
  });

  it('readPid returns null and removes the file on garbage contents', () => {
    const path = join(tmp(), 'daemon.pid');
    writeFileSync(path, 'not-a-number');
    expect(readPid(path)).toBeNull();
    expect(existsSync(path)).toBe(false);
  });

  it('removePid is a no-op when file is absent', () => {
    expect(() => removePid(join(tmp(), 'missing.pid'))).not.toThrow();
  });

  it('isProcessAlive returns true for the current process', () => {
    expect(isProcessAlive(process.pid)).toBe(true);
  });

  it('isProcessAlive returns false for an obviously-dead PID', () => {
    expect(isProcessAlive(2 ** 22)).toBe(false);
  });
});

const CREW_BIN = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'bin', 'crew');

describe.skipIf(!process.env.CREW_RUN_INTEGRATION)('daemon lifecycle (integration)', () => {
  it('start → status → stop round-trip', async () => {
    const tmpDir = tmp();
    const env = {
      ...process.env,
      CREW_CONFIG_DIR: tmpDir,
      CREW_PORT: '17773',
      CREW_DB_FILE: join(tmpDir, 'state.db'),
      CREW_PID_FILE: join(tmpDir, 'daemon.pid'),
      CREW_LOG_FILE: join(tmpDir, 'daemon.log'),
    };
    await execa(CREW_BIN, ['daemon', 'start'], { env });

    const pidFile = join(tmpDir, 'daemon.pid');
    let alive = false;
    for (let i = 0; i < 50; i++) {
      const pid = readPid(pidFile);
      if (pid && isProcessAlive(pid)) {
        alive = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(alive).toBe(true);

    const status = await execa(CREW_BIN, ['daemon', 'status'], { env });
    expect(status.stdout).toMatch(/running/);

    await execa(CREW_BIN, ['daemon', 'stop'], { env });
    await new Promise((r) => setTimeout(r, 500));
    expect(readPid(pidFile)).toBeNull();
  }, 15_000);
});
