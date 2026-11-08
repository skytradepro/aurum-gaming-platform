'use client';

import { apiClient } from '@/lib/api';
import { findCurrency, formatAmountMinor } from '@/lib/money-display';
import type { CurrencyDTO } from '@/lib/types';
import { Link, usePathname, useRouter } from '@/i18n/routing';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

/** Shown once right after a new account is created (/account?welcome=1): a dancing joker, confetti and the welcome gift. */
export function WelcomeJoker({ currencies, locale }: { currencies: CurrencyDTO[]; locale: string }) {
  const t = useTranslations('welcome');
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [show, setShow] = useState(false);
  const [gift, setGift] = useState<string | null>(null);

  useEffect(() => {
    if (params.get('welcome') !== '1') return;
    setShow(true);
    // The real gift amount from the ledger (nothing is shown if there was no gift).
    void apiClient<{ items: { amount: { amountMinor: string; currency: string } }[] }>('/account/transactions?type=welcome_gift&limit=1')
      .then((page) => {
        const item = page.items[0];
        const cur = item ? findCurrency(currencies, item.amount.currency) : undefined;
        if (item && cur) setGift(formatAmountMinor(item.amount.amountMinor, cur, locale, 'full'));
      })
      .catch(() => setGift(null));
  }, [params, currencies, locale]);

  function close() {
    setShow(false);
    router.replace(pathname);
  }

  if (!show) return null;
  return (
    <div className="wj-overlay" role="dialog" aria-modal="true" aria-label={t('title')} onClick={close}>
      <div className="wj-confetti" aria-hidden="true">
        {Array.from({ length: 36 }, (_, i) => (
          <i key={i} style={{ ['--x' as string]: `${(i * 37) % 100}%`, ['--d' as string]: `${(i % 9) * 0.18}s`, ['--c' as string]: ['#ffd34d', '#ef4444', '#22c55e', '#3b82f6', '#a855f7', '#f97316'][i % 6] }} />
        ))}
      </div>
      <div className="wj-card" onClick={(e) => e.stopPropagation()}>
        <div className="wj-joker">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/media/welcome-joker.svg" alt="" draggable={false} />
        </div>
        <p className="wj-kicker">HANNIBAL CASINO</p>
        <h2 className="wj-title">{t('title')}</h2>
        {gift ? (
          <p className="wj-gift">
            {t('gift')} <b>{gift}</b>
          </p>
        ) : null}
        <p className="wj-sub">{t('sub')}</p>
        <div className="wj-actions">
          <Link href="/casino" className="btn btn-gold" onClick={() => setShow(false)}>
            {t('play')}
          </Link>
          <button type="button" className="btn btn-ghost" onClick={close}>
            {t('close')}
          </button>
        </div>
      </div>
    </div>
  );
}
