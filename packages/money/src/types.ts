/** Locales with built-in number formatting rules. Unknown locales fall back to `en`. */
export type FormatLocale = 'en' | 'fr' | 'ar';

export type RoundingMode = 'half-up' | 'half-even' | 'down' | 'up';

export type SymbolPlacement = 'prefix' | 'suffix';

/** How a currency is written in one locale. Presentation only; never affects accounting. */
export interface CurrencyDisplayRule {
  readonly symbol: string;
  readonly placement: SymbolPlacement;
  /** Put a non-breaking space between symbol and number. */
  readonly spacing: boolean;
}

/**
 * Currency configuration (mirrors the `currencies` table).
 *
 * - `decimals` is the ACCOUNTING precision: amounts are stored as integers in 10^-decimals units.
 *   It can never change once the currency has been used.
 * - `displayDecimals` is PRESENTATION only (player-facing summaries). Ledger statements,
 *   admin screens and reports always use `decimals`.
 */
export interface CurrencyConfig {
  readonly code: string;
  readonly decimals: number;
  readonly displayDecimals?: number;
  readonly display: { readonly default: CurrencyDisplayRule } & Partial<Record<FormatLocale, CurrencyDisplayRule>>;
}

/** An exact monetary amount. `amountMinor` is an integer count of minor units (never a float). */
export interface Money {
  readonly amountMinor: bigint;
  readonly currency: string;
}

/** JSON-safe representation used on the wire (BigInt cannot be serialised by JSON.stringify). */
export interface MoneyDTO {
  readonly amountMinor: string;
  readonly currency: string;
}
