import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AppError, ERROR_STATUS, parse, parseOrThrow, v } from '../src/index.ts';
import type { Infer } from '../src/index.ts';

describe('v.string', () => {
  it('trims, normalises and enforces length', () => {
    const s = v.string({ min: 2, max: 5 });
    assert.deepEqual(parse(s, '  abc  '), { ok: true, value: 'abc' });
    assert.deepEqual(parse(s, 'a'), { ok: false, errors: { $: 'tooShort' } });
    assert.deepEqual(parse(s, 'abcdef'), { ok: false, errors: { $: 'tooLong' } });
    assert.deepEqual(parse(s, '   '), { ok: false, errors: { $: 'required' } });
    assert.deepEqual(parse(s, 42), { ok: false, errors: { $: 'required' } });
  });

  it('allows empty strings when min is 0', () => {
    assert.deepEqual(parse(v.string({ min: 0 }), ''), { ok: true, value: '' });
  });

  it('rejects control characters and bidirectional overrides', () => {
    assert.equal(parse(v.string(), 'a\u0000b').ok, false);
    assert.equal(parse(v.string(), 'a\nb').ok, false);
    assert.equal(parse(v.string(), 'abc‮def').ok, false);
    assert.equal(parse(v.string({ multiline: true }), 'line 1\r\nline 2').ok, true);
    assert.deepEqual(parse(v.string({ multiline: true }), 'a\r\nb'), { ok: true, value: 'a\nb' });
  });

  it('accepts Arabic and French text', () => {
    assert.equal(parse(v.string(), 'مرحبًا بكم').ok, true);
    assert.equal(parse(v.string(), 'Écoute, ça va très bien').ok, true);
  });
});

describe('specialised string schemas', () => {
  it('validates and normalises e-mail addresses', () => {
    assert.deepEqual(parse(v.email(), '  Player@Example.COM '), { ok: true, value: 'player@example.com' });
    assert.deepEqual(parse(v.email(), 'not-an-email'), { ok: false, errors: { $: 'invalidEmail' } });
    assert.deepEqual(parse(v.email(), 'a@b'), { ok: false, errors: { $: 'invalidEmail' } });
    assert.equal(parse(v.email(), 'a b@c.de').ok, false);
  });

  it('validates usernames', () => {
    assert.equal(parse(v.username(), 'player_01').ok, true);
    assert.deepEqual(parse(v.username(), 'ab'), { ok: false, errors: { $: 'invalidUsername' } });
    assert.deepEqual(parse(v.username(), 'a'.repeat(25)), { ok: false, errors: { $: 'invalidUsername' } });
    assert.deepEqual(parse(v.username(), 'bad name'), { ok: false, errors: { $: 'invalidUsername' } });
    assert.deepEqual(parse(v.username(), 'احمد_player'), { ok: false, errors: { $: 'invalidUsername' } });
  });

  it('validates the shape of passwords without trimming them', () => {
    assert.equal(parse(v.password(), 'abcdefghi1').ok, true);
    assert.deepEqual(parse(v.password(), 'short1'), { ok: false, errors: { $: 'passwordTooShort' } });
    assert.deepEqual(parse(v.password(), 'abcdefghijk'), { ok: false, errors: { $: 'passwordNeedsLetterAndDigit' } });
    assert.deepEqual(parse(v.password(), '12345678901'), { ok: false, errors: { $: 'passwordNeedsLetterAndDigit' } });
    assert.deepEqual(parse(v.password(), `${'a1'.repeat(65)}`), { ok: false, errors: { $: 'tooLong' } });
    assert.deepEqual(parse(v.password(), ' abcdefghi1 '), { ok: true, value: ' abcdefghi1 ' });
  });

  it('validates calendar dates', () => {
    assert.equal(parse(v.isoDate(), '2000-02-29').ok, true);
    assert.deepEqual(parse(v.isoDate(), '2001-02-29'), { ok: false, errors: { $: 'invalidDate' } });
    assert.deepEqual(parse(v.isoDate(), '2001-13-01'), { ok: false, errors: { $: 'invalidDate' } });
    assert.deepEqual(parse(v.isoDate(), '01/02/2000'), { ok: false, errors: { $: 'invalidDate' } });
  });

  it('normalises instants to UTC', () => {
    assert.deepEqual(parse(v.isoInstant(), '2026-10-23T10:00:00+02:00'), { ok: true, value: '2026-10-23T08:00:00.000Z' });
    assert.equal(parse(v.isoInstant(), '2026-10-23').ok, false);
  });

  it('accepts only safe link targets', () => {
    const s = v.linkUrl();
    assert.deepEqual(parse(s, '/promotions'), { ok: true, value: '/promotions' });
    assert.deepEqual(parse(s, '/'), { ok: true, value: '/' });
    assert.deepEqual(parse(s, 'https://example.com/a?b=1'), { ok: true, value: 'https://example.com/a?b=1' });
    assert.deepEqual(parse(s, ''), { ok: true, value: '' });
    for (const bad of ['javascript:alert(1)', 'data:text/html,hi', '//evil.example', '/\\evil.example', 'http://example.com', 'ftp://x.y', '/a b']) {
      assert.deepEqual(parse(s, bad), { ok: false, errors: { $: 'invalidUrl' } }, bad);
    }
  });

  it('validates UUIDs', () => {
    assert.equal(parse(v.uuid(), '3F2504E0-4F89-41D3-9A0C-0305E82C3301').ok, true);
    assert.equal(parse(v.uuid(), 'nope').ok, false);
  });
});

