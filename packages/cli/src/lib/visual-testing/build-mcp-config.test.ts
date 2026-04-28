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

  it('serializes to stable JSON (snapshot)', () => {
    const config = buildMcpConfig({ appUrl: 'http://localhost:5173' });
    expect(JSON.stringify(config, null, 2)).toMatchSnapshot();
  });
});
