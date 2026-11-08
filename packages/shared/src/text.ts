/** Text helpers for names, e-mail, phone numbers, ages and passwords. Pure functions. */
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from './constants.ts';

export function normalizeEmail(input: string): string {
  return input.normalize('NFKC').trim().toLowerCase();
}

/** "+216", "00216" or "216" -> "216". Returns null when it is not a plausible calling code. */
export function normalizeCallingCode(input: string): string | null {
  const s = input.trim().replace(/^(\+|00)/, '');
  return /^[1-9]\d{0,3}$/.test(s) ? s : null;
}

/**
 * Builds an E.164 number ("+21620123456") from a calling code and the national number as typed.
 * Spaces, dots, dashes and brackets are ignored; one leading trunk "0" is dropped.
 * Returns null when the result cannot be a valid number (7 to 15 digits in total).
 */
export function toE164(callingCode: string, national: string): string | null {
  const cc = normalizeCallingCode(callingCode);
  if (!cc) return null;
  const cleaned = national.normalize('NFKC').replace(/[\s.\-()]/g, '');
  if (!/^\d+$/.test(cleaned)) return null;
  const digits = cleaned.length > 1 ? cleaned.replace(/^0/, '') : cleaned;
  const total = cc.length + digits.length;
  if (digits.length < 4 || total < 7 || total > 15) return null;
  return `+${cc}${digits}`;
}

/** "player123" -> "p****3" (first and last character only; never reveals more). */
export function maskUsername(username: string): string {
  const chars = [...username];
  if (chars.length <= 1) return '****';
  if (chars.length === 2) return `${chars[0]}****`;
  return `${chars[0]}****${chars[chars.length - 1]}`;
}

/** Whole years between a date of birth and a given day (both YYYY-MM-DD). */
export function ageOn(dateOfBirth: string, onDate: string): number {
  const [by, bm, bd] = dateOfBirth.split('-').map(Number) as [number, number, number];
  const [ty, tm, td] = onDate.split('-').map(Number) as [number, number, number];
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return age;
}

/** Today's date in UTC as YYYY-MM-DD. */
export function todayUtc(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

const COMMON_PASSWORDS = new Set([
  '1234567890', '12345678901', '123456789012', '0123456789', '1111111111', '0000000000',
  'password12', 'password123', 'password1234', 'password12345', 'passw0rd123', 'p@ssw0rd123',
  'qwertyuiop', 'qwerty1234', 'qwerty12345', 'qwertyuiop1', 'azertyuiop', 'azerty1234', 'azerty12345',
  '1q2w3e4r5t', '1qaz2wsx3e', 'abcdefghij1', 'abcd123456', 'abc1234567', 'abc123456789',
  'iloveyou12', 'iloveyou123', 'letmein1234', 'welcome123', 'welcome1234', 'welcome12345',
  'admin12345', 'admin123456', 'administrator1', 'changeme123', 'changeme1234', 'trustno1234',
  'football123', 'football1234', 'monkey1234', 'dragon1234', 'master12345', 'superman123',
  'casino1234', 'casino12345', 'poker12345', 'jackpot123', 'jackpot1234', 'bet1234567',
  'motdepasse1', 'motdepasse123', 'bonjour1234', 'soleil1234', 'azerty123456',
]);

export type PasswordProblem =
  | 'passwordTooShort'
  | 'tooLong'
  | 'passwordNeedsLetterAndDigit'
  | 'passwordTooCommon'
  | 'passwordContainsIdentity';

/**
 * Password policy: 10-128 characters, at least one letter and one digit, not a well-known weak
 * password, and not built from the username or the e-mail name. Returns null when acceptable.
 */
export function passwordProblem(
  password: string,
  context: { username?: string; email?: string } = {},
): PasswordProblem | null {
  if (password.length < PASSWORD_MIN_LENGTH) return 'passwordTooShort';
  if (password.length > PASSWORD_MAX_LENGTH) return 'tooLong';
  if (!/\p{L}/u.test(password) || !/\p{Nd}/u.test(password)) return 'passwordNeedsLetterAndDigit';
  const lower = password.normalize('NFKC').toLowerCase();
  if (COMMON_PASSWORDS.has(lower) || /^(.)\1+$/.test(lower)) return 'passwordTooCommon';
  const identities = [context.username, context.email?.split('@')[0]]
    .filter((s): s is string => typeof s === 'string' && s.length >= 5)
    .map((s) => s.normalize('NFKC').toLowerCase());
  if (identities.some((id) => lower === id || lower.includes(id))) return 'passwordContainsIdentity';
  return null;
}
