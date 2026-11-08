/**
 * Tiny input-validation library (no dependencies).
 *
 * - Unknown keys are dropped, never copied (no mass assignment).
 * - Errors are message KEYS (e.g. "invalidEmail"), not sentences: the UI translates them
 *   (validation.* in @aurum/i18n).
 * - Every schema returns a typed value: `Infer<typeof schema>` gives the TypeScript type.
 */
import { AppError } from './errors.ts';
import type { FieldErrors } from './errors.ts';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, USERNAME_PATTERN } from './constants.ts';

export interface Schema<T> {
  /** Returns `{ value }` on success. On failure records an error under `path` and returns undefined. */
  readonly run: (input: unknown, path: string, errors: FieldErrors) => { value: T } | undefined;
}

export type Infer<S> = S extends Schema<infer T> ? T : never;

type Shape = Record<string, Schema<unknown>>;
type OptionalKeys<S extends Shape> = { [K in keyof S]: undefined extends Infer<S[K]> ? K : never }[keyof S];
type RequiredKeys<S extends Shape> = Exclude<keyof S, OptionalKeys<S>>;
type Prettify<T> = { [K in keyof T]: T[K] } & {};
export type InferShape<S extends Shape> = Prettify<
  { [K in RequiredKeys<S>]: Infer<S[K]> } & { [K in OptionalKeys<S>]?: Infer<S[K]> }
>;

export type ParseResult<T> = { ok: true; value: T } | { ok: false; errors: FieldErrors };

const ROOT = '$';

function fail(errors: FieldErrors, path: string, code: string): undefined {
  if (!Object.hasOwn(errors, path)) errors[path] = code;
  return undefined;
}

export function parse<T>(schema: Schema<T>, input: unknown): ParseResult<T> {
  const errors: FieldErrors = {};
  const result = schema.run(input, ROOT, errors);
  if (!result || Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: result.value };
}

/** Parses or throws an AppError('validation') carrying the field errors. */
export function parseOrThrow<T>(schema: Schema<T>, input: unknown): T {
  const result = parse(schema, input);
  if (!result.ok) throw new AppError('validation', { fields: result.errors });
  return result.value;
}

// Control characters (except tab/newline in multi-line text) and bidirectional overrides
// are rejected so that names and titles cannot hide or reorder text in the dashboards.
// eslint-disable-next-line no-control-regex
const CONTROL_SINGLE = /[\u0000-\u001F\u007F\u0080-\u009F]/;
// eslint-disable-next-line no-control-regex
const CONTROL_MULTI = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u0080-\u009F]/;
const BIDI_OVERRIDE = /[‪-‮⁦-⁩]/;

export interface StringOptions {
  min?: number;
  max?: number;
  pattern?: RegExp;
  /** Message key when `pattern` does not match (default "invalidFormat"). */
  patternCode?: string;
  trim?: boolean;
  multiline?: boolean;
  transform?: (value: string) => string;
}

export function string(options: StringOptions = {}): Schema<string> {
  const { min = 1, max = 1000, trim = true, multiline = false } = options;
  return {
    run(input, path, errors) {
      if (typeof input !== 'string') return fail(errors, path, 'required');
      let s = input.normalize('NFC');
      if (multiline) s = s.replace(/\r\n?/g, '\n');
      if (trim) s = s.trim();
      if (options.transform) s = options.transform(s);
      if (s.length === 0 && min > 0) return fail(errors, path, 'required');
      if (s.length < min) return fail(errors, path, 'tooShort');
      if (s.length > max) return fail(errors, path, 'tooLong');
      if ((multiline ? CONTROL_MULTI : CONTROL_SINGLE).test(s) || BIDI_OVERRIDE.test(s)) {
        return fail(errors, path, 'invalidFormat');
      }
      if (options.pattern && !options.pattern.test(s)) {
        return fail(errors, path, options.patternCode ?? 'invalidFormat');
      }
      return { value: s };
    },
  };
}

