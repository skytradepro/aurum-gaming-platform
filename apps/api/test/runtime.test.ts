/**
 * The parts that only exist at the command line: creating the first Super Admin, and starting the real
 * server process (configuration, schema check, graceful shutdown).
 */
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';
import { createDb } from '@aurum/db';
import { TEST_DATABASE_URL, createTestDatabase } from '@aurum/db/testing';
import type { TestDatabase } from '@aurum/db/testing';
import { loadConfig } from '../src/config.ts';
import { createSuperAdmin } from '../src/services/bootstrap.ts';
import { login, startServer, unique, STRONG_PASSWORD } from './helpers.ts';
import type { TestServer } from './helpers.ts';

const apiDir = fileURLToPath(new URL('..', import.meta.url));
const NODE_FLAGS = ['--disable-warning=ExperimentalWarning'];
const baseEnv = { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '' };

describe('first Super Admin', { skip: TEST_DATABASE_URL ? false : 'TEST_DATABASE_URL is not set' }, () => {
  let server: TestServer;

  before(async () => {
    server = await startServer();
  });
  after(async () => {
    await server?.stop();
  });

  const input = (overrides: Record<string, string> = {}) => {
    const u = unique();
    return { username: `root_${u}`, email: `root_${u}@example.test`, firstName: 'Ada', lastName: 'Lovelace', password: 'Correct-Horse-Battery-9', ...overrides };
  };

  it('creates a Super Admin who can sign in and who is recorded in the audit log', async () => {
    const data = input();
    const created = await createSuperAdmin(server.db, data, server.config.scryptLog2N);
    const { rows } = await server.db.query<{ role: string; must_change_password: boolean; status: string; password_hash: string }>(
      'select role::text, must_change_password, status::text, password_hash from users where id = $1::uuid',
      [created.id],
    );
    assert.equal(rows[0]?.role, 'super_admin');
    assert.equal(rows[0]?.status, 'active');
    assert.ok(rows[0]?.password_hash.startsWith('scrypt$'), 'the password is stored as a scrypt hash');
    assert.ok(!rows[0]?.password_hash.includes(data.password));
    const session = server.browser();
    const response = await login(session, { username: data.username, password: data.password });
    assert.equal(response.status, 200);
    assert.equal(response.body.data.user.role, 'super_admin');
    const audit = await server.db.query("select 1 from audit_logs where action = 'bootstrap.super_admin_created' and target_id = $1", [created.id]);
    assert.equal(audit.rowCount, 1);
  });

  it('refuses weak passwords, passwords built from the account data, and duplicates', async () => {
    const shortOne = await createSuperAdmin(server.db, input({ password: 'Short-Pw-1' }), 10).catch((e: unknown) => e);
    assert.equal((shortOne as { code?: string }).code, 'weak_password');
    const u = unique();
    const same = await createSuperAdmin(server.db, input({ username: `boss_${u}`, email: `b_${u}@example.test`, password: `boss_${u}-Strong-1` }), 10).catch((e: unknown) => e);
    assert.equal((same as { code?: string }).code, 'weak_password');
    const common = await createSuperAdmin(server.db, input({ password: 'password12345' }), 10).catch((e: unknown) => e);
    assert.equal((common as { code?: string }).code, 'weak_password');

    const first = input();
    await createSuperAdmin(server.db, first, 10);
    const dupName = await createSuperAdmin(server.db, input({ username: first.username.toUpperCase() }), 10).catch((e: unknown) => e);
    assert.equal((dupName as { code?: string }).code, 'username_taken');
    const dupMail = await createSuperAdmin(server.db, input({ email: first.email.toUpperCase() }), 10).catch((e: unknown) => e);
    assert.equal((dupMail as { code?: string }).code, 'email_taken');
    const badName = await createSuperAdmin(server.db, input({ username: 'x y' }), 10).catch((e: unknown) => e);
    assert.equal((badName as { code?: string }).code, 'validation');
  });

  it('is the only way: the database refuses a Super Admin created or promoted from anywhere else', async () => {
    const u = unique();
    await assert.rejects(
      server.db.query(
        `insert into users (username, email, password_hash, first_name, last_name, role) values ($1, $2, 'x', 'A', 'B', 'super_admin')`,
        [`sneaky_${u}`, `sneaky_${u}@example.test`],
      ),
      (e: { code?: string }) => e.code === 'AU102',
    );
    const staff = await server.db.query<{ id: string }>(
      `insert into users (username, email, password_hash, first_name, last_name, role) values ($1, $2, 'x', 'A', 'B', 'admin') returning id::text`,
      [`adm_${u}`, `adm_${u}@example.test`],
    );
    await assert.rejects(
      server.db.query("update users set role = 'super_admin' where id = $1::uuid", [staff.rows[0]?.id]),
      (e: { code?: string }) => e.code === 'AU102',
    );
  });

  it('never lets the last active Super Admin be demoted or disabled', async () => {
    const database = await createTestDatabase();
    try {
      const only = await createSuperAdmin(database.db, input(), 10);
      await assert.rejects(database.db.query("update users set role = 'admin' where id = $1::uuid", [only.id]), (e: { code?: string }) => e.code === 'AU103');
      await assert.rejects(database.db.query("update users set status = 'suspended' where id = $1::uuid", [only.id]), (e: { code?: string }) => e.code === 'AU103');
      await assert.rejects(database.db.query('delete from users where id = $1::uuid', [only.id]), (e: { code?: string }) => e.code === 'AU105');
      // with a second one, the first may be disabled
      await createSuperAdmin(database.db, input(), 10);
      await database.db.query("update users set status = 'suspended' where id = $1::uuid", [only.id]);
    } finally {
      await database.drop();
    }
  });

  it('can be created from the command line, with the password read from the environment, and never prints it', async () => {
    const database = await createTestDatabase();
    try {
      const data = input({ username: 'cli_boss', email: 'cli_boss@example.test', password: 'Another-Long-Pass-77' });
      const run = (extra: string[] = [], password = data.password, args?: string[]) =>
        spawnSync(
          process.execPath,
          [...NODE_FLAGS, 'scripts/create-super-admin.ts', ...(args ?? ['--username', data.username, '--email', data.email, '--first-name', data.firstName, '--last-name', data.lastName]), ...extra],
          { cwd: apiDir, encoding: 'utf8', timeout: 60_000, env: { ...baseEnv, NODE_ENV: 'test', DATABASE_URL: database.url, SUPER_ADMIN_PASSWORD: password } },
        );
      const ok = run();
      assert.equal(ok.status, 0, `${ok.stdout}\n${ok.stderr}`);
      assert.match(ok.stdout, /Super Admin "cli_boss" created/);
      assert.ok(!ok.stdout.includes(data.password) && !ok.stderr.includes(data.password));
      const { rows } = await database.db.query<{ role: string }>("select role::text from users where username = 'cli_boss'");
      assert.equal(rows[0]?.role, 'super_admin');

      const again = run();
      assert.equal(again.status, 1);
      assert.match(again.stderr, /Nothing was created: username_taken/);

      const weak = run([], 'short', ['--username', 'cli_two', '--email', 'cli_two@example.test', '--first-name', 'Grace', '--last-name', 'Hopper']);
      assert.equal(weak.status, 1);
      assert.match(weak.stderr, /weak_password/);
      assert.equal((await database.db.query("select 1 from users where username = 'cli_two'")).rowCount, 0);
    } finally {
      await database.drop();
    }
  });
});

