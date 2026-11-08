/** Unit tests for the website's security-sensitive helpers (no server or database). */
import assert from 'node:assert/strict';
import type { IncomingMessage } from 'node:http';
import { describe, test } from 'node:test';
import { gameArtSvg } from '../src/assets.ts';
import { csrfToken, csrfValid, newCsrfSeed, parseCookies, sameOrigin } from '../src/http.ts';
import { html, join, paragraphs, raw, safeHref } from '../src/html.ts';
import { translator } from '../src/i18n.ts';

describe('html templates', () => {
  test('escape every interpolated value', () => {
    const evil = `<script>alert("x")</script>&'`;
    assert.equal(html`<p title="${evil}">${evil}</p>`.toString(), '<p title="&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;&#39;">&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;&#39;</p>');
  });
  test('nested templates and arrays are not escaped twice; raw() is kept as is', () => {
    const inner = html`<b>${'a<b'}</b>`;
    assert.equal(html`<i>${inner}${[html`<u>1</u>`, '<2>']}${raw('<br>')}</i>`.toString(), '<i><b>a&lt;b</b><u>1</u>&lt;2&gt;<br></i>');
    assert.equal(join(['a', '', '<c>'], ', ').toString(), 'a, &lt;c&gt;');
  });
  test('null, undefined and false render nothing', () => {
    assert.equal(html`${null}${undefined}${false}x`.toString(), 'x');
  });
  test('paragraphs() keeps text as text', () => {
    assert.equal(paragraphs('one\ntwo<b>\n\nthree').toString(), '<p>one<br>two&lt;b&gt;</p><p>three</p>');
  });
});

describe('safeHref', () => {
  test('allows same-site paths and https only', () => {
    assert.equal(safeHref('/en/casino'), '/en/casino');
    assert.equal(safeHref('https://example.com/x'), 'https://example.com/x');
    for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', '//evil.example', '/\\evil.example', 'http://plain.example', 'data:text/html,x', '', null, undefined]) {
      assert.equal(safeHref(bad), '#', String(bad));
    }
  });
});

describe('game artwork', () => {
  test('only accepts hex colours, known glyphs and escapes the title', () => {
    const svg = gameArtSvg(new URLSearchParams({ c1: 'ff0000"/><script>', c2: '00ff00', g: '<evil>', t: '</text><script>x</script>' }));
    assert.doesNotMatch(svg, /<script/);
    assert.match(svg, /stop-color="#3b1d6e"/, 'invalid colour replaced by the default');
    assert.match(svg, /stop-color="#00ff00"/);
    assert.match(svg, /&lt;\/text&gt;/);
  });
});

describe('CSRF and origin checks', () => {
  test('a token only matches its own seed and secret', () => {
    const seed = newCsrfSeed();
    const token = csrfToken('secret-a', seed);
    assert.equal(csrfValid('secret-a', seed, token), true);
    assert.equal(csrfValid('secret-b', seed, token), false);
    assert.equal(csrfValid('secret-a', newCsrfSeed(), token), false);
    assert.equal(csrfValid('secret-a', undefined, token), false);
    assert.equal(csrfValid('secret-a', seed, null), false);
    assert.equal(csrfValid('secret-a', seed, `${token}x`), false);
  });
  test('cross-site posts are refused', () => {
    const req = (headers: Record<string, string>) => ({ headers }) as unknown as IncomingMessage;
    const origin = 'https://www.example.com';
    assert.equal(sameOrigin(req({ origin }), origin), true);
    assert.equal(sameOrigin(req({ origin, 'sec-fetch-site': 'same-origin' }), origin), true);
    assert.equal(sameOrigin(req({ origin: 'https://evil.example' }), origin), false);
    assert.equal(sameOrigin(req({ origin: 'null' }), origin), false);
    assert.equal(sameOrigin(req({ 'sec-fetch-site': 'cross-site' }), origin), false);
  });
  test('cookie parsing', () => {
    assert.deepEqual(parseCookies('a=1; b = two ;c'), { a: '1', b: 'two' });
  });
});

describe('translations', () => {
  test('fall back to English, then to the key, and fill placeholders', () => {
    const ar = translator('ar');
    assert.match(ar('nav.casino'), /[؀-ۿ]/);
    assert.equal(translator('fr')('no.such.key'), 'no.such.key');
    assert.match(translator('en')('withdrawals.validUntil', { date: '2026-01-01' }), /2026-01-01/);
  });
});
