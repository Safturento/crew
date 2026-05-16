export interface McpServerEntry {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface McpConfig {
  mcpServers: Record<string, McpServerEntry>;
}

export interface BuildMcpConfigOptions {
  /** Playwright MCP server. Omit to leave it out of the config. */
  playwright?: {
    appUrl: string;
    // Path to the playwright-bundled chromium executable. When set, written
    // into the MCP server args as `--executable-path <path>`. Omit when the
    // path can't be resolved — the agent gets @playwright/mcp's default
    // (system `chrome` channel).
    chromiumPath?: string;
  };
  /** Chrome (superpowers-chrome) MCP server. Omit to leave it out. */
  chrome?: {
    /** Absolute path to the chrome MCP server entrypoint. */
    mcpServerPath: string;
  };
}

export function buildMcpConfig(opts: BuildMcpConfigOptions): McpConfig {
  const mcpServers: Record<string, McpServerEntry> = {};

  if (opts.playwright) {
    const args = ['-y', '@playwright/mcp@latest', '--headless'];
    if (opts.playwright.chromiumPath) {
      args.push('--executable-path', opts.playwright.chromiumPath);
    }
    mcpServers.playwright = {
      command: 'npx',
      args,
      env: { CREW_APP_URL: opts.playwright.appUrl },
    };
  }

  if (opts.chrome) {
    mcpServers.chrome = {
      command: 'node',
      args: [opts.chrome.mcpServerPath],
    };
  }

  return { mcpServers };
}
