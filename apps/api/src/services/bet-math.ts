// Exact bet arithmetic: odds are whole numbers x100, money is in minor units, nothing is a floating point number.

/** stake x product of the odds, exact (odds are whole x100 numbers), rounded down to the smallest unit. */
export function payoutOf(stake: bigint, oddsX100: readonly number[]): bigint {
  let num = stake;
  let den = 1n;
  for (const o of oddsX100) {
    num *= BigInt(o);
    den *= 100n;
  }
  return num / den;
}

export function totalOdds(oddsX100: readonly number[]): string {
  let num = 1n;
  let den = 1n;
  for (const o of oddsX100) {
    num *= BigInt(o);
    den *= 100n;
  }
  const scaled = (num * 10000n) / den;
  const whole = scaled / 10000n;
  const frac = (scaled % 10000n).toString().padStart(4, '0');
  return `${whole}.${frac}`;
}
