import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { AppError } from '@aurum/shared';
import { loadMigrations, mapDbError, migrate } from '../src/index.ts';
import { MIGRATIONS_DIR, TEST_DATABASE_URL, createTestDatabase } from '../src/testing.ts';
import type { TestDatabase } from '../src/testing.ts';

describe('loadMigrations', () => {
  it('reads the project migrations in order with stable checksums', () => {
    const migrations = loadMigrations(MIGRATIONS_DIR);
    assert.ok(migrations.length >= 4);
    assert.deepEqual(
      migrations.map((m) => m.version),
      migrations.map((_, i) => String(i + 1).padStart(4, '0')),
    );
    for (const m of migrations) assert.match(m.checksum, /^[0-9a-f]{64}$/);
    assert.equal(loadMigrations(MIGRATIONS_DIR)[0]?.checksum, migrations[0]?.checksum);
  });

  it('rejects misnamed or gapped migrations', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'aurum-mig-'));
    try {
      await writeFile(join(dir, '0001_a.sql'), 'select 1;');
      await writeFile(join(dir, '0003_c.sql'), 'select 1;');
      assert.throws(() => loadMigrations(dir), /no gaps/);
      await writeFile(join(dir, 'oops.sql'), 'select 1;');
      assert.throws(() => loadMigrations(dir), /Invalid migration file name/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('mapDbError', () => {
  it('translates known SQLSTATEs without leaking SQL', () => {
    const e = mapDbError({ code: 'AU001', message: 'insufficient funds' });
    assert.ok(e instanceof AppError);
    assert.equal(e.code, 'insufficient_funds');
    assert.equal(mapDbError({ code: '23505', constraint: 'users_email_ci' })?.code, 'email_taken');
    assert.equal(mapDbError({ code: '23505', constraint: 'users_username_ci' })?.code, 'username_taken');
    assert.equal(mapDbError({ code: '23505', constraint: 'something_else' })?.code, 'conflict');
    assert.equal(mapDbError({ code: '23514' })?.code, 'validation');
    assert.equal(mapDbError({ code: '40001' })?.code, 'conflict');
    assert.equal(mapDbError({ code: 'XX000' }), null);
    assert.equal(mapDbError(new Error('boom')), null);
    assert.equal(mapDbError('text'), null);
  });
});

describe('PostgreSQL (real database)', { skip: TEST_DATABASE_URL ? false : 'TEST_DATABASE_URL is not set' }, () => {
  let t: TestDatabase;
  before(async () => {
    t = await createTestDatabase();
  });
  after(async () => {
    await t?.drop();
  });

  it('applied every migration exactly once', async () => {
    const { rows } = await t.db.query<{ version: string }>('select version from schema_migrations order by version');
    assert.deepEqual(
      rows.map((r) => r.version),
      loadMigrations(MIGRATIONS_DIR).map((m) => m.version),
    );
  });

  it('is idempotent: a second run applies nothing', async () => {
    const report = await migrate(t.db, MIGRATIONS_DIR);
    assert.deepEqual(report.applied, []);
    assert.ok(report.alreadyApplied.length >= 4);
  });

  it('refuses a migration that was edited after being applied', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'aurum-mig-'));
    try {
      await cp(MIGRATIONS_DIR, dir, { recursive: true });
      const first = join(dir, '0001_foundation.sql');
      await writeFile(first, `${await readFile(first, 'utf8')}\n-- edited\n`);
      await assert.rejects(() => migrate(t.db, dir), /was changed after it was applied/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rolls a failed migration back completely', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'aurum-mig-'));
    try {
      await cp(MIGRATIONS_DIR, dir, { recursive: true });
      const next = String(loadMigrations(MIGRATIONS_DIR).length + 1).padStart(4, '0');
      await writeFile(join(dir, `${next}_broken.sql`), 'create table half_done (id int); select 1/0;');
      await assert.rejects(() => migrate(t.db, dir), /division by zero/);
      const { rows } = await t.db.query("select to_regclass('half_done') as t");
      assert.equal(rows[0]?.t, null, 'the table of the failed migration must not exist');
      const applied = await t.db.query('select 1 from schema_migrations where version = $1', [next]);
      assert.equal(applied.rowCount, 0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('commits and rolls back transactions', async () => {
    await t.db.query('create table tx_probe (id int primary key)');
    await t.db.transaction(async (tx) => {
      await tx.query('insert into tx_probe values (1)');
    });
    await assert.rejects(() =>
      t.db.transaction(async (tx) => {
        await tx.query('insert into tx_probe values (2)');
        throw new Error('stop');
      }),
    );
    const { rows } = await t.db.query<{ id: number }>('select id from tx_probe order by id');
    assert.deepEqual(rows.map((r) => r.id), [1]);
  });

  it('maps database errors raised inside a transaction', async () => {
    await assert.rejects(
      () =>
        t.db.transaction(async (tx) => {
          await tx.query('insert into tx_probe values (1)');
        }),
      (err: unknown) => err instanceof AppError && err.code === 'conflict',
    );
  });

  it('retries a serializable transaction after a serialization failure', async () => {
    await t.db.query('create table counter (id int primary key, n int not null)');
    await t.db.query('insert into counter values (1, 0)');
    let attempts = 0;
    const bump = () =>
      t.db.transaction(
        async (tx) => {
          attempts++;
          const { rows } = await tx.query<{ n: number }>('select n from counter where id = 1');
          await new Promise((r) => setTimeout(r, 30));
          await tx.query('update counter set n = $1 where id = 1', [(rows[0]?.n ?? 0) + 1]);
        },
        { isolation: 'serializable', retries: 5 },
      );
    await Promise.all([bump(), bump(), bump()]);
    const { rows } = await t.db.query<{ n: number }>('select n from counter');
    assert.equal(rows[0]?.n, 3, 'no update may be lost');
    assert.ok(attempts > 3, `expected retries, got ${attempts} attempts`);
  });

  it('keeps bigint values exact (returned as strings)', async () => {
    const { rows } = await t.db.query<{ v: string }>('select (9007199254740993::bigint + 2)::text as v');
    assert.equal(rows[0]?.v, '9007199254740995');
  });
});
