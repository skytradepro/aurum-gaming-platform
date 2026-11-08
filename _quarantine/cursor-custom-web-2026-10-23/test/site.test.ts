/**
 * Website tests: the real web server in front of the real API and a temporary database.
 * They go through the pages and forms the way a visitor, a cashier and an administrator do.
 */
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { STRONG_PASSWORD, createSuperAdminAccount, unique } from '../../api/test/helpers.ts';
import { startSite, textOf, type Site, type WebClient } from './helpers.ts';

const hasDatabase = Boolean(process.env.TEST_DATABASE_URL);

async function signIn(client: WebClient, username: string, password: string) {
  return client.submit('/en/login', { identifier: username, login: username, username, password }, '/en/login');
}

describe('website', { skip: !hasDatabase && 'TEST_DATABASE_URL is not set' }, () => {
  let site: Site;
  before(async () => {
    site = await startSite();
  });
  after(async () => {
    await site?.stop();
  });

  test('public pages answer in every language, with RTL for Arabic and security headers', async () => {
    const c = site.client();
    const root = await c.get('/', false);
    assert.equal(root.status, 302);
    assert.match(root.headers.get('location') ?? '', /^\/(en|fr|ar)\/$/);

    for (const locale of ['en', 'fr', 'ar']) {
      for (const path of ['', 'casino', 'casino/all', 'live-casino', 'promotions', 'sports', 'shops', 'page/about-us', 'login', 'register']) {
        const page = await c.get(`/${locale}/${path}`);
        assert.equal(page.status, 200, `/${locale}/${path}`);
        assert.match(page.html, new RegExp(`<html lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}"`), `/${locale}/${path}`);
      }
    }
    const home = await c.get('/en/');
    const csp = home.headers.get('content-security-policy') ?? '';
    assert.match(csp, /script-src 'self'/);
    assert.doesNotMatch(csp, /unsafe-inline/);
    assert.equal(home.headers.get('x-frame-options'), 'DENY');
    assert.equal((await c.get('/en/no-such-page')).status, 404);
  });

  test('protected areas send visitors to the login page', async () => {
    const c = site.client();
    for (const path of ['/en/account', '/en/admin', '/en/counter']) {
      const page = await c.get(path);
      assert.match(page.url, /\/en\/login/, path);
    }
  });

  test('a form posted from another site is refused', async () => {
    const c = site.client();
    await c.get('/en/login');
    const res = await fetch(`${site.baseUrl}/en/login`, {
      method: 'POST',
      redirect: 'manual',
      headers: { origin: 'https://evil.example', 'content-type': 'application/x-www-form-urlencoded', cookie: [...c.cookies].map(([k, v]) => `${k}=${v}`).join('; ') },
      body: 'username=x&password=y',
    });
    assert.equal(res.status, 403);
  });

  test('full cash cycle: register, shop deposit, withdrawal request, payout at the counter', async () => {
    // --- a player registers on the website -------------------------------------------------
    const player = site.client();
    const u = unique();
    const username = `web_${u}`;
    const registered = await player.submit(
      '/en/register',
      {
        username,
        email: `${username}@example.test`,
        callingCode: '216',
        mobile: String(20_000_000 + Math.floor(Math.random() * 70_000_000)),
        password: STRONG_PASSWORD,
        firstName: 'Amina',
        lastName: 'Ben Salah',
        dateOfBirth: '1990-05-17',
        country: 'TN',
        currency: 'TND',
        acceptTerms: true,
      },
      '/en/register',
    );
    assert.equal(registered.status, 200, textOf(registered.html, 'alert'));
    assert.equal(registered.url, '/en/account');
    const accountNo = /<bdi dir="ltr">(\d{6,})<\/bdi>/.exec(registered.html)?.[1];
    assert.ok(accountNo, 'the account page shows the account number');

    // --- the Super Admin creates a shop and a cashier ---------------------------------------
    const boss = await createSuperAdminAccount(site.api);
    const admin = site.client();
    const signedIn = await signIn(admin, boss.username, boss.password);
    assert.match(signedIn.url, /^\/en\/admin/);

    const shopCode = `T-${u.slice(-6).toUpperCase()}`;
    const shop = await admin.submit('/en/admin/shops/new', { code: shopCode, name: 'Tunis Centre', city: 'Tunis', currency: 'TND' }, '/en/admin/shops/new');
    assert.equal(shop.status, 200, textOf(shop.html, 'alert'));
    const shopId = /\/en\/admin\/shops\/(\d+)/.exec(shop.url)?.[1];
    assert.ok(shopId, `redirected to the shop page (${shop.url})`);

    const cashierName = `cash_${u}`;
    const worker = await admin.submit(`/en/admin/shops/${shopId}/workers`, { username: cashierName, email: `${cashierName}@example.test`, firstName: 'Karim', lastName: 'Trabelsi', shopRole: 'cashier' }, `/en/admin/shops/${shopId}`);
    assert.equal(worker.status, 200, textOf(worker.html, 'alert'));
    const tempPassword = /class="secret-box"[\s\S]*?<p class="code" dir="ltr">([^<]+)<\/p>/.exec(worker.html)?.[1];
    assert.ok(tempPassword, 'the temporary password is shown once');

    // --- the cashier signs in, must change the password, then credits cash ---------------------
    const cashier = site.client();
    let counter = await signIn(cashier, cashierName, tempPassword);
    if (/password/.test(counter.url)) {
      const newPassword = `${STRONG_PASSWORD}-c`;
      counter = await cashier.submit(new URL(counter.url, 'http://x').pathname, { currentPassword: tempPassword, newPassword, confirmPassword: newPassword, newPasswordConfirm: newPassword });
    }
    assert.match(counter.url, /^\/en\/counter/, `cashier lands on the counter (${counter.url})`);

    await cashier.get(`/en/counter/deposit?q=${accountNo}`);
    const deposit = await cashier.submit('/en/counter/deposit', { amount: '150.500', cashReceived: true });
    assert.equal(deposit.status, 200, textOf(deposit.html, 'alert'));
    assert.match(deposit.url, /^\/en\/counter\/receipt\//);
    assert.match(deposit.html, /150\.500/);

    // --- the player sees the balance and requests a withdrawal ----------------------------------
    const overview = await player.get('/en/account');
    assert.match(overview.html, /150\.500/);
    await player.get('/en/account/withdrawals');
    const requested = await player.submit('/en/account/withdrawals', { amount: '50' });
    assert.equal(requested.status, 200, textOf(requested.html, 'alert'));
    const code = /<p class="code" dir="ltr">([A-Z0-9-]+)<\/p>/.exec(requested.html)?.[1];
    assert.ok(code, 'the pickup code is shown');
    assert.match((await player.get('/en/account')).html, /100\.500/);

    // --- the cashier pays it out -----------------------------------------------------------
    await cashier.get('/en/counter/payout');
    const found = await cashier.submit('/en/counter/payout', { code, account: accountNo });
    assert.equal(found.status, 200, textOf(found.html, 'alert'));
    assert.match(found.html, /Amina/);
    const action = /action="(\/en\/counter\/payout\/\d+)"/.exec(found.html)?.[1] as string;
    const refused = await cashier.submit(action, { idChecked: false });
    assert.equal(refused.status, 422, 'no payout without the ID check');
    const paid = await cashier.submit(action, { idChecked: true, note: 'CIN checked' });
    assert.equal(paid.status, 200, textOf(paid.html, 'alert'));
    assert.match(paid.url, /^\/en\/counter\/receipt\//);

    // --- the administrator sees the history ------------------------------------------------
    const list = await admin.get('/en/admin/withdrawals');
    assert.match(list.html, new RegExp(username));
    assert.match(list.html, new RegExp(shopCode), 'the list shows where it was paid');
    const shopPage = await admin.get(`/en/admin/shops/${shopId}`);
    assert.equal(shopPage.status, 200);
    assert.match(shopPage.html, /100\.500/, 'shop cash = 150.500 received - 50.000 paid');

    // --- and the books balance ---------------------------------------------------------------
    await admin.get('/en/admin');
    const health = await admin.submit('/en/admin/health', {});
    assert.equal(health.status, 200);
    assert.doesNotMatch(health.html, /code-block/);

    // a cashier cannot open the administration
    const denied = await cashier.get('/en/admin');
    assert.ok(denied.status === 403 || /\/counter/.test(denied.url), `cashier kept out of admin (${denied.status} ${denied.url})`);
  });

  test('every administration page renders for the Super Admin, in English and Arabic', async () => {
    const boss = await createSuperAdminAccount(site.api);
    const admin = site.client();
    await signIn(admin, boss.username, boss.password);
    const paths = [
      'admin', 'admin/reports', 'admin/players', 'admin/ledger', 'admin/withdrawals', 'admin/shops', 'admin/shops/new', 'admin/workers', 'admin/shop-cash',
      'admin/banners', 'admin/banners/new', 'admin/promotions', 'admin/promotions/new', 'admin/pages', 'admin/pages/about-us', 'admin/games', 'admin/games/new',
      'admin/providers', 'admin/media', 'admin/staff', 'admin/currencies', 'admin/currencies/new', 'admin/rates', 'admin/languages', 'admin/countries',
      'admin/settings', 'admin/audit',
    ];
    for (const locale of ['en', 'ar']) {
      for (const path of paths) {
        const page = await admin.get(`/${locale}/${path}`);
        assert.equal(page.status, 200, `/${locale}/${path}: ${textOf(page.html, 'alert')}`);
        assert.equal(page.url, `/${locale}/${path}`, `no redirect for /${locale}/${path}`);
      }
    }
  });
});
