import { formatMoney, fromDTO } from '@aurum/money';
import type { CurrencyConfig } from '@aurum/money';
import type { CurrencyDTO } from './types';

export function currencyConfigFromDto(dto: CurrencyDTO): CurrencyConfig {
  return {
    code: dto.code,
    decimals: dto.decimals,
    ...(dto.displayDecimals !== null ? { displayDecimals: dto.displayDecimals } : {}),
    display: dto.display,
  };
}

export function formatAmountMinor(amountMinor: string, currency: CurrencyDTO, locale: string, mode: 'full' | 'display' = 'display'): string {
  const cfg = currencyConfigFromDto(currency);
  return formatMoney(fromDTO({ amountMinor, currency: currency.code }), cfg, locale, { mode, symbol: 'symbol' });
}

export function findCurrency(currencies: CurrencyDTO[], code: string | null | undefined): CurrencyDTO | undefined {
  if (!code) return undefined;
  return currencies.find((c) => c.code === code);
}
