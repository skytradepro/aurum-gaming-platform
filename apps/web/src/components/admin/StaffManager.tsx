'use client';

import { errorMessageKey } from '@aurum/i18n';
import { PERMISSIONS } from '@aurum/shared';
import { ApiError, apiClient } from '@/lib/api';
import { Link, useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { Fragment, useState } from 'react';

export interface StaffRow {
  id: string;
  accountNo: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  status: string;
  permissions: string[];
  /** prepaid balance of an admin, per currency (migration 0017) */
  credit?: { amountMinor: string; currency: string }[];
  createdAt?: string;
  lastLoginAt?: string | null;
}

export interface StaffCurrency {
  code: string;
  decimals: number;
}

interface CreditEntry {
  id: string;
  createdAt: string;
  entryType: string;
  direction: 1 | -1;
  amount: { amountMinor: string; currency: string };
  balanceAfter: { amountMinor: string; currency: string };
  operator: { username: string };
  player: { username: string } | null;
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
export function fromMinor(v: bigint, decimals: number): string {
  const neg = v < 0n;
  const a = neg ? -v : v;
  const unit = 10n ** BigInt(decimals);
  const s = decimals > 0 ? `${a / unit}.${(a % unit).toString().padStart(decimals, '0')}` : `${a}`;
  return neg ? `-${s}` : s;
}

/** Readable name of each permission (keys of adminContent). */
export const PERM_LABEL: Record<string, string> = {
  'users.view': 'permUsersView',
  'users.manage': 'permUsersManage',
  'balances.view': 'permBalancesView',
  'balances.manage': 'permBalancesManage',
  'banners.manage': 'permBannersManage',
  'promotions.manage': 'permPromotionsManage',
  'pages.manage': 'permPagesManage',
  'games.manage': 'permGamesManage',
  'reports.view': 'permReportsView',
  'audit.view': 'permAuditView',
  'shops.view': 'permShopsView',
  'shops.manage': 'permShopsManage',
  'shops.cash': 'permShopsCash',
  'withdrawals.view': 'permWithdrawalsView',
  'withdrawals.manage': 'permWithdrawalsManage',
};

/**
 * Super Admin only: list staff and create admins with a one-time temporary password.
 * Each admin has a prepaid balance: the Super Admin adds to it or takes from it; the admin credits players
 * only from it (cash-outs come back to it). An admin can be deleted (closed for good).
 */
export function StaffManager({ staff, currencies }: { staff: StaffRow[]; currencies: StaffCurrency[] }) {
  const t = useTranslations('adminContent');
  const tCommon = useTranslations('admin.common');
  const tCredit = useTranslations('staffCredit');
  const tRoot = useTranslations();
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const decimalsOf = (code: string) => currencies.find((c) => c.code === code)?.decimals ?? 2;
  const showMoney = (list: { amountMinor: string; currency: string }[] | undefined) => {
    const items = (list ?? []).filter((m) => m.amountMinor !== '0');
    if (items.length === 0) {
      const c = currencies[0];
      return c ? `${fromMinor(0n, c.decimals)} ${c.code}` : '0';
    }
    return items.map((m) => `${fromMinor(BigInt(m.amountMinor), decimalsOf(m.currency))} ${m.currency}`).join(' · ');
  };
  const [form, setForm] = useState({ username: '', email: '', firstName: '', lastName: '' });
  const [perms, setPerms] = useState<string[]>(['users.view', 'users.manage', 'balances.view', 'balances.manage']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [temp, setTemp] = useState<{ username: string; password: string } | null>(null);
  const [resetTemp, setResetTemp] = useState<{ username: string; password: string } | null>(null);

  function toggle(p: string) {
    setPerms((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setTemp(null);
    setBusy(true);
    try {
      const res = await apiClient<{ temporaryPassword: string }>('/admin/staff', {
        method: 'POST',
        json: { ...form, permissions: perms },
      });
      setTemp({ username: form.username, password: res.temporaryPassword });
      setForm({ username: '', email: '', firstName: '', lastName: '' });
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

  const permLabel = (p: string) => (PERM_LABEL[p] ? t(PERM_LABEL[p] as never) : p);
  const roleLabel = (r: string) => (r === 'super_admin' ? t('roleSuper') : r === 'admin' ? t('roleAdmin') : r);
  const statusLabel = (st: string) => (['active', 'suspended', 'closed'].includes(st) ? tRoot(`status.${st}` as never) : st);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function resetStaff(id: string, username: string) {
    if (!window.confirm(tCommon('resetConfirm'))) return;
    setError(null);
    setResetTemp(null);
    setBusy(true);
    try {
      const res = await apiClient<{ temporaryPassword: string }>(`/admin/staff/${id}/reset-password`, { method: 'POST' });
      setResetTemp({ username, password: res.temporaryPassword });
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) setError(tRoot(errorMessageKey(err.code) as never));
      else setError(tRoot('errors.generic' as never));
    } finally {
      setBusy(false);
    }
  }

  async function deleteStaff(s: StaffRow) {
    if (!window.confirm(tCredit('deleteConfirm', { username: s.username }))) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const res = await apiClient<{ returned: { amountMinor: string; currency: string }[] }>(`/admin/staff/${s.id}/close`, { method: 'POST', json: {} });
      const back = res.returned.map((m) => `${fromMinor(BigInt(m.amountMinor), decimalsOf(m.currency))} ${m.currency}`).join(' · ');
      setNotice(`${tCredit('deleted', { username: s.username })}${back ? ` ${tCredit('returned', { amounts: back })}` : ''}`);
      setOpenId(null);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) setError(tRoot(errorMessageKey(err.code) as never));
      else setError(tRoot('errors.generic' as never));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form className="card staff-form" onSubmit={(e) => void submit(e)}>
        <h3>{t('newAdmin')}</h3>
        {error ? <div className="alert alert-error">{error}</div> : null}
        {temp ? (
          <div className="alert alert-success">
            <p>{t('tempPasswordOnce', { username: temp.username })}</p>
            <p>
              <strong style={{ fontFamily: 'monospace', fontSize: '1.2em' }}>{temp.password}</strong>
            </p>
          </div>
        ) : null}
        {resetTemp ? (
          <div className="alert alert-success">
            <p>{tCommon('passwordReset')}</p>
            <p>{t('tempPasswordOnce', { username: resetTemp.username })}</p>
            <p>
              <strong style={{ fontFamily: 'monospace', fontSize: '1.2em' }}>{resetTemp.password}</strong>
            </p>
          </div>
        ) : null}
        <div className="admin-cols">
          <div className="field">
            <label>{t('username')}</label>
            <input value={form.username} required onChange={set('username')} />
          </div>
          <div className="field">
            <label>{t('email')}</label>
            <input type="email" value={form.email} required onChange={set('email')} />
          </div>
          <div className="field">
            <label>{t('firstName')}</label>
            <input value={form.firstName} required onChange={set('firstName')} />
          </div>
          <div className="field">
            <label>{t('lastName')}</label>
            <input value={form.lastName} required onChange={set('lastName')} />
          </div>
        </div>
        <fieldset className="perm-box">
          <legend>{t('permissions')}</legend>
          <small className="perm-hint">{t('permHint')}</small>
          <div className="perm-grid">
            {PERMISSIONS.map((p) => (
              <label key={p} className={perms.includes(p) ? 'perm-chip is-on' : 'perm-chip'}>
                <input type="checkbox" checked={perms.includes(p)} onChange={() => toggle(p)} />
                <span>{permLabel(p)}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <button type="submit" className="btn btn-gold staff-submit" disabled={busy}>
          {t('createAdmin')}
        </button>
      </form>

      <div className="card">
        <h3>{t('staffTitle')}</h3>
        {notice ? <div className="alert alert-success">{notice}</div> : null}
        <div className="table-scroll">
        <table style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>#</th>
              <th>{t('username')}</th>
              <th>{t('email')}</th>
              <th>{t('staffRole')}</th>
              <th>{t('staffStatus')}</th>
              <th>{tCredit('balance')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <Fragment key={s.id}>
                <tr>
                  <td>
                    {s.role === 'admin' ? (
                      <Link href={`/admin/staff?admin=${s.id}`} className="staff-link">
                        {s.accountNo}
                      </Link>
                    ) : (
                      s.accountNo
                    )}
                  </td>
                  <td>
                    {s.role === 'admin' ? (
                      <Link href={`/admin/staff?admin=${s.id}`} className="staff-link">
                        {s.username}
                      </Link>
                    ) : (
                      s.username
                    )}
                  </td>
                  <td>{s.email}</td>
                  <td>{roleLabel(s.role)}</td>
                  <td>{statusLabel(s.status)}</td>
                  <td dir="ltr" className="staff-credit-cell">
                    {s.role === 'admin' ? <b>{showMoney(s.credit)}</b> : <span className="muted">∞</span>}
                  </td>
                  <td>
                    {s.role === 'admin' ? (
                      <span className="staff-actions">
                        <Link href={`/admin/staff?admin=${s.id}`} className="btn btn-gold btn-sm">
                          {tCredit('openPage')}
                        </Link>
                        <button type="button" className={openId === s.id ? 'btn btn-gold btn-sm' : 'btn btn-ghost btn-sm'} onClick={() => setOpenId(openId === s.id ? null : s.id)}>
                          {openId === s.id ? tCredit('hide') : tCredit('manage')}
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void resetStaff(s.id, s.username)}>
                          {tCommon('resetPassword')}
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm shop-stop" disabled={busy} onClick={() => void deleteStaff(s)}>
                          {tCredit('delete')}
                        </button>
                      </span>
                    ) : null}
                  </td>
                </tr>
                {openId === s.id ? (
                  <tr className="staff-credit-row">
                    <td colSpan={7}>
                      <StaffCredit staff={s} currencies={currencies} />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </>
  );
}

/** The Super Admin adds balance to one admin, takes it back, or corrects a mistake; with the history. */
export function StaffCredit({ staff, currencies }: { staff: StaffRow; currencies: StaffCurrency[] }) {
  const t = useTranslations('staffCredit');
  const tc = useTranslations('cashDesk');
  const tRoot = useTranslations();
  const router = useRouter();
  type Mode = 'recharge' | 'withdraw' | 'correction_credit' | 'correction_debit';
  const firstWithBalance = staff.credit?.find((m) => m.amountMinor !== '0')?.currency;
  const [currency, setCurrency] = useState<string>(firstWithBalance ?? currencies[0]?.code ?? 'TND');
  const [mode, setMode] = useState<Mode>('recharge');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [key, setKey] = useState(newKey);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [history, setHistory] = useState<CreditEntry[] | null>(null);

  const decimals = currencies.find((c) => c.code === currency)?.decimals ?? 2;
  const decimalsOf = (code: string) => currencies.find((c) => c.code === code)?.decimals ?? 2;
  const balance = BigInt(staff.credit?.find((m) => m.currency === currency)?.amountMinor ?? '0');
  const minor = toMinor(amount, decimals);
  const up = mode === 'recharge' || mode === 'correction_credit';
  const after = minor === null ? null : up ? balance + minor : balance - minor;
  const tooMuch = after !== null && after < 0n;
  const needsReason = mode === 'correction_credit' || mode === 'correction_debit';
  const fail = (err: unknown) =>
    setError(err instanceof ApiError ? `${tRoot(errorMessageKey(err.code) as never)}${err.fields ? ` (${Object.keys(err.fields).join(', ')})` : ''}` : tRoot('errors.generic' as never));
  const pick = (m: Mode) => {
    setMode(m);
    setError(null);
    setNotice(null);
  };

  async function loadHistory() {
    try {
      setHistory((await apiClient<{ items: CreditEntry[] }>(`/admin/staff/${staff.id}/credit`)).items);
    } catch (err) {
      fail(err);
    }
  }

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
    if (!window.confirm(t('confirm', { sign, amount: fromMinor(minor, decimals), currency, username: staff.username, after: fromMinor(after, decimals) }))) return;
    setBusy(true);
    try {
      await apiClient(`/admin/staff/${staff.id}/credit`, {
        method: 'POST',
        json: { entryType: mode, currency, amount: fromMinor(minor, decimals), ...(note.trim() ? { reason: note.trim() } : {}), idempotencyKey: key },
      });
      setNotice(t('done', { sign, amount: fromMinor(minor, decimals), currency, username: staff.username }));
      setAmount('');
      setNote('');
      setKey(newKey());
      setMode('recharge');
      if (history) await loadHistory();
      router.refresh();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="staff-credit">
      <div className="shop-balance">
        <span>
          {t('balance')} · <span dir="ltr">{staff.username}</span>
        </span>
        <b dir="ltr">
          {fromMinor(balance, decimals)} {currency}
        </b>
      </div>
      <p className="muted">{t('hint')}</p>
      {error ? <div className="alert alert-error">{error}</div> : null}
      {notice ? <div className="alert alert-success">{notice}</div> : null}

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
            <label htmlFor={`sc-amount-${staff.id}`}>
              {tc('amount')} ({currency})
            </label>
            <input id={`sc-amount-${staff.id}`} inputMode="decimal" value={amount} required placeholder="0.00" dir="ltr" onChange={(e) => setAmount(e.target.value)} />
          </div>
          {currencies.length > 1 ? (
            <div className="field">
              <label htmlFor={`sc-cur-${staff.id}`}>{t('currency')}</label>
              <select id={`sc-cur-${staff.id}`} value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {currencies.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="field cd-note">
            <label htmlFor={`sc-note-${staff.id}`}>{needsReason ? tc('reason') : tc('note')}</label>
            <input id={`sc-note-${staff.id}`} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        {after !== null ? (
          <div className={tooMuch ? 'cd-preview is-bad' : 'cd-preview'}>
            {tooMuch ? (
              t('notEnough')
            ) : (
              <>
                {tc('after')}: <b dir="ltr">{fromMinor(after, decimals)} {currency}</b>
              </>
            )}
          </div>
        ) : null}
        <button type="submit" className={up ? 'btn cd-go cd-go-in' : 'btn cd-go cd-go-out'} disabled={busy || minor === null || tooMuch}>
          {mode === 'recharge' ? t('doAdd') : mode === 'withdraw' ? t('doTake') : tc('doCorrection')}
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

      <div className="shop-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => (history ? setHistory(null) : void loadHistory())}>
          {history ? t('hideHistory') : t('history')}
        </button>
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
                      {fromMinor(BigInt(h.amount.amountMinor), decimalsOf(h.amount.currency))} {h.amount.currency}
                    </td>
                    <td dir="ltr" className="num">= {fromMinor(BigInt(h.balanceAfter.amountMinor), decimalsOf(h.balanceAfter.currency))}</td>
                    <td className="muted">
                      {h.player ? <span dir="ltr">{h.player.username}</span> : h.operator.username}
                      {h.reason ? ` · ${h.reason}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}
    </div>
  );
}
