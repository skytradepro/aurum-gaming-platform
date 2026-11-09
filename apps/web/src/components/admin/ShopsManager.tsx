'use client';

import { errorMessageKey } from '@aurum/i18n';
import { ApiError, apiClient } from '@/lib/api';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export interface AdminShop {
  id: string;
  code: string;
  name: string;
  city: string;
  currency: string;
  status: 'active' | 'suspended' | 'closed';
  creditBalance: { amountMinor: string; currency: string };
  activeWorkers: number;
}

interface Worker {
  id: string;
  username: string;
  email: string;
  status: string;
  shopRole: string;
}

interface CreditEntry {
  id: string;
  createdAt: string;
  entryType: string;
  direction: 1 | -1;
  amount: { amountMinor: string };
  balanceAfter: { amountMinor: string };
  operator: { username: string };
  reason: string | null;
}

const newKey = () => `ui-${crypto.randomUUID()}`;

/** Decimal text -> minor units, or null when it is not a valid positive amount for this currency. */
function toMinor(text: string, decimals: number): bigint | null {
  const m = /^(\d{1,15})(?:[.,](\d+))?$/.exec(text.trim());
  if (!m) return null;
  const frac = m[2] ?? '';
  if (frac.length > decimals) return null;
  const v = BigInt(m[1] as string) * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, '0') || '0');
  return v > 0n ? v : null;
}
function fromMinor(v: bigint, decimals: number): string {
  const neg = v < 0n;
  const a = neg ? -v : v;
  const unit = 10n ** BigInt(decimals);
  const s = decimals > 0 ? `${a / unit}.${(a % unit).toString().padStart(decimals, '0')}` : `${a}`;
  return neg ? `-${s}` : s;
}

/**
 * Head office: every shop with its prepaid balance. Head office adds balance to a shop (the shop paid for it)
 * or takes balance back; the shop recharges players from it and pays players out in cash (that amount comes
 * back to its balance), and asks head office for a new recharge when it runs out.
 */
