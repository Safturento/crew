/**
 * Convert a glob-ish pattern (`*`, `?`) into an anchored RegExp. Other
 * characters are escaped so a pattern like `users.bak` matches that exact
 * name rather than acting as a regex.
 */
function patternToRegex(pattern: string): RegExp {
  let body = '';
  for (const char of pattern) {
    if (char === '*') body += '.*';
    else if (char === '?') body += '.';
    else body += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${body}$`);
}

export function tableMatchesPattern(table: string, pattern: string): boolean {
  return patternToRegex(pattern).test(table);
}

export function filterTablesForTruncate(tables: string[], excludePatterns: string[]): string[] {
  return tables.filter((table) => !excludePatterns.some((p) => tableMatchesPattern(table, p)));
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Build a single TRUNCATE statement for every table in `tables`. Returns null
 * when the list is empty so callers can skip the round-trip entirely.
 *
 * RESTART IDENTITY rewinds sequences; CASCADE follows FK references so no
 * dependency-order dance is needed.
 */
export function buildTruncateSql(tables: string[]): string | null {
  if (tables.length === 0) return null;
  const list = tables.map((t) => `public.${quoteIdent(t)}`).join(', ');
  return `TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE;`;
}

/**
 * SQL that returns a single integer: how many of `requiredTables` exist in
 * the public schema. Caller compares against `requiredTables.length` to
 * decide whether all the required migrations have run.
 */
export function buildRequiredTablesQuery(requiredTables: string[]): string {
  const literals = requiredTables.map(quoteLiteral).join(',');
  return `SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND tablename = ANY(ARRAY[${literals}]);`;
}
