import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { TEST_DATABASE_URL } from '@aurum/db/testing';
import { Browser, STRONG_PASSWORD, createStaff, login, registerPlayer, registrationPayload, signedIn, startServer } from './helpers.ts';
import type { TestServer } from './helpers.ts';

describe('authentication', { skip: TEST_DATABASE_URL ? false : 'TEST_DATABASE_URL is not set' }, () => {
  let server: TestServer;
  before(async () => {
    server = await startServer();
  });
  after(async () => {
    await server?.stop();
  });

  describe('registration', () => {
    it('creates a player, a wallet in the chosen currency and a session cookie', async () => {
      const browser = server.browser();
      const payload = registrationPayload({ currency: 'EUR', preferredLocale: 'fr' });
      const response = await browser.post('/v1/auth/register', payload);
      assert.equal(response.status, 201);
      const user = response.body.data.user;
      assert.equal(user.role, 'user');
      assert.equal(user.accountCurrency, 'EUR');
      assert.deepEqual(user.wallet.balance, { amountMinor: '0', currency: 'EUR' });
      assert.equal(user.preferredLocale, 'fr');
      assert.ok(Number(user.accountNo) >= 100001);
      assert.equal(user.password, undefined);
      assert.equal(user.passwordHash, undefined);
      const cookie = response.setCookie[0] ?? '';
      assert.match(cookie, /^aurum_session=/);
      assert.match(cookie, /HttpOnly/);
      assert.match(cookie, /SameSite=Lax/);
      assert.match(cookie, /Path=\//);
      assert.ok(browser.sessionCookie);
      const me = await browser.get('/v1/auth/me');
      assert.equal(me.status, 200);
      assert.equal(me.body.data.user.username, payload.username);
    });

    it('stores only a hash of the password and a hash of the session token', async () => {
      const { account, browser } = await registerPlayer(server);
      const row = await server.db.query<{ password_hash: string }>('select password_hash from users where id = $1::uuid', [account.id]);
      assert.match(row.rows[0]?.password_hash ?? '', /^scrypt\$/);
      assert.ok(!(row.rows[0]?.password_hash ?? '').includes(account.password));
      const sessions = await server.db.query<{ token_hash: Buffer }>('select token_hash from sessions where user_id = $1::uuid', [account.id]);
      assert.equal(sessions.rowCount, 1);
      assert.equal(sessions.rows[0]?.token_hash.length, 32);
      assert.notEqual(sessions.rows[0]?.token_hash.toString('base64url'), browser.sessionCookie);
    });

    const invalid: [string, Record<string, unknown>, number, string][] = [
      ['under 18', { dateOfBirth: new Date(Date.now() - 17 * 365.25 * 86_400_000).toISOString().slice(0, 10) }, 422, 'under_age'],
      ['terms not accepted', { acceptTerms: false }, 422, 'terms_required'],
      ['weak password', { password: 'password123' }, 422, 'weak_password'],
      ['password containing the username', { username: 'falcon_hunter', password: 'falcon_hunter99' }, 422, 'weak_password'],
      ['unknown country', { country: 'ZZ' }, 422, 'country_unavailable'],
      ['unknown currency', { currency: 'XXX' }, 422, 'currency_unavailable'],
      ['bad e-mail', { email: 'not-an-email' }, 422, 'validation'],
      ['bad username', { username: 'a b' }, 422, 'validation'],
      ['impossible date', { dateOfBirth: '1990-02-30' }, 422, 'validation'],
      ['bad phone', { mobile: '12ab' }, 422, 'validation'],
      ['missing name', { firstName: '' }, 422, 'validation'],
      ['name with control characters', { lastName: 'Ben\u0000Salah' }, 422, 'validation'],
    ];
    for (const [label, overrides, status, code] of invalid) {
      it(`rejects ${label}`, async () => {
        const response = await server.browser().post('/v1/auth/register', registrationPayload(overrides));
        assert.equal(response.status, status, JSON.stringify(response.body));
        assert.equal(response.body.error.code, code);
      });
    }

    it('rejects a duplicate username or e-mail regardless of case, and a duplicate mobile number', async () => {
      const first = await registerPlayer(server);
      let response = await server.browser().post('/v1/auth/register', registrationPayload({ username: first.account.username.toUpperCase() }));
      assert.equal(response.body.error.code, 'username_taken');
      response = await server.browser().post('/v1/auth/register', registrationPayload({ email: first.account.email.toUpperCase() }));
      assert.equal(response.body.error.code, 'email_taken');
      const row = await server.db.query<{ phone: string }>('select phone from users where id = $1::uuid', [first.id]);
      const national = (row.rows[0]?.phone ?? '').slice(4);
      response = await server.browser().post('/v1/auth/register', registrationPayload({ mobile: `0${national}` }));
      assert.equal(response.body.error.code, 'phone_taken');
    });

    it('ignores fields it does not know (no mass assignment)', async () => {
      const browser = server.browser();
      const response = await browser.post('/v1/auth/register', registrationPayload({ role: 'super_admin', permissions: ['users.manage'], status: 'suspended' }));
      assert.equal(response.status, 201);
      assert.equal(response.body.data.user.role, 'user');
      assert.deepEqual(response.body.data.user.permissions, []);
      assert.equal(response.body.data.user.status, 'active');
    });

    it('does not accept a disabled currency or country', async () => {
      await server.db.query("update currencies set is_enabled = false where code = 'USD'");
      await server.db.query("update countries set is_enabled = false where code = 'DZ'");
      try {
        let response = await server.browser().post('/v1/auth/register', registrationPayload({ currency: 'USD' }));
        assert.equal(response.body.error.code, 'currency_unavailable');
        response = await server.browser().post('/v1/auth/register', registrationPayload({ country: 'DZ', callingCode: '213' }));
        assert.equal(response.body.error.code, 'country_unavailable');
      } finally {
        await server.db.query("update currencies set is_enabled = true where code = 'USD'");
        await server.db.query("update countries set is_enabled = true where code = 'DZ'");
      }
    });

    it('can be closed by the Super Admin setting', async () => {
      await server.db.query("update site_settings set value = 'false'::jsonb where key = 'registration_open'");
      try {
        const response = await server.browser().post('/v1/auth/register', registrationPayload());
        assert.equal(response.status, 403);
        assert.equal(response.body.error.code, 'registration_closed');
      } finally {
        await server.db.query("update site_settings set value = 'true'::jsonb where key = 'registration_open'");
      }
    });
  });

  describe('login and sessions', () => {
    it('signs in by username or e-mail, case-insensitively', async () => {
      const { account } = await registerPlayer(server);
      for (const identifier of [account.username, account.username.toUpperCase(), account.email, account.email.toUpperCase()]) {
        const browser = server.browser();
        const response = await browser.post('/v1/auth/login', { identifier, password: account.password });
        assert.equal(response.status, 200, identifier);
        assert.equal(response.body.data.user.id, account.id);
      }
    });

    it('gives the same answer for an unknown user and a wrong password', async () => {
      const { account } = await registerPlayer(server);
      const wrong = await server.browser().post('/v1/auth/login', { identifier: account.username, password: 'Wrong-Password-1' });
      const unknown = await server.browser().post('/v1/auth/login', { identifier: 'nobody_here', password: 'Wrong-Password-1' });
      assert.equal(wrong.status, 401);
      assert.equal(unknown.status, 401);
      assert.equal(wrong.body.error.code, 'invalid_credentials');
      assert.equal(unknown.body.error.code, 'invalid_credentials');
      assert.deepEqual(Object.keys(wrong.body.error).sort(), Object.keys(unknown.body.error).sort());
    });

    it('locks the account after 5 wrong passwords, even for the right password, and unlocks later', async () => {
      const { account } = await registerPlayer(server);
      for (let i = 1; i <= 4; i++) {
        const r = await server.browser().post('/v1/auth/login', { identifier: account.username, password: `Wrong-Password-${i}` });
        assert.equal(r.body.error.code, 'invalid_credentials');
      }
      const fifth = await server.browser().post('/v1/auth/login', { identifier: account.username, password: 'Wrong-Password-5' });
      assert.equal(fifth.status, 429);
      assert.equal(fifth.body.error.code, 'account_locked');
      assert.ok(Number(fifth.headers.get('retry-after')) > 0);
      const correct = await server.browser().post('/v1/auth/login', { identifier: account.username, password: account.password });
      assert.equal(correct.status, 429);
      await server.db.query("update users set locked_until = now() - interval '1 minute' where id = $1::uuid", [account.id]);
      const after = await server.browser().post('/v1/auth/login', { identifier: account.username, password: account.password });
      assert.equal(after.status, 200);
    });

    it('a successful login resets the failure counter', async () => {
      const { account } = await registerPlayer(server);
      for (let i = 0; i < 3; i++) await server.browser().post('/v1/auth/login', { identifier: account.username, password: 'Wrong-Password-9' });
      assert.equal((await login(server.browser(), account)).status, 200);
      const row = await server.db.query<{ n: number }>('select failed_login_count as n from users where id = $1::uuid', [account.id]);
      assert.equal(row.rows[0]?.n, 0);
    });

    it('refuses suspended accounts and kills their sessions', async () => {
      const { account, browser } = await registerPlayer(server);
      assert.equal((await browser.get('/v1/auth/me')).status, 200);
      await server.db.query("update users set status = 'suspended' where id = $1::uuid", [account.id]);
      assert.equal((await browser.get('/v1/auth/me')).status, 401);
      const response = await server.browser().post('/v1/auth/login', { identifier: account.username, password: account.password });
      assert.equal(response.status, 403);
      assert.equal(response.body.error.code, 'account_suspended');
    });

    it('logout revokes the session on the server', async () => {
      const { browser } = await registerPlayer(server);
      const token = browser.sessionCookie as string;
      const out = await browser.post('/v1/auth/logout');
      assert.equal(out.status, 204);
      assert.match(out.setCookie[0] ?? '', /Max-Age=0/);
      const replay = new Browser(server.baseUrl, server.config.cookieName);
      replay.cookies.set(server.config.cookieName, token);
      assert.equal((await replay.get('/v1/auth/me')).status, 401);
    });

    it('rejects malformed, unknown and expired session cookies', async () => {
      const { browser } = await registerPlayer(server);
      const forged = new Browser(server.baseUrl, server.config.cookieName);
      forged.cookies.set(server.config.cookieName, 'x'.repeat(43));
      assert.equal((await forged.get('/v1/auth/me')).status, 401);
      forged.cookies.set(server.config.cookieName, "'; drop table users; --");
      assert.equal((await forged.get('/v1/auth/me')).status, 401);
      await server.db.query("update sessions set expires_at = now() - interval '1 second' where token_hash = sha256(convert_to($1, 'UTF8'))", [browser.sessionCookie]);
      assert.equal((await browser.get('/v1/auth/me')).status, 401);
    });

    it('expires idle staff sessions sooner than player sessions', async () => {
      const staff = await createStaff(server, { permissions: [] });
      const staffBrowser = await signedIn(server, staff);
      const { browser: player } = await registerPlayer(server);
      await server.db.query("update sessions set last_seen_at = now() - interval '2 hours'");
      assert.equal((await staffBrowser.get('/v1/auth/me')).status, 401);
      assert.equal((await player.get('/v1/auth/me')).status, 200);
    });

    it('uses a shorter session lifetime for staff', async () => {
      const staff = await createStaff(server);
      const response = await login(server.browser(), staff);
      assert.match(response.setCookie[0] ?? '', new RegExp(`Max-Age=${server.config.sessions.staffMs / 1000}`));
      const player = await server.browser().post('/v1/auth/register', registrationPayload());
      assert.match(player.setCookie[0] ?? '', new RegExp(`Max-Age=${server.config.sessions.userMs / 1000}`));
    });
  });

  describe('password change', () => {
    it('needs the current password and signs out the other sessions', async () => {
      const { account, browser } = await registerPlayer(server);
      const other = await signedIn(server, account);
      let r = await browser.post('/v1/auth/change-password', { currentPassword: 'Wrong-Password-1', newPassword: 'Another-Strong-88' });
      assert.equal(r.status, 401);
      assert.equal(r.body.error.fields.currentPassword, 'invalidCredentials');
      r = await browser.post('/v1/auth/change-password', { currentPassword: account.password, newPassword: 'short1' });
      assert.equal(r.status, 422);
      r = await browser.post('/v1/auth/change-password', { currentPassword: account.password, newPassword: account.password });
      assert.equal(r.status, 422);
      r = await browser.post('/v1/auth/change-password', { currentPassword: account.password, newPassword: 'Another-Strong-88' });
      assert.equal(r.status, 204);
      assert.equal((await browser.get('/v1/auth/me')).status, 200);
      assert.equal((await other.get('/v1/auth/me')).status, 401);
      assert.equal((await login(server.browser(), account)).status, 401);
      assert.equal((await login(server.browser(), { username: account.username, password: 'Another-Strong-88' })).status, 200);
    });

    it('forces staff with a temporary password to change it before doing anything else', async () => {
      const staff = await createStaff(server, { permissions: ['users.view'], mustChangePassword: true });
      const browser = await signedIn(server, staff);
      assert.equal((await browser.get('/v1/auth/me')).body.data.user.mustChangePassword, true);
      const blocked = await browser.get('/v1/admin/players');
      assert.equal(blocked.status, 403);
      assert.equal(blocked.body.error.code, 'password_change_required');
      const changed = await browser.post('/v1/auth/change-password', { currentPassword: staff.password, newPassword: 'Fresh-Strong-Pass-5' });
      assert.equal(changed.status, 204);
      assert.equal((await browser.get('/v1/admin/players')).status, 200);
    });
  });

  describe('request protection', () => {
    it('refuses state-changing requests from another origin', async () => {
      const { browser } = await registerPlayer(server);
      const r = await browser.post('/v1/auth/logout', undefined, { headers: { origin: 'https://evil.example' } });
      assert.equal(r.status, 403);
      assert.equal(r.body.error.code, 'csrf');
      assert.equal((await browser.get('/v1/auth/me')).status, 200);
    });

    it('refuses cross-site fetches and requests with a cookie but without the client header', async () => {
      const { browser } = await registerPlayer(server);
      let r = await browser.post('/v1/auth/logout', undefined, { headers: { 'sec-fetch-site': 'cross-site' } });
      assert.equal(r.status, 403);
      r = await browser.post('/v1/auth/logout', undefined, { browserHeaders: false });
      assert.equal(r.status, 403);
      assert.equal(r.body.error.code, 'csrf');
      assert.equal((await browser.get('/v1/auth/me')).status, 200);
    });

    it('requires JSON bodies and rejects oversized ones', async () => {
      const browser = server.browser();
      let r = await browser.request('POST', '/v1/auth/login', { headers: { 'content-type': 'text/plain' } });
      assert.equal(r.status, 415);
      const big = 'x'.repeat(300 * 1024);
      r = await browser.post('/v1/auth/login', { identifier: big, password: 'x' });
      assert.equal(r.status, 413);
      const broken = await fetch(`${server.baseUrl}/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' }, body: '{not json' });
      assert.equal(broken.status, 422);
    });

    it('adds security headers and never caches API answers', async () => {
      const r = await server.browser().get('/v1/health');
      assert.equal(r.status, 200);
      assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(r.headers.get('x-frame-options'), 'DENY');
      assert.equal(r.headers.get('cache-control'), 'no-store');
      assert.match(r.headers.get('content-security-policy') ?? '', /default-src 'none'/);
      assert.ok(r.headers.get('x-request-id'));
    });

    it('answers 404 and 405 with the JSON error format', async () => {
      const browser = server.browser();
      let r = await browser.get('/v1/nothing-here');
      assert.equal(r.status, 404);
      assert.equal(r.body.error.code, 'not_found');
      r = await browser.request('DELETE', '/v1/auth/me');
      assert.equal(r.status, 405);
      assert.equal(r.body.error.code, 'method_not_allowed');
      r = await browser.get('/v1/admin/players/..%2F..%2Fetc');
      assert.ok([401, 404].includes(r.status));
    });

    it('rate limits registration per IP', async () => {
      const limited = await startServer({ rateLimits: 'real' });
      try {
        const browser = limited.browser();
        let last = 0;
        for (let i = 0; i < 12; i++) {
          const r = await browser.post('/v1/auth/register', registrationPayload({ dateOfBirth: '2020-01-01' }));
          last = r.status;
          if (r.status === 429) break;
        }
        assert.equal(last, 429);
      } finally {
        await limited.stop();
      }
    });
  });

  it('never exposes secrets in any auth response', async () => {
    const { browser, account } = await registerPlayer(server);
    const text = JSON.stringify((await browser.get('/v1/auth/me')).body);
    for (const needle of ['scrypt', 'password_hash', account.password, 'token_hash']) assert.ok(!text.includes(needle), needle);
    assert.ok(STRONG_PASSWORD.length > 10);
  });
});
