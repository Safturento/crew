import { describe, it, expect } from 'vitest';
import {
  tableMatchesPattern,
  filterTablesForTruncate,
  buildTruncateSql,
  buildRequiredTablesQuery,
} from './sql.js';

describe('tableMatchesPattern', () => {
  it('matches an exact name', () => {
    expect(tableMatchesPattern('audit_log', 'audit_log')).toBe(true);
    expect(tableMatchesPattern('audit_log', 'other')).toBe(false);
  });

  it('treats * as a wildcard', () => {
    expect(tableMatchesPattern('kysely_migration', 'kysely_migration*')).toBe(true);
    expect(tableMatchesPattern('kysely_migration_lock', 'kysely_migration*')).toBe(true);
    expect(tableMatchesPattern('user_macro_goal', 'kysely_migration*')).toBe(false);
  });

  it('treats ? as a single-char wildcard', () => {
    expect(tableMatchesPattern('table1', 'table?')).toBe(true);
    expect(tableMatchesPattern('table12', 'table?')).toBe(false);
  });

  it('escapes regex metacharacters in the pattern', () => {
    expect(tableMatchesPattern('users.bak', 'users.bak')).toBe(true);
    expect(tableMatchesPattern('usersxbak', 'users.bak')).toBe(false);
  });
});

describe('filterTablesForTruncate', () => {
  it('removes tables matching any exclude pattern', () => {
    const tables = ['user', 'user_macro_goal', 'kysely_migration', 'kysely_migration_lock'];
    expect(filterTablesForTruncate(tables, ['kysely_migration*'])).toEqual([
      'user',
      'user_macro_goal',
    ]);
  });

  it('returns all tables when no patterns match', () => {
    expect(filterTablesForTruncate(['a', 'b'], ['z*'])).toEqual(['a', 'b']);
  });

  it('returns an empty array when every table is excluded', () => {
    expect(filterTablesForTruncate(['kysely_migration', 'kysely_migration_lock'], ['*'])).toEqual(
      [],
    );
  });
});

describe('buildTruncateSql', () => {
  it('returns null for an empty list (no SQL to run)', () => {
    expect(buildTruncateSql([])).toBeNull();
  });

  it('quotes table names with double-quotes and joins them', () => {
    expect(buildTruncateSql(['user', 'user_macro_goal'])).toBe(
      'TRUNCATE TABLE public."user", public."user_macro_goal" RESTART IDENTITY CASCADE;',
    );
  });

  it('escapes embedded double-quotes in table names', () => {
    expect(buildTruncateSql(['weird"name'])).toBe(
      'TRUNCATE TABLE public."weird""name" RESTART IDENTITY CASCADE;',
    );
  });
});

describe('buildRequiredTablesQuery', () => {
  it('returns a count of matching tables in the public schema', () => {
    const sql = buildRequiredTablesQuery(['user', 'user_macro_goal']);
    expect(sql).toContain("schemaname = 'public'");
    expect(sql).toContain("tablename = ANY(ARRAY['user','user_macro_goal'])");
    expect(sql).toMatch(/^SELECT count\(\*\)/);
  });

  it("escapes single-quotes inside table names so they don't break the literal", () => {
    const sql = buildRequiredTablesQuery(["o'connor"]);
    expect(sql).toContain("'o''connor'");
  });
});
