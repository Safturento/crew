import { describe, it, expect, vi } from 'vitest';
import { execa } from 'execa';
import {
  enrichSnapshotWithPluginApi,
  defaultRunner,
  type ClaudeRunner,
  type ClaudeProbe,
} from './plugin-api-enrichment.js';

vi.mock('execa', () => ({ execa: vi.fn() }));

describe('enrichSnapshotWithPluginApi', () => {
  const baseOpts = {
    snapshotDir: '/tmp/fake-snapshot',
    fileKey: 'ABC123',
    log: () => {},
    warn: () => {},
  };

  it('skips when claude is not on PATH', async () => {
    const probe: ClaudeProbe = async () => null;
    const runner = vi.fn();
    const result = await enrichSnapshotWithPluginApi({
      ...baseOpts,
      probeClaude: probe,
      runClaude: runner as never,
    });
    expect(result).toEqual({ kind: 'skipped', reason: 'claude not on PATH' });
    expect(runner).not.toHaveBeenCalled();
  });

  it('returns ok with parsed summary on subprocess success', async () => {
    const probe: ClaudeProbe = async () => '/usr/local/bin/claude';
    const runner: ClaudeRunner = async () => ({
      exitCode: 0,
      stdout: 'some preamble text\n{"enrichedNodeCount":5,"errors":[]}',
      stderr: '',
    });
    const result = await enrichSnapshotWithPluginApi({
      ...baseOpts,
      probeClaude: probe,
      runClaude: runner,
    });
    expect(result).toEqual({
      kind: 'ok',
      enrichedNodeCount: 5,
      errors: [],
    });
  });

  it('returns warning when subprocess exits non-zero', async () => {
    const probe: ClaudeProbe = async () => '/usr/local/bin/claude';
    const runner: ClaudeRunner = async () => ({
      exitCode: 1,
      stdout: '',
      stderr: 'oh no',
    });
    const result = await enrichSnapshotWithPluginApi({
      ...baseOpts,
      probeClaude: probe,
      runClaude: runner,
    });
    expect(result.kind).toBe('warning');
    if (result.kind === 'warning') {
      expect(result.reason).toMatch(/exit/i);
    }
  });

  it('returns warning when subprocess stdout has no JSON summary on last line', async () => {
    const probe: ClaudeProbe = async () => '/usr/local/bin/claude';
    const runner: ClaudeRunner = async () => ({
      exitCode: 0,
      stdout: 'I did the thing.\nBut forgot to print the summary.',
      stderr: '',
    });
    const result = await enrichSnapshotWithPluginApi({
      ...baseOpts,
      probeClaude: probe,
      runClaude: runner,
    });
    expect(result.kind).toBe('warning');
    if (result.kind === 'warning') {
      expect(result.reason).toMatch(/summary/i);
    }
  });

  it('returns warning when summary parses but enrichedNodeCount is missing', async () => {
    const probe: ClaudeProbe = async () => '/usr/local/bin/claude';
    const runner: ClaudeRunner = async () => ({
      exitCode: 0,
      stdout: '{"foo":"bar"}',
      stderr: '',
    });
    const result = await enrichSnapshotWithPluginApi({
      ...baseOpts,
      probeClaude: probe,
      runClaude: runner,
    });
    expect(result.kind).toBe('warning');
  });

  it('returns warning when subprocess throws (timeout, kill, etc.)', async () => {
    const probe: ClaudeProbe = async () => '/usr/local/bin/claude';
    const runner: ClaudeRunner = async () => {
      throw new Error('TimeoutError');
    };
    const result = await enrichSnapshotWithPluginApi({
      ...baseOpts,
      probeClaude: probe,
      runClaude: runner,
    });
    expect(result.kind).toBe('warning');
    if (result.kind === 'warning') {
      expect(result.reason).toMatch(/TimeoutError/);
    }
  });

  describe('defaultRunner (real argv)', () => {
    it('invokes claude with --dangerously-skip-permissions so MCP calls are not denied', async () => {
      vi.mocked(execa).mockResolvedValueOnce({
        exitCode: 0,
        stdout: '{"enrichedNodeCount":0,"errors":[]}',
        stderr: '',
      } as never);

      await defaultRunner({
        claudePath: '/usr/local/bin/claude',
        prompt: 'enrich the snapshot',
        cwd: '/tmp/snap',
        timeoutMs: 90_000,
      });

      expect(execa).toHaveBeenCalledWith(
        '/usr/local/bin/claude',
        ['--dangerously-skip-permissions', '-p', 'enrich the snapshot'],
        expect.objectContaining({
          cwd: '/tmp/snap',
          timeout: 90_000,
          reject: false,
          env: expect.objectContaining({ PATH: expect.any(String) }),
        }),
      );
    });
  });

  it('passes the built prompt to the runner via the -p flag pattern', async () => {
    const probe: ClaudeProbe = async () => '/usr/local/bin/claude';
    const runner: ClaudeRunner = vi.fn(async () => ({
      exitCode: 0,
      stdout: '{"enrichedNodeCount":0,"errors":[]}',
      stderr: '',
    }));
    await enrichSnapshotWithPluginApi({
      ...baseOpts,
      probeClaude: probe,
      runClaude: runner,
    });
    const mock = vi.mocked(runner);
    expect(mock).toHaveBeenCalledTimes(1);
    const callArgs = mock.mock.calls[0]?.[0];
    if (!callArgs) throw new Error('runner not invoked');
    expect(callArgs.prompt).toContain(baseOpts.snapshotDir);
    expect(callArgs.prompt).toContain(baseOpts.fileKey);
  });
});
