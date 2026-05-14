import { describe, expect, it } from 'vitest';
import { buildMcpConfig } from './build-mcp-config.js';

describe('buildMcpConfig', () => {
  it('emits a playwright-only config when only playwright opts are provided', () => {
    const config = buildMcpConfig({
      playwright: { appUrl: 'http://localhost:5173' },
    });
    expect(Object.keys(config.mcpServers)).toEqual(['playwright']);
    expect(config.mcpServers.playwright.args).toEqual([
      '-y',
      '@playwright/mcp@latest',
      '--headless',
    ]);
    expect(config.mcpServers.playwright.env).toEqual({ CREW_APP_URL: 'http://localhost:5173' });
  });

  it('includes --executable-path when chromiumPath is set', () => {
    const config = buildMcpConfig({
      playwright: { appUrl: 'http://localhost:5173', chromiumPath: '/opt/chrome' },
    });
    expect(config.mcpServers.playwright.args).toContain('--executable-path');
    expect(config.mcpServers.playwright.args).toContain('/opt/chrome');
  });

  it('omits --executable-path when chromiumPath is undefined', () => {
    const config = buildMcpConfig({ playwright: { appUrl: 'http://localhost:5173' } });
    expect(config.mcpServers.playwright.args).not.toContain('--executable-path');
  });

  it('emits a chrome-only config when only chrome opts are provided', () => {
    const config = buildMcpConfig({
      chrome: { mcpServerPath: '/path/to/mcp/dist/index.js' },
    });
    expect(Object.keys(config.mcpServers)).toEqual(['chrome']);
    expect(config.mcpServers.chrome).toEqual({
      command: 'node',
      args: ['/path/to/mcp/dist/index.js'],
    });
  });

  it('emits both server entries when both opts are provided', () => {
    const config = buildMcpConfig({
      playwright: { appUrl: 'http://localhost:5173' },
      chrome: { mcpServerPath: '/path/to/index.js' },
    });
    expect(Object.keys(config.mcpServers).sort()).toEqual(['chrome', 'playwright']);
  });

  it('throws when neither playwright nor chrome opts are provided', () => {
    expect(() => buildMcpConfig({})).toThrow(/at least one of playwright or chrome/);
  });

  it('serializes a playwright-only config to stable JSON (snapshot)', () => {
    const config = buildMcpConfig({ playwright: { appUrl: 'http://localhost:5173' } });
    expect(JSON.stringify(config, null, 2)).toMatchSnapshot();
  });

  it('serializes a both-server config to stable JSON (snapshot)', () => {
    const config = buildMcpConfig({
      playwright: {
        appUrl: 'http://localhost:5173',
        chromiumPath: '/home/me/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome',
      },
      chrome: { mcpServerPath: '/home/me/.claude/plugins/cache/superpowers-chrome/2.0.0/mcp/dist/index.js' },
    });
    expect(JSON.stringify(config, null, 2)).toMatchSnapshot();
  });
});
