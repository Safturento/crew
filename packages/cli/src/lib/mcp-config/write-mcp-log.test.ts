import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeMcpDiagnosticLog } from './write-mcp-log.js';

describe('writeMcpDiagnosticLog', () => {
  it('writes a log that captures resolved chrome + playwright paths and warnings', () => {
    const dir = mkdtempSync(join(tmpdir(), 'crew-mcp-log-'));
    const logPath = join(dir, 'crew-mcp.log');
    const mcpJsonPath = join(dir, '.mcp.json');
    writeFileSync(
      mcpJsonPath,
      JSON.stringify(
        {
          mcpServers: {
            playwright: { command: 'npx', args: ['-y', '@playwright/mcp@latest'] },
            chrome: { command: 'node', args: ['/abs/superpowers-chrome/2.0.0/mcp/dist/index.js'] },
          },
        },
        null,
        2,
      ),
    );

    writeMcpDiagnosticLog({
      logPath,
      mcpJsonPath,
      chromiumPath: '/abs/ms-playwright/chromium-1217/chrome-linux64/chrome',
      chromeMcpPath: '/abs/superpowers-chrome/2.0.0/mcp/dist/index.js',
      wantsPlaywright: true,
      wantsChrome: true,
      warnings: [],
    });

    const content = readFileSync(logPath, 'utf8');
    expect(content).toContain('playwright requested: true');
    expect(content).toContain('chrome requested: true');
    expect(content).toContain('/abs/ms-playwright/chromium-1217/chrome-linux64/chrome');
    expect(content).toContain('/abs/superpowers-chrome/2.0.0/mcp/dist/index.js');
    expect(content).toContain('.mcp.json contents');
    expect(content).toContain('"playwright"');
    expect(content).toContain('"chrome"');
  });

  it('records unresolved paths and surfaces plugin-absent warnings', () => {
    const dir = mkdtempSync(join(tmpdir(), 'crew-mcp-log-'));
    const logPath = join(dir, 'crew-mcp.log');
    const mcpJsonPath = join(dir, '.mcp.json');
    writeFileSync(mcpJsonPath, JSON.stringify({ mcpServers: {} }, null, 2));

    writeMcpDiagnosticLog({
      logPath,
      mcpJsonPath,
      chromiumPath: null,
      chromeMcpPath: null,
      wantsPlaywright: false,
      wantsChrome: true,
      warnings: ['superpowers-chrome plugin not found in ~/.claude/plugins/cache/'],
    });

    const content = readFileSync(logPath, 'utf8');
    expect(content).toContain('chrome MCP: <unresolved>');
    expect(content).toContain('superpowers-chrome plugin not found');
  });

  it('tolerates a missing .mcp.json gracefully (records the absence)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'crew-mcp-log-'));
    const logPath = join(dir, 'crew-mcp.log');
    const mcpJsonPath = join(dir, 'never-written.json');

    writeMcpDiagnosticLog({
      logPath,
      mcpJsonPath,
      chromiumPath: null,
      chromeMcpPath: null,
      wantsPlaywright: false,
      wantsChrome: false,
      warnings: [],
    });

    const content = readFileSync(logPath, 'utf8');
    expect(content).toMatch(/\.mcp\.json contents: <not present at .*never-written\.json>/);
  });
});
