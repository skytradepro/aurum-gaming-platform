/**
 * Read-only export of local PostgreSQL data (aurum_app). No pg_dump / no postgres superuser.
 * Output: deploy/sync/aurum-data.sql (INSERT statements, public schema tables only).
 *
 *   node --disable-warning=ExperimentalWarning --env-file-if-exists=../../.env deploy/scripts/export-local-db.ts
 */
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb } from '../../packages/db/src/index.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'sync');
const outFile = join(outDir, 'aurum-data.sql');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const db = createDb({ connectionString: url, max: 1, applicationName: 'aurum-export' });
const out = createWriteStream(outFile, { encoding: 'utf8' });

function pgArrayLiteral(val: unknown[], udtName: string): string {
  const inner = val
    .map((item) => {
      if (item === null || item === undefined) return 'NULL';
      return `"${String(item).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    })
    .join(',');
  return `'{${inner}}'`;
}

function esc(val: unknown, dataType: string, udtName: string): string {
  if (val === null || val === undefined) return 'NULL';
  if (dataType === 'ARRAY' || udtName.startsWith('_')) {
    if (!Array.isArray(val)) return 'NULL';
    const lit = pgArrayLiteral(val, udtName);
    const cast =
      udtName === '_text'
        ? 'text[]'
        : udtName === '_int4'
          ? 'integer[]'
          : udtName === '_int8'
            ? 'bigint[]'
            : udtName === '_uuid'
              ? 'uuid[]'
              : udtName.startsWith('_')
                ? `${udtName.slice(1)}[]`
                : 'text[]';
    return `${lit}::${cast}`;
  }
  if (udtName === 'jsonb' || udtName === 'json' || dataType === 'jsonb' || dataType === 'json') {
    return `'${JSON.stringify(val).replace(/'/g, "''")}'::jsonb`;
  }
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (typeof val === 'number' && Number.isFinite(val)) return String(val);
  if (typeof val === 'bigint') return String(val);
  if (val instanceof Date) return `'${val.toISOString().replace(/'/g, "''")}'`;
  if (Buffer.isBuffer(val)) return `'\\x${val.toString('hex')}'`;
  if (Array.isArray(val)) return `${pgArrayLiteral(val, udtName)}::text[]`;
  if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'::jsonb`;
  return `'${String(val).replace(/'/g, "''")}'`;
}

try {
  await mkdir(outDir, { recursive: true });
  out.write('-- Aurum local data export (read-only). Import on server with sync-import on VPS.\n');
  out.write('BEGIN;\nSET session_replication_role = replica;\n');

  const { rows: tables } = await db.query<{ tablename: string }>(
    `select tablename from pg_tables where schemaname = 'public' order by tablename`,
  );
  const dataTables = tables.map((t) => t.tablename).filter((t) => t !== 'schema_migrations');
  if (dataTables.length > 0) {
    const list = dataTables.map((t) => `"${t}"`).join(', ');
    out.write(`TRUNCATE ${list} RESTART IDENTITY CASCADE;\n`);
  }

  for (const tablename of dataTables) {
    const { rows: cols } = await db.query<{
      column_name: string;
      is_identity: string;
      is_generated: string;
      data_type: string;
      udt_name: string;
    }>(
      `select column_name, is_identity, is_generated, data_type, udt_name from information_schema.columns
       where table_schema = 'public' and table_name = $1 order by ordinal_position`,
      [tablename],
    );
    if (cols.length === 0) continue;
    const insertCols = cols.filter((c) => c.is_generated !== 'ALWAYS');
    const names = insertCols.map((c) => c.column_name);
    const quoted = names.map((n) => `"${n}"`).join(', ');
    const hasIdentity = cols.some((c) => c.is_identity === 'YES');
    const { rows: data } = await db.query(`select * from "${tablename}"`);
    if (data.length === 0) continue;
    out.write(`\n-- ${tablename} (${data.length} rows)\n`);
    const override = hasIdentity ? ' OVERRIDING SYSTEM VALUE' : '';
    for (const row of data) {
      const vals = insertCols.map((c) =>
        esc((row as Record<string, unknown>)[c.column_name], c.data_type, c.udt_name),
      );
      out.write(`INSERT INTO "${tablename}" (${quoted})${override} VALUES (${vals.join(', ')});\n`);
    }
    console.log(`${tablename}: ${data.length} row(s)`);
  }

  out.write(`
-- Identity sequences must catch up after OVERRIDING SYSTEM VALUE inserts (otherwise new logins/sessions get 409 conflict).
DO $aurum$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND is_identity = 'YES'
  LOOP
    EXECUTE format(
      'SELECT setval(pg_get_serial_sequence(%L, %L), COALESCE((SELECT MAX(%I) FROM %I), 1), true)',
      r.table_name, r.column_name, r.column_name, r.table_name
    );
  END LOOP;
END $aurum$;

`);
  out.write('SET session_replication_role = DEFAULT;\nCOMMIT;\n');
  out.end();
  await new Promise<void>((resolve, reject) => {
    out.on('finish', resolve);
    out.on('error', reject);
  });
  console.log(`Wrote ${outFile}`);
} catch (error) {
  console.error('Export failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await db.close();
}