describe('numbers, booleans and choices', () => {
  it('validates integers with ranges and optional coercion', () => {
    assert.deepEqual(parse(v.integer({ min: 1, max: 10 }), 5), { ok: true, value: 5 });
    assert.deepEqual(parse(v.integer({ min: 1, max: 10 }), 11), { ok: false, errors: { $: 'outOfRange' } });
    assert.deepEqual(parse(v.integer(), 1.5), { ok: false, errors: { $: 'invalidNumber' } });
    assert.deepEqual(parse(v.integer(), '5'), { ok: false, errors: { $: 'invalidNumber' } });
    assert.deepEqual(parse(v.integer({ coerce: true }), '5'), { ok: true, value: 5 });
    assert.deepEqual(parse(v.integer({ coerce: true }), 'abc'), { ok: false, errors: { $: 'invalidNumber' } });
    assert.deepEqual(parse(v.integer(), undefined), { ok: false, errors: { $: 'required' } });
    assert.deepEqual(parse(v.integer(), Number.NaN), { ok: false, errors: { $: 'invalidNumber' } });
  });

  it('validates booleans and choices', () => {
    assert.deepEqual(parse(v.boolean(), true), { ok: true, value: true });
    assert.deepEqual(parse(v.boolean(), 'true'), { ok: false, errors: { $: 'required' } });
    assert.deepEqual(parse(v.boolean({ coerce: true }), 'false'), { ok: true, value: false });
    const c = v.choice(['a', 'b'] as const);
    assert.deepEqual(parse(c, 'a'), { ok: true, value: 'a' });
    assert.deepEqual(parse(c, 'c'), { ok: false, errors: { $: 'invalidChoice' } });
    assert.deepEqual(parse(c, 1), { ok: false, errors: { $: 'required' } });
  });
});

describe('objects, arrays and records', () => {
  const schema = v.object({
    name: v.string({ max: 10 }),
    age: v.optional(v.integer({ min: 0 })),
    kind: v.choice(['x', 'y'] as const),
    tags: v.withDefault(v.array(v.string({ max: 5 }), { max: 3 }), []),
    note: v.nullable(v.string({ min: 0 })),
  });

  it('infers precise types (compile-time check)', () => {
    type T = Infer<typeof schema>;
    const sample: T = { name: 'n', kind: 'x', tags: [], note: null };
    const withAge: T = { ...sample, age: 3 };
    // @ts-expect-error `kind` only accepts the declared choices
    const bad: T = { ...sample, kind: 'z' };
    void withAge;
    void bad;
    assert.ok(true);
  });

  it('parses a valid object, drops unknown keys and fills defaults', () => {
    const r = parse(schema, { name: ' Ann ', kind: 'y', note: null, isAdmin: true, role: 'super_admin' });
    assert.deepEqual(r, { ok: true, value: { name: 'Ann', kind: 'y', tags: [], note: null } });
  });

  it('reports every problem with its path', () => {
    const r = parse(schema, { name: '', age: -1, kind: 'q', tags: ['ok', 'toolong'], note: 5 });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.deepEqual(r.errors, {
        name: 'required',
        age: 'outOfRange',
        kind: 'invalidChoice',
        'tags[1]': 'tooLong',
        note: 'required',
      });
    }
  });

  it('rejects non-objects and does not read inherited keys', () => {
    assert.deepEqual(parse(schema, null), { ok: false, errors: { $: 'required' } });
    assert.deepEqual(parse(schema, []), { ok: false, errors: { $: 'required' } });
    const polluted = Object.create({ name: 'inherited', kind: 'x', note: null });
    assert.equal(parse(schema, polluted).ok, false);
  });

  it('limits array sizes', () => {
    const a = v.array(v.integer(), { min: 1, max: 2 });
    assert.deepEqual(parse(a, []), { ok: false, errors: { $: 'tooShort' } });
    assert.deepEqual(parse(a, [1, 2, 3]), { ok: false, errors: { $: 'tooLong' } });
    assert.deepEqual(parse(a, [1, 2]), { ok: true, value: [1, 2] });
  });

  it('validates records limited to known keys (languages)', () => {
    const r = v.recordOf(['en', 'fr', 'ar'] as const, v.object({ title: v.string() }));
    assert.deepEqual(parse(r, { en: { title: 'Hi' }, ar: { title: 'مرحبا' } }), {
      ok: true,
      value: { en: { title: 'Hi' }, ar: { title: 'مرحبا' } },
    });
    assert.deepEqual(parse(r, { de: { title: 'Hallo' }, en: { title: '' } }), {
      ok: false,
      errors: { de: 'invalidChoice', 'en.title': 'required' },
    });
  });

  it('does not allow prototype pollution through keys', () => {
    const r = parse(v.recordOf(['en'] as const, v.string()), JSON.parse('{"__proto__": "x", "en": "ok"}'));
    assert.equal(r.ok, false);
    assert.equal(({} as Record<string, unknown>).polluted, undefined);
  });
});

describe('parseOrThrow / AppError', () => {
  it('throws a validation AppError carrying the field errors', () => {
    assert.throws(
      () => parseOrThrow(v.object({ email: v.email() }), { email: 'x' }),
      (err: unknown) =>
        err instanceof AppError && err.code === 'validation' && err.status === 422 && err.fields?.email === 'invalidEmail',
    );
  });

  it('maps every error code to a valid HTTP status', () => {
    for (const [code, status] of Object.entries(ERROR_STATUS)) {
      assert.ok(status >= 400 && status <= 599, `${code} -> ${status}`);
    }
    assert.equal(new AppError('insufficient_funds').status, 409);
    assert.equal(new AppError('unauthenticated').status, 401);
  });
});
