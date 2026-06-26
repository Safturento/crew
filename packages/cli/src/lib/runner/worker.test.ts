import { mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { formatLogLine, launchDetached } from './worker.js';

describe('formatLogLine', () => {
  it('prefixes an ISO timestamp and terminates with a newline', () => {
    const line = formatLogLine('claimed action 5', new Date('2026-06-04T19:00:00.000Z'));
    expect(line).toBe('[2026-06-04T19:00:00.000Z] claimed action 5\n');
  });
});

/** Poll until `file` contains `needle`, or throw after `timeoutMs`. */
async function waitForFileContaining(
  file: string,
  needle: string,
  timeoutMs = 5_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (existsSync(file)) {
      const body = readFileSync(file, 'utf8');
      if (body.includes(needle)) return body;
    }
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${needle} in ${file}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

describe('launchDetached startup-log capture', () => {
  it('redirects the child stdout+stderr to the append-mode log file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'crew-startup-'));
    const logFile = join(dir, 'nested', 'CREW-9.log');
    await launchDetached(
      'node',
      ['-e', 'process.stdout.write("OUT\\n"); process.stderr.write("ERR\\n")'],
      { cwd: dir, logFile },
    );
    const body = await waitForFileContaining(logFile, 'ERR');
    expect(body).toContain('OUT');
    expect(body).toContain('ERR');
  });

  it('captures output from a child that exits non-zero (pre-registration death)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'crew-startup-'));
    const logFile = join(dir, 'CREW-DEAD.log');
    await launchDetached('node', ['-e', 'process.stderr.write("boom\\n"); process.exit(1)'], {
      cwd: dir,
      logFile,
    });
    const body = await waitForFileContaining(logFile, 'boom');
    expect(body).toContain('boom');
  });

  it('still launches when the log dir cannot be created (best-effort capture)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'crew-startup-'));
    // A regular file in the parent makes mkdirSync(recursive) throw ENOTDIR —
    // an unwritable startup root must never wedge a dispatch.
    const notADir = join(dir, 'blocker');
    writeFileSync(notADir, 'x');
    const logFile = join(notADir, 'sub', 'CREW-9.log');
    const handle = await launchDetached('node', ['-e', 'process.exit(0)'], { cwd: dir, logFile });
    expect(handle.pid).toBeGreaterThan(0);
    expect(existsSync(logFile)).toBe(false);
  });
});
