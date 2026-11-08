import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { TEST_DATABASE_URL, createTestDatabase } from '../src/testing.ts';

/**
 * Runs db/tests/schema.test.sql (the database rules written in plain SQL) against a fresh, fully
 * migrated database, without needing the psql program. The SQL file creates a temporary role, so the
 * role in TEST_DATABASE_URL needs CREATEDB and CREATEROLE (a superuser such as "postgres" has both).
 */
const SQL_FILE = fileURLToPath(new URL('../../../db/tests/schema.test.sql', import.meta.url));

describe('database rules written in SQL', { skip: TEST_DATABASE_URL ? false : 'TEST_DATABASE_URL is not set' }, () => {
  it('passes every check in db/tests/schema.test.sql', async () => {
    const database = await createTestDatabase();
    try {
      // lines starting with a backslash are psql commands (\set, \echo): not SQL
      const sql = readFileSync(SQL_FILE, 'utf8')
        .split(/\r?\n/)
        .filter((line) => !line.startsWith('\\'))
        .join('\n');
      const pool = new pg.Pool({ connectionString: database.url, max: 1 });
      const client = await pool.connect();
      const passed: string[] = [];
      const listening = typeof client.on === 'function';
      client.on?.('notice', (notice) => {
        if (notice.message.startsWith('ok - ')) passed.push(notice.message);
      });
      try {
        await client.query(sql);
      } finally {
        client.release();
        await pool.end();
      }
      // the file prints one "ok - ..." line per check; make sure the checks really ran
      if (listening) assert.ok(passed.length >= 70, `only ${passed.length} checks reported success`);
    } finally {
      await database.drop();
    }
  });
});
