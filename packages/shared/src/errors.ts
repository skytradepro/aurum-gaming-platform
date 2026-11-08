/**
 * API error codes. Each code has an HTTP status and (for the user-facing ones) a message in
 * every language under `errors.codes.<code>` or `errors.<code>` in @aurum/i18n.
 */
export const ERROR_STATUS = {
  // generic
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  method_not_allowed: 405,
  validation: 422,
  conflict: 409,
  rate_limited: 429,
  csrf: 403,
  password_change_required: 403,
  payload_too_large: 413,
  unsupported_media_type: 415,
  internal_error: 500,
  // accounts
  invalid_credentials: 401,
  account_locked: 429,
  account_suspended: 403,
  registration_closed: 403,
  username_taken: 409,
  email_taken: 409,
  phone_taken: 409,
  under_age: 422,
  terms_required: 422,
  weak_password: 422,
  currency_unavailable: 422,
  country_unavailable: 422,
  user_not_found: 404,
  last_super_admin: 409,
  two_factor_invalid: 401,
  two_factor_expired: 401,
  two_factor_already_on: 409,
  // money
  insufficient_funds: 409,
  game_unavailable: 403,
  odds_changed: 409,
  bet_unavailable: 409,
  gift_unavailable: 409,
  gift_needs_deposit: 403,
  provider_unavailable: 503,
  provider_signature: 401,
  provider_session: 401,
  crypto_unavailable: 503,
  crypto_over_limit: 422,
  crypto_under_minimum: 422,
  crypto_too_many_open: 409,
  crypto_tx_not_found: 404,
  crypto_tx_invalid: 422,
  crypto_tx_pending: 409,
  crypto_tx_used: 409,
  idempotency_key_reuse: 409,
  wallet_not_found: 404,
  account_not_postable: 409,
  invalid_amount: 422,
  too_many_decimals: 422,
  ambiguous_separator: 422,
  out_of_range: 422,
  invalid_rate: 422,
  negative_not_allowed: 422,
  reason_required: 422,
  conversion_mismatch: 422,
  currency_in_use: 409,
  // uploads
  upload_invalid: 415,
  upload_too_large: 413,
  // shops and withdrawals collected at a shop
  shop_not_found: 404,
  shop_not_active: 409,
  shop_currency_mismatch: 422,
  shop_limit_exceeded: 422,
  shop_cash_insufficient: 409,
  shop_credit_insufficient: 409,
  staff_credit_insufficient: 409,
  operator_not_in_shop: 403,
  withdrawal_not_found: 404,
  withdrawal_not_pending: 409,
  withdrawal_expired: 409,
  withdrawals_closed: 403,
  withdrawal_needs_deposit: 409,
  withdrawal_too_many_open: 409,
  approval_not_found: 404,
  approval_code_invalid: 422,
  approval_expired: 409,
  approval_locked: 409,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && Object.hasOwn(ERROR_STATUS, value);
}

/** Field-level validation errors: field path -> message key under `validation` in @aurum/i18n. */
export type FieldErrors = Record<string, string>;

export interface AppErrorOptions {
  /** Technical message for logs; never shown to players. */
  message?: string;
  fields?: FieldErrors;
  details?: Record<string, unknown>;
  cause?: unknown;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly fields: FieldErrors | undefined;
  readonly details: Record<string, unknown> | undefined;

  constructor(code: ErrorCode, options: AppErrorOptions = {}) {
    super(options.message ?? code, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'AppError';
    this.code = code;
    this.status = ERROR_STATUS[code];
    this.fields = options.fields;
    this.details = options.details;
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}
