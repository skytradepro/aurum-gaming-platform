import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db } from './index.ts';

/** Folder with the SQL migration files (db/migrations at the project root). */
export const MIGRATIONS_DIR = fileURLToPath(new URL('../../../db/migrations', import.meta.url));

export interface MigrationFile {
  /** "0001" */
  version: string;
  /** "0001_foundation.sql" */
  name: string;
  sql: string;
  /** SHA-256 of the file with normalised line endings. */
  checksum: string;
}

export interface MigrationReport {
  applied: string[];
  alreadyApplied: string[];
}

const FILE_PATTERN = /^(\d{4})_[a-z0-9_]+\.sql$/;

/** Reads db/migrations/NNNN_name.sql in numeric order. Versions must be unique and gap-free. */
export function loadMigrations(directory: string): MigrationFile[] {
  const files = readdirSync(directory)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const migrations = files.map((name) => {
    const match = FILE_PATTERN.exec(name);
    if (!match) throw new Error(`Invalid migration file name: ${name} (expected NNNN_description.sql)`);
    const sql = readFileSync(join(directory, name), 'utf8').replace(/\r\n/g, '\n');
    return {
      version: match[1] as string,
      name,
      sql,
      checksum: createHash('sha256').update(sql).digest('hex'),
    };
  });
  migrations.forEach((m, i) => {
    if (Number(m.version) !== i + 1) {
      throw new Error(`Migration numbering must start at 0001 and have no gaps (found ${m.name} at position ${i + 1})`);
    }
  });
  return migrations;
}

const LOCK_KEY = 727_274_001; // arbitrary constant: "aurum migrations"

/**
 * Applies pending migrations, each inside its own transaction. Already applied migrations are
 * never run again, and editing an applied migration is detected (checksum) and refused:
 * schema changes always go into a new file.
 */
export async function migrate(
  db: Db,
  directory: string,
  log: (message: string) => void = () => {},
): Promise<MigrationReport> {
  const migrations = loadMigrations(directory);
  await db.query(`create table if not exists schema_migrations (
    version    text primary key,
    name       text not null,
    checksum   text not null,
    applied_at timestamptz not null default now()
  )`);

  const report: MigrationReport = { applied: [], alreadyApplied: [] };
  for (const migration of migrations) {
    const outcome = await db.transaction(async (tx) => {
      await tx.query('select pg_advisory_xact_lock($1::bigint)', [LOCK_KEY]);
      const existing = await tx.query<{ checksum: string }>(
        'select checksum from schema_migrations where version = $1',
        [migration.version],
      );
      const row = existing.rows[0];
      if (row) {
        if (row.checksum !== migration.checksum) {
          throw new Error(
            `Migration ${migration.name} was changed after it was applied. ` +
              'Never edit an applied migration: add a new one instead.',
          );
        }
        return 'already' as const;
      }
      await tx.query(migration.sql);
      await tx.query('insert into schema_migrations (version, name, checksum) values ($1, $2, $3)', [
        migration.version,
        migration.name,
        migration.checksum,
      ]);
      return 'applied' as const;
    });
    if (outcome === 'applied') {
      report.applied.push(migration.name);
      log(`applied ${migration.name}`);
    } else {
      report.alreadyApplied.push(migration.name);
    }
  }
  return report;
}
