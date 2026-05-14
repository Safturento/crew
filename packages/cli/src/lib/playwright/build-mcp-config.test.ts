import { describe, it, expect } from 'vitest';
import { buildMcpConfig } from './build-mcp-config.js';

describe('buildMcpConfig', () => {
  it('produces a valid Claude Code MCP server config for Playwright', () => {
    const config = buildMcpConfig({ appUrl: 'https://localhost:18443' });
    expect(config).toEqual({
      mcpServers: {
        playwright: {
          command: 'npx',
          args: ['-y', '@playwright/mcp@latest', '--headless'],
          env: { CREW_APP_URL: 'https://localhost:18443' },
        },
      },
    });
  });

  it('appends --executable-path when chromiumPath is supplied', () => {
    const config = buildMcpConfig({
      appUrl: 'https://localhost:18443',
      chromiumPath: '/home/me/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome',
    });
    expect(config.mcpServers.playwright.args).toEqual([
      '-y',
      '@playwright/mcp@latest',
      '--headless',
      '--executable-path',
      '/home/me/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome',
    ]);
  });

  it('omits --executable-path when chromiumPath is undefined', () => {
    const config = buildMcpConfig({ appUrl: 'https://localhost:18443' });
    expect(config.mcpServers.playwright.args).not.toContain('--executable-path');
  });

  it('serializes to stable JSON (snapshot)', () => {
    const config = buildMcpConfig({ appUrl: 'http://localhost:5173' });
    expect(JSON.stringify(config, null, 2)).toMatchSnapshot();
  });

  it('serializes with chromiumPath to stable JSON (snapshot)', () => {
    const config = buildMcpConfig({
      appUrl: 'http://localhost:5173',
      chromiumPath: '/home/me/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome',
    });
    expect(JSON.stringify(config, null, 2)).toMatchSnapshot();
  });
});
