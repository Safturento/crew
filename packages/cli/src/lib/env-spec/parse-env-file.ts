/**
 * Minimal `.env` file parser — KEY=VALUE per line, skipping `#` comments
 * and blank lines. Used to read an existing `.env` into a cache map for
 * materialize idempotency. NOT a general-purpose dotenv loader; values are
 * preserved verbatim (no quoting, no escapes) because we wrote them ourselves.
 */
export function parseEnvFile(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1);
    if (key) out[key] = value;
  }
  return out;
}
