import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;

interface ParsedVersion {
  raw: string;
  major: number;
  minor: number;
  patch: number;
}

function parseSemver(name: string): ParsedVersion | null {
  const m = SEMVER_RE.exec(name);
  if (!m) return null;
  return { raw: name, major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

function compareDesc(a: ParsedVersion, b: ParsedVersion): number {
  if (b.major !== a.major) return b.major - a.major;
  if (b.minor !== a.minor) return b.minor - a.minor;
  return b.patch - a.patch;
}

// Resolve the absolute path to the user's installed superpowers-chrome MCP
// server entrypoint. Looks under
// `<home>/.claude/plugins/cache/superpowers-marketplace/superpowers-chrome/`,
// picks the highest semver subdir whose `mcp/dist/index.js` exists, and
// returns its absolute path. Returns null in every "not present" case so the
// caller can warn and degrade gracefully (chrome MCP is optional — playwright
// MCP carries the project alone otherwise).
export function resolveChromeMcpPath(home: string = homedir()): string | null {
  const root = join(
    home,
    '.claude',
    'plugins',
    'cache',
    'superpowers-marketplace',
    'superpowers-chrome',
  );
  if (!existsSync(root)) return null;

  const entries = readdirSync(root, { withFileTypes: true });
  const versions = entries
    .filter((e) => e.isDirectory())
    .map((e) => parseSemver(e.name))
    .filter((v): v is ParsedVersion => v !== null)
    .sort(compareDesc);

  for (const v of versions) {
    const candidate = join(root, v.raw, 'mcp', 'dist', 'index.js');
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}
