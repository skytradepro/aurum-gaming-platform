import { cookies } from 'next/headers';
import { SITE_COOKIE_DISPLAY_CURRENCY, SITE_COOKIE_THEME } from './config';
import type { CurrencyDTO } from './types';

/**
 * The display currency is a viewing preference stored in a cookie. It only changes how demo figures are
 * shown; it never converts a balance or an accounting amount.
 */
export async function getDisplayCurrency(currencies: CurrencyDTO[]): Promise<CurrencyDTO | undefined> {
  const jar = await cookies();
  const wanted = jar.get(SITE_COOKIE_DISPLAY_CURRENCY)?.value;
  return currencies.find((c) => c.code === wanted) ?? currencies.find((c) => c.code === 'TND') ?? currencies[0];
}

export async function getTheme(): Promise<'dark' | 'light'> {
  const jar = await cookies();
  return jar.get(SITE_COOKIE_THEME)?.value === 'light' ? 'light' : 'dark';
}
