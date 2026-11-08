import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { TEST_DATABASE_URL, createTestDatabase } from '@aurum/db/testing';
import type { TestDatabase } from '@aurum/db/testing';
import { MAX_UPLOAD_BYTES } from '@aurum/shared';
import { createStaff, registerPlayer, signedIn, startServer, tinyPng, unique, uploadForm } from './helpers.ts';
import type { Browser, TestServer } from './helpers.ts';

const DAY = 86_400_000;
const inDays = (n: number): string => new Date(Date.now() + n * DAY).toISOString();

describe('content management and public content', { skip: TEST_DATABASE_URL ? false : 'TEST_DATABASE_URL is not set' }, () => {
  let server: TestServer;
  let editor: Browser;
  let editorId: string;
  let anonymous: Browser;

  before(async () => {
    server = await startServer();
    const account = await createStaff(server, { permissions: ['banners.manage', 'promotions.manage', 'pages.manage', 'games.manage'] });
    editorId = account.id;
    editor = await signedIn(server, account);
    anonymous = server.browser();
  });
  after(async () => {
    await server?.stop();
  });

  const upload = (browser: Browser, bytes: Uint8Array = tinyPng(1425, 415), name = 'banner.png', type = 'image/png') =>
    browser.request('POST', '/v1/admin/media', { form: uploadForm(bytes, name, type) });

  async function newImage(width = 1425, height = 415): Promise<{ id: string; url: string }> {
    const r = await upload(editor, tinyPng(width, height));
    assert.equal(r.status, 201, JSON.stringify(r.body));
    return r.body.data.media as { id: string; url: string };
  }

  const auditActions = async (action: string, targetId?: string): Promise<number> => {
    const { rows } = await server.db.query<{ n: string }>(
      'select count(*)::text as n from audit_logs where action = $1 and ($2::text is null or target_id = $2)',
      [action, targetId ?? null],
    );
    return Number(rows[0]?.n ?? 0);
  };

  // -------------------------------------------------------------------------
  describe('image uploads', () => {
    it('stores a PNG under a random name, records it, and serves it back unchanged', async () => {
      const bytes = tinyPng(1425, 415);
      const r = await upload(editor, bytes, 'My Banner.png');
      assert.equal(r.status, 201, JSON.stringify(r.body));
      assert.equal(r.body.data.duplicate, false);
      const media = r.body.data.media;
      assert.match(media.url, /^\/api\/v1\/media\/[a-f0-9]{32}\.png$/);
      assert.equal(media.width, 1425);
      assert.equal(media.height, 415);
      assert.equal(media.mimeType, 'image/png');
      assert.equal(media.byteSize, bytes.length);
      assert.equal(media.originalName, 'My Banner.png');

      const key = media.url.split('/').pop() as string;
      assert.ok(!key.includes('Banner'), 'the stored name must not come from the uploaded name');
      assert.deepEqual(readFileSync(join(server.uploadDir, key)), bytes);

      // anyone can load it (it is shown on the public site), with safe headers
      const response = await fetch(`${server.baseUrl}/v1/media/${key}`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type'), 'image/png');
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(response.headers.get('cache-control'), 'public, max-age=31536000, immutable');
      assert.equal(response.headers.get('content-security-policy'), "default-src 'none'; sandbox");
      assert.equal(response.headers.get('content-length'), String(bytes.length));
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
      assert.equal(await auditActions('media.uploaded', media.id), 1);
    });

    it('strips control characters from the original name and keeps long names short', async () => {
      const r = await upload(editor, tinyPng(), `bad\u0000\u001fname-${'x'.repeat(300)}.png`);
      assert.equal(r.status, 201, JSON.stringify(r.body));
      const name = r.body.data.media.originalName as string;
      assert.ok(name.length <= 200);
      assert.ok(!/[\u0000-\u001f]/.test(name));
    });

    it('stores identical files only once', async () => {
      const bytes = tinyPng(800, 200);
      const first = await upload(editor, bytes);
      const filesBefore = readdirSync(server.uploadDir).length;
      const second = await upload(editor, bytes, 'renamed.png');
      assert.equal(first.status, 201);
      assert.equal(second.status, 200);
      assert.equal(second.body.data.duplicate, true);
      assert.equal(second.body.data.media.id, first.body.data.media.id);
      assert.equal(readdirSync(server.uploadDir).length, filesBefore);
      assert.equal(await auditActions('media.uploaded', first.body.data.media.id), 1);
    });

    it('accepts JPEG and WebP by their content', async () => {
      const jpeg = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/wAARCAAKAA8DASIAAhEBAxEB/9k=', 'base64');
      const j = await upload(editor, jpeg, 'photo.jpg', 'image/jpeg');
      assert.equal(j.status, 201, JSON.stringify(j.body));
      assert.equal(j.body.data.media.mimeType, 'image/jpeg');
      assert.equal(j.body.data.media.width, 15);
      assert.equal(j.body.data.media.height, 10);
      assert.match(j.body.data.media.url, /\.jpg$/);

      const webp = Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA', 'base64');
      const w = await upload(editor, webp, 'photo.webp', 'image/webp');
      assert.equal(w.status, 201, JSON.stringify(w.body));
      assert.equal(w.body.data.media.mimeType, 'image/webp');
      assert.equal(w.body.data.media.width, 1);
      assert.equal(w.body.data.media.height, 1);
    });

    it('refuses anything that is not PNG, JPEG or WebP, whatever its name or declared type', async () => {
      const filesBefore = readdirSync(server.uploadDir).length;
      const { rows: before } = await server.db.query<{ n: string }>('select count(*)::text as n from media_assets');
      const cases: [string, Uint8Array, string, string][] = [
        ['an SVG with a script', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'logo.svg', 'image/svg+xml'],
        ['an SVG called .png', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'logo.png', 'image/png'],
        ['text called .png', Buffer.from('hello, I am not an image at all, really not one'), 'photo.png', 'image/png'],
        ['HTML called .png', Buffer.from('<html><script>alert(document.cookie)</script></html>'), 'x.png', 'image/png'],
        ['a GIF', Buffer.from('GIF89a\u0001\u0000\u0001\u0000\u0000\u0000\u0000;', 'latin1'), 'a.gif', 'image/gif'],
        ['a PDF', Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF'), 'a.pdf', 'application/pdf'],
        ['a truncated PNG', tinyPng().subarray(0, 12), 'cut.png', 'image/png'],
        ['a PNG with a zero size', tinyPng(0, 5), 'zero.png', 'image/png'],
        ['an empty file', new Uint8Array(0), 'empty.png', 'image/png'],
      ];
      for (const [label, bytes, name, type] of cases) {
        const r = await upload(editor, bytes, name, type);
        assert.equal(r.status, 415, `${label}: ${JSON.stringify(r.body)}`);
        assert.equal(r.body.error.code, 'upload_invalid', label);
      }
      assert.equal(readdirSync(server.uploadDir).length, filesBefore, 'nothing is left on disk');
      const { rows: after } = await server.db.query<{ n: string }>('select count(*)::text as n from media_assets');
      assert.equal(after[0]?.n, before[0]?.n);
    });

    it('refuses images with absurd dimensions and files that are too large', async () => {
      const wide = await upload(editor, tinyPng(7000, 10));
      assert.equal(wide.status, 415);
      assert.equal(wide.body.error.fields.file, 'outOfRange');

      const big = Buffer.concat([tinyPng(), Buffer.alloc(MAX_UPLOAD_BYTES)]);
      const tooLarge = await upload(editor, big);
      assert.equal(tooLarge.status, 413, JSON.stringify(tooLarge.body));
      assert.equal(tooLarge.body.error.code, 'upload_too_large');

      const huge = Buffer.concat([tinyPng(), Buffer.alloc(MAX_UPLOAD_BYTES + 2 * 1024 * 1024)]);
      const rejectedEarly = await upload(editor, huge);
      assert.equal(rejectedEarly.status, 413);
      assert.equal(rejectedEarly.body.error.code, 'upload_too_large');
    });

    it('needs a "file" field, and a multipart body', async () => {
      const form = new FormData();
      form.set('other', 'x');
      const missing = await editor.request('POST', '/v1/admin/media', { form });
      assert.equal(missing.status, 422);
      assert.equal(missing.body.error.fields.file, 'required');
      const notAFile = new FormData();
      notAFile.set('file', 'just text');
      assert.equal((await editor.request('POST', '/v1/admin/media', { form: notAFile })).status, 422);
      const json = await editor.post('/v1/admin/media', { file: 'x' });
      assert.equal(json.status, 415);
      assert.equal(json.body.error.code, 'unsupported_media_type');
    });

    it('is only for staff who manage banners, promotions or games', async () => {
      assert.equal((await upload(anonymous)).status, 401);
      const player = await registerPlayer(server);
      assert.equal((await upload(player.browser)).status, 403);
      const viewer = await signedIn(server, await createStaff(server, { permissions: ['users.view', 'balances.view'] }));
      assert.equal((await upload(viewer)).status, 403);
      const gamesOnly = await signedIn(server, await createStaff(server, { permissions: ['games.manage'] }));
      assert.equal((await upload(gamesOnly)).status, 201);
      assert.equal((await viewer.get('/v1/admin/media')).status, 403);
    });

    it('lists the library newest first with a limit', async () => {
      await newImage(100, 50);
      const newest = await newImage(101, 50);
      const r = await editor.get('/v1/admin/media?limit=2');
      assert.equal(r.status, 200);
      assert.equal(r.body.data.items.length, 2);
      assert.equal(r.body.data.items[0].id, newest.id);
      assert.equal((await editor.get('/v1/admin/media?limit=0')).status, 422);
      assert.equal((await editor.get('/v1/admin/media?limit=500')).status, 422);
    });

    it('does not serve anything but files it stored', async () => {
      for (const path of [
        `/v1/media/${'a'.repeat(32)}.png`, // well-formed but unknown
        `/v1/media/${'a'.repeat(32)}.svg`,
        `/v1/media/${'A'.repeat(32)}.png`,
        '/v1/media/logo.png',
        '/v1/media/..%2F..%2Fetc%2Fpasswd',
        '/v1/media/%2e%2e%2f%2e%2e%2fetc%2fpasswd',
        '/v1/media/',
      ]) {
        const r = await fetch(`${server.baseUrl}${path}`);
        assert.equal(r.status, 404, path);
        await r.arrayBuffer();
      }
    });
  });

  // -------------------------------------------------------------------------
  describe('banners', () => {
    const body = (imageId: string, overrides: Record<string, unknown> = {}) => ({
      placement: 'home_hero',
      name: `Banner ${unique()}`,
      sortOrder: 0,
      isActive: true,
      translations: {
        en: { title: 'Welcome Bonus', subtitle: '100% up to 500', ctaLabel: 'Join now', linkUrl: '/promotions', altText: 'Welcome bonus', imageDesktopId: imageId },
      },
      ...overrides,
    });

    it('creates, reads, updates and deletes a banner with translations and images, and audits each change', async () => {
      const desktop = await newImage();
      const mobile = await newImage(750, 600);
      const created = await editor.post('/v1/admin/banners', {
        ...body(desktop.id),
        translations: {
          en: { title: 'Welcome Bonus', subtitle: 'Sub', ctaLabel: 'Join', linkUrl: '/promotions', altText: 'Alt', imageDesktopId: desktop.id, imageMobileId: mobile.id },
          ar: { title: 'مكافأة الترحيب', ctaLabel: 'انضم الآن', imageDesktopId: desktop.id },
          fr: { title: 'Bonus de bienvenue' },
        },
      });
      assert.equal(created.status, 201, JSON.stringify(created.body));
      const banner = created.body.data.banner;
      assert.match(banner.id, /^\d+$/);
      assert.equal(banner.isActive, true);
      assert.deepEqual(Object.keys(banner.translations).sort(), ['ar', 'en', 'fr']);
      assert.equal(banner.translations.en.imageDesktop.id, desktop.id);
      assert.equal(banner.translations.en.imageDesktop.url, desktop.url);
      assert.equal(banner.translations.en.imageMobile.id, mobile.id);
      assert.equal(banner.translations.ar.title, 'مكافأة الترحيب');
      assert.equal(banner.translations.ar.subtitle, '');
      assert.equal(banner.translations.fr.imageDesktop, null);
      assert.equal(await auditActions('banner.created', banner.id), 1);

      const read = await editor.get(`/v1/admin/banners/${banner.id}`);
      assert.deepEqual(read.body.data.banner, banner);
      const list = await editor.get('/v1/admin/banners?placement=home_hero');
      assert.ok(list.body.data.items.some((b: { id: string }) => b.id === banner.id));

      // an update replaces the whole banner: the French text disappears, German-like extras cannot appear
      const updated = await editor.put(`/v1/admin/banners/${banner.id}`, {
        ...body(desktop.id, { name: 'Renamed', sortOrder: 5, isActive: false, placement: 'casino_hero' }),
        translations: { en: { title: 'New title', imageDesktopId: desktop.id } },
      });
      assert.equal(updated.status, 200, JSON.stringify(updated.body));
      assert.equal(updated.body.data.banner.name, 'Renamed');
      assert.equal(updated.body.data.banner.placement, 'casino_hero');
      assert.equal(updated.body.data.banner.isActive, false);
      assert.equal(updated.body.data.banner.sortOrder, 5);
      assert.deepEqual(Object.keys(updated.body.data.banner.translations), ['en']);
      assert.equal(updated.body.data.banner.translations.en.subtitle, '');
      assert.equal(updated.body.data.banner.translations.en.imageMobile, null);
      assert.ok(Date.parse(updated.body.data.banner.updatedAt) >= Date.parse(banner.updatedAt));
      assert.equal(await auditActions('banner.updated', banner.id), 1);

      const removed = await editor.delete(`/v1/admin/banners/${banner.id}`);
      assert.equal(removed.status, 204);
      assert.equal((await editor.get(`/v1/admin/banners/${banner.id}`)).status, 404);
      assert.equal((await editor.delete(`/v1/admin/banners/${banner.id}`)).status, 404);
      assert.equal((await editor.put(`/v1/admin/banners/${banner.id}`, body(desktop.id))).status, 404);
      assert.equal(await auditActions('banner.deleted', banner.id), 1);
      // deleting a banner keeps the image in the library
      assert.equal((await fetch(`${server.baseUrl}${desktop.url.replace('/api', '')}`)).status, 200);
    });

    it('validates the input and names the field that is wrong', async () => {
      const image = await newImage();
      const ok = body(image.id);
      const bad: [string, Record<string, unknown>, string][] = [
        ['no translations at all', { translations: {} }, 'translations'],
        ['no desktop image in any language', { translations: { en: { title: 'No image' } } }, 'translations'],
        ['an unknown language', { translations: { de: { title: 'Hallo', imageDesktopId: image.id } } }, 'translations.de'],
        ['an unknown placement', { placement: 'footer' }, 'placement'],
        ['an empty name', { name: '' }, 'name'],
        ['a name that is too long', { name: 'x'.repeat(121) }, 'name'],
        ['a sort order that is out of range', { sortOrder: 100_000 }, 'sortOrder'],
        ['a title that is too long', { translations: { en: { title: 'x'.repeat(121), imageDesktopId: image.id } } }, 'translations.en.title'],
        ['an image that does not exist', { translations: { en: { title: 'x', imageDesktopId: randomUUID() } } }, 'translations.en.imageDesktopId'],
        ['a mobile image that does not exist', { translations: { en: { title: 'x', imageDesktopId: image.id, imageMobileId: randomUUID() } } }, 'translations.en.imageMobileId'],
        ['an image id that is not a UUID', { translations: { en: { title: 'x', imageDesktopId: '12' } } }, 'translations.en.imageDesktopId'],
        ['an end before the start', { startsAt: inDays(2), endsAt: inDays(1) }, 'endsAt'],
        ['an end equal to the start', { startsAt: '2030-01-01T00:00:00.000Z', endsAt: '2030-01-01T00:00:00.000Z' }, 'endsAt'],
        ['a date that is not a date', { startsAt: 'tomorrow' }, 'startsAt'],
        ['isActive as text', { isActive: 'yes' }, 'isActive'],
      ];
      for (const [label, overrides, field] of bad) {
        const r = await editor.post('/v1/admin/banners', { ...ok, ...overrides });
        assert.equal(r.status, 422, `${label}: ${JSON.stringify(r.body)}`);
        assert.equal(r.body.error.code, 'validation', label);
        assert.ok(Object.keys(r.body.error.fields ?? {}).some((f) => f === field), `${label}: expected field ${field}, got ${JSON.stringify(r.body.error.fields)}`);
      }
    });

    it('accepts only safe links: this site or https', async () => {
      const image = await newImage();
      const link = (linkUrl: string) =>
        editor.post('/v1/admin/banners', body(image.id, { translations: { en: { title: 'x', linkUrl, imageDesktopId: image.id } } }));
      for (const linkUrl of ['', '/promotions', '/casino?category=slots', '/', 'https://example.com/offer?a=1']) {
        const r = await link(linkUrl);
        assert.equal(r.status, 201, `${linkUrl}: ${JSON.stringify(r.body)}`);
        await editor.delete(`/v1/admin/banners/${r.body.data.banner.id}`);
      }
      for (const linkUrl of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<b>x</b>', 'http://example.com', '//evil.example/x', '/\\evil.example', 'https://exa mple.com', 'example.com', 'ftp://example.com', `https://example.com/${'a'.repeat(500)}`]) {
        const r = await link(linkUrl);
        assert.equal(r.status, 422, linkUrl);
        assert.ok('translations.en.linkUrl' in (r.body.error.fields ?? {}), `${linkUrl}: ${JSON.stringify(r.body.error.fields)}`);
      }
    });

    it('stores staff text as plain text: markup is kept as characters, not interpreted', async () => {
      const image = await newImage();
      const title = '<script>alert(1)</script> & "quotes"';
      const r = await editor.post('/v1/admin/banners', body(image.id, { translations: { en: { title, imageDesktopId: image.id } } }));
      assert.equal(r.status, 201);
      assert.equal(r.body.data.banner.translations.en.title, title);
      const publicList = await anonymous.get('/v1/public/banners?placement=home_hero&locale=en');
      const mine = publicList.body.data.items.find((b: { id: string }) => b.id === r.body.data.banner.id);
      assert.equal(mine.title, title);
      assert.match(String(publicList.headers.get('content-type')), /^application\/json/);
      await editor.delete(`/v1/admin/banners/${r.body.data.banner.id}`);
    });

    it('rejects bad ids and unknown banners', async () => {
      const image = await newImage();
      assert.equal((await editor.get('/v1/admin/banners/abc')).status, 404);
      assert.equal((await editor.get('/v1/admin/banners/99999999')).status, 404);
      assert.equal((await editor.put('/v1/admin/banners/99999999', body(image.id))).status, 404);
      assert.equal((await editor.delete('/v1/admin/banners/1;drop table banners')).status, 404);
      assert.equal((await editor.get('/v1/admin/banners?placement=nope')).status, 422);
    });

    it('is reserved for staff with banners.manage', async () => {
      const image = await newImage();
      const promoOnly = await signedIn(server, await createStaff(server, { permissions: ['promotions.manage', 'pages.manage', 'games.manage'] }));
      assert.equal((await promoOnly.get('/v1/admin/banners')).status, 403);
      assert.equal((await promoOnly.post('/v1/admin/banners', body(image.id))).status, 403);
      const player = await registerPlayer(server);
      assert.equal((await player.browser.get('/v1/admin/banners')).status, 403);
      assert.equal((await anonymous.get('/v1/admin/banners')).status, 401);
      const manager = await signedIn(server, await createStaff(server, { permissions: ['banners.manage'] }));
      assert.equal((await manager.get('/v1/admin/banners')).status, 200);
    });

    describe('what visitors see', () => {
      const publicBanners = async (placement: string, locale: string) => {
        const r = await anonymous.get(`/v1/public/banners?placement=${placement}&locale=${locale}`);
        assert.equal(r.status, 200, JSON.stringify(r.body));
        return r;
      };
      const create = async (placement: string, overrides: Record<string, unknown>) => {
        const r = await editor.post('/v1/admin/banners', { placement, name: `Banner ${unique()}`, ...overrides });
        assert.equal(r.status, 201, JSON.stringify(r.body));
        return r.body.data.banner as { id: string };
      };

      it('shows only active banners inside their schedule, in the order set by staff', async () => {
        const image = await newImage();
        const t = (title: string) => ({ en: { title, imageDesktopId: image.id } });
        const second = await create('casino_hero', { sortOrder: 2, translations: t('Second') });
        const first = await create('casino_hero', { sortOrder: 1, translations: t('First') });
        const off = await create('casino_hero', { sortOrder: 0, isActive: false, translations: t('Switched off') });
        const future = await create('casino_hero', { sortOrder: 0, startsAt: inDays(1), translations: t('Starts tomorrow') });
        const expired = await create('casino_hero', { sortOrder: 0, startsAt: inDays(-3), endsAt: inDays(-1), translations: t('Ended yesterday') });
        const current = await create('casino_hero', { sortOrder: 3, startsAt: inDays(-1), endsAt: inDays(1), translations: t('Running now') });
        const elsewhere = await create('sports_hero', { sortOrder: 0, translations: t('Other page') });

        const r = await publicBanners('casino_hero', 'en');
        const ours = new Set([second.id, first.id, off.id, future.id, expired.id, current.id, elsewhere.id]);
        const titles = r.body.data.items.filter((b: { id: string }) => ours.has(b.id)).map((b: { title: string }) => b.title);
        assert.deepEqual(titles, ['First', 'Second', 'Running now']);
        assert.equal(r.headers.get('cache-control'), 'public, max-age=15');

        // switching a banner off, or editing its dates, takes effect on the next request
        const read = await editor.get(`/v1/admin/banners/${first.id}`);
        const patch = { ...read.body.data.banner, isActive: false };
        const put = await editor.put(`/v1/admin/banners/${first.id}`, {
          placement: patch.placement,
          name: patch.name,
          sortOrder: patch.sortOrder,
          isActive: false,
          translations: { en: { title: 'First', imageDesktopId: image.id } },
        });
        assert.equal(put.status, 200);
        const after = await publicBanners('casino_hero', 'en');
        assert.ok(!after.body.data.items.some((b: { id: string }) => b.id === first.id));
        assert.ok(after.body.data.items.some((b: { id: string }) => b.id === second.id));
      });

      it('falls back to the default language field by field, and never shows a banner without an image', async () => {
        const en = await newImage(1425, 415);
        const fr = await newImage(1425, 416);
        const arImage = await newImage(1425, 417);
        const onlyEnglish = await create('live_casino_hero', {
          sortOrder: 1,
          translations: { en: { title: 'English only', subtitle: 'Sub EN', ctaLabel: 'Go', linkUrl: '/a', altText: 'alt en', imageDesktopId: en.id } },
        });
        const partlyFrench = await create('live_casino_hero', {
          sortOrder: 2,
          translations: {
            en: { title: 'Mixed', subtitle: 'Subtitle EN', ctaLabel: 'Play', linkUrl: '/b', altText: 'alt en', imageDesktopId: en.id },
            fr: { title: 'Mélangé', imageDesktopId: fr.id },
          },
        });
        const onlyArabic = await create('live_casino_hero', {
          sortOrder: 3,
          translations: { ar: { title: 'عربي فقط', imageDesktopId: arImage.id } },
        });
        const mine = new Set([onlyEnglish.id, partlyFrench.id, onlyArabic.id]);
        const pick = async (locale: string) => (await publicBanners('live_casino_hero', locale)).body.data.items.filter((b: { id: string }) => mine.has(b.id));

        const forEnglish = await pick('en');
        assert.deepEqual(forEnglish.map((b: { title: string }) => b.title), ['English only', 'Mixed']);

        const forFrench = await pick('fr');
        assert.deepEqual(forFrench.map((b: { title: string }) => b.title), ['English only', 'Mélangé']);
        const mixed = forFrench[1];
        assert.equal(mixed.subtitle, 'Subtitle EN', 'empty French fields use the English text');
        assert.equal(mixed.ctaLabel, 'Play');
        assert.equal(mixed.linkUrl, '/b');
        assert.equal(mixed.alt, 'alt en');
        assert.equal(mixed.imageDesktop.id, fr.id, 'the French image wins when there is one');
        assert.equal(forFrench[0].imageDesktop.id, en.id);

        const forArabic = await pick('ar');
        assert.deepEqual(forArabic.map((b: { title: string }) => b.title), ['English only', 'Mixed', 'عربي فقط']);
        assert.equal(forArabic[2].imageDesktop.id, arImage.id);
        assert.equal(forArabic[2].alt, 'عربي فقط', 'the alternative text defaults to the title');
      });

      it('exposes only what the page needs', async () => {
        const image = await newImage();
        const mobile = await newImage(750, 600);
        const banner = await create('sports_hero', { translations: { en: { title: 'Plain', imageDesktopId: image.id, imageMobileId: mobile.id } } });
        const r = await publicBanners('sports_hero', 'en');
        const item = r.body.data.items.find((b: { id: string }) => b.id === banner.id);
        assert.deepEqual(Object.keys(item).sort(), ['alt', 'ctaLabel', 'id', 'imageDesktop', 'imageMobile', 'linkUrl', 'subtitle', 'title']);
        assert.equal(item.imageMobile.id, mobile.id);
        assert.deepEqual(Object.keys(item.imageDesktop).sort(), ['byteSize', 'createdAt', 'height', 'id', 'mimeType', 'originalName', 'url', 'width']);
      });

      it('validates the query, and defaults to the home banners in English', async () => {
        assert.equal((await anonymous.get('/v1/public/banners?locale=de')).status, 422);
        assert.equal((await anonymous.get('/v1/public/banners?placement=nope')).status, 422);
        assert.equal((await anonymous.get('/v1/public/banners')).status, 200);
      });
    });
  });

  // -------------------------------------------------------------------------
  describe('promotions', () => {
    const body = (overrides: Record<string, unknown> = {}) => ({
      slug: `promo-${unique()}`,
      sortOrder: 0,
      isActive: true,
      translations: { en: { title: 'Welcome offer', summary: 'Short text', body: 'Line one.\n\nLine two.', terms: 'Terms apply.' } },
      ...overrides,
    });

    it('creates, reads, updates and deletes a promotion, and audits each change', async () => {
      const image = await newImage(309, 193);
      const input = body({
        translations: {
          en: { title: 'Welcome offer', summary: 'Short', body: 'Body', terms: 'Terms', imageId: image.id },
          ar: { title: 'عرض الترحيب', summary: 'ملخص', body: 'نص', terms: 'الشروط' },
        },
      });
      const created = await editor.post('/v1/admin/promotions', input);
      assert.equal(created.status, 201, JSON.stringify(created.body));
      const promotion = created.body.data.promotion;
      assert.equal(promotion.slug, input.slug);
      assert.equal(promotion.translations.en.image.id, image.id);
      assert.equal(promotion.translations.ar.image, null);
      assert.equal(promotion.translations.ar.title, 'عرض الترحيب');
      assert.equal(await auditActions('promotion.created', promotion.id), 1);

      assert.deepEqual((await editor.get(`/v1/admin/promotions/${promotion.id}`)).body.data.promotion, promotion);
      assert.ok((await editor.get('/v1/admin/promotions')).body.data.items.some((p: { id: string }) => p.id === promotion.id));

      const newSlug = `renamed-${unique()}`;
      const updated = await editor.put(`/v1/admin/promotions/${promotion.id}`, body({ slug: newSlug, isActive: false, translations: { en: { title: 'Changed' } } }));
      assert.equal(updated.status, 200, JSON.stringify(updated.body));
      assert.equal(updated.body.data.promotion.slug, newSlug);
      assert.equal(updated.body.data.promotion.isActive, false);
      assert.deepEqual(Object.keys(updated.body.data.promotion.translations), ['en']);
      assert.equal(updated.body.data.promotion.translations.en.image, null);
      assert.equal(await auditActions('promotion.updated', promotion.id), 1);

      assert.equal((await editor.delete(`/v1/admin/promotions/${promotion.id}`)).status, 204);
      assert.equal((await editor.get(`/v1/admin/promotions/${promotion.id}`)).status, 404);
      assert.equal((await editor.delete(`/v1/admin/promotions/${promotion.id}`)).status, 404);
      assert.equal(await auditActions('promotion.deleted', promotion.id), 1);
    });

    it('validates the input; a duplicate address is reported on the slug field', async () => {
      const bad: [string, Record<string, unknown>, string][] = [
        ['an upper-case slug', { slug: 'Welcome' }, 'slug'],
        ['a slug with spaces', { slug: 'welcome offer' }, 'slug'],
        ['a slug with a slash', { slug: 'a/b' }, 'slug'],
        ['an empty slug', { slug: '' }, 'slug'],
        ['no translations', { translations: {} }, 'translations'],
        ['an empty title', { translations: { en: { title: '' } } }, 'translations.en.title'],
        ['a missing title', { translations: { en: { summary: 'x' } } }, 'translations.en.title'],
        ['a summary that is too long', { translations: { en: { title: 'x', summary: 'y'.repeat(401) } } }, 'translations.en.summary'],
        ['a body that is too long', { translations: { en: { title: 'x', body: 'y'.repeat(20_001) } } }, 'translations.en.body'],
        ['an image that does not exist', { translations: { en: { title: 'x', imageId: randomUUID() } } }, 'translations.en.imageId'],
        ['an unknown language', { translations: { es: { title: 'Hola' } } }, 'translations.es'],
        ['an end before the start', { startsAt: inDays(2), endsAt: inDays(1) }, 'endsAt'],
      ];
      for (const [label, overrides, field] of bad) {
        const r = await editor.post('/v1/admin/promotions', body(overrides));
        assert.equal(r.status, 422, `${label}: ${JSON.stringify(r.body)}`);
        assert.ok(field in (r.body.error.fields ?? {}), `${label}: expected ${field}, got ${JSON.stringify(r.body.error.fields)}`);
      }
      const first = body();
      assert.equal((await editor.post('/v1/admin/promotions', first)).status, 201);
      const duplicate = await editor.post('/v1/admin/promotions', first);
      assert.equal(duplicate.status, 409);
      assert.equal(duplicate.body.error.code, 'conflict');
      assert.equal(duplicate.body.error.fields.slug, 'alreadyExists');
      // renaming another promotion to a taken slug is refused the same way, and changes nothing
      const other = await editor.post('/v1/admin/promotions', body());
      const clash = await editor.put(`/v1/admin/promotions/${other.body.data.promotion.id}`, body({ slug: first.slug }));
      assert.equal(clash.status, 409);
      assert.equal(clash.body.error.fields.slug, 'alreadyExists');
      assert.equal((await editor.get(`/v1/admin/promotions/${other.body.data.promotion.id}`)).body.data.promotion.slug, other.body.data.promotion.slug);
    });

    it('is reserved for staff with promotions.manage', async () => {
      const bannersOnly = await signedIn(server, await createStaff(server, { permissions: ['banners.manage'] }));
      assert.equal((await bannersOnly.get('/v1/admin/promotions')).status, 403);
      assert.equal((await bannersOnly.post('/v1/admin/promotions', body())).status, 403);
      assert.equal((await anonymous.post('/v1/admin/promotions', body())).status, 401);
    });

    describe('what visitors see', () => {
      const make = async (overrides: Record<string, unknown>) => {
        const r = await editor.post('/v1/admin/promotions', body(overrides));
        assert.equal(r.status, 201, JSON.stringify(r.body));
        return r.body.data.promotion as { id: string; slug: string };
      };

      it('lists active promotions inside their schedule, with a summary but without the long text', async () => {
        const image = await newImage(309, 193);
        const visible = await make({ sortOrder: -5, translations: { en: { title: 'Visible', summary: 'Sum', body: 'Long body', terms: 'Long terms', imageId: image.id } } });
        const off = await make({ isActive: false });
        const later = await make({ startsAt: inDays(1) });
        const over = await make({ startsAt: inDays(-4), endsAt: inDays(-2) });
        const r = await anonymous.get('/v1/public/promotions?locale=en');
        assert.equal(r.status, 200);
        assert.equal(r.headers.get('cache-control'), 'public, max-age=15');
        const slugs = r.body.data.items.map((p: { slug: string }) => p.slug);
        assert.ok(slugs.includes(visible.slug));
        for (const hidden of [off, later, over]) assert.ok(!slugs.includes(hidden.slug), hidden.slug);
        assert.equal(slugs[0], visible.slug, 'lowest sort order first');
        const item = r.body.data.items[0];
        assert.deepEqual(Object.keys(item).sort(), ['endsAt', 'image', 'slug', 'startsAt', 'summary', 'title']);
        assert.equal(item.image.id, image.id);
      });

      it('shows the full text on the promotion page, in the visitor language or the default one', async () => {
        const promo = await make({
          translations: {
            en: { title: 'English title', summary: 'English summary', body: 'English body', terms: 'English terms' },
            fr: { title: 'Titre français', body: 'Corps français' },
          },
        });
        const en = await anonymous.get(`/v1/public/promotions/${promo.slug}?locale=en`);
        assert.equal(en.status, 200);
        assert.deepEqual({ ...en.body.data.item, startsAt: null, endsAt: null, image: null }, {
          slug: promo.slug,
          title: 'English title',
          summary: 'English summary',
          image: null,
          startsAt: null,
          endsAt: null,
          body: 'English body',
          terms: 'English terms',
        });
        const fr = await anonymous.get(`/v1/public/promotions/${promo.slug}?locale=fr`);
        assert.equal(fr.body.data.item.title, 'Titre français');
        assert.equal(fr.body.data.item.body, 'Corps français');
        assert.equal(fr.body.data.item.summary, 'English summary', 'missing French summary falls back to English');
        assert.equal(fr.body.data.item.terms, 'English terms');
        const ar = await anonymous.get(`/v1/public/promotions/${promo.slug}?locale=ar`);
        assert.equal(ar.body.data.item.title, 'English title');
      });

      it('answers 404 for promotions that do not exist or are not running, and 422 for a bad language', async () => {
        const hidden = await make({ isActive: false });
        assert.equal((await anonymous.get(`/v1/public/promotions/${hidden.slug}`)).status, 404);
        assert.equal((await anonymous.get('/v1/public/promotions/does-not-exist')).status, 404);
        assert.equal((await anonymous.get('/v1/public/promotions/Not%20A%20Slug')).status, 404);
        assert.equal((await anonymous.get('/v1/public/promotions/x?locale=de')).status, 422);
        assert.equal((await anonymous.get('/v1/public/promotions?locale=de')).status, 422);
      });
    });
  });

  // -------------------------------------------------------------------------
  describe('information pages', () => {
    const put = (slug: string, translations: Record<string, unknown>, browser: Browser = editor) => browser.put(`/v1/admin/pages/${slug}`, { translations });

    it('lists the five standard pages, none of them published at first', async () => {
      const r = await editor.get('/v1/admin/pages');
      assert.equal(r.status, 200);
      assert.deepEqual(r.body.data.items.map((p: { slug: string }) => p.slug), ['about-us', 'privacy-policy', 'responsible-gaming', 'sportsbook-rules', 'terms-and-conditions']);
      assert.ok(r.body.data.items.every((p: { translations: object }) => Object.keys(p.translations).length === 0));
      const page = await anonymous.get('/v1/public/pages/about-us');
      assert.equal(page.status, 200);
      assert.deepEqual(page.body.data.page, { slug: 'about-us', published: false, locale: null, title: null, body: null });
    });

    it('saves translations, publishes them per language, and falls back to the default language', async () => {
      const slug = 'privacy-policy';
      const saved = await put(slug, {
        en: { title: 'Privacy policy', body: 'Paragraph one.\n\nParagraph two with <b>markup</b>.', isPublished: true },
        fr: { title: 'Politique de confidentialité', body: 'Brouillon', isPublished: false },
        ar: { title: 'سياسة الخصوصية', body: 'الفقرة الأولى.\n\nالفقرة الثانية.', isPublished: true },
      });
      assert.equal(saved.status, 200, JSON.stringify(saved.body));
      assert.deepEqual(Object.keys(saved.body.data.page.translations).sort(), ['ar', 'en', 'fr']);
      assert.equal(saved.body.data.page.translations.fr.isPublished, false);
      assert.equal(await auditActions('page.saved', slug), 1);

      const en = (await anonymous.get(`/v1/public/pages/${slug}?locale=en`)).body.data.page;
      assert.deepEqual(en, { slug, published: true, locale: 'en', title: 'Privacy policy', body: 'Paragraph one.\n\nParagraph two with <b>markup</b>.' });
      const ar = (await anonymous.get(`/v1/public/pages/${slug}?locale=ar`)).body.data.page;
      assert.equal(ar.locale, 'ar');
      assert.equal(ar.title, 'سياسة الخصوصية');
      // French is a draft, so French visitors see the English page, never the draft
      const fr = (await anonymous.get(`/v1/public/pages/${slug}?locale=fr`)).body.data.page;
      assert.equal(fr.locale, 'en');
      assert.equal(fr.title, 'Privacy policy');

      // publishing the French text makes it visible
      await put(slug, {
        en: { title: 'Privacy policy', body: 'x', isPublished: true },
        fr: { title: 'Politique de confidentialité', body: 'Texte final', isPublished: true },
      });
      const frNow = (await anonymous.get(`/v1/public/pages/${slug}?locale=fr`)).body.data.page;
      assert.equal(frNow.locale, 'fr');
      assert.equal(frNow.body, 'Texte final');
      // Arabic was left out of the last save, so it is gone and Arabic visitors fall back to English
      assert.equal((await anonymous.get(`/v1/public/pages/${slug}?locale=ar`)).body.data.page.locale, 'en');
      assert.equal(await auditActions('page.saved', slug), 2);
    });

    it('says "not published" when no published text exists in the visitor or default language', async () => {
      const slug = 'sportsbook-rules';
      await put(slug, { en: { title: 'Draft', body: 'Not ready', isPublished: false }, ar: { title: 'مسودة', body: 'x', isPublished: true } });
      const en = (await anonymous.get(`/v1/public/pages/${slug}?locale=en`)).body.data.page;
      assert.equal(en.published, false);
      const ar = (await anonymous.get(`/v1/public/pages/${slug}?locale=ar`)).body.data.page;
      assert.equal(ar.published, true);
      assert.equal(ar.locale, 'ar');
      const fr = (await anonymous.get(`/v1/public/pages/${slug}?locale=fr`)).body.data.page;
      assert.equal(fr.published, false, 'the default-language text is a draft, so there is nothing to fall back to');
    });

    it('validates the input', async () => {
      const slug = 'about-us';
      const bad: [string, Record<string, unknown>, string][] = [
        ['an empty title', { en: { title: '', body: 'x' } }, 'translations.en.title'],
        ['a title that is too long', { en: { title: 'x'.repeat(161), body: 'x' } }, 'translations.en.title'],
        ['a body that is too long', { en: { title: 'x', body: 'y'.repeat(100_001) } }, 'translations.en.body'],
        ['an unknown language', { de: { title: 'Hallo', body: 'x' } }, 'translations.de'],
        ['isPublished as text', { en: { title: 'x', body: 'x', isPublished: 'true' } }, 'translations.en.isPublished'],
      ];
      for (const [label, translations, field] of bad) {
        const r = await put(slug, translations);
        assert.equal(r.status, 422, `${label}: ${JSON.stringify(r.body)}`);
        assert.ok(field in (r.body.error.fields ?? {}), `${label}: expected ${field}, got ${JSON.stringify(r.body.error.fields)}`);
      }
      const longest = await put(slug, { en: { title: 'Long page', body: 'z'.repeat(100_000), isPublished: false } });
      assert.equal(longest.status, 200, JSON.stringify(longest.body).slice(0, 200));
    });

    it('only knows the standard page addresses', async () => {
      for (const slug of ['pricing', '..%2Fabout-us', 'About-Us', 'about-us%00']) {
        assert.equal((await editor.get(`/v1/admin/pages/${slug}`)).status, 404, slug);
        assert.equal((await put(slug, { en: { title: 'x', body: 'x' } })).status, 404, slug);
        assert.equal((await anonymous.get(`/v1/public/pages/${slug}`)).status, 404, slug);
      }
      assert.equal((await anonymous.get('/v1/public/pages/about-us?locale=de')).status, 422);
    });

    it('is reserved for staff with pages.manage', async () => {
      const other = await signedIn(server, await createStaff(server, { permissions: ['banners.manage', 'promotions.manage', 'games.manage'] }));
      assert.equal((await other.get('/v1/admin/pages')).status, 403);
      assert.equal((await put('about-us', { en: { title: 'x', body: 'x' } }, other)).status, 403);
      assert.equal((await put('about-us', { en: { title: 'x', body: 'x' } }, anonymous)).status, 401);
      const pagesManager = await signedIn(server, await createStaff(server, { permissions: ['pages.manage'] }));
      assert.equal((await pagesManager.get('/v1/admin/pages')).status, 200);
    });
  });

  // -------------------------------------------------------------------------
  describe('game providers and games', () => {
    let providerId: string;
    let providerSlug: string;

    before(async () => {
      providerSlug = `studio-${unique()}`;
      const r = await editor.post('/v1/admin/game-providers', { slug: providerSlug, name: 'Test Studio' });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      providerId = r.body.data.provider.id;
    });

    const game = (overrides: Record<string, unknown> = {}) => ({
      slug: `game-${unique()}`,
      name: 'Test Game',
      providerId,
      category: 'slots',
      ...overrides,
    });

    it('creates and updates providers; a duplicate slug is reported on the slug field', async () => {
      const slug = `studio-${unique()}`;
      const created = await editor.post('/v1/admin/game-providers', { slug, name: 'Second Studio', sortOrder: 4 });
      assert.equal(created.status, 201);
      assert.deepEqual(created.body.data.provider, { id: created.body.data.provider.id, slug, name: 'Second Studio', isActive: true, sortOrder: 4, isDemo: false });
      const dup = await editor.post('/v1/admin/game-providers', { slug, name: 'Again' });
      assert.equal(dup.status, 409);
      assert.equal(dup.body.error.fields.slug, 'alreadyExists');
      const updated = await editor.put(`/v1/admin/game-providers/${created.body.data.provider.id}`, { slug, name: 'Renamed Studio', isActive: false });
      assert.equal(updated.status, 200);
      assert.equal(updated.body.data.provider.name, 'Renamed Studio');
      assert.equal(updated.body.data.provider.isActive, false);
      assert.equal((await editor.put('/v1/admin/game-providers/99999999', { slug: 'zz', name: 'x' })).status, 404);
      for (const [label, payload] of [
        ['upper-case slug', { slug: 'Studio', name: 'x' }],
        ['empty name', { slug: 'ok-slug', name: '' }],
        ['long name', { slug: 'ok-slug', name: 'x'.repeat(81) }],
      ] as const) {
        assert.equal((await editor.post('/v1/admin/game-providers', payload)).status, 422, label);
      }
      assert.ok((await editor.get('/v1/admin/game-providers')).body.data.items.some((p: { slug: string }) => p.slug === slug));
      assert.equal(await auditActions('provider.created', created.body.data.provider.id), 1);
    });

    it('creates, updates and filters games', async () => {
      const thumbnail = await newImage(142, 190);
      const created = await editor.post('/v1/admin/games', game({ name: 'Golden Pharaoh', thumbnailId: thumbnail.id, isFeatured: true, isNew: true, externalId: 'ext-1' }));
      assert.equal(created.status, 201, JSON.stringify(created.body));
      const g = created.body.data.game;
      assert.equal(g.provider.id, providerId);
      assert.equal(g.provider.slug, providerSlug);
      assert.equal(g.thumbnail.id, thumbnail.id);
      assert.equal(g.isFeatured, true);
      assert.equal(g.isDemo, false);
      assert.equal(g.externalId, 'ext-1');
      assert.equal(await auditActions('game.created', g.id), 1);

      const crash = await editor.post('/v1/admin/games', game({ name: 'Rocket Run', category: 'crash', sortOrder: 9 }));
      assert.equal(crash.status, 201);

      const byCategory = await editor.get(`/v1/admin/games?category=crash&provider=${providerSlug}`);
      assert.deepEqual(byCategory.body.data.items.map((x: { id: string }) => x.id), [crash.body.data.game.id]);
      assert.equal(byCategory.body.data.total, 1);
      const bySearch = await editor.get(`/v1/admin/games?q=pharaoh&provider=${providerSlug}`);
      assert.deepEqual(bySearch.body.data.items.map((x: { id: string }) => x.id), [g.id]);

      const updated = await editor.put(`/v1/admin/games/${g.id}`, game({ slug: g.slug, name: 'Golden Pharaoh II', category: 'table', isActive: false }));
      assert.equal(updated.status, 200, JSON.stringify(updated.body));
      assert.equal(updated.body.data.game.name, 'Golden Pharaoh II');
      assert.equal(updated.body.data.game.category, 'table');
      assert.equal(updated.body.data.game.thumbnail, null);
      assert.equal(updated.body.data.game.externalId, null);
      assert.equal(updated.body.data.game.isActive, false);
      assert.equal(await auditActions('game.updated', g.id), 1);
      assert.equal((await editor.put('/v1/admin/games/99999999', game())).status, 404);
    });

    it('validates games', async () => {
      const bad: [string, Record<string, unknown>, string][] = [
        ['an unknown provider', { providerId: '99999999' }, 'providerId'],
        ['a provider id that is not a number', { providerId: 'abc' }, 'providerId'],
        ['a category that does not exist', { category: 'bingo' }, 'category'],
        ['an upper-case slug', { slug: 'Game One' }, 'slug'],
        ['an empty name', { name: '' }, 'name'],
        ['a thumbnail that does not exist', { thumbnailId: randomUUID() }, 'thumbnailId'],
      ];
      for (const [label, overrides, field] of bad) {
        const r = await editor.post('/v1/admin/games', game(overrides));
        assert.equal(r.status, 422, `${label}: ${JSON.stringify(r.body)}`);
        assert.ok(field in (r.body.error.fields ?? {}), `${label}: expected ${field}, got ${JSON.stringify(r.body.error.fields)}`);
      }
      const input = game();
      assert.equal((await editor.post('/v1/admin/games', input)).status, 201);
      const dup = await editor.post('/v1/admin/games', input);
      assert.equal(dup.status, 409);
      assert.equal(dup.body.error.fields.slug, 'alreadyExists');
    });

    it('is reserved for staff with games.manage', async () => {
      const other = await signedIn(server, await createStaff(server, { permissions: ['banners.manage', 'promotions.manage', 'pages.manage'] }));
      assert.equal((await other.get('/v1/admin/games')).status, 403);
      assert.equal((await other.post('/v1/admin/games', game())).status, 403);
      assert.equal((await other.get('/v1/admin/game-providers')).status, 403);
      assert.equal((await anonymous.get('/v1/admin/games')).status, 401);
    });

    describe('what visitors see', () => {
      let pub: { providerSlug: string; names: string[] };

      before(async () => {
        const slug = `pub-${unique()}`;
        const provider = await editor.post('/v1/admin/game-providers', { slug, name: 'Public Studio' });
        const hiddenProvider = await editor.post('/v1/admin/game-providers', { slug: `${slug}-off`, name: 'Hidden Studio', isActive: false });
        const mk = async (name: string, overrides: Record<string, unknown>) => {
          const r = await editor.post('/v1/admin/games', { slug: `${slug}-${unique()}`, name, providerId: provider.body.data.provider.id, category: 'slots', ...overrides });
          assert.equal(r.status, 201, JSON.stringify(r.body));
        };
        await mk('Alpha Slot', { sortOrder: 1, isFeatured: true });
        await mk('Beta Slot', { sortOrder: 2 });
        await mk('Gamma Crash', { sortOrder: 3, category: 'crash', isFeatured: true });
        await mk('Delta 100% Wild', { sortOrder: 4 });
        await mk('Epsilon Disabled', { sortOrder: 5, isActive: false });
        const r = await editor.post('/v1/admin/games', { slug: `${slug}-hp`, name: 'Zeta From Hidden Provider', providerId: hiddenProvider.body.data.provider.id, category: 'slots' });
        assert.equal(r.status, 201);
        pub = { providerSlug: slug, names: ['Alpha Slot', 'Beta Slot', 'Gamma Crash', 'Delta 100% Wild'] };
      });

      it('lists active games of active providers only, in the order set by staff', async () => {
        const r = await anonymous.get(`/v1/public/games?provider=${pub.providerSlug}`);
        assert.equal(r.status, 200);
        assert.deepEqual(r.body.data.items.map((g: { name: string }) => g.name), pub.names);
        assert.equal(r.body.data.total, 4);
        assert.equal(r.body.data.demo, false);
        assert.equal(r.headers.get('cache-control'), 'public, max-age=15');
        const hidden = await anonymous.get(`/v1/public/games?provider=${pub.providerSlug}-off`);
        assert.equal(hidden.body.data.total, 0);
      });

      it('filters by category, featured flag and name, and pages through the results', async () => {
        const base = `/v1/public/games?provider=${pub.providerSlug}`;
        assert.deepEqual((await anonymous.get(`${base}&category=crash`)).body.data.items.map((g: { name: string }) => g.name), ['Gamma Crash']);
        assert.deepEqual((await anonymous.get(`${base}&featured=true`)).body.data.items.map((g: { name: string }) => g.name), ['Alpha Slot', 'Gamma Crash']);
        assert.deepEqual((await anonymous.get(`${base}&q=BETA`)).body.data.items.map((g: { name: string }) => g.name), ['Beta Slot']);
        const page = await anonymous.get(`${base}&limit=2&offset=1`);
        assert.deepEqual(page.body.data.items.map((g: { name: string }) => g.name), ['Beta Slot', 'Gamma Crash']);
        assert.equal(page.body.data.total, 4, 'total ignores the page window');
      });

      it('treats % and _ in the search box as plain characters', async () => {
        const base = `/v1/public/games?provider=${pub.providerSlug}`;
        assert.deepEqual((await anonymous.get(`${base}&q=${encodeURIComponent('100%')}`)).body.data.items.map((g: { name: string }) => g.name), ['Delta 100% Wild']);
        assert.equal((await anonymous.get(`${base}&q=${encodeURIComponent('%')}`)).body.data.total, 1);
        assert.equal((await anonymous.get(`${base}&q=${encodeURIComponent('_')}`)).body.data.total, 0);
        assert.equal((await anonymous.get(`${base}&q=${encodeURIComponent("'; drop table games; --")}`)).body.data.total, 0);
      });

      it('validates the query', async () => {
        for (const query of ['category=bingo', 'limit=0', 'limit=201', 'offset=-1', 'limit=abc', 'featured=maybe', 'provider=Not%20A%20Slug']) {
          assert.equal((await anonymous.get(`/v1/public/games?${query}`)).status, 422, query);
        }
      });

      it('lists providers that are active', async () => {
        const r = await anonymous.get('/v1/public/providers');
        assert.equal(r.status, 200);
        const slugs = r.body.data.items.map((p: { slug: string }) => p.slug);
        assert.ok(slugs.includes(pub.providerSlug));
        assert.ok(!slugs.includes(`${pub.providerSlug}-off`));
      });
    });
  });

  // -------------------------------------------------------------------------
  describe('public configuration', () => {
    it('describes the languages, currencies, countries and switches the website needs, and no secrets', async () => {
      const r = await anonymous.get('/v1/public/config');
      assert.equal(r.status, 200);
      const config = r.body.data;
      assert.deepEqual(config.languages.map((l: { code: string }) => l.code), ['en', 'fr', 'ar']);
      assert.deepEqual(config.languages.find((l: { code: string }) => l.code === 'ar'), { code: 'ar', nativeName: 'العربية', englishName: 'Arabic', direction: 'rtl', isDefault: false });
      assert.equal(config.languages.find((l: { code: string }) => l.code === 'en').isDefault, true);
      assert.deepEqual(config.currencies.map((c: { code: string }) => c.code), ['TND', 'EUR', 'USD']);
      assert.ok(config.countries.some((c: { code: string; callingCode: string }) => c.code === 'TN' && c.callingCode === '216'));
      assert.equal(config.registrationOpen, true);
      assert.deepEqual(config.captcha, { enabled: false, siteKey: null });
      assert.equal(config.demo, false);
      assert.equal(config.minAge, 18);
      assert.equal(typeof config.termsVersion, 'string');
      assert.equal(r.headers.get('cache-control'), 'public, max-age=30');
      const text = JSON.stringify(r.body);
      assert.ok(!/secret|password|database|token/i.test(text), 'no secrets or internals in the public configuration');
    });
  });
});

describe('demo data switch', { skip: TEST_DATABASE_URL ? false : 'TEST_DATABASE_URL is not set' }, () => {
  let database: TestDatabase;
  let off: TestServer;
  let on: TestServer;

  before(async () => {
    database = await createTestDatabase();
    off = await startServer({ database, env: { SHOW_DEMO_DATA: 'false' } });
    on = await startServer({ database, env: { SHOW_DEMO_DATA: 'true' } });
    const provider = await database.db.query<{ id: string }>(
      "insert into game_providers (slug, name, is_demo) values ('demo-studio', 'Demo Studio', true) returning id::text",
    );
    const providerId = provider.rows[0]?.id as string;
    await database.db.query(
      `insert into games (slug, name, provider_id, category, is_demo, art)
       values ('demo-slot', 'Demo Slot', $1::bigint, 'slots', true, '{"hue": 40, "glyph": "S"}'::jsonb)`,
      [providerId],
    );
  });
  after(async () => {
    await off?.stop();
    await on?.stop();
    await database?.drop();
  });

  it('hides demo games, providers, winners and jackpots unless SHOW_DEMO_DATA is on', async () => {
    const a = off.browser();
    const b = on.browser();
    assert.equal((await a.get('/v1/public/config')).body.data.demo, false);
    assert.equal((await b.get('/v1/public/config')).body.data.demo, true);

    const hiddenGames = await a.get('/v1/public/games');
    assert.equal(hiddenGames.body.data.total, 0);
    assert.equal(hiddenGames.body.data.demo, false);
    const shownGames = await b.get('/v1/public/games');
    assert.equal(shownGames.body.data.total, 1);
    assert.equal(shownGames.body.data.demo, true);
    assert.equal(shownGames.body.data.items[0].isDemo, true);
    assert.deepEqual(shownGames.body.data.items[0].art, { hue: 40, glyph: 'S' });

    assert.equal((await a.get('/v1/public/providers')).body.data.items.length, 0);
    assert.equal((await b.get('/v1/public/providers')).body.data.items.length, 1);

    assert.equal((await a.get('/v1/public/demo/winners')).status, 404);
    assert.equal((await a.get('/v1/public/demo/jackpots')).status, 404);
    assert.equal((await b.get('/v1/public/demo/winners')).status, 200);
    assert.equal((await b.get('/v1/public/demo/jackpots')).status, 200);
  });

  it('labels demo winners and jackpots as demo, masks names, and scales amounts to the currency', async () => {
    const b = on.browser();
    const tnd = (await b.get('/v1/public/demo/winners?currency=TND')).body.data;
    assert.equal(tnd.demo, true);
    assert.equal(tnd.items[0].username, 'd****1');
    assert.ok(tnd.items.every((w: { username: string }) => /^.\*{4}.$/.test(w.username)));
    assert.deepEqual({ amountMinor: tnd.items[0].amountMinor, currency: tnd.items[0].currency }, { amountMinor: '12800000', currency: 'TND' });
    const eur = (await b.get('/v1/public/demo/winners?currency=eur')).body.data;
    assert.deepEqual({ amountMinor: eur.items[0].amountMinor, currency: eur.items[0].currency }, { amountMinor: '1280000', currency: 'EUR' });
    const jackpots = (await b.get('/v1/public/demo/jackpots?currency=EUR')).body.data;
    assert.equal(jackpots.demo, true);
    assert.deepEqual(jackpots.items.map((j: { level: string }) => j.level), ['ultimate', 'vip', 'plus', 'basic']);
    assert.equal(jackpots.items[0].amountMinor, '12345600');
    const unknown = await b.get('/v1/public/demo/jackpots?currency=XYZ');
    assert.equal(unknown.status, 422);
    assert.equal(unknown.body.error.code, 'currency_unavailable');
  });

  it('refuses to start with demo data in production', async () => {
    const { loadConfig } = await import('../src/config.ts');
    assert.throws(
      () => loadConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgres://x', WEB_ORIGIN: 'https://example.com', COOKIE_SECURE: 'true', SHOW_DEMO_DATA: 'true' }),
      /SHOW_DEMO_DATA must be false in production/,
    );
  });
});
