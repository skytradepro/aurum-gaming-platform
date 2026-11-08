import type { Queryable } from '@aurum/db';

/**
 * Pulls market rates from an exchange-rate provider and stores them (append-only) with the provider's
 * name and the time, so every figure shown can be traced to a source.
 *
 * `urlTemplate` contains {BASE}, for example https://open.er-api.com/v6/latest/{BASE}. The provider must
 * answer with JSON like { "rates": { "EUR": 0.3, "USD": 0.32 } }. Check the provider's terms before relying on it.
 */
export async function syncRates(db: Queryable, urlTemplate: string): Promise<{ stored: number; failed: string[] }> {
  const { rows } = await db.query<{ code: string }>('select code from currencies where is_enabled and kind = $1 order by code', ['fiat']);
  const codes = rows.map((r) => r.code);
  const source = new URL(urlTemplate.replace('{BASE}', 'XXX')).hostname;
  let stored = 0;
  const failed: string[] = [];
  for (const base of codes) {
    try {
      const res = await fetch(urlTemplate.replace('{BASE}', encodeURIComponent(base)), { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { rates?: Record<string, unknown> };
      for (const quote of codes) {
        if (quote === base) continue;
        const value = body.rates?.[quote];
        if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) continue;
        await db.query('insert into exchange_rates (base_currency, quote_currency, rate, source, note) values ($1, $2, $3, $4, $5)', [
          base,
          quote,
          value.toFixed(12),
          source,
          'automatic',
        ]);
        stored += 1;
      }
    } catch {
      failed.push(base);
    }
  }
  return { stored, failed };
}
