'use client';

import { convertAny, minorToPlain, parseDecimalToMinor } from '@/lib/rates';
import type { PublicRate } from '@/lib/rates';
import { formatAmountMinor } from '@/lib/money-display';
import type { CurrencyDTO } from '@/lib/types';
import { wheelLimits } from '@aurum/shared';
import { createContext, useContext, useEffect, useState } from 'react';

interface DisplayValue {
  display: CurrencyDTO | null;
  rates: PublicRate[];
  /** Stake limits of this game from the central rules, in minor units of the wallet currency. */
  limits: { min: string; max: string } | null;
}

const Ctx = createContext<DisplayValue>({ display: null, rates: [], limits: null });

/** Gives the game screens the visitor's display currency and the stored exchange rates. */
export function DisplayProvider({ display, rates, limits = null, children }: { display: CurrencyDTO | null; rates: PublicRate[]; limits?: { min: string; max: string } | null; children: React.ReactNode }) {
  return <Ctx.Provider value={{ display, rates, limits }}>{children}</Ctx.Provider>;
}

/** Smallest and largest stake of the game: the central rules when the page passed them, otherwise the built-in defaults. */
export function useGameLimits(currency: CurrencyDTO): { min: bigint; max: bigint } {
  const { limits } = useContext(Ctx);
  if (limits) return { min: BigInt(limits.min), max: BigInt(limits.max) };
  return wheelLimits(currency.decimals);
}

/** The display currency when it differs from the wallet currency and a rate is stored; otherwise null. */
function useActiveDisplay(currency: CurrencyDTO | null): { display: CurrencyDTO; rates: PublicRate[] } | null {
  const { display, rates } = useContext(Ctx);
  if (!currency || !display || display.code === currency.code) return null;
  if (convertAny((10n ** BigInt(currency.decimals)).toString(), currency, display, rates, 'down') === null) return null;
  return { display, rates };
}

/**
 * Formats an amount of the wallet currency in the currency the visitor chose ("≈"), with the real wallet amount
 * in brackets because bets are settled in the wallet currency.
 */
export function useMoneyFmt(currency: CurrencyDTO, locale: string): (minor: bigint | string) => string;
export function useMoneyFmt(currency: CurrencyDTO | null, locale: string): (minor: bigint | string) => string;
export function useMoneyFmt(currency: CurrencyDTO | null, locale: string): (minor: bigint | string) => string {
  const active = useActiveDisplay(currency);
  return (minor) => {
    if (!currency) return minor.toString();
    const real = formatAmountMinor(minor.toString(), currency, locale, 'full');
    if (!active) return real;
    const converted = convertAny(minor.toString(), currency, active.display, active.rates, 'down');
    return converted ? formatAmountMinor(converted, active.display, locale, 'full') : real;
  };
}

/** The currency the player sees amounts in, when it differs from the wallet currency; otherwise null. */
export function useShownCurrency(currency: CurrencyDTO | null): string | null {
  return useActiveDisplay(currency)?.display.code ?? null;
}

/**
 * Stake input. Shows and accepts the amount in the visitor's display currency when one is chosen and a rate exists;
 * `stake` / `setStake` always carry the plain decimal text of the wallet currency that is sent to the server.
 */
export function StakeField({
  stake,
  setStake,
  currency,
  disabled,
  label,
}: {
  stake: string;
  setStake: (v: string) => void;
  currency: CurrencyDTO;
  disabled: boolean;
  label: string;
}) {
  const active = useActiveDisplay(currency);
  const toText = (walletPlain: string): string => {
    if (!active) return walletPlain;
    const minor = parseDecimalToMinor(walletPlain, currency.decimals);
    if (minor === null) return '';
    const conv = convertAny(minor.toString(), currency, active.display, active.rates, 'down');
    return conv === null ? '' : minorToPlain(BigInt(conv), active.display.decimals);
  };
  const toWallet = (text: string): string | null => {
    if (!active) return text;
    const minor = parseDecimalToMinor(text, active.display.decimals);
    if (minor === null) return null;
    const conv = convertAny(minor.toString(), active.display, currency, active.rates, 'up');
    return conv === null ? null : minorToPlain(BigInt(conv), currency.decimals);
  };

  const [text, setText] = useState(() => toText(stake));
  // Re-sync when the stake is changed from outside (quick buttons) or the currency choice changes.
  useEffect(() => {
    if (toWallet(text) !== stake) setText(toText(stake));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stake, active?.display.code]);

  return (
    <>
      <label>
        {label} ({active ? active.display.code : currency.code})
      </label>
      <input
        inputMode="decimal"
        value={text}
        disabled={disabled}
        onChange={(e) => {
          setText(e.target.value);
          const w = toWallet(e.target.value);
          setStake(w ?? e.target.value);
        }}
      />
    </>
  );
}