export function ShopsManager({ initial, currencies, canManage, canCash }: { initial: AdminShop[]; currencies: { code: string; decimals: number }[]; canManage: boolean; canCash: boolean }) {
  const t = useTranslations('shopAdmin');
  const tRoot = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(initial.length === 0);
  const [form, setForm] = useState({ name: '', code: '', city: '', currency: currencies.find((c) => c.code === 'TND')?.code ?? currencies[0]?.code ?? 'TND' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const fail = (err: unknown) => setError(err instanceof ApiError ? `${tRoot(errorMessageKey(err.code) as never)}${err.fields ? ` (${Object.keys(err.fields).join(', ')})` : ''}` : tRoot('errors.generic' as never));

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await apiClient('/admin/shops', { method: 'POST', json: { name: form.name.trim(), code: form.code.trim().toUpperCase(), city: form.city.trim(), currency: form.currency } });
      setNotice(t('created'));
      setForm({ ...form, name: '', code: '', city: '' });
      setOpen(false);
      router.refresh();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shops-admin">
      {error ? <div className="alert alert-error">{error}</div> : null}
      {notice ? <div className="alert alert-success">{notice}</div> : null}

      {canManage ? (
        <section className="card">
          <button type="button" className="cd-more" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {open ? '▾' : '▸'} {t('newShop')}
          </button>
          {open ? (
            <form className="shop-new" onSubmit={(e) => void create(e)}>
              <div className="field">
                <label htmlFor="shop-name">{t('name')}</label>
                <input id="shop-name" value={form.name} maxLength={120} required onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="shop-code">{t('code')}</label>
                <input id="shop-code" value={form.code} maxLength={20} required pattern="[A-Za-z0-9][A-Za-z0-9-]{1,19}" dir="ltr" onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
              </div>
              <div className="field">
                <label htmlFor="shop-city">{t('city')}</label>
                <input id="shop-city" value={form.city} maxLength={80} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="shop-currency">{t('currency')}</label>
                <select id="shop-currency" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                  {currencies.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className="btn btn-gold" disabled={busy}>
                {t('create')}
              </button>
            </form>
          ) : null}
        </section>
      ) : null}

      {initial.length === 0 ? <p className="muted">{t('none')}</p> : null}
      <div className="shop-grid">
        {initial.map((s) => (
          <ShopCard key={s.id} shop={s} decimals={currencies.find((c) => c.code === s.currency)?.decimals ?? 3} canManage={canManage} canCash={canCash} />
        ))}
      </div>
    </div>
  );
}

function ShopCard({ shop, decimals, canManage, canCash }: { shop: AdminShop; decimals: number; canManage: boolean; canCash: boolean }) {
  const t = useTranslations('shopAdmin');
  const tc = useTranslations('cashDesk');
  const tRoot = useTranslations();
  const router = useRouter();
  type Mode = 'recharge' | 'withdraw' | 'correction_credit' | 'correction_debit';
  const [mode, setMode] = useState<Mode>('recharge');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [key, setKey] = useState(newKey);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [workers, setWorkers] = useState<Worker[] | null>(null);
  const [login, setLogin] = useState({ username: '', email: '', firstName: '', lastName: '' });
  const [password, setPassword] = useState<{ username: string; value: string } | null>(null);
  const [history, setHistory] = useState<CreditEntry[] | null>(null);

  const fail = (err: unknown) => setError(err instanceof ApiError ? `${tRoot(errorMessageKey(err.code) as never)}${err.fields ? ` (${Object.keys(err.fields).join(', ')})` : ''}` : tRoot('errors.generic' as never));
  const balance = BigInt(shop.creditBalance.amountMinor);
  const minor = toMinor(amount, decimals);
  const up = mode === 'recharge' || mode === 'correction_credit';
  const after = minor === null ? null : up ? balance + minor : balance - minor;
  const tooMuch = after !== null && after < 0n;
  const needsReason = mode === 'correction_credit' || mode === 'correction_debit';
  const pick = (m: Mode) => {
    setMode(m);
    setError(null);
    setNotice(null);
  };
  const active = shop.status === 'active';

  async function post(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (minor === null || tooMuch || after === null) return;
    if (needsReason && note.trim().length < 3) {
      setError(tc('reasonNeeded'));
      return;
    }
    const sign = up ? '+' : '−';
    if (!window.confirm(t('confirm', { sign, amount: fromMinor(minor, decimals), currency: shop.currency, shop: shop.name, after: fromMinor(after, decimals) }))) return;
    setBusy(true);
    try {
      await apiClient(`/admin/shops/${shop.id}/credit`, {
        method: 'POST',
        json: { entryType: mode, amount: fromMinor(minor, decimals), ...(note.trim() ? { reason: note.trim() } : {}), idempotencyKey: key },
      });
      setNotice(t('done', { sign, amount: fromMinor(minor, decimals), currency: shop.currency, shop: shop.name }));
      setAmount('');
      setNote('');
      setKey(newKey());
      setMode('recharge');
      setHistory(null);
      router.refresh();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function loadWorkers() {
    try {
      setWorkers((await apiClient<{ items: Worker[] }>(`/admin/workers?shopId=${shop.id}`)).items);
    } catch (err) {
      fail(err);
    }
  }

  async function createLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await apiClient<{ worker: Worker; temporaryPassword: string }>('/admin/workers', {
        method: 'POST',
        json: { shopId: shop.id, username: login.username.trim(), email: login.email.trim(), firstName: login.firstName.trim(), lastName: login.lastName.trim(), shopRole: 'manager' },
      });
      setPassword({ username: res.worker.username, value: res.temporaryPassword });
      setLogin({ username: '', email: '', firstName: '', lastName: '' });
      await loadWorkers();
      router.refresh();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function workerStatus(w: Worker, status: 'active' | 'suspended') {
    setError(null);
    try {
      await apiClient(`/admin/workers/${w.id}`, { method: 'PATCH', json: { status } });
      await loadWorkers();
      router.refresh();
    } catch (err) {
      fail(err);
    }
  }

  async function newPassword(w: Worker) {
    if (!window.confirm(t('resetConfirm', { username: w.username }))) return;
    setError(null);
    try {
      const res = await apiClient<{ temporaryPassword: string }>(`/admin/workers/${w.id}/reset-password`, { method: 'POST', json: {} });
      setPassword({ username: w.username, value: res.temporaryPassword });
    } catch (err) {
      fail(err);
    }
  }

  async function shopStatus(status: 'active' | 'suspended') {
    if (status === 'suspended' && !window.confirm(t('stopConfirm', { shop: shop.name }))) return;
    setError(null);
    try {
      await apiClient(`/admin/shops/${shop.id}/status`, { method: 'POST', json: { status } });
      router.refresh();
    } catch (err) {
      fail(err);
    }
  }

  async function toggleHistory() {
    if (history) {
      setHistory(null);
      return;
    }
    try {
      setHistory((await apiClient<{ items: CreditEntry[] }>(`/admin/shops/${shop.id}/credit`)).items);
    } catch (err) {
      fail(err);
    }
  }

  return (
    <section className={`card shop-card${active ? '' : ' is-off'}`}>
      <div className="shop-card-head">
        <div>
          <h3>{shop.name}</h3>
          <small className="muted" dir="ltr">
            {shop.code}
            {shop.city ? ` · ${shop.city}` : ''}
          </small>
        </div>
        <span className={`shop-status is-${shop.status}`}>{t(`status_${shop.status}` as never)}</span>
      </div>

      <div className="shop-balance">
        <span>{t('balance')}</span>
        <b dir="ltr">
          {fromMinor(balance, decimals)} {shop.currency}
        </b>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}
      {notice ? <div className="alert alert-success">{notice}</div> : null}

      {canCash && shop.status !== 'closed' ? (
        <form className="cd-card shop-recharge" onSubmit={(e) => void post(e)}>
          <div className="cd-modes" role="tablist">
            <button type="button" role="tab" aria-selected={mode === 'recharge'} className={mode === 'recharge' ? 'cd-mode is-in on' : 'cd-mode is-in'} onClick={() => pick('recharge')}>
              <b>＋</b>
              <span>{t('add')}</span>
              <small>{t('addHint')}</small>
            </button>
            <button type="button" role="tab" aria-selected={mode === 'withdraw'} className={mode === 'withdraw' ? 'cd-mode is-out on' : 'cd-mode is-out'} onClick={() => pick('withdraw')}>
              <b>－</b>
              <span>{t('take')}</span>
              <small>{t('takeHint')}</small>
            </button>
          </div>
          <div className="cd-row">
            <div className="field cd-amount">
              <label htmlFor={`sr-amount-${shop.id}`}>
                {tc('amount')} ({shop.currency})
              </label>
              <input id={`sr-amount-${shop.id}`} inputMode="decimal" value={amount} required placeholder="0.00" dir="ltr" onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="field cd-note">
              <label htmlFor={`sr-note-${shop.id}`}>{needsReason ? tc('reason') : tc('note')}</label>
              <input id={`sr-note-${shop.id}`} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
          {after !== null ? (
            <div className={tooMuch ? 'cd-preview is-bad' : 'cd-preview'}>
              {tooMuch ? (
                t('notEnough')
              ) : (
                <>
                  {tc('after')}: <b dir="ltr">{fromMinor(after, decimals)} {shop.currency}</b>
                </>
              )}
            </div>
          ) : null}
          <button type="submit" className={up ? 'btn cd-go cd-go-in' : 'btn cd-go cd-go-out'} disabled={busy || minor === null || tooMuch}>
            {mode === 'recharge' ? t('doRecharge') : mode === 'withdraw' ? t('doTake') : tc('doCorrection')}
          </button>
          <button type="button" className="cd-more" onClick={() => setMore((v) => !v)} aria-expanded={more}>
            {more ? '▾' : '▸'} {tc('corrections')}
          </button>
          {more ? (
            <div className="cd-modes cd-modes-small">
              <button type="button" className={mode === 'correction_credit' ? 'cd-mode on' : 'cd-mode'} onClick={() => pick(mode === 'correction_credit' ? 'recharge' : 'correction_credit')}>
                <span>{tc('fixUp')}</span>
              </button>
              <button type="button" className={mode === 'correction_debit' ? 'cd-mode on' : 'cd-mode'} onClick={() => pick(mode === 'correction_debit' ? 'recharge' : 'correction_debit')}>
                <span>{tc('fixDown')}</span>
              </button>
            </div>
          ) : null}
        </form>
      ) : null}

      <div className="shop-actions">
        <button type="button" className="btn btn-sm admin-chip tone-ledger" onClick={() => void toggleHistory()}>
          {history ? t('hideHistory') : t('history')}
        </button>
        {canManage ? (
          <button type="button" className="btn btn-sm admin-chip tone-players" onClick={() => (workers ? setWorkers(null) : void loadWorkers())}>
            {t('logins')} ({shop.activeWorkers})
          </button>
        ) : null}
        {canManage && shop.status !== 'closed' ? (
          active ? (
            <button type="button" className="btn btn-sm admin-chip tone-danger" onClick={() => void shopStatus('suspended')}>
              {t('stop')}
            </button>
          ) : (
            <button type="button" className="btn btn-sm admin-chip tone-in" onClick={() => void shopStatus('active')}>
              {t('open')}
            </button>
          )
        ) : null}
      </div>

      {history ? (
        history.length === 0 ? (
          <p className="muted">{t('noHistory')}</p>
        ) : (
          <div>
            <table className="shop-history">
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <td className="when">{new Date(h.createdAt).toLocaleString(undefined, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                    <td>{t(`type_${h.entryType}` as never)}</td>
                    <td dir="ltr" className={h.direction > 0 ? 'num amount-in' : 'num amount-out'}>
                      {h.direction > 0 ? '+' : '−'}
                      {fromMinor(BigInt(h.amount.amountMinor), decimals)}
                    </td>
                    <td dir="ltr" className="num">= {fromMinor(BigInt(h.balanceAfter.amountMinor), decimals)}</td>
                    <td className="muted">
                      {h.operator.username}
                      {h.reason ? ` · ${h.reason}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}

      {password ? (
        <div className="alert alert-success shop-password">
          {t('tempPassword', { username: password.username })}{' '}
          <b dir="ltr">{password.value}</b>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPassword(null)}>
            OK
          </button>
        </div>
      ) : null}

      {workers ? (
        <div className="shop-logins">
          {workers.length === 0 ? <p className="muted">{t('noLogins')}</p> : null}
          {workers.map((w) => (
            <div key={w.id} className="shop-login">
              <span dir="ltr">
                <b>{w.username}</b> · {w.email}
              </span>
              <span className="admin-actions">
                {w.status === 'active' ? (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => void workerStatus(w, 'suspended')}>
                    {t('stopLogin')}
                  </button>
                ) : (
                  <button type="button" className="btn btn-gold btn-sm" onClick={() => void workerStatus(w, 'active')}>
                    {t('allowLogin')}
                  </button>
                )}
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => void newPassword(w)}>
                  {t('resetPassword')}
                </button>
              </span>
            </div>
          ))}
          <form className="shop-new" onSubmit={(e) => void createLogin(e)}>
            <strong>{t('newLogin')}</strong>
            <div className="field">
              <label htmlFor={`sl-user-${shop.id}`}>{t('username')}</label>
              <input id={`sl-user-${shop.id}`} value={login.username} required maxLength={30} dir="ltr" onChange={(e) => setLogin({ ...login, username: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor={`sl-mail-${shop.id}`}>{t('email')}</label>
              <input id={`sl-mail-${shop.id}`} type="email" value={login.email} required maxLength={254} dir="ltr" onChange={(e) => setLogin({ ...login, email: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor={`sl-first-${shop.id}`}>{t('firstName')}</label>
              <input id={`sl-first-${shop.id}`} value={login.firstName} required maxLength={80} onChange={(e) => setLogin({ ...login, firstName: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor={`sl-last-${shop.id}`}>{t('lastName')}</label>
              <input id={`sl-last-${shop.id}`} value={login.lastName} required maxLength={80} onChange={(e) => setLogin({ ...login, lastName: e.target.value })} />
            </div>
            <button type="submit" className="btn btn-gold btn-sm" disabled={busy}>
              {t('createLogin')}
            </button>
          </form>
        </div>
      ) : null}
    </section>
  );
}
