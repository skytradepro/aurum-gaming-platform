import { isPgError } from '@aurum/db';
import { MoneyError } from '@aurum/money';
import type { MoneyErrorCode } from '@aurum/money';
import { AppError } from '@aurum/shared';
import type { ErrorCode } from '@aurum/shared';

const MONEY_TO_APP: Readonly<Record<MoneyErrorCode, ErrorCode>> = {
  invalid_amount: 'invalid_amount',
  too_many_decimals: 'too_many_decimals',
  negative_not_allowed: 'negative_not_allowed',
  out_of_range: 'out_of_range',
  ambiguous_separator: 'ambiguous_separator',
  invalid_rate: 'invalid_rate',
  invalid_decimals: 'internal_error',
  invalid_currency: 'validation',
  currency_mismatch: 'validation',
  division_by_zero: 'internal_error',
};

/** Turns a money-library error into an AppError that carries a translatable code. */
export function fromMoneyError(error: MoneyError): AppError {
  return new AppError(MONEY_TO_APP[error.code], { message: error.message, cause: error });
}

/** Runs `work`, converting MoneyError into AppError. Other errors pass through unchanged. */
export function money<T>(work: () => T): T {
  try {
    return work();
  } catch (error) {
    if (error instanceof MoneyError) throw fromMoneyError(error);
    throw error;
  }
}

/**
 * A duplicate slug is reported against the `slug` field, so the dashboard form can show the message
 * next to it. Database errors reach us already translated (the original is the `cause`).
 * Other errors are returned unchanged.
 */
export function slugConflict(error: unknown): unknown {
  const raw = error instanceof AppError && error.code === 'conflict' ? error.cause : error;
  if (isPgError(raw) && raw.code === '23505' && typeof raw.constraint === 'string' && raw.constraint.endsWith('_slug_key')) {
    return new AppError('conflict', { fields: { slug: 'alreadyExists' }, message: raw.message ?? 'duplicate slug', cause: raw });
  }
  return error;
}