// 3..254 characters, one "@", a dot in the domain, no spaces (same rule as the database check)
const EMAIL_PATTERN = /^(?=.{3,254}$)[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function email(): Schema<string> {
  return string({
    pattern: EMAIL_PATTERN,
    patternCode: 'invalidEmail',
    transform: (s) => s.normalize('NFKC').toLowerCase(),
  });
}

/** 3-24 letters, digits, dots, dashes or underscores. Any violation (even length) is "invalidUsername". */
export function username(): Schema<string> {
  return string({ pattern: USERNAME_PATTERN, patternCode: 'invalidUsername' });
}

/** Shape check only (length, letter + digit). Use passwordProblem() for the common-password rules. */
export function password(): Schema<string> {
  return {
    run(input, path, errors) {
      if (typeof input !== 'string' || input.length === 0) return fail(errors, path, 'required');
      if (input.length < PASSWORD_MIN_LENGTH) return fail(errors, path, 'passwordTooShort');
      if (input.length > PASSWORD_MAX_LENGTH) return fail(errors, path, 'tooLong');
      if (!/\p{L}/u.test(input) || !/\p{Nd}/u.test(input)) return fail(errors, path, 'passwordNeedsLetterAndDigit');
      return { value: input };
    },
  };
}

export interface IntegerOptions {
  min?: number;
  max?: number;
  /** Accept numeric strings such as "25" (query strings). */
  coerce?: boolean;
}

export function integer(options: IntegerOptions = {}): Schema<number> {
  const { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER, coerce = false } = options;
  return {
    run(input, path, errors) {
      let n: number;
      if (typeof input === 'number') n = input;
      else if (coerce && typeof input === 'string' && /^-?\d{1,15}$/.test(input.trim())) n = Number(input.trim());
      else return fail(errors, path, input === undefined || input === null || input === '' ? 'required' : 'invalidNumber');
      if (!Number.isSafeInteger(n)) return fail(errors, path, 'invalidNumber');
      if (n < min || n > max) return fail(errors, path, 'outOfRange');
      return { value: n };
    },
  };
}

export function boolean(options: { coerce?: boolean } = {}): Schema<boolean> {
  return {
    run(input, path, errors) {
      if (typeof input === 'boolean') return { value: input };
      if (options.coerce && (input === 'true' || input === 'false')) return { value: input === 'true' };
      return fail(errors, path, 'required');
    },
  };
}

export function choice<const V extends readonly string[]>(values: V): Schema<V[number]> {
  return {
    run(input, path, errors) {
      if (typeof input !== 'string') return fail(errors, path, 'required');
      if (!(values as readonly string[]).includes(input)) return fail(errors, path, 'invalidChoice');
      return { value: input as V[number] };
    },
  };
}

/** A real calendar day written as YYYY-MM-DD. */
export function isoDate(): Schema<string> {
  return {
    run(input, path, errors) {
      if (typeof input !== 'string' || input === '') return fail(errors, path, 'required');
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
      if (!m) return fail(errors, path, 'invalidDate');
      const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
      const probe = new Date(Date.UTC(y, mo - 1, d));
      if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) {
        return fail(errors, path, 'invalidDate');
      }
      return { value: input };
    },
  };
}

/** An ISO-8601 instant (e.g. 2026-10-23T10:00:00Z) normalised to UTC. */
export function isoInstant(): Schema<string> {
  return {
    run(input, path, errors) {
      if (typeof input !== 'string' || input === '') return fail(errors, path, 'required');
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(input)) {
        return fail(errors, path, 'invalidDate');
      }
      const t = Date.parse(input);
      if (Number.isNaN(t)) return fail(errors, path, 'invalidDate');
      return { value: new Date(t).toISOString() };
    },
  };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function uuid(): Schema<string> {
  return string({ min: 36, max: 36, pattern: UUID_PATTERN, transform: (s) => s.toLowerCase() });
}

