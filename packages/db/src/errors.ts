import { AppError } from '@aurum/shared';
import type { ErrorCode } from '@aurum/shared';

/** SQLSTATE codes raised by Aurum's own database rules (see db/migrations). */
const CUSTOM_SQLSTATE: Readonly<Record<string, ErrorCode>> = {
  AU001: 'insufficient_funds',
  AU002: 'idempotency_key_reuse',
  AU003: 'wallet_not_found',
  AU004: 'account_not_postable',
  AU005: 'invalid_amount',
  AU006: 'reason_required',
  AU007: 'forbidden',
  AU008: 'conversion_mismatch',
  AU009: 'out_of_range',
  AU010: 'validation',
  AU011: 'validation',
  AU012: 'validation',
  AU013: 'user_not_found',
  AU101: 'under_age',
  AU102: 'forbidden',
  AU103: 'last_super_admin',
  AU104: 'conflict',
  AU105: 'conflict',
  AU201: 'currency_in_use',
  AU301: 'shop_not_found',
  AU302: 'shop_not_active',
  AU303: 'shop_currency_mismatch',
  AU304: 'shop_limit_exceeded',
  AU305: 'shop_cash_insufficient',
  AU306: 'operator_not_in_shop',
  AU307: 'shop_credit_insufficient',
  AU308: 'staff_credit_insufficient',
  AU311: 'withdrawal_not_found',
  AU312: 'withdrawal_not_pending',
  AU313: 'withdrawal_expired',
  AU320: 'withdrawal_needs_deposit',
  AU321: 'withdrawal_too_many_open',
  AU901: 'internal_error',
  AU902: 'internal_error',
  AU903: 'internal_error',
  AU904: 'internal_error',
  AU905: 'internal_error',
  AU906: 'internal_error',
  AU907: 'internal_error',
  AU908: 'internal_error',
  AU909: 'internal_error',
};

/** Unique constraints that deserve a specific message for the player. */
const UNIQUE_CONSTRAINTS: Readonly<Record<string, ErrorCode>> = {
  users_username_ci: 'username_taken',
  users_email_ci: 'email_taken',
  users_phone_uq: 'phone_taken',
  ledger_idempotency_unique: 'idempotency_key_reuse',
  shop_cash_idempotency_unique: 'idempotency_key_reuse',
};

export interface PgErrorLike {
  code?: string;
  constraint?: string;
  message?: string;
  detail?: string;
}

export function isPgError(value: unknown): value is PgErrorLike {
  return typeof value === 'object' && value !== null && typeof (value as PgErrorLike).code === 'string';
}

/** SQLSTATEs that mean "run the transaction again". */
export function isRetryable(error: unknown): boolean {
  return isPgError(error) && (error.code === '40001' || error.code === '40P01');
}

/**
 * Converts a database error into an AppError that is safe to show (no SQL, no table names).
 * Returns null when the error is not one we know how to translate (treat it as an internal error).
 */
export function mapDbError(error: unknown): AppError | null {
  if (error instanceof AppError) return error;
  if (!isPgError(error) || !error.code) return null;
  const { code } = error;
  const custom = CUSTOM_SQLSTATE[code];
  if (custom) return new AppError(custom, { message: error.message, cause: error });
  if (code === '23505') {
    const mapped = error.constraint ? UNIQUE_CONSTRAINTS[error.constraint] : undefined;
    return new AppError(mapped ?? 'conflict', { message: error.message, cause: error });
  }
  if (code === '23514' || code === '23502' || code === '22P02' || code === '22001' || code === '22003' || code === '22007' || code === '22008') {
    return new AppError('validation', { message: error.message, cause: error });
  }
  if (code === '23503') return new AppError('conflict', { message: error.message, cause: error });
  if (code === '40001' || code === '40P01') return new AppError('conflict', { message: error.message, cause: error });
  return null;
}
