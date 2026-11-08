/**
 * Password hashing with scrypt (built into Node.js, memory-hard, no native add-on).
 * Stored format:  scrypt$<N>$<r>$<p>$<salt base64url>$<hash base64url>
 * The parameters are stored with each hash, so the cost can be raised later and old hashes
 * are upgraded at the next successful login (see needsRehash).
 */
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

function derive(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, { N: n, r, p, maxmem: 256 * n * r + 1024 * 1024 }, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string, log2N: number): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await derive(password, salt, 2 ** log2N, R, P);
  return `scrypt$${2 ** log2N}$${R}$${P}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

interface Parsed {
  n: number;
  r: number;
  p: number;
  salt: Buffer;
  hash: Buffer;
}

function parse(stored: string): Parsed | null {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null;
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (![n, r, p].every(Number.isSafeInteger) || n < 2 ** 10 || n > 2 ** 20 || (n & (n - 1)) !== 0 || r < 1 || r > 32 || p < 1 || p > 4) {
    return null;
  }
  const salt = Buffer.from(parts[4] ?? '', 'base64url');
  const hash = Buffer.from(parts[5] ?? '', 'base64url');
  if (salt.length < 8 || hash.length !== KEY_LENGTH) return null;
  return { n, r, p, salt, hash };
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parse(stored);
  if (!parsed) return false;
  const key = await derive(password, parsed.salt, parsed.n, parsed.r, parsed.p);
  return timingSafeEqual(key, parsed.hash);
}

/** True when the stored hash uses weaker parameters than the current configuration. */
export function needsRehash(stored: string, log2N: number): boolean {
  const parsed = parse(stored);
  return !parsed || parsed.n < 2 ** log2N || parsed.r < R || parsed.p < P;
}

let dummy: Promise<string> | undefined;
/**
 * Verifies against a throw-away hash so that "unknown user" takes as long as "wrong password"
 * (prevents learning which usernames exist from the response time).
 */
export async function burnPasswordCheck(password: string, log2N: number): Promise<void> {
  dummy ??= hashPassword('not-a-real-password', log2N);
  await verifyPassword(password, await dummy);
}
