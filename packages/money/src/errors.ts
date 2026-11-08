export type MoneyErrorCode =
  | 'invalid_amount'
  | 'too_many_decimals'
  | 'negative_not_allowed'
  | 'out_of_range'
  | 'ambiguous_separator'
  | 'invalid_decimals'
  | 'invalid_currency'
  | 'currency_mismatch'
  | 'invalid_rate'
  | 'division_by_zero';

/**
 * Every failure of this package is a MoneyError with a stable machine-readable code.
 * Messages are for developers/logs; user-facing text must be translated from `code`.
 */
export class MoneyError extends Error {
  readonly code: MoneyErrorCode;

  constructor(code: MoneyErrorCode, message: string) {
    super(message);
    this.name = 'MoneyError';
    this.code = code;
  }
}

/** Keep untrusted input out of logs/messages in unbounded form. */
export function clip(input: unknown, max = 40): string {
  const s = typeof input === 'string' ? input : String(input);
  return s.length > max ? `${s.slice(0, max)}...` : s;
}
