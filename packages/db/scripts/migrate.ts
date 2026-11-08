/**
 * Applies the SQL migrations in db/migrations to the database in DATABASE_URL.
 *   npm run db:migrate
 * Set DATABASE_SSL=true when the database requires TLS (managed PostgreSQL services usually do).
 */
import { createDb, migrate, MIGRATIONS_DIR } from '../src/index.ts';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const ssl = ['1', 'true', 'yes', 'on'].includes((process.env.DATABASE_SSL ?? '').toLowerCase());
const db = createDb({
  connectionString: url,
  max: 1,
  applicationName: 'aurum-migrate',
  ssl: ssl ? true : undefined,
  statementTimeoutMs: 120_000,
});

try {
  const report = await migrate(db, MIGRATIONS_DIR, (m) => console.log(m));
  console.log(
    report.applied.length === 0
      ? `Database is up to date (${report.alreadyApplied.length} migrations already applied).`
      : `Done: ${report.applied.length} migration(s) applied.`,
  );
} catch (error) {
  console.error('Migration failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await db.close();
}
