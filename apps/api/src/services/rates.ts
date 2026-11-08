import type { Queryable } from '@aurum/db';
import { convertMinor } from '@aurum/money';
import { trimRate } from '@aurum/ledger';

export interface RateRow {
  base: string;
  quote: string;
  rate: string;
  source: string;
  effectiveAt: string;
}

/** The most recent rate entered for exactly this pair (1 base = rate quote). No inverse, no triangulation. */
export async function latestRate(q: Queryable, base: string, quote: string): Promise<RateRow | null> {
  const { rows } = await q.query<{ base_currency: string; quote_currency: string; rate: string; source: string; effective_at: Date }>(
    `select base_currency, quote_currency, rate::text, source, effective_at
       from exchange_rates
      where base_currency = $1 and quote_currency = $2 and effective_at <= now()
      order by effective_at desc, id desc limit 1`,
    [base, quote],
  );
  const r = rows[0];
  return r ? { base: r.base_currency, quote: r.quote_currency, rate: trimRate(r.rate), source: r.source, effectiveAt: r.effective_at.toISOString() } : null;
}

export interface Indicative {
  amountMinor: string;
  currency: string;
  rate: string;
  asOf: string;
  source: string;
}

/**
 * "About X in your display currency" for information only. The balance itself never changes
 * currency. Rounds DOWN so the indicative figure can never overstate what the player has.
 */
export async function indicativeAmount(
  q: Queryable,
  args: { amountMinor: bigint; from: string; to: string },
): Promise<Indicative | null> {
  if (args.from === args.to) return null;
  const rate = await latestRate(q, args.from, args.to);
  if (!rate) return null;
  const { rows } = await q.query<{ code: string; decimals: number }>('select code, decimals::int from currencies where code = any($1::text[])', [[args.from, args.to]]);
  const from = rows.find((r) => r.code === args.from);
  const to = rows.find((r) => r.code === args.to);
  if (!from || !to) return null;
  const amount = convertMinor({ amountMinor: args.amountMinor, fromDecimals: from.decimals, toDecimals: to.decimals, rate: rate.rate, rounding: 'down' });
  return { amountMinor: amount.toString(), currency: args.to, rate: rate.rate, asOf: rate.effectiveAt, source: rate.source };
}

export interface PublicRate {
  base: string;
  quote: string;
  rate: string;
  source: string;
  asOf: string;
}

/** The newest stored rate of every pair between enabled currencies. Used for "about X" display only. */
export async function latestRates(q: Queryable): Promise<PublicRate[]> {
  const { rows } = await q.query<{ base_currency: string; quote_currency: string; rate: string; source: string; effective_at: Date }>(
    `select distinct on (r.base_currency, r.quote_currency)
            r.base_currency, r.quote_currency, r.rate::text, r.source, r.effective_at
       from exchange_rates r
       join currencies b on b.code = r.base_currency and b.is_enabled
       join currencies c on c.code = r.quote_currency and c.is_enabled
      where r.effective_at <= now()
      order by r.base_currency, r.quote_currency, r.effective_at desc, r.id desc`,
  );
  return rows.map((r) => ({ base: r.base_currency, quote: r.quote_currency, rate: trimRate(r.rate), source: r.source, asOf: r.effective_at.toISOString() }));
}
