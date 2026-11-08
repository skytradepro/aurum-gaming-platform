/**
 * Aurum Wheel: an in-house game. The API picks the segment on the server; the website only animates it.
 * Both sides read this one table, so the picture always matches the result.
 */
export interface WheelSegment {
  /** Payout = stake * num / den (rounded down). 0 means the stake is lost. */
  num: number;
  den: number;
  label: string;
}

const seg = (num: number, den: number, label: string): WheelSegment => ({ num, den, label });
const L = seg(0, 1, '0×');
const H = seg(1, 2, '0.5×');
const O = seg(1, 1, '1×');
const D = seg(2, 1, '2×');
const T = seg(10, 1, '10×');

/** 24 segments: 10 × 0, 7 × 0.5, 3 × 1, 3 × 2, 1 × 10. Return to player = 22.5/24 = 93.75%. */
export const WHEEL_SEGMENTS: readonly WheelSegment[] = [L, H, L, O, L, D, L, H, L, O, L, T, H, L, H, H, L, D, H, L, O, H, D, L];

export const WHEEL_RTP_PERCENT = (WHEEL_SEGMENTS.reduce((sum, s) => sum + s.num / s.den, 0) / WHEEL_SEGMENTS.length) * 100;

/** Stake limits in minor units for a currency with `decimals` decimals: 0.1 .. 20 whole units. */
export function wheelLimits(decimals: number): { min: bigint; max: bigint } {
  const unit = 10n ** BigInt(decimals);
  const min = decimals >= 1 ? unit / 10n : 1n;
  return { min, max: unit * 20n };
}
