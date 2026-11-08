'use client';

import '@/styles/toasts.css';
import { apiClient } from '@/lib/api';
import { Link, usePathname } from '@/i18n/routing';
import { findCurrency, formatAmountMinor } from '@/lib/money-display';
import { odds, pickLabel } from '@/lib/sports-labels';
import type { SbT } from '@/lib/sports-labels';
import type { SlipItem } from '@/lib/sports-slip';
import type { CurrencyDTO } from '@/lib/types';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';

interface Toast {
  id: number;
  kind: 'slip' | 'win' | 'gift' | 'game' | 'feed';
  icon: string;
  title: string;
  text?: string;
  href?: string;
  cta?: string;
}

const LOBBY = new Set(['/', '/casino', '/sports', '/live-betting', '/promotions', '/live-casino']);
const SHOW_MS = 5200;
const FEED_MAX = 3;

const store = {
  get(key: string, session = false): string | null {
    try {
      return (session ? sessionStorage : localStorage).getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string, session = false) {
    try {
      (session ? sessionStorage : localStorage).setItem(key, value);
    } catch {
      /* private mode */
    }
  },
};

let configPromise: Promise<CurrencyDTO[]> | null = null;
const currencies = () => (configPromise ??= apiClient<{ currencies: CurrencyDTO[] }>('/public/config').then((c) => c.currencies).catch(() => []));

/**
 * Small notices that never get in the way: one at a time, top corner, gone after 5 seconds, never while a game is open.
 * Bet slip added, a bet that won, the daily gift is ready, continue the last game, and now and then a real big win of
 * the week (usernames hidden; the player can switch those off).
 */
export function SiteToasts() {
  const t = useTranslations('toasts');
  const ts = useTranslations('sbk') as unknown as SbT;
  const tg = useTranslations('games');
  const locale = useLocale();
  const pathname = usePathname();
  const [queue, setQueue] = useState<Toast[]>([]);
  const [hover, setHover] = useState(false);
  const seq = useRef(0);
  const isGame = pathname.startsWith('/casino/');
  const current = queue[0];

  const push = useCallback((toast: Omit<Toast, 'id'>) => {
    seq.current += 1;
    const id = seq.current;
    setQueue((q) => (q.length >= 3 ? q : [...q, { ...toast, id }]));
  }, []);
  const next = useCallback(() => setQueue((q) => q.slice(1)), []);

  useEffect(() => {
    if (!current || hover) return;
    const timer = setTimeout(next, SHOW_MS);
    return () => clearTimeout(timer);
  }, [current, hover, next]);

  // a game is open: no notices at all
  useEffect(() => {
    if (isGame) setQueue([]);
  }, [isGame]);

  // bet slip: what was added, single or accumulator
  useEffect(() => {
    const onAdd = (e: Event) => {
      const d = (e as CustomEvent<{ item: SlipItem; count: number }>).detail;
      if (!d) return;
      const i = d.item;
      push({
        kind: 'slip',
        icon: '🎟️',
        title: t('slipAdded'),
        text: `${i.home} – ${i.away} · ${pickLabel(ts, i, i.home, i.away)} @ ${odds(i.oddsX100)}`,
        href: '#bet-slip',
        cta: d.count > 1 ? t('acca', { n: d.count }) : t('single'),
      });
    };
    window.addEventListener('hb:slip-added', onAdd);
    return () => window.removeEventListener('hb:slip-added', onAdd);
  }, [push, t, ts]);

  // remember the last game played; offer to continue it from the lobby (once per visit)
  useEffect(() => {
    if (isGame) {
      const timer = setTimeout(() => {
        const name = (document.querySelector('.site-main h1') ?? document.querySelector('h1'))?.textContent?.trim();
        if (name) store.set('hb-last-game', JSON.stringify({ href: pathname, name: name.slice(0, 60) }));
      }, 4000);
      return () => clearTimeout(timer);
    }
    if ((pathname === '/' || pathname === '/casino') && !store.get('hb-cont', true)) {
      const timer = setTimeout(() => {
        try {
          const last = JSON.parse(store.get('hb-last-game') ?? 'null') as { href: string; name: string } | null;
          if (last && typeof last.href === 'string' && last.href.startsWith('/casino/') && typeof last.name === 'string') {
            store.set('hb-cont', '1', true);
            push({ kind: 'game', icon: '🎰', title: t('cont'), text: last.name, href: last.href, cta: t('play') });
          }
        } catch {
          /* nothing saved */
        }
      }, 3500);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [isGame, pathname, push, t]);

  // a bet that won since the last visit, and the daily gift (players only; checked every 2 minutes)
  useEffect(() => {
    if (isGame) return;
    let stop = false;
    const check = async () => {
      if (document.hidden) return;
      try {
        const page = await apiClient<{ items: { id: string; status: string; currency: string; payoutMinor: string; settledAt: string | null }[] }>('/bets/mine?limit=10');
        const seen = store.get('hb-bets-seen');
        const newest = page.items.reduce((m, b) => (b.settledAt && b.settledAt > m ? b.settledAt : m), seen ?? '');
        if (seen) {
          const list = await currencies();
          for (const b of page.items) {
            if (stop || b.status !== 'won' || !b.settledAt || b.settledAt <= seen) continue;
            const cur = findCurrency(list, b.currency);
            push({ kind: 'win', icon: '🏆', title: t('betWon', { id: b.id }), text: cur ? `+${formatAmountMinor(b.payoutMinor, cur, locale)}` : undefined, href: '/account/bets', cta: t('viewBets') });
          }
        }
        if (newest) store.set('hb-bets-seen', newest);
        else if (!seen) store.set('hb-bets-seen', new Date().toISOString());
      } catch {
        return; // a visitor (not signed in) or a staff account: nothing to show
      }
      if (!LOBBY.has(pathname)) return;
      const day = new Date().toISOString().slice(0, 10);
      if (store.get('hb-gift-told') === day) return;
      try {
        const gift = await apiClient<{ state: string }>('/gift');
        if (!stop && gift.state === 'ready') {
          store.set('hb-gift-told', day);
          push({ kind: 'gift', icon: '🎁', title: t('giftReady'), href: '/gift', cta: t('giftOpen') });
        }
      } catch {
        /* gift not available */
      }
    };
    const first = setTimeout(() => void check(), 2500);
    const timer = setInterval(() => void check(), 120_000);
    return () => {
      stop = true;
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [isGame, pathname, push, t, locale]);

  // now and then a real big win of the week (lobby pages only, at most 3 per visit, can be switched off)
  useEffect(() => {
    if (!LOBBY.has(pathname) || store.get('hb-feed') === 'off') return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = async () => {
      const shown = Number(store.get('hb-feed-n', true) ?? '0');
      if (stop || shown >= FEED_MAX) return;
      try {
        const [wins, list] = await Promise.all([apiClient<{ items: { username: string; game: string; currency: string; amountMinor: string }[] }>('/public/winners'), currencies()]);
        const w = wins.items[shown % Math.max(1, wins.items.length)];
        const cur = w ? findCurrency(list, w.currency) : undefined;
        if (stop || !w || !cur || document.hidden) return;
        store.set('hb-feed-n', String(shown + 1), true);
        const known = (tg as unknown as { has: (k: string) => boolean }).has(`${w.game}Title`);
        push({ kind: 'feed', icon: '💰', title: t('bigWin'), text: `${w.username} · +${formatAmountMinor(w.amountMinor, cur, locale)}${known ? ` · ${tg(`${w.game}Title` as never)}` : ''}` });
      } catch {
        return;
      }
      timer = setTimeout(() => void run(), 70_000);
    };
    timer = setTimeout(() => void run(), 25_000);
    return () => {
      stop = true;
      if (timer) clearTimeout(timer);
    };
  }, [pathname, push, t, tg, locale]);

  if (!current || isGame) return null;
  return (
    <div className="hb-toasts" aria-live="polite">
      <div key={current.id} className={`hb-toast is-${current.kind}`} role="status" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
        <span className="hb-toast-icon" aria-hidden="true">
          {current.icon}
        </span>
        <div className="hb-toast-body">
          <b>{current.title}</b>
          {current.text ? <span>{current.text}</span> : null}
          {current.href && current.cta ? (
            current.href.startsWith('#') ? (
              <a href={current.href} onClick={next}>
                {current.cta} ›
              </a>
            ) : (
              <Link href={current.href} onClick={next}>
                {current.cta} ›
              </Link>
            )
          ) : null}
        </div>
        {current.kind === 'feed' ? (
          <button
            type="button"
            className="hb-toast-x"
            title={t('mute')}
            aria-label={t('mute')}
            onClick={() => {
              store.set('hb-feed', 'off');
              next();
            }}
          >
            🔕
          </button>
        ) : null}
        <button type="button" className="hb-toast-x" aria-label={t('close')} onClick={next}>
          ✕
        </button>
        <i className="hb-toast-time" style={{ animationDuration: `${SHOW_MS}ms`, animationPlayState: hover ? 'paused' : 'running' }} />
      </div>
    </div>
  );
}
