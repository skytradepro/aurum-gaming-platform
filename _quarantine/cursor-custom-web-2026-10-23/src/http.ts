/** Small HTTP helpers: cookies, form bodies, client IP and CSRF tokens. */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { isIP } from 'node:net';
import { Readable } from 'node:stream';

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 1) continue;
    const name = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (Object.hasOwn(out, name)) continue;
    try {
      out[name] = decodeURIComponent(value);
    } catch {
      out[name] = value;
    }
  }
  return out;
}

export interface CookieOptions {
  maxAgeSeconds?: number;
  secure: boolean;
  httpOnly?: boolean;
  sameSite?: 'Lax' | 'Strict';
}

export function serializeCookie(name: string, value: string, options: CookieOptions): string {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', `SameSite=${options.sameSite ?? 'Lax'}`];
  if (options.httpOnly !== false) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  if (options.maxAgeSeconds !== undefined) parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAgeSeconds))}`);
  return parts.join('; ');
}

export function clientIp(req: IncomingMessage, trustedHops: number): string {
  const remote = (req.socket.remoteAddress ?? '127.0.0.1').replace(/^::ffff:/, '');
  if (trustedHops <= 0) return remote;
  const header = req.headers['x-forwarded-for'];
  const list = (Array.isArray(header) ? header.join(',') : header ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const candidate = list[list.length - trustedHops];
  return candidate && isIP(candidate) ? candidate : remote;
}

export const MAX_FORM_BYTES = 7 * 1024 * 1024;

export class BodyTooLarge extends Error {}

/** Reads an urlencoded or multipart form (images for the dashboards). */
export async function readForm(req: IncomingMessage): Promise<{ fields: URLSearchParams; files: Map<string, File> }> {
  const type = String(req.headers['content-type'] ?? '').toLowerCase();
  const length = Number(req.headers['content-length'] ?? '0');
  if (length > MAX_FORM_BYTES) throw new BodyTooLarge();
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    total += (chunk as Buffer).length;
    if (total > MAX_FORM_BYTES) throw new BodyTooLarge();
    chunks.push(chunk as Buffer);
  }
  const body = Buffer.concat(chunks);
  const fields = new URLSearchParams();
  const files = new Map<string, File>();
  if (type.startsWith('application/x-www-form-urlencoded')) {
    for (const [k, v] of new URLSearchParams(body.toString('utf8'))) fields.append(k, v);
  } else if (type.startsWith('multipart/form-data')) {
    const form = await new Response(Readable.toWeb(Readable.from([body])) as ReadableStream, { headers: { 'content-type': String(req.headers['content-type']) } }).formData();
    for (const [k, v] of form.entries()) {
      if (typeof v === 'string') fields.append(k, v);
      else if (v.size > 0) files.set(k, v);
    }
  }
  return { fields, files };
}

// ---------------------------------------------------------------------------
// CSRF: every form carries HMAC(secret, csrf cookie). An attacker's page can neither read the
// cookie nor compute the HMAC, and the Origin of state-changing requests is checked as well.
// ---------------------------------------------------------------------------
export const CSRF_COOKIE = 'aurum_csrf';

export function newCsrfSeed(): string {
  return randomBytes(24).toString('base64url');
}

export function csrfToken(secret: string, seed: string): string {
  return createHmac('sha256', secret).update(`csrf:${seed}`).digest('base64url');
}

export function csrfValid(secret: string, seed: string | undefined, token: string | null): boolean {
  if (!seed || !token) return false;
  const expected = Buffer.from(csrfToken(secret, seed));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Same-origin check on POST: the Origin header (when sent) and Fetch Metadata must agree. */
export function sameOrigin(req: IncomingMessage, publicOrigin: string): boolean {
  const origin = req.headers.origin;
  if (origin !== undefined && origin !== 'null' && origin !== publicOrigin) return false;
  if (origin === 'null') return false;
  const site = req.headers['sec-fetch-site'];
  if (typeof site === 'string' && !['same-origin', 'none'].includes(site)) return false;
  return true;
}
