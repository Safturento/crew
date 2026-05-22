import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export interface WriteMcpDiagnosticLogOptions {
  /** Where to write the diagnostic log (typically `/tmp/crew-mcp-<key>.log`). */
  logPath: string;
  /** Path to the worktree's `.mcp.json` so its contents can be embedded. */
  mcpJsonPath: string;
  /** Resolved playwright chromium executable path, or null when unresolved. */
  chromiumPath: string | null;
  /** Resolved chrome MCP server entrypoint, or null when unresolved. */
  chromeMcpPath: string | null;
  /** Whether the dispatcher requested the playwright MCP server. */
  wantsPlaywright: boolean;
  /** Whether the dispatcher requested the chrome MCP server. */
  wantsChrome: boolean;
  /** Warnings emitted during MCP resolution (e.g. plugin-absent). */
  warnings: string[];
}

/**
 * Write a host-side diagnostic record of the worktree's MCP wiring. Future
 * agent-side failures (chrome MCP unreachable, tool inventory missing
 * `mcp__chrome__use_browser`) can be diagnosed from this log without
 * re-running the dispatch.
 *
 * The log captures the dispatcher's *intent* (`wantsPlaywright`, `wantsChrome`)
 * alongside the *resolved* paths and the actual `.mcp.json` contents it
 * produced. Disagreement between these surfaces wiring bugs that the agent
 * couldn't otherwise observe.
 */
export function writeMcpDiagnosticLog(opts: WriteMcpDiagnosticLogOptions): void {
  const lines: string[] = [];
  lines.push(`crew MCP wiring diagnostic — ${new Date().toISOString()}`);
  lines.push('');
  lines.push(`playwright requested: ${opts.wantsPlaywright}`);
  lines.push(`chrome requested: ${opts.wantsChrome}`);
  lines.push('');
  lines.push(`playwright chromium: ${opts.chromiumPath ?? '<unresolved>'}`);
  lines.push(`chrome MCP: ${opts.chromeMcpPath ?? '<unresolved>'}`);
  lines.push('');
  if (opts.warnings.length === 0) {
    lines.push('warnings: <none>');
  } else {
    lines.push('warnings:');
    for (const w of opts.warnings) lines.push(`  - ${w}`);
  }
  lines.push('');
  if (existsSync(opts.mcpJsonPath)) {
    lines.push('.mcp.json contents:');
    lines.push(readFileSync(opts.mcpJsonPath, 'utf8').trimEnd());
  } else {
    lines.push(`.mcp.json contents: <not present at ${opts.mcpJsonPath}>`);
  }
  lines.push('');
  writeFileSync(opts.logPath, lines.join('\n') + '\n');
}
