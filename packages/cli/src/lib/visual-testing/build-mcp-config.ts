export interface McpServerEntry {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface McpConfig {
  mcpServers: Record<string, McpServerEntry>;
}

export function buildMcpConfig(opts: { appUrl: string }): McpConfig {
  return {
    mcpServers: {
      playwright: {
        command: 'npx',
        args: ['-y', '@playwright/mcp@latest', '--headless'],
        env: { CREW_APP_URL: opts.appUrl },
      },
    },
  };
}
