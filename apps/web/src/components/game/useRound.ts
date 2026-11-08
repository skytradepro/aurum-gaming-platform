'use client';

import { errorMessageKey } from '@aurum/i18n';
import { ApiError, apiClient } from '@/lib/api';
import { useGameLimits, useMoneyFmt } from './DisplayContext';
import { parseDecimalToMinor } from '@/lib/rates';
import type { CurrencyDTO } from '@/lib/types';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { announce, playFreeSpinsShow, primeSound, readFreeSpins } from './freeSpins';

const VOICE_LANG: Record<string, string> = { en: 'en-US', fr: 'fr-FR', ar: 'ar-SA', tr: 'tr-TR', ru: 'ru-RU' };

export interface RoundResponse {
  roundId: string;
  game: string;
  win: boolean;
  multiplier: string;
  detail: Record<string, unknown>;
  stake: { amountMinor: string; currency: string };
  payout: { amountMinor: string; currency: string };
  balance: { amountMinor: string; currency: string };
}

export interface HistoryRow {
  id: string;
  multiplier: string;
  stake: string;
  payout: string;
}

export function plain(minor: bigint, decimals: number): string {
  const unit = 10n ** BigInt(decimals);
  const frac = (minor % unit).toString().padStart(decimals, '0');
  return decimals > 0 ? `${minor / unit}.${frac}` : `${minor}`;
}

/**
 * Shared state of every in-house game: stake, balance, one round at a time, errors, history.
 * ownFreeSpins: the game plays its free spins on its own reels (the shared free spins show is skipped).
 */
export function useRound({ endpoint, currency, locale, initialBalanceMinor, ownFreeSpins = false }: { endpoint: string; currency: CurrencyDTO; locale: string; initialBalanceMinor: string; ownFreeSpins?: boolean }) {
  const tRoot = useTranslations();
  const tf = useTranslations('freeSpins');
  const router = useRouter();
  const { min, max } = useGameLimits(currency);
  const [stake, setStake] = useState(plain(min * 10n > max ? min : min * 10n, currency.decimals));
  const [balance, setBalance] = useState(initialBalanceMinor);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RoundResponse | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);

  const fmt = useMoneyFmt(currency, locale);

  function quick(kind: 'half' | 'double' | 'min' | 'max') {
    try {
      const unit = 10n ** BigInt(currency.decimals);
      const [w = '0', f = ''] = stake.trim().split('.');
      const cur = BigInt(w || '0') * unit + BigInt(f.padEnd(currency.decimals, '0').slice(0, currency.decimals) || '0');
      let next = cur;
      if (kind === 'half') next = cur / 2n;
      if (kind === 'double') next = cur * 2n;
      if (kind === 'min') next = min;
      if (kind === 'max') next = max < BigInt(balance) ? max : BigInt(balance);
      if (next < min) next = min;
      if (next > max) next = max;
      setStake(plain(next, currency.decimals));
    } catch {
      setStake(plain(min, currency.decimals));
    }
  }

  /**
   * Sends one round. `animate` runs after the server answered and before the result is shown.
   * `over`: another endpoint of the same game, and what it costs when that is not the bet (bought spins).
   */
  async function play(extra: Record<string, unknown>, animate?: (res: RoundResponse) => Promise<void>, over?: { path?: string; costMinor?: bigint }): Promise<void> {
    if (busy) return;
    setError(null);
    setResult(null);
    const minor = parseDecimalToMinor(stake.trim(), currency.decimals);
    if (minor === null || minor <= 0n) {
      setError(tRoot('wheel.stakeInvalid' as never));
      return;
    }
    if (minor < min) {
      setError(tRoot('wheel.stakeTooLow' as never, { min: fmt(min) } as never));
      return;
    }
    if (minor > max) {
      setError(tRoot('wheel.stakeTooHigh' as never, { max: fmt(max) } as never));
      return;
    }
    if ((over?.costMinor ?? minor) > BigInt(balance)) {
      setError(tRoot('wheel.notEnoughBalance' as never, { balance: fmt(balance) } as never));
      return;
    }
    primeSound(); // still inside the player's tap: lets phones play the free spins sound and voice later
    setBusy(true);
    try {
      const res = await apiClient<RoundResponse>(over?.path ?? endpoint, { method: 'POST', json: { stake: stake.trim(), idempotencyKey: `r-${crypto.randomUUID()}`, ...extra } });
      const fs = ownFreeSpins ? null : readFreeSpins(res.detail);
      const lang = VOICE_LANG[locale] ?? 'en-US';
      // With free spins, the game first shows its own paid spin (without the free spins' winnings)...
      const shown: RoundResponse = fs
        ? {
            ...res,
            multiplier: fs.baseMultiplier,
            win: BigInt(fs.basePayoutMinor) > BigInt(res.stake.amountMinor),
            payout: { ...res.payout, amountMinor: fs.basePayoutMinor },
            balance: { ...res.balance, amountMinor: (BigInt(res.balance.amountMinor) - BigInt(fs.totalPayoutMinor) + BigInt(fs.basePayoutMinor)).toString() },
          }
        : res;
      if (animate) await animate(shown);
      if (fs) {
        // ...then the free spins show, then the full total lands in the balance.
        setBalance(shown.balance.amountMinor);
        await playFreeSpinsShow(fs, {
          labels: {
            title: tf('title', { count: fs.count }),
            sub: tf('sub', { stake: fmt(res.stake.amountMinor) }),
            spin: tf('spin', { n: '{n}' }),
            total: tf('total'),
            collect: tf('collect'),
            noWin: tf('noWin'),
            voiceStart: tf('voiceStart', { count: fs.count }),
            voiceWin: tf('voiceWin'),
            voiceBig: tf('voiceBig'),
            lang,
          },
          fmt: (m) => fmt(m),
          stakeMinor: res.stake.amountMinor,
          dir: locale === 'ar' ? 'rtl' : 'ltr',
        });
      } else if (BigInt(res.payout.amountMinor) >= BigInt(res.stake.amountMinor) * 10n) {
        announce(tf('voiceBig'), lang);
      }
      setResult(res);
      setHistory((h) => [{ id: res.roundId, multiplier: res.multiplier, stake: res.stake.amountMinor, payout: res.payout.amountMinor }, ...h].slice(0, 10));
      setBalance(res.balance.amountMinor);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        const fields = err.fields ? ` (${Object.keys(err.fields).join(', ')})` : '';
        setError(`${tRoot(errorMessageKey(err.code) as never)}${fields}`);
      } else {
        setError(tRoot('errors.generic' as never));
      }
    } finally {
      setBusy(false);
    }
  }

  return { stake, setStake, balance, busy, error, result, history, fmt, quick, play, min, max };
}
