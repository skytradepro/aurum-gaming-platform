/**
 * Helpers for tests that need a real PostgreSQL. Set TEST_DATABASE_URL to a connection string
 * of a role that may CREATE DATABASE (for example postgres://postgres@127.0.0.1:5432/postgres).
 * Each call creates a fresh, fully migrated database and drops it afterwards.
 */
import { randomBytes } from 'node:crypto';
import { createDb } from './index.ts';
import type { Db } from './index.ts';
import { MIGRATIONS_DIR, migrate } from './migrate.ts';

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

export { MIGRATIONS_DIR };

export interface TestDatabase {
  db: Db;
  url: string;
  name: string;
  drop(): Promise<void>;
}

export async function createTestDatabase(): Promise<TestDatabase> {
  if (!TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL is not set');
  const admin = createDb({ connectionString: TEST_DATABASE_URL, max: 1, applicationName: 'aurum-test-admin' });
  const name = `aurum_test_${randomBytes(6).toString('hex')}`;
  await admin.query(`create database ${name}`);
  const url = new URL(TEST_DATABASE_URL);
  url.pathname = `/${name}`;
  const db = createDb({ connectionString: url.toString(), max: 20, applicationName: 'aurum-test' });
  try {
    await migrate(db, MIGRATIONS_DIR);
  } catch (error) {
    await db.close();
    await admin.query(`drop database if exists ${name}`);
    await admin.close();
    throw error;
  }
  return {
    db,
    url: url.toString(),
    name,
    async drop() {
      await db.close();
      await admin.query(`drop database if exists ${name} with (force)`);
      await admin.close();
    },
  };
}
