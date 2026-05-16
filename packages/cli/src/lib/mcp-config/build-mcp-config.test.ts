import { describe, it, expect } from 'vitest';
import { buildMcpConfig } from './build-mcp-config.js';

describe('buildMcpConfig', () => {
  it('emits a playwright-only config', () => {
    const config = buildMcpConfig({ playwright: { appUrl: 'https://localhost:18443' } });
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

  it('appends --executable-path when playwright.chromiumPath is supplied', () => {
    const config = buildMcpConfig({
      playwright: {
        appUrl: 'https://localhost:18443',
        chromiumPath: '/cache/ms-playwright/chromium-1217/chrome-linux64/chrome',
      },
    });
    expect(config.mcpServers.playwright.args).toEqual([
      '-y',
      '@playwright/mcp@latest',
      '--headless',
      '--executable-path',
      '/cache/ms-playwright/chromium-1217/chrome-linux64/chrome',
    ]);
  });

  it('emits a chrome-only config', () => {
    const config = buildMcpConfig({ chrome: { mcpServerPath: '/plugins/sp-chrome/2.0.0/mcp/dist/index.js' } });
    expect(config).toEqual({
      mcpServers: {
        chrome: {
          command: 'node',
          args: ['/plugins/sp-chrome/2.0.0/mcp/dist/index.js'],
        },
      },
    });
  });

  it('emits both servers when both opts are supplied', () => {
    const config = buildMcpConfig({
      playwright: { appUrl: 'http://localhost:5173' },
      chrome: { mcpServerPath: '/plugins/sp-chrome/2.0.0/mcp/dist/index.js' },
    });
    expect(Object.keys(config.mcpServers).sort()).toEqual(['chrome', 'playwright']);
  });

  it('emits an empty mcpServers map when neither opt is supplied', () => {
    expect(buildMcpConfig({})).toEqual({ mcpServers: {} });
  });

  it('serializes a both-servers config to stable JSON (snapshot)', () => {
    const config = buildMcpConfig({
      playwright: { appUrl: 'http://localhost:5173' },
      chrome: { mcpServerPath: '/plugins/sp-chrome/2.0.0/mcp/dist/index.js' },
    });
    expect(JSON.stringify(config, null, 2)).toMatchSnapshot();
  });
});
