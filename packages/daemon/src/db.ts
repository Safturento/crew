import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import SqliteDatabase from 'better-sqlite3';
import {
  Kysely,
  SqliteDialect,
  Migrator,
  FileMigrationProvider,
  type MigrationResultSet,
} from 'kysely';

/**
 * The daemon's SQLite schema cradle. Empty for slice 1a — tables land in
 * slice 1b. Each new table adds an entry whose type matches the migration
 * that creates it.
 */
export type DaemonDatabase = Record<string, never>;

/**
 * Open a Kysely-backed SQLite database. Pass `:memory:` for tests.
 * Callers own the lifetime — call `db.destroy()` to close the underlying
 * better-sqlite3 handle.
 */
export function createDb(dbFile: string): Kysely<DaemonDatabase> {
  return new Kysely<DaemonDatabase>({
    dialect: new SqliteDialect({
      database: new SqliteDatabase(dbFile),
    }),
  });
}

/**
 * Run any pending migrations from `migrationsPath` to the latest version.
 * Returns the list of applied migration results (empty when the folder
 * contains no migrations). Throws if any migration fails.
 */
export async function runMigrations(
  db: Kysely<DaemonDatabase>,
  migrationsPath: string,
): Promise<NonNullable<MigrationResultSet['results']>> {
  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: migrationsPath,
    }),
  });
  const { error, results } = await migrator.migrateToLatest();
  if (error) throw error;
  return results ?? [];
}
