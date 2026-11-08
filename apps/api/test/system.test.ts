import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { TEST_DATABASE_URL } from '@aurum/db/testing';
import { createStaff, createSuperAdminAccount, login, registerPlayer, registrationPayload, signedIn, startServer, tinyPng, unique, uploadForm } from './helpers.ts';
import type { Browser, TestServer } from './helpers.ts';

describe('Super Admin settings', { skip: TEST_DATABASE_URL ? false : 'TEST_DATABASE_URL is not set' }, () => {
  let server: TestServer;
  let boss: Browser;
  let bossId: string;
  let anonymous: Browser;
  let plainAdmin: Browser;

  before(async () => {
    server = await startServer();
    const account = await createSuperAdminAccount(server);
    bossId = account.id;
    boss = await signedIn(server, account);
    anonymous = server.browser();
    plainAdmin = await signedIn(server, await createStaff(server, { permissions: [] }));
  });
  after(async () => {
    await server?.stop();
  });

  const audits = async (action: string, targetId?: string): Promise<{ details: Record<string, unknown>; actor_id: string | null }[]> => {
    const { rows } = await server.db.query<{ details: Record<string, unknown>; actor_id: string | null }>(
      'select details, actor_id::text from audit_logs where action = $1 and ($2::text is null or target_id = $2) order by id',
      [action, targetId ?? null],
    );
    return rows;
  };

  // -------------------------------------------------------------------------
  describe('staff accounts', () => {
    const newAdmin = (overrides: Record<string, unknown> = {}) => {
      const u = unique();
      return { username: `adm_${u}`, email: `adm_${u}@example.test`, firstName: 'Salma', lastName: 'Trabelsi', permissions: ['users.view', 'balances.view'], ...overrides };
    };

    it('creates an admin with a one-time temporary password that must be changed at first sign-in', async () => {
      const input = newAdmin({ permissions: ['users.view', 'users.view', 'balances.view', 'reports.view'] });
      const r = await boss.post('/v1/admin/staff', input);
      assert.equal(r.status, 201, JSON.stringify(r.body));
      const { staff, temporaryPassword } = r.body.data;
      assert.equal(staff.role, 'admin');
      assert.deepEqual(staff.permissions.sort(), ['balances.view', 'reports.view', 'users.view']);
      assert.equal(staff.mustChangePassword, true);
      assert.equal(staff.status, 'active');
      assert.equal(staff.lastLoginAt, null);
      assert.match(temporaryPassword, /^[A-Za-z0-9]{16}$/);
      assert.ok(!JSON.stringify(staff).includes('hash'));

      // the audit trail knows who created the account and with which permissions, but not the password
      const [entry] = await audits('staff.created', staff.id);
      assert.equal(entry?.actor_id, bossId);
      assert.deepEqual((entry?.details.permissions as string[]).sort(), ['balances.view', 'reports.view', 'users.view']);
      assert.ok(!JSON.stringify(entry).includes(temporaryPassword));

      // first sign-in: everything is blocked except changing the password
      const browser = server.browser();
      const loggedIn = await login(browser, { username: input.username, password: temporaryPassword });
      assert.equal(loggedIn.status, 200);
      assert.equal(loggedIn.body.data.user.mustChangePassword, true);
      const blocked = await browser.get('/v1/admin/players');
      assert.equal(blocked.status, 403);
      assert.equal(blocked.body.error.code, 'password_change_required');
      assert.equal((await browser.post('/v1/auth/change-password', { currentPassword: temporaryPassword, newPassword: 'Chosen-By-Staff-42' })).status, 204);
      assert.equal((await browser.get('/v1/admin/players')).status, 200);
      assert.equal((await browser.get('/v1/admin/ledger')).status, 200, 'balances.view');
      assert.equal((await browser.get('/v1/admin/audit')).status, 403, 'no audit.view permission');
      assert.equal((await browser.get('/v1/admin/staff')).status, 403, 'staff accounts are for the Super Admin only');
      // the temporary password no longer works
      assert.equal((await login(server.browser(), { username: input.username, password: temporaryPassword })).status, 401);
    });

    it('cannot be tricked into creating a Super Admin or a player', async () => {
      const r = await boss.post('/v1/admin/staff', newAdmin({ role: 'super_admin', status: 'closed', mustChangePassword: false, accountCurrency: 'TND' }));
      assert.equal(r.status, 201, JSON.stringify(r.body));
      assert.equal(r.body.data.staff.role, 'admin');
      assert.equal(r.body.data.staff.mustChangePassword, true);
      const { rows } = await server.db.query<{ role: string; account_currency: string | null }>('select role::text, account_currency from users where id = $1::uuid', [r.body.data.staff.id]);
      assert.deepEqual(rows[0], { role: 'admin', account_currency: null });
      const wallets = await server.db.query('select 1 from wallets where user_id = $1::uuid', [r.body.data.staff.id]);
      assert.equal(wallets.rowCount, 0, 'staff accounts have no wallet');
    });

    it('validates the input and refuses duplicates', async () => {
      const bad: [string, Record<string, unknown>, string][] = [
        ['a username that is too short', { username: 'ab' }, 'username'],
        ['a username with spaces', { username: 'two words' }, 'username'],
        ['an invalid email', { email: 'not-an-email' }, 'email'],
        ['a first name with digits', { firstName: 'R2D2' }, 'firstName'],
        ['an empty last name', { lastName: '' }, 'lastName'],
        ['an unknown permission', { permissions: ['users.view', 'root'] }, 'permissions[1]'],
        ['permissions that are not a list', { permissions: 'users.view' }, 'permissions'],
      ];
      for (const [label, overrides, field] of bad) {
        const r = await boss.post('/v1/admin/staff', newAdmin(overrides));
        assert.equal(r.status, 422, `${label}: ${JSON.stringify(r.body)}`);
        assert.ok(field in (r.body.error.fields ?? {}), `${label}: expected ${field}, got ${JSON.stringify(r.body.error.fields)}`);
      }
      const first = newAdmin();
      assert.equal((await boss.post('/v1/admin/staff', first)).status, 201);
      const sameName = await boss.post('/v1/admin/staff', newAdmin({ username: first.username.toUpperCase() }));
      assert.equal(sameName.status, 409);
      assert.equal(sameName.body.error.code, 'username_taken');
      const sameEmail = await boss.post('/v1/admin/staff', newAdmin({ email: first.email.toUpperCase() }));
      assert.equal(sameEmail.status, 409);
      assert.equal(sameEmail.body.error.code, 'email_taken');
      const none = await boss.post('/v1/admin/staff', newAdmin({ permissions: [] }));
      assert.equal(none.status, 201, 'an admin with no permission is allowed (they can only see their own account)');
    });

    it('lists staff, never players, and never any secret', async () => {
      const player = await registerPlayer(server);
      const r = await boss.get('/v1/admin/staff');
      assert.equal(r.status, 200);
      const ids = r.body.data.items.map((s: { id: string }) => s.id);
      assert.ok(ids.includes(bossId));
      assert.ok(!ids.includes(player.id));
      assert.equal(r.body.data.items[0].role, 'super_admin', 'Super Admins first');
      assert.ok(!/hash|password_|scrypt/i.test(JSON.stringify(r.body).replace(/mustChangePassword/g, '')));
      assert.deepEqual(Object.keys(r.body.data.items[0]).sort(), ['accountNo', 'createdAt', 'email', 'firstName', 'id', 'lastLoginAt', 'lastName', 'mustChangePassword', 'permissions', 'role', 'status', 'username']);
    });

    it('changes permissions and status, and takes effect immediately', async () => {
      const created = await boss.post('/v1/admin/staff', newAdmin({ permissions: ['users.view'] }));
      const { staff, temporaryPassword } = created.body.data;
      const admin = server.browser();
      await login(admin, { username: staff.username, password: temporaryPassword });
      await admin.post('/v1/auth/change-password', { currentPassword: temporaryPassword, newPassword: 'Chosen-By-Staff-42' });
      assert.equal((await admin.get('/v1/admin/players')).status, 200);
      assert.equal((await admin.get('/v1/admin/audit')).status, 403);

      const newEmail = `Renamed.${staff.username}@Example.TEST`;
      const granted = await boss.patch(`/v1/admin/staff/${staff.id}`, { permissions: ['users.view', 'audit.view'], firstName: 'Salma', email: newEmail });
      assert.equal(granted.status, 200, JSON.stringify(granted.body));
      assert.deepEqual(granted.body.data.staff.permissions.sort(), ['audit.view', 'users.view']);
      assert.equal(granted.body.data.staff.email, newEmail.toLowerCase());
      // the admin was signed out so that the new rights are read fresh at the next sign-in
      assert.equal((await admin.get('/v1/admin/players')).status, 401);
      const again = await signedIn(server, { username: staff.username, password: 'Chosen-By-Staff-42' });
      assert.equal((await again.get('/v1/admin/audit')).status, 200);

      const suspended = await boss.patch(`/v1/admin/staff/${staff.id}`, { status: 'suspended' });
      assert.equal(suspended.body.data.staff.status, 'suspended');
      assert.equal((await again.get('/v1/admin/audit')).status, 401);
      const blocked = await login(server.browser(), { username: staff.username, password: 'Chosen-By-Staff-42' });
      assert.equal(blocked.status, 403);
      assert.equal(blocked.body.error.code, 'account_suspended');

      const restored = await boss.patch(`/v1/admin/staff/${staff.id}`, { status: 'active' });
      assert.equal(restored.body.data.staff.status, 'active');
      assert.equal((await login(server.browser(), { username: staff.username, password: 'Chosen-By-Staff-42' })).status, 200);

      const log = await audits('staff.updated', staff.id);
      assert.equal(log.length, 3);
      assert.deepEqual(Object.keys(log[0]?.details.changes as object).sort(), ['email', 'permissions'].sort());
    });

    it('does nothing for an empty change, and ignores fields it does not know', async () => {
      const created = await boss.post('/v1/admin/staff', newAdmin({ permissions: ['users.view'] }));
      const staff = created.body.data.staff;
      const same = await boss.patch(`/v1/admin/staff/${staff.id}`, {});
      assert.equal(same.status, 200);
      assert.deepEqual(same.body.data.staff, staff);
      const sneaky = await boss.patch(`/v1/admin/staff/${staff.id}`, { role: 'super_admin', mustChangePassword: false, username: 'someone_else' });
      assert.equal(sneaky.status, 200);
      assert.equal(sneaky.body.data.staff.role, 'admin');
      assert.equal(sneaky.body.data.staff.username, staff.username);
      assert.equal(sneaky.body.data.staff.mustChangePassword, true);
      assert.equal((await audits('staff.updated', staff.id)).length, 0);
      assert.equal((await boss.patch(`/v1/admin/staff/${staff.id}`, { status: 'closed' })).status, 422);
      assert.equal((await boss.patch(`/v1/admin/staff/${staff.id}`, { permissions: ['everything'] })).status, 422);
    });

    it('never edits a Super Admin or a player through this route', async () => {
      const other = await createSuperAdminAccount(server);
      const r = await boss.patch(`/v1/admin/staff/${other.id}`, { status: 'suspended' });
      assert.equal(r.status, 403);
      const self = await boss.patch(`/v1/admin/staff/${bossId}`, { permissions: [] });
      assert.equal(self.status, 403);
      const player = await registerPlayer(server);
      assert.equal((await boss.patch(`/v1/admin/staff/${player.id}`, { status: 'suspended' })).status, 404);
      assert.equal((await boss.patch(`/v1/admin/staff/${randomUUID()}`, { status: 'suspended' })).status, 404);
      assert.equal((await boss.patch('/v1/admin/staff/not-a-uuid', { status: 'suspended' })).status, 404);
      const { rows } = await server.db.query<{ status: string }>('select status::text from users where id = $1::uuid', [other.id]);
      assert.equal(rows[0]?.status, 'active');
    });

    it('resets an admin password: new one-time password, forced change, all sessions closed', async () => {
      const staff = await createStaff(server, { permissions: ['users.view'] });
      const session = await signedIn(server, staff);
      assert.equal((await session.get('/v1/admin/players')).status, 200);
      const r = await boss.post(`/v1/admin/staff/${staff.id}/reset-password`);
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.headers.get('cache-control'), 'no-store');
      const temporaryPassword = r.body.data.temporaryPassword as string;
      assert.match(temporaryPassword, /^[A-Za-z0-9]{16}$/);
      assert.deepEqual(Object.keys(r.body.data), ['temporaryPassword']);
      assert.equal((await session.get('/v1/admin/players')).status, 401, 'the old session was closed');
      assert.equal((await login(server.browser(), staff)).status, 401, 'the old password stopped working');
      const fresh = server.browser();
      const loggedIn = await login(fresh, { username: staff.username, password: temporaryPassword });
      assert.equal(loggedIn.status, 200);
      assert.equal(loggedIn.body.data.user.mustChangePassword, true);
      assert.equal((await fresh.get('/v1/admin/players')).status, 403);
      const [entry] = await audits('user.password_reset', staff.id);
      assert.equal(entry?.actor_id, bossId);
      assert.ok(!JSON.stringify(entry).includes(temporaryPassword));
    });

    it('does not reset the password of a Super Admin, a player or an unknown account', async () => {
      const other = await createSuperAdminAccount(server);
      const player = await registerPlayer(server);
      for (const id of [other.id, bossId, player.id, randomUUID(), 'nope']) {
        const r = await boss.post(`/v1/admin/staff/${id}/reset-password`);
        assert.equal(r.status, 404, id);
        assert.equal(r.body.error.code, 'user_not_found');
      }
      assert.equal((await login(server.browser(), other)).status, 200, 'the Super Admin password is untouched');
      assert.equal((await login(server.browser(), player.account)).status, 200);
    });

    it('is closed to everyone but the Super Admin', async () => {
      const staff = await createStaff(server, { permissions: [] });
      const everything = await signedIn(server, await createStaff(server, { permissions: ['users.view', 'users.manage', 'balances.view', 'balances.manage', 'banners.manage', 'promotions.manage', 'pages.manage', 'games.manage', 'reports.view', 'audit.view'] }));
      const player = await registerPlayer(server);
      for (const browser of [anonymous, player.browser, everything, plainAdmin]) {
        const r = await browser.get('/v1/admin/staff');
        assert.ok([401, 403].includes(r.status));
        assert.ok([401, 403].includes((await browser.post('/v1/admin/staff', newAdmin())).status));
        assert.ok([401, 403].includes((await browser.patch(`/v1/admin/staff/${staff.id}`, { status: 'suspended' })).status));
        assert.ok([401, 403].includes((await browser.post(`/v1/admin/staff/${staff.id}/reset-password`)).status));
      }
      const { rows } = await server.db.query<{ status: string }>('select status::text from users where id = $1::uuid', [staff.id]);
      assert.equal(rows[0]?.status, 'active');
    });
  });

  // -------------------------------------------------------------------------
  describe('currencies', () => {
    const currency = (code: string, overrides: Record<string, unknown> = {}) => ({
      code,
      kind: 'fiat',
      decimals: 2,
      names: { en: 'Pound sterling', fr: 'Livre sterling', ar: 'جنيه إسترليني' },
      display: { default: { symbol: '£', placement: 'prefix', spacing: false }, ar: { symbol: '£', placement: 'suffix', spacing: true } },
      isEnabled: false,
      ...overrides,
    });
    const { code: placeholderCode, ...withoutCode } = currency('X');
    assert.equal(placeholderCode, 'X');

    it('lets the Super Admin add a currency, stored in minor units with its own display rules', async () => {
      const r = await boss.post('/v1/admin/currencies', currency('gbp', { displayDecimals: 2, sortOrder: 7 }));
      assert.equal(r.status, 201, JSON.stringify(r.body));
      assert.deepEqual(r.body.data.currency, {
        code: 'GBP',
        kind: 'fiat',
        decimals: 2,
        displayDecimals: 2,
        names: { en: 'Pound sterling', fr: 'Livre sterling', ar: 'جنيه إسترليني' },
        display: { default: { symbol: '£', placement: 'prefix', spacing: false }, ar: { symbol: '£', placement: 'suffix', spacing: true } },
        isEnabled: false,
        sortOrder: 7,
      });
      const { rows } = await server.db.query<{ display: { default: { placement: string } } }>("select display from currencies where code = 'GBP'");
      assert.equal(rows[0]?.display.default.placement, 'before', 'the database vocabulary is before/after');
      assert.equal((await audits('currency.created', 'GBP')).length, 1);

      const crypto = await boss.post('/v1/admin/currencies', currency('BTC', { kind: 'crypto', decimals: 8, displayDecimals: 6, names: { en: 'Bitcoin' }, display: { default: { symbol: '₿', placement: 'prefix', spacing: false } } }));
      assert.equal(crypto.status, 201, JSON.stringify(crypto.body));
      assert.equal(crypto.body.data.currency.decimals, 8);
    });

    it('is visible to all staff but only the Super Admin can change it', async () => {
      const list = await plainAdmin.get('/v1/admin/currencies');
      assert.equal(list.status, 200);
      assert.ok(list.body.data.items.some((c: { code: string }) => c.code === 'TND'));
      assert.equal((await anonymous.get('/v1/admin/currencies')).status, 401);
      const player = await registerPlayer(server);
      assert.equal((await player.browser.get('/v1/admin/currencies')).status, 403);
      assert.equal((await plainAdmin.post('/v1/admin/currencies', currency('JPY', { decimals: 0 }))).status, 403);
      assert.equal((await plainAdmin.put('/v1/admin/currencies/TND', withoutCode)).status, 403);
      const { rows } = await server.db.query('select 1 from currencies where code = $1', ['JPY']);
      assert.equal(rows.length, 0);
    });

    it('validates the code, the precision and the display rules', async () => {
      const bad: [string, Record<string, unknown>, string][] = [
        ['a code that is too short', { code: 'AB' }, 'code'],
        ['a code with symbols', { code: 'U$D' }, 'code'],
        ['a code starting with a digit', { code: '1ABC' }, 'code'],
        ['more than 8 decimals', { decimals: 9 }, 'decimals'],
        ['negative decimals', { decimals: -1 }, 'decimals'],
        ['fractional decimals', { decimals: 1.5 }, 'decimals'],
        ['decimals as text', { decimals: '2' }, 'decimals'],
        ['display decimals above accounting decimals', { decimals: 2, displayDecimals: 3 }, 'displayDecimals'],
        ['an unknown kind', { kind: 'gold' }, 'kind'],
        ['an empty symbol', { display: { default: { symbol: '', placement: 'prefix', spacing: false } } }, 'display.default.symbol'],
        ['a symbol that is too long', { display: { default: { symbol: 'x'.repeat(13), placement: 'prefix', spacing: false } } }, 'display.default.symbol'],
        ['an unknown placement', { display: { default: { symbol: '£', placement: 'left', spacing: false } } }, 'display.default.placement'],
        ['no default display rule', { display: { ar: { symbol: '£', placement: 'prefix', spacing: false } } }, 'display.default'],
        ['a name in an unknown language', { names: { de: 'Pfund' } }, 'names.de'],
        ['an empty name', { names: { en: '' } }, 'names.en'],
      ];
      for (const [label, overrides, field] of bad) {
        const r = await boss.post('/v1/admin/currencies', currency(`T${unique().slice(-5).toUpperCase()}`, overrides));
        const code = (overrides.code as string | undefined) ?? undefined;
        assert.ok(r.status === 422, `${label}: ${r.status} ${JSON.stringify(r.body)} ${code ?? ''}`);
        assert.ok(field in (r.body.error.fields ?? {}), `${label}: expected ${field}, got ${JSON.stringify(r.body.error.fields)}`);
      }
      const duplicate = await boss.post('/v1/admin/currencies', currency('EUR'));
      assert.equal(duplicate.status, 409);
      assert.equal(duplicate.body.error.fields.code, 'alreadyExists');
    });

    it('updates names, symbols, switches and order; the precision can change only while no wallet uses it', async () => {
      // CHF: nobody uses it yet
      assert.equal((await boss.post('/v1/admin/currencies', currency('CHF', { decimals: 2, names: { en: 'Swiss franc' }, display: { default: { symbol: 'CHF', placement: 'prefix', spacing: true } } }))).status, 201);
      const body = { ...withoutCode, names: { en: 'Swiss franc', fr: 'Franc suisse' }, display: { default: { symbol: 'Fr.', placement: 'suffix', spacing: true } }, decimals: 3, displayDecimals: 2, isEnabled: true, sortOrder: 9 };
      const updated = await boss.put('/v1/admin/currencies/chf', body);
      assert.equal(updated.status, 200, JSON.stringify(updated.body));
      assert.equal(updated.body.data.currency.decimals, 3);
      assert.equal(updated.body.data.currency.display.default.symbol, 'Fr.');
      assert.equal(updated.body.data.currency.isEnabled, true);
      assert.equal(updated.body.data.currency.names.fr, 'Franc suisse');
      assert.equal(updated.body.data.currency.names.ar, undefined);
      assert.equal((await audits('currency.updated', 'CHF')).length, 1);

      // TND is used by a wallet: its precision is frozen, its look is not
      await registerPlayer(server);
      const tnd = (await boss.get('/v1/admin/currencies')).body.data.items.find((c: { code: string }) => c.code === 'TND');
      const { code, ...tndBody } = tnd;
      void code;
      const frozen = await boss.put('/v1/admin/currencies/TND', { ...tndBody, decimals: 2 });
      assert.equal(frozen.status, 409);
      assert.equal(frozen.body.error.code, 'currency_in_use');
      const relabelled = await boss.put('/v1/admin/currencies/TND', { ...tndBody, display: { ...tndBody.display, default: { symbol: 'DT', placement: 'suffix', spacing: true } } });
      assert.equal(relabelled.status, 200, JSON.stringify(relabelled.body));
      assert.equal(relabelled.body.data.currency.decimals, 3);
      const config = (await anonymous.get('/v1/public/config')).body.data;
      assert.equal(config.currencies.find((c: { code: string }) => c.code === 'TND').display.default.symbol, 'DT');
      await boss.put('/v1/admin/currencies/TND', tndBody); // put it back

      assert.equal((await boss.put('/v1/admin/currencies/ZZZ', body)).status, 404);
      assert.equal((await boss.put('/v1/admin/currencies/not%20a%20code', body)).status, 404);
      assert.equal((await boss.put('/v1/admin/currencies/CHF', { ...body, decimals: 9 })).status, 422);
    });

    it('offers only enabled currencies to visitors; players keep the currency of their wallet', async () => {
      const player = await registerPlayer(server, { currency: 'EUR' });
      const eur = (await boss.get('/v1/admin/currencies')).body.data.items.find((c: { code: string }) => c.code === 'EUR');
      const { code, ...eurBody } = eur;
      void code;
      try {
        assert.equal((await boss.put('/v1/admin/currencies/EUR', { ...eurBody, isEnabled: false })).status, 200);
        const config = (await anonymous.get('/v1/public/config')).body.data;
        assert.ok(!config.currencies.some((c: { code: string }) => c.code === 'EUR'));
        const refused = await server.browser().post('/v1/auth/register', registrationPayload({ currency: 'EUR' }));
        assert.equal(refused.status, 422);
        assert.equal(refused.body.error.code, 'currency_unavailable');
        const wallet = await player.browser.get('/v1/account/wallet');
        assert.equal(wallet.status, 200);
        assert.equal(wallet.body.data.wallet.balance.currency, 'EUR');
      } finally {
        await boss.put('/v1/admin/currencies/EUR', eurBody);
      }
      assert.ok((await anonymous.get('/v1/public/config')).body.data.currencies.some((c: { code: string }) => c.code === 'EUR'));
    });
  });

  // -------------------------------------------------------------------------
  describe('exchange rates', () => {
    const rate = (overrides: Record<string, unknown> = {}) => ({ base: 'USD', quote: 'TND', rate: '3.1', source: 'Central bank, manual entry', ...overrides });

    it('records a rate typed by the Super Admin, never edits it, and lists the newest first', async () => {
      const first = await boss.post('/v1/admin/exchange-rates', rate({ rate: '3.100', note: 'morning fixing' }));
      assert.equal(first.status, 201, JSON.stringify(first.body));
      assert.equal(first.body.data.rate.rate, '3.1', 'trailing zeros are not significant');
      assert.equal(first.body.data.rate.note, 'morning fixing');
      assert.equal(first.body.data.rate.createdBy, bossId);
      const second = await boss.post('/v1/admin/exchange-rates', rate({ rate: '3.12' }));
      assert.equal(second.status, 201);
      const list = await plainAdmin.get('/v1/admin/exchange-rates?base=USD&quote=TND');
      assert.equal(list.status, 200, 'any staff member can read the rates');
      assert.deepEqual(list.body.data.items.slice(0, 2).map((r: { rate: string }) => r.rate), ['3.12', '3.1']);
      assert.equal((await audits('rate.added', first.body.data.rate.id)).length, 1);

      // there is no way to change or delete a rate: only a newer one
      assert.ok([404, 405].includes((await boss.put(`/v1/admin/exchange-rates/${first.body.data.rate.id}`, rate())).status));
      assert.ok([404, 405].includes((await boss.delete(`/v1/admin/exchange-rates/${first.body.data.rate.id}`)).status));
      await assert.rejects(server.db.query('update exchange_rates set rate = 1'), (e: { code?: string }) => e.code === 'AU901');
      await assert.rejects(server.db.query('delete from exchange_rates'), (e: { code?: string }) => e.code === 'AU901');
    });

    it('uses the rate with the latest effective date, not the one entered last', async () => {
      const player = await registerPlayer(server, { currency: 'EUR' });
      const ledger = await signedIn(server, await createStaff(server, { permissions: ['balances.manage'] }));
      await ledger.post(`/v1/admin/players/${player.id}/balance`, { idempotencyKey: `k-${unique()}`, entryType: 'deposit', amount: '100.00' });
      await player.browser.patch('/v1/account/preferences', { displayCurrency: 'USD' });
      await boss.post('/v1/admin/exchange-rates', rate({ base: 'EUR', quote: 'USD', rate: '1.10', effectiveAt: new Date(Date.now() - 1000).toISOString() }));
      await boss.post('/v1/admin/exchange-rates', rate({ base: 'EUR', quote: 'USD', rate: '1.05', effectiveAt: new Date(Date.now() - 86_400_000).toISOString() }));
      const wallet = await player.browser.get('/v1/account/wallet');
      assert.equal(wallet.body.data.indicative.rate, '1.1');
      assert.equal(wallet.body.data.indicative.amountMinor, '11000');
      assert.equal(wallet.body.data.wallet.balance.amountMinor, '10000');
      // a rate that is not yet in force is not used either
      await boss.post('/v1/admin/exchange-rates', rate({ base: 'EUR', quote: 'USD', rate: '9.99', effectiveAt: new Date(Date.now() + 86_400_000).toISOString() }));
      assert.equal((await player.browser.get('/v1/account/wallet')).body.data.indicative.rate, '1.1');
      // and the inverse pair is never guessed
      await player.browser.patch('/v1/account/preferences', { displayCurrency: 'TND' });
      assert.equal((await player.browser.get('/v1/account/wallet')).body.data.indicative, null);
    });

    it('validates the pair, the rate and the source', async () => {
      const bad: [string, Record<string, unknown>, string, number][] = [
        ['the same currency twice', { base: 'USD', quote: 'USD' }, 'quote', 422],
        ['an unknown currency', { quote: 'XYZ' }, 'base', 422],
        ['an empty source', { source: '' }, 'source', 422],
        ['a note that is too long', { note: 'x'.repeat(501) }, 'note', 422],
        ['an effective date that is not a date', { effectiveAt: 'soon' }, 'effectiveAt', 422],
      ];
      for (const [label, overrides, field, status] of bad) {
        const r = await boss.post('/v1/admin/exchange-rates', rate(overrides));
        assert.equal(r.status, status, `${label}: ${JSON.stringify(r.body)}`);
        assert.ok(field in (r.body.error.fields ?? {}), `${label}: expected ${field}, got ${JSON.stringify(r.body.error.fields)}`);
      }
      for (const value of ['0', '-1', 'abc', '1e3', '', '1,5', '1.1234567890123', '.5', ' ']) {
        const r = await boss.post('/v1/admin/exchange-rates', rate({ rate: value }));
        assert.ok(r.status === 422, `${JSON.stringify(value)} -> ${r.status} ${JSON.stringify(r.body)}`);
      }
      assert.equal((await boss.get('/v1/admin/exchange-rates?base=usd')).status, 200, 'codes are case-insensitive in filters');
      assert.equal((await boss.get('/v1/admin/exchange-rates?limit=0')).status, 422);
    });

    it('is writable by the Super Admin only', async () => {
      assert.equal((await plainAdmin.post('/v1/admin/exchange-rates', rate())).status, 403);
      assert.equal((await anonymous.post('/v1/admin/exchange-rates', rate())).status, 401);
      const player = await registerPlayer(server);
      assert.equal((await player.browser.post('/v1/admin/exchange-rates', rate())).status, 403);
      assert.equal((await player.browser.get('/v1/admin/exchange-rates')).status, 403);
    });
  });

  // -------------------------------------------------------------------------
  describe('languages', () => {
    it('lists the languages with their direction and whether the interface supports them', async () => {
      const r = await boss.get('/v1/admin/languages');
      assert.equal(r.status, 200);
      assert.deepEqual(
        r.body.data.items.map((l: { code: string; direction: string; isDefault: boolean; hasCatalog: boolean }) => [l.code, l.direction, l.isDefault, l.hasCatalog]),
        [['en', 'ltr', true, true], ['fr', 'ltr', false, true], ['ar', 'rtl', false, true]],
      );
      assert.equal((await plainAdmin.get('/v1/admin/languages')).status, 403);
    });

    it('hides a disabled language from visitors and keeps exactly one default', async () => {
      try {
        const off = await boss.patch('/v1/admin/languages/fr', { isEnabled: false });
        assert.equal(off.status, 200, JSON.stringify(off.body));
        assert.deepEqual((await anonymous.get('/v1/public/config')).body.data.languages.map((l: { code: string }) => l.code), ['en', 'ar']);

        const reorder = await boss.patch('/v1/admin/languages/ar', { sortOrder: 0 });
        assert.equal(reorder.status, 200);
        assert.deepEqual((await anonymous.get('/v1/public/config')).body.data.languages.map((l: { code: string }) => l.code), ['ar', 'en']);

        const newDefault = await boss.patch('/v1/admin/languages/ar', { isDefault: true });
        assert.equal(newDefault.status, 200, JSON.stringify(newDefault.body));
        const defaults = (await boss.get('/v1/admin/languages')).body.data.items.filter((l: { isDefault: boolean }) => l.isDefault).map((l: { code: string }) => l.code);
        assert.deepEqual(defaults, ['ar']);
        assert.equal((await audits('language.updated', 'ar')).length, 2);
      } finally {
        await boss.patch('/v1/admin/languages/en', { isDefault: true });
        await boss.patch('/v1/admin/languages/fr', { isEnabled: true });
        await boss.patch('/v1/admin/languages/ar', { sortOrder: 3 });
      }
      assert.deepEqual((await anonymous.get('/v1/public/config')).body.data.languages.map((l: { code: string; isDefault: boolean }) => [l.code, l.isDefault]), [['en', true], ['fr', false], ['ar', false]]);
    });

    it('shows content in the new default language when a translation is missing', async () => {
      const upload = await boss.request('POST', '/v1/admin/media', { form: uploadForm(tinyPng(1425, 415)) });
      const image = upload.body.data.media.id as string;
      const banner = await boss.post('/v1/admin/banners', {
        placement: 'home_hero',
        name: `Default language ${unique()}`,
        translations: { en: { title: 'English text', imageDesktopId: image }, ar: { title: 'نص عربي', imageDesktopId: image } },
      });
      assert.equal(banner.status, 201, JSON.stringify(banner.body));
      const titleFor = async (locale: string) => {
        const r = await anonymous.get(`/v1/public/banners?placement=home_hero&locale=${locale}`);
        return r.body.data.items.find((b: { id: string }) => b.id === banner.body.data.banner.id)?.title;
      };
      try {
        assert.equal(await titleFor('fr'), 'English text');
        await boss.patch('/v1/admin/languages/ar', { isDefault: true });
        assert.equal(await titleFor('fr'), 'نص عربي');
        assert.equal(await titleFor('en'), 'English text');
      } finally {
        await boss.patch('/v1/admin/languages/en', { isDefault: true });
      }
      assert.equal(await titleFor('fr'), 'English text');
    });

    it('protects the default language and refuses languages the interface cannot display', async () => {
      const disableDefault = await boss.patch('/v1/admin/languages/en', { isEnabled: false });
      assert.equal(disableDefault.status, 422);
      assert.equal(disableDefault.body.error.fields.isEnabled, 'defaultMustBeEnabled');
      const unsetDefault = await boss.patch('/v1/admin/languages/en', { isDefault: false });
      assert.equal(unsetDefault.status, 422);
      assert.equal(unsetDefault.body.error.fields.isDefault, 'defaultRequired');
      const defaultDisabled = await boss.patch('/v1/admin/languages/fr', { isEnabled: false, isDefault: true });
      assert.equal(defaultDisabled.status, 422);

      await server.db.query("insert into languages (code, native_name, english_name, direction, is_enabled, sort_order) values ('de', 'Deutsch', 'German', 'ltr', false, 9)");
      const noCatalog = await boss.patch('/v1/admin/languages/de', { isEnabled: true });
      assert.equal(noCatalog.status, 422);
      assert.equal(noCatalog.body.error.fields.isEnabled, 'noCatalog');
      assert.equal((await boss.get('/v1/admin/languages')).body.data.items.find((l: { code: string }) => l.code === 'de').hasCatalog, false);
      assert.equal((await boss.patch('/v1/admin/languages/de', { sortOrder: 5 })).status, 200, 'it can still be ordered');

      assert.equal((await boss.patch('/v1/admin/languages/xx', { isEnabled: true })).status, 404);
      assert.equal((await boss.patch('/v1/admin/languages/ENGLISH', { isEnabled: true })).status, 404);
      assert.equal((await boss.patch('/v1/admin/languages/fr', { isEnabled: 'yes' })).status, 422);
      assert.equal((await plainAdmin.patch('/v1/admin/languages/fr', { isEnabled: false })).status, 403);
      assert.equal((await anonymous.patch('/v1/admin/languages/fr', { isEnabled: false })).status, 401);
      assert.equal((await boss.get('/v1/admin/languages')).body.data.items.find((l: { code: string }) => l.code === 'en').isDefault, true);
    });
  });

  // -------------------------------------------------------------------------
  describe('countries and switches', () => {
    it('stops registrations from a country that is switched off, and accepts them again once it is on', async () => {
      try {
        const off = await boss.patch('/v1/admin/countries/fr', { isEnabled: false });
        assert.equal(off.status, 200, JSON.stringify(off.body));
        assert.deepEqual(off.body.data.country, { code: 'FR', callingCode: '33', isEnabled: false, sortOrder: 16 });
        assert.ok(!(await anonymous.get('/v1/public/config')).body.data.countries.some((c: { code: string }) => c.code === 'FR'));
        const payload = registrationPayload({ country: 'FR', callingCode: '33', mobile: String(600_000_000 + Math.floor(Math.random() * 99_000_000)) });
        const refused = await server.browser().post('/v1/auth/register', payload);
        assert.equal(refused.status, 422);
        assert.equal(refused.body.error.code, 'country_unavailable');
      } finally {
        await boss.patch('/v1/admin/countries/FR', { isEnabled: true });
      }
      assert.ok((await anonymous.get('/v1/public/config')).body.data.countries.some((c: { code: string }) => c.code === 'FR'));
      const accepted = await server.browser().post('/v1/auth/register', registrationPayload({ country: 'FR', callingCode: '33', mobile: String(600_000_000 + Math.floor(Math.random() * 99_000_000)) }));
      assert.equal(accepted.status, 201, JSON.stringify(accepted.body));
      assert.equal((await audits('country.updated', 'FR')).length, 2);
    });

    it('lists countries for the Super Admin only and validates the request', async () => {
      const list = await boss.get('/v1/admin/countries');
      assert.equal(list.status, 200);
      assert.equal(list.body.data.items.length, 60);
      assert.equal(list.body.data.items[0].code, 'TN');
      assert.equal((await plainAdmin.get('/v1/admin/countries')).status, 403);
      assert.equal((await boss.patch('/v1/admin/countries/ZZ', { isEnabled: false })).status, 404);
      assert.equal((await boss.patch('/v1/admin/countries/FRA', { isEnabled: false })).status, 404);
      assert.equal((await boss.patch('/v1/admin/countries/TN', { isEnabled: 'no' })).status, 422);
      assert.equal((await boss.patch('/v1/admin/countries/TN', {})).status, 422);
      assert.equal((await plainAdmin.patch('/v1/admin/countries/TN', { isEnabled: false })).status, 403);
    });

    it('closes and reopens registration with one switch', async () => {
      const settings = await boss.get('/v1/admin/settings');
      assert.deepEqual(settings.body.data.settings, { registration_open: true, withdrawals_open: true, withdrawal_expiry_hours: 168 });
      const existing = await registerPlayer(server);
      try {
        const closed = await boss.put('/v1/admin/settings/registration_open', { value: false });
        assert.equal(closed.status, 200, JSON.stringify(closed.body));
        assert.deepEqual(closed.body.data.settings, { registration_open: false, withdrawals_open: true, withdrawal_expiry_hours: 168 });
        assert.equal((await anonymous.get('/v1/public/config')).body.data.registrationOpen, false);
        const refused = await server.browser().post('/v1/auth/register', registrationPayload());
        assert.equal(refused.status, 403);
        assert.equal(refused.body.error.code, 'registration_closed');
        // players who already have an account can still sign in
        assert.equal((await login(server.browser(), existing.account)).status, 200);
      } finally {
        await boss.put('/v1/admin/settings/registration_open', { value: true });
      }
      assert.equal((await anonymous.get('/v1/public/config')).body.data.registrationOpen, true);
      assert.equal((await server.browser().post('/v1/auth/register', registrationPayload())).status, 201);
      const entries = await audits('settings.changed', 'registration_open');
      assert.deepEqual(entries.map((e) => e.details), [{ from: true, to: false }, { from: false, to: true }]);
    });

    it('knows only the switches it defines, and only takes true or false', async () => {
      assert.equal((await boss.put('/v1/admin/settings/maintenance_mode', { value: true })).status, 404);
      assert.equal((await boss.put('/v1/admin/settings/registration_open', { value: 'false' })).status, 422);
      assert.equal((await boss.put('/v1/admin/settings/registration_open', {})).status, 422);
      assert.equal((await plainAdmin.get('/v1/admin/settings')).status, 403);
      assert.equal((await plainAdmin.put('/v1/admin/settings/registration_open', { value: false })).status, 403);
      assert.equal((await anonymous.put('/v1/admin/settings/registration_open', { value: false })).status, 401);
      assert.equal((await anonymous.get('/v1/public/config')).body.data.registrationOpen, true);
    });
  });
});
