import type { PreflightError } from './types.js';

const MIN_KEY_COL_WIDTH = 8;

export function renderPreflightError(err: PreflightError): string {
  const lines: string[] = [];
  lines.push(`✗ preflight: ${err.headline}`);

  const keys = Object.keys(err.details);
  const maxKeyLen = Math.max(0, ...keys.map((k) => k.length));
  const padWidth = Math.max(maxKeyLen + 2, MIN_KEY_COL_WIDTH);

  for (const key of keys) {
    const padded = `${key}:`.padEnd(padWidth);
    lines.push(`   ${padded}${err.details[key]}`);
  }

  lines.push(`   ${'fix:'.padEnd(padWidth)}${err.remediation}`);
  return lines.join('\n');
}
