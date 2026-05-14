export interface McpServerEntry {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface McpConfig {
  mcpServers: Record<string, McpServerEntry>;
}

export interface PlaywrightServerOptions {
  appUrl: string;
  // Path to the playwright-bundled chromium executable. When set, written into
  // the MCP server args as `--executable-path <path>`. @playwright/mcp's default
  // is the `chrome` channel (system Google Chrome); pinning the path tells it
  // to use the chromium crew already installed via `npx playwright install
  // chromium`. Omit when the path can't be resolved — the MCP server falls
  // back to the system chrome channel.
  chromiumPath?: string;
}

export interface ChromeServerOptions {
  // Absolute path to the superpowers-chrome MCP server's `dist/index.js`,
  // resolved from the user's plugin cache by `resolveChromeMcpPath`.
  mcpServerPath: string;
}

export interface BuildMcpConfigOptions {
  playwright?: PlaywrightServerOptions;
  chrome?: ChromeServerOptions;
}

export function buildMcpConfig(opts: BuildMcpConfigOptions): McpConfig {
  if (!opts.playwright && !opts.chrome) {
    throw new Error('buildMcpConfig: at least one of playwright or chrome must be provided');
  }
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
