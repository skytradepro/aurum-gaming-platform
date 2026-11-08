'use client';

import { apiClient } from '@/lib/api';
import { findCurrency, formatAmountMinor } from '@/lib/money-display';
import type { CurrencyDTO } from '@/lib/types';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

interface PlayerApproval {
  id: string;
  shop: { name: string; city: string };
  amount: { amountMinor: string; currency: string };
  code: string;
  expiresAt: string;
}

/** For signed-in players: shows the one-time code when a shop asks to pay them a withdrawal. Checks every few seconds. */
export function ApprovalAlert({ currencies, locale }: { currencies: CurrencyDTO[]; locale: string }) {
  const t = useTranslations('approvalAlert');
  const [items, setItems] = useState<PlayerApproval[]>([]);

  useEffect(() => {
    let stop = false;
    const load = async () => {
      if (document.hidden) return;
      try {
        const res = await apiClient<{ items: PlayerApproval[] }>('/account/approvals');
        if (!stop) setItems(res.items);
      } catch {
        /* signed out or offline: try again later */
      }
    };
    void load();
    const timer = setInterval(() => void load(), 5000);
    const onVisible = () => void load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stop = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  async function refuse(id: string) {
    try {
      await apiClient(`/account/approvals/${id}/refuse`, { method: 'POST' });
    } catch {
      /* already closed */
    }
    setItems((list) => list.filter((a) => a.id !== id));
  }

  const a = items[0];
  if (!a) return null;
  const cur = findCurrency(currencies, a.amount.currency);
  const amount = cur ? formatAmountMinor(a.amount.amountMinor, cur, locale, 'full') : `${a.amount.amountMinor} ${a.amount.currency}`;
  return (
    <div className="aa-wrap" role="alertdialog" aria-labelledby="aa-title">
      <div className="aa-card">
        <h3 id="aa-title">{t('title')}</h3>
        <p>{t('body', { shop: `${a.shop.name}${a.shop.city ? `, ${a.shop.city}` : ''}`, amount })}</p>
        <div className="aa-code" dir="ltr">
          {a.code.slice(0, 3)} {a.code.slice(3)}
        </div>
        <p className="aa-warn">{t('warn')}</p>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void refuse(a.id)}>
          {t('refuse')}
        </button>
      </div>
    </div>
  );
}