/** A link target: a site-relative path ("/promotions") or an https URL. Never javascript:, data: or //host. */
export function linkUrl(options: { max?: number } = {}): Schema<string> {
  return {
    run(input, path, errors) {
      if (typeof input !== 'string') return fail(errors, path, 'required');
      const s = input.trim();
      if (s === '') return { value: '' };
      if (s.length > (options.max ?? 500)) return fail(errors, path, 'tooLong');
      if (CONTROL_SINGLE.test(s) || /\s/.test(s)) return fail(errors, path, 'invalidUrl');
      if (/^\/([^/\\].*)?$/.test(s) || /^https:\/\/[^\s]+$/.test(s)) return { value: s };
      return fail(errors, path, 'invalidUrl');
    },
  };
}

export function array<T>(item: Schema<T>, options: { min?: number; max?: number } = {}): Schema<T[]> {
  const { min = 0, max = 1000 } = options;
  return {
    run(input, path, errors) {
      if (!Array.isArray(input)) return fail(errors, path, 'required');
      if (input.length < min) return fail(errors, path, 'tooShort');
      if (input.length > max) return fail(errors, path, 'tooLong');
      const out: T[] = [];
      let ok = true;
      input.forEach((element, i) => {
        const r = item.run(element, `${path}[${i}]`, errors);
        if (r) out.push(r.value);
        else ok = false;
      });
      return ok ? { value: out } : undefined;
    },
  };
}

export function object<S extends Shape>(shape: S): Schema<InferShape<S>> {
  const keys = Object.keys(shape);
  return {
    run(input, path, errors) {
      if (typeof input !== 'object' || input === null || Array.isArray(input)) {
        return fail(errors, path, 'required');
      }
      const source = input as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      let ok = true;
      for (const key of keys) {
        const child = path === ROOT ? key : `${path}.${key}`;
        const r = (shape[key] as Schema<unknown>).run(Object.hasOwn(source, key) ? source[key] : undefined, child, errors);
        if (!r) ok = false;
        else if (r.value !== undefined) out[key] = r.value;
      }
      return ok ? { value: out as InferShape<S> } : undefined;
    },
  };
}

/** An object whose keys are limited to `keys` (e.g. language codes); every present value must satisfy `item`. */
export function recordOf<const K extends readonly string[], T>(
  keys: K,
  item: Schema<T>,
): Schema<Partial<Record<K[number], T>>> {
  return {
    run(input, path, errors) {
      if (typeof input !== 'object' || input === null || Array.isArray(input)) return fail(errors, path, 'required');
      const source = input as Record<string, unknown>;
      const out: Record<string, T> = {};
      let ok = true;
      for (const key of Object.keys(source)) {
        const child = path === ROOT ? key : `${path}.${key}`;
        if (!(keys as readonly string[]).includes(key)) {
          fail(errors, child, 'invalidChoice');
          ok = false;
          continue;
        }
        const r = item.run(source[key], child, errors);
        if (r) out[key] = r.value;
        else ok = false;
      }
      return ok ? { value: out as Partial<Record<K[number], T>> } : undefined;
    },
  };
}

/** The key may be missing or null. */
export function optional<T>(schema: Schema<T>): Schema<T | undefined> {
  return {
    run(input, path, errors) {
      if (input === undefined || input === null) return { value: undefined };
      return schema.run(input, path, errors);
    },
  };
}

/** The value may be null (kept as null). A missing key is still an error. */
export function nullable<T>(schema: Schema<T>): Schema<T | null> {
  return {
    run(input, path, errors) {
      if (input === null) return { value: null };
      return schema.run(input, path, errors);
    },
  };
}

export function withDefault<T>(schema: Schema<T>, fallback: T): Schema<T> {
  return {
    run(input, path, errors) {
      if (input === undefined || input === null) return { value: fallback };
      return schema.run(input, path, errors);
    },
  };
}

export const v = {
  string,
  email,
  username,
  password,
  integer,
  boolean,
  choice,
  isoDate,
  isoInstant,
  uuid,
  linkUrl,
  array,
  object,
  recordOf,
  optional,
  nullable,
  withDefault,
} as const;
