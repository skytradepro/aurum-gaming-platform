import { createHmac, timingSafeEqual } from 'node:crypto';

/** HMAC-SHA256 uppercase hex (API LX Seamless Wallet V2). */
export function apilxSign(secret: string, message: string): string {
  return createHmac('sha256', secret).update(message, 'utf8').digest('hex').toUpperCase();
}

/** Amounts in sign strings use exactly two decimal places. */
export function apilxAmountPart(value: unknown): string {
  if (value === null || value === undefined) return '';
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(n)) return '';
  return n.toFixed(2);
}

export function apilxSignOk(secret: string, message: string, sign: unknown): boolean {
  if (typeof sign !== 'string' || !/^[0-9a-fA-F]{64}$/.test(sign)) return false;
  const want = Buffer.from(apilxSign(secret, message), 'hex');
  const got = Buffer.from(sign.toUpperCase(), 'hex');
  return want.length === got.length && timingSafeEqual(want, got);
}

/** Returns true if any configured provider secret validates the sign. */
export function apilxSignAny(secrets: readonly string[], message: string, sign: unknown): boolean {
  return secrets.some((s) => apilxSignOk(s, message, sign));
}

export const APILX_SIGN = {
  getBalance: (b: Record<string, unknown>) =>
    `${str(b.agentID)}${str(b.userID)}${str(b.gameID)}`,
  withdraw: (b: Record<string, unknown>) =>
    `${str(b.agentID)}${str(b.userID)}${apilxAmountPart(b.amount)}${str(b.transactionID)}${str(b.roundID)}${str(b.gameID)}`,
  deposit: (b: Record<string, unknown>) =>
    `${str(b.agentID)}${str(b.userID)}${apilxAmountPart(b.amount)}${str(b.refTransactionID)}${str(b.transactionID)}${str(b.roundID)}${str(b.gameID)}`,
  betWin: (b: Record<string, unknown>) =>
    `${str(b.agentID)}${str(b.userID)}${apilxAmountPart(b.betAmount)}${apilxAmountPart(b.winAmount)}${str(b.transactionID)}${str(b.roundID)}${str(b.gameID)}`,
  rollback: (b: Record<string, unknown>) =>
    `${str(b.agentID)}${str(b.userID)}${str(b.refTransactionID)}${str(b.gameID)}`,
} as const;

function str(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return String(v);
}
