export interface McpServerEntry {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface McpConfig {
  mcpServers: Record<string, McpServerEntry>;
}

export interface BuildMcpConfigOptions {
  appUrl: string;
  // Path to the playwright-bundled chromium executable. When set, written into
  // the MCP server args as `--executable-path <path>`. @playwright/mcp's default
  // is the `chrome` channel (system Google Chrome at /opt/google/chrome/chrome);
  // pinning the path tells it to use the chromium crew already installed via
  // `npx playwright install chromium`. Omit when the path can't be resolved
  // (e.g. project doesn't yet have @playwright/test installed) — the agent
  // will get the same default behavior as before.
  chromiumPath?: string;
}

export function buildMcpConfig(opts: BuildMcpConfigOptions): McpConfig {
  const args = ['-y', '@playwright/mcp@latest', '--headless'];
  if (opts.chromiumPath) {
    args.push('--executable-path', opts.chromiumPath);
  }
  return {
    mcpServers: {
      playwright: {
        command: 'npx',
        args,
        env: { CREW_APP_URL: opts.appUrl },
      },
    },
  };
}
