'use client';

import { errorMessageKey } from '@aurum/i18n';
import { ApiError, apiClient } from '@/lib/api';
import { findCurrency, formatAmountMinor } from '@/lib/money-display';
import type { CurrencyDTO } from '@/lib/types';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export interface AdminOnlineItem {
  id: string;
  method: 'bank' | 'crypto';
  status: 'pending' | 'paid' | 'cancelled' | 'rejected';
  amount: { amountMinor: string; currency: string };
  details: Record<string, string>;
  createdAt: string;
  payoutReference: string | null;
  closeReason: string | null;
  player: { accountNo: string; username: string; firstName: string; lastName: string; email: string };
  paidBy: string | null;
  closedBy: string | null;
}
export interface AdminShopItem {
  id: string;
  code: string;
  status: string;
  amount: { amountMinor: string; currency: string };
  createdAt: string;
  player: { username: string; accountNo: string };
  paidShop: { name: string; city: string } | null;
}

function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      onClick={() => void navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1200); })}
    >
      {done ? '✓' : '⧉'}
    </button>
  );
}

/** Head office: online payouts to send by hand, and the shop pickup requests. Super Admin can open or close withdrawals here. */
export function AdminWithdrawals({ online, shop, currencies, locale, canManage, isSuper, open }: { online: AdminOnlineItem[]; shop: AdminShopItem[]; currencies: CurrencyDTO[]; locale: string; canManage: boolean; isSuper: boolean; open: boolean }) {
  const t = useTranslations('adminWithdrawals');
  const tRoot = useTranslations();
  const router = useRouter();
  const [tab, setTab] = useState<'online' | 'shop'>('online');
  const [items, setItems] = useState(online);
  const [refs, setRefs] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(open);

  const fmt = (m: { amountMinor: string; currency: string }) => {
    const cur = findCurrency(currencies, m.currency);
    return cur ? formatAmountMinor(m.amountMinor, cur, locale, 'full') : `${m.amountMinor} ${m.currency}`;
  };
  const fail = (err: unknown) => setError(err instanceof ApiError ? tRoot(errorMessageKey(err.code) as never) : tRoot('errors.generic' as never));

  async function act(id: string, kind: 'pay' | 'reject') {
    setError(null);
    setBusy(id);
    try {
      const json = kind === 'pay' ? { reference: (refs[id] ?? '').trim() } : { reason: (reasons[id] ?? '').trim() };
      const res = await apiClient<{ withdrawal: AdminOnlineItem }>(`/admin/online-withdrawals/${id}/${kind}`, { method: 'POST', json });
      setItems((list) => list.map((w) => (w.id === id ? res.withdrawal : w)));
      router.refresh();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  }

  async function toggle() {
    setError(null);
    try {
      await apiClient('/admin/settings/withdrawals_open', { method: 'PUT', json: { value: !isOpen } });
      setIsOpen(!isOpen);
      router.refresh();
    } catch (err) {
      fail(err);
    }
  }

  const pending = items.filter((w) => w.status === 'pending').length;

  return (
    <div className="aw-wrap">
      <div className="card aw-switch">
        <div>
          <strong>{t('switchTitle')}</strong>
          <span className="muted">{isOpen ? t('switchOn') : t('switchOff')}</span>
        </div>
        {isSuper ? (
          <button type="button" role="switch" aria-checked={isOpen} aria-label={t('switchTitle')} className={isOpen ? 'switch is-on' : 'switch'} onClick={() => void toggle()}>
            <span />
          </button>
        ) : (
          <span className={isOpen ? 'switch-state is-on' : 'switch-state'}>{isOpen ? 'ON' : 'OFF'}</span>
        )}
      </div>
      {error ? <div className="alert alert-error">{error}</div> : null}
      <div className="deposit-tab-bar" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'online'} className={tab === 'online' ? 'deposit-tab on' : 'deposit-tab'} onClick={() => setTab('online')}>
          🏦 {t('tabOnline')} {pending > 0 ? <b className="aw-count">{pending}</b> : null}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'shop'} className={tab === 'shop' ? 'deposit-tab on' : 'deposit-tab'} onClick={() => setTab('shop')}>
          🏪 {t('tabShop')}
        </button>
      </div>

      {tab === 'online' ? (
        items.length === 0 ? (
          <p className="muted">{t('empty')}</p>
        ) : (
          <div className="aw-list">
            {items.map((w) => (
              <div key={w.id} className={`card aw-item is-${w.status}`}>
                <div className="aw-head">
                  <strong className="aw-amount">{fmt(w.amount)}</strong>
                  <span className={`wd-badge is-${w.status}`}>{t(`status_${w.status}`)}</span>
                  <span className="muted">#{w.id} · {new Date(w.createdAt).toLocaleString(locale)}</span>
                </div>
                <div className="aw-player">
                  {[`${w.player.firstName} ${w.player.lastName}`.trim(), w.player.username, `${t('account')} ${w.player.accountNo}`, w.player.email].filter(Boolean).join(' · ')}
                </div>
                <div className="aw-details" dir="ltr">
                  {w.method === 'bank' ? (
                    <>
                      <span>🏦 {w.details.accountName}</span>
                      <code>{w.details.iban}</code>
                      <Copy text={w.details.iban ?? ''} />
                    </>
                  ) : (
                    <>
                      <span>₿ {w.details.coin} ({w.details.chain})</span>
                      <code>{w.details.address}</code>
                      <Copy text={w.details.address ?? ''} />
                    </>
                  )}
                </div>
                {w.status === 'pending' && canManage ? (
                  <div className="aw-actions">
                    <div className="aw-act">
                      <input placeholder={t('referencePlaceholder')} value={refs[w.id] ?? ''} onChange={(e) => setRefs((r) => ({ ...r, [w.id]: e.target.value }))} maxLength={200} />
                      <button type="button" className="btn btn-gold btn-sm" disabled={busy === w.id || (refs[w.id] ?? '').trim().length < 3} onClick={() => void act(w.id, 'pay')}>
                        {t('markPaid')}
                      </button>
                    </div>
                    <div className="aw-act">
                      <input placeholder={t('reasonPlaceholder')} value={reasons[w.id] ?? ''} onChange={(e) => setReasons((r) => ({ ...r, [w.id]: e.target.value }))} maxLength={500} />
                      <button type="button" className="btn btn-ghost btn-sm" disabled={busy === w.id || (reasons[w.id] ?? '').trim().length < 3} onClick={() => void act(w.id, 'reject')}>
                        {t('reject')}
                      </button>
                    </div>
                  </div>
                ) : null}
                {w.status === 'paid' ? (
                  <div className="muted">
                    {t('paidWith')}: <code dir="ltr">{w.payoutReference}</code> · {w.paidBy}
                  </div>
                ) : null}
                {w.status === 'rejected' || w.status === 'cancelled' ? (
                  <div className="muted">
                    {w.closeReason ? `${w.closeReason} · ` : ''}
                    {w.closedBy}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="aw-table-wrap">
          <table className="aw-table">
            <thead>
              <tr>
                <th>{t('code')}</th>
                <th>{t('player')}</th>
                <th>{t('status')}</th>
                <th>{t('amount')}</th>
                <th>{t('shop')}</th>
              </tr>
            </thead>
            <tbody>
              {shop.length === 0 ? (
                <tr>
                  <td colSpan={5} className="muted">
                    {t('empty')}
                  </td>
                </tr>
              ) : (
                shop.map((w) => (
                  <tr key={w.id}>
                    <td dir="ltr">{w.code}</td>
                    <td>
                      {w.player.accountNo} ({w.player.username})
                    </td>
                    <td>{t(`status_${w.status}` as never)}</td>
                    <td>{fmt(w.amount)}</td>
                    <td>{w.paidShop ? `${w.paidShop.name}, ${w.paidShop.city}` : '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