describe('server process', { skip: TEST_DATABASE_URL ? false : 'TEST_DATABASE_URL is not set' }, () => {
  let database: TestDatabase;

  before(async () => {
    database = await createTestDatabase();
  });
  after(async () => {
    await database?.drop();
  });

  async function freePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const probe = createServer();
      probe.once('error', reject);
      probe.listen(0, '127.0.0.1', () => {
        const address = probe.address();
        probe.close(() => (address && typeof address === 'object' ? resolve(address.port) : reject(new Error('no port'))));
      });
    });
  }

  function start(env: Record<string, string>) {
    const child = spawn(process.execPath, [...NODE_FLAGS, 'src/main.ts'], { cwd: apiDir, env: { ...baseEnv, ...env } });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));
    const exited = new Promise<number | null>((resolve) => child.once('exit', (code) => resolve(code)));
    return { child, exited, output: () => output };
  }

  async function waitForHealth(port: number, exited: Promise<number | null>): Promise<void> {
    let stopped = false;
    void exited.then(() => (stopped = true));
    for (let attempt = 0; attempt < 100 && !stopped; attempt++) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/v1/health`);
        if (response.status === 200) return;
      } catch {
        // not listening yet
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('the server did not become healthy');
  }

  it('starts from environment variables, answers requests, and shuts down cleanly on SIGTERM', async () => {
    const port = await freePort();
    const server = start({
      NODE_ENV: 'test',
      LOG_LEVEL: 'info',
      DATABASE_URL: database.url,
      API_HOST: '127.0.0.1',
      API_PORT: String(port),
      WEB_ORIGIN: 'http://localhost:3000',
      UPLOAD_DIR: `/tmp/aurum-main-test-${randomBytes(4).toString('hex')}`,
    });
    try {
      await waitForHealth(port, server.exited);
      const health = await fetch(`http://127.0.0.1:${port}/v1/health`);
      assert.deepEqual(await health.json(), { data: { status: 'ok' } });
      assert.equal(health.headers.get('x-content-type-options'), 'nosniff');
      const config = await fetch(`http://127.0.0.1:${port}/v1/public/config`);
      assert.equal(config.status, 200);
      assert.equal(((await config.json()) as { data: { demo: boolean } }).data.demo, false);
      const missing = await fetch(`http://127.0.0.1:${port}/v1/nothing-here`);
      assert.equal(missing.status, 404);
      assert.ok(server.output().includes('api listening'));
      server.child.kill('SIGTERM');
      if (process.platform === 'win32') {
        // Windows cannot deliver SIGTERM to a child: the process is terminated abruptly,
        // so the graceful-shutdown handler cannot be observed here. Verified on POSIX only.
        await server.exited;
      } else {
        assert.equal(await server.exited, 0, server.output());
        assert.ok(server.output().includes('shutting down'));
      }
    } finally {
      server.child.kill('SIGKILL');
    }
  });

  it('refuses to start when the database has not been migrated, and says what to do', async () => {
    const admin = createDb({ connectionString: TEST_DATABASE_URL as string, max: 1 });
    const name = `aurum_empty_${randomBytes(5).toString('hex')}`;
    await admin.query(`create database ${name}`);
    try {
      const url = new URL(TEST_DATABASE_URL as string);
      url.pathname = `/${name}`;
      const server = start({ NODE_ENV: 'test', LOG_LEVEL: 'info', DATABASE_URL: url.toString(), API_HOST: '127.0.0.1', API_PORT: String(await freePort()) });
      assert.equal(await server.exited, 1);
      assert.match(server.output(), /no schema yet/);
    } finally {
      await admin.query(`drop database if exists ${name} with (force)`);
      await admin.close();
    }
  });

  it('refuses to start with unsafe or incomplete configuration', async () => {
    const cases: [string, Record<string, string>, RegExp][] = [
      ['a missing database', { NODE_ENV: 'test' }, /DATABASE_URL is required/],
      ['demo data in production', { NODE_ENV: 'production', DATABASE_URL: database.url, WEB_ORIGIN: 'https://example.com', COOKIE_SECURE: 'true', SHOW_DEMO_DATA: 'true' }, /SHOW_DEMO_DATA must be false in production/],
      ['plain-http origin in production', { NODE_ENV: 'production', DATABASE_URL: database.url, WEB_ORIGIN: 'http://example.com' }, /must use https in production/],
      ['insecure cookies in production', { NODE_ENV: 'production', DATABASE_URL: database.url, WEB_ORIGIN: 'https://example.com', COOKIE_SECURE: 'false' }, /COOKIE_SECURE must be true in production/],
      ['a half-configured captcha', { NODE_ENV: 'test', DATABASE_URL: database.url, TURNSTILE_SECRET: 'only-the-secret' }, /must be set together/],
    ];
    for (const [label, env, message] of cases) {
      const server = start(env);
      assert.equal(await server.exited, 1, label);
      assert.match(server.output(), message, label);
    }
  });

  it('reads configuration safely', () => {
    const config = loadConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgres://x/db', WEB_ORIGIN: 'https://a.example, https://b.example/', TRUST_PROXY_HOPS: '1' });
    assert.deepEqual(config.webOrigins, ['https://a.example', 'https://b.example']);
    assert.equal(config.cookieSecure, true);
    assert.equal(config.cookieName, '__Host-aurum_session');
    assert.equal(config.scryptLog2N, 15);
    assert.equal(config.showDemoData, false);
    assert.equal(config.trustProxyHops, 1);
    assert.equal(config.sessions.staffMs, 12 * 3_600_000);
    assert.throws(() => loadConfig({ DATABASE_URL: 'x', API_PORT: '99999' }), /API_PORT/);
    assert.throws(() => loadConfig({ DATABASE_URL: 'x', WEB_ORIGIN: 'https://a.example/path' }), /without a path/);
    assert.throws(() => loadConfig({ DATABASE_URL: 'x', SHOW_DEMO_DATA: 'maybe' }), /Invalid boolean/);
    assert.throws(() => loadConfig({ DATABASE_URL: 'x', LOG_LEVEL: 'chatty' }), /LOG_LEVEL/);
    assert.equal(STRONG_PASSWORD.length >= 10, true);
  });
});
