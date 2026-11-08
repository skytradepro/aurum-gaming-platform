'use client';

import type { CurrencyDTO } from '@/lib/types';
import { useLocale, useTranslations } from 'next-intl';
import { createContext, useContext, useEffect, useState } from 'react';
import { useMoneyFmt } from './DisplayContext';

export interface GameInfoValue {
  game: string;
  title: string;
  rules: string;
}

const Ctx = createContext<GameInfoValue | null>(null);

export function GameInfoProvider({ value, children }: { value: GameInfoValue; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const AI_OPEN_EVENT = 'hannibal-ai-open';

/** "Ask AI" button for the stake panel: opens Hannibal AI with this game as context. */
export function GameAiButton({ active = false }: { active?: boolean }) {
  const info = useContext(Ctx);
  const t = useTranslations('games');
  if (!info) return null;
  return (
    <button
      type="button"
      className={`ai-game-btn${active ? ' is-active' : ''}`}
      onClick={() =>
        window.dispatchEvent(
          new CustomEvent(AI_OPEN_EVENT, { detail: { page: `${info.title}. ${info.rules}`, question: t('aiQuestion', { game: info.title }) } }),
        )
      }
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/media/hannibal-logo-64.png" alt="" width={34} height={34} />
      <span>{t('aiAsk')}</span>
    </button>
  );
}

interface Win {
  username: string;
  currency: string;
  amountMinor: string;
  at: string;
}

/** Real recent wins of this game (last 7 days); hidden when there are none. */
export function GameWinners({ currency }: { currency: CurrencyDTO }) {
  const info = useContext(Ctx);
  const t = useTranslations('games');
  const locale = useLocale();
  const fmt = useMoneyFmt(currency, locale);
  const [items, setItems] = useState<Win[]>([]);

  useEffect(() => {
    if (!info) return;
    let alive = true;
    const load = () =>
      fetch(`/api/v1/public/winners/${info.game}`, { headers: { Accept: 'application/json' } })
        .then((r) => (r.ok ? r.json() : null))
        .then((b: { data?: { items: Win[] } } | null) => {
          if (alive && b?.data) setItems(b.data.items.filter((w) => w.currency === currency.code));
        })
        .catch(() => undefined);
    void load();
    const id = window.setInterval(load, 30_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [info, currency.code]);

  if (!info || items.length === 0) return null;
  return (
    <section className="game-winners">
      <h3>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0Z" />
          <path d="M17 5h3a3 3 0 0 1-3 4M7 5H4a3 3 0 0 0 3 4" />
        </svg>
        {t('winnersTitle', { game: info.title })}
      </h3>
      <div className="game-winners-track">
        {items.map((w, i) => (
          <div key={`${w.at}-${i}`} className="game-win" style={{ ['--i' as string]: i }}>
            <span>{w.username}</span>
            <b>{fmt(w.amountMinor)}</b>
          </div>
        ))}
      </div>
    </section>
  );
}
