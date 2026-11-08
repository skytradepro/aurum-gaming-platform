'use client';

import { errorMessageKey } from '@aurum/i18n';
import { PERMISSIONS } from '@aurum/shared';
import { ApiError, apiClient } from '@/lib/api';
import { Link, useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { PERM_LABEL, StaffCredit, fromMinor } from './StaffManager';
import type { StaffCurrency, StaffRow } from './StaffManager';

export interface StaffPlayer {
  id: string;
  accountNo: string;
  username: string;
  firstName?: string;
  lastName?: string;
  status: string;
  accountCurrency: string | null;
  balance: { amountMinor: string; currency: string } | null;
}

/**
 * Super Admin: the page of one admin (shop). His account, his prepaid balance (add / take, history),
 * the players he created with their balances, and his options: permissions, stop / allow sign-in,
 * temporary password, delete.
 */
export function StaffDetail({ staff, players, currencies }: { staff: StaffRow; players: StaffPlayer[]; currencies: StaffCurrency[] }) {
  const t = useTranslations('staffCredit');
  const tc = useTranslations('adminContent');
  const tCommon = useTranslations('admin.common');
  const tp = useTranslations('adminPlayers');
  const tRoot = useTranslations();
  const router = useRouter();
  const [perms, setPerms] = useState<string[]>(staff.permissions);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [temp, setTemp] = useState<string | null>(null);

  const decimalsOf = (code: string) => currencies.find((c) => c.code === code)?.decimals ?? 2;
  const fail = (err: unknown) => setError(err instanceof ApiError ? tRoot(errorMessageKey(err.code) as never) : tRoot('errors.generic' as never));
  const statusLabel = (st: string) => (['active', 'suspended', 'closed'].includes(st) ? tRoot(`status.${st}` as never) : st);
  const when = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : t('never');
  const name = `${staff.firstName} ${staff.lastName}`.trim();
  const active = staff.status === 'active';
  const permsChanged = [...perms].sort().join(',') !== [...staff.permissions].sort().join(',');

  // total of his players' balances, per currency
  const totals = new Map<string, bigint>();
  for (const p of players) {
    if (!p.balance) continue;
    totals.set(p.balance.currency, (totals.get(p.balance.currency) ?? 0n) + BigInt(p.balance.amountMinor));
  }
  const totalText = [...totals.entries()].map(([cur, v]) => `${fromMinor(v, decimalsOf(cur))} ${cur}`).join(' · ');

  async function run(action: () => Promise<void>) {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await action();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  const savePermissions = () =>
    run(async () => {
      await apiClient(`/admin/staff/${staff.id}`, { method: 'PATCH', json: { permissions: perms } });
      setNotice(t('saved'));
      router.refresh();
    });

  const setStatus = (status: 'active' | 'suspended') => {
    if (status === 'suspended' && !window.confirm(t('stopConfirm', { username: staff.username }))) return;
    void run(async () => {
      await apiClient(`/admin/staff/${staff.id}`, { method: 'PATCH', json: { status } });
      setNotice(t('saved'));
      router.refresh();
    });
  };

  const resetPassword = () => {
    if (!window.confirm(tCommon('resetConfirm'))) return;
    void run(async () => {
      const res = await apiClient<{ temporaryPassword: string }>(`/admin/staff/${staff.id}/reset-password`, { method: 'POST' });
      setTemp(res.temporaryPassword);
    });
  };

  const remove = () => {
    if (!window.confirm(t('deleteConfirm', { username: staff.username }))) return;
    void run(async () => {
      await apiClient(`/admin/staff/${staff.id}/close`, { method: 'POST', json: {} });
      router.push('/admin/staff');
      router.refresh();
    });
  };

  return (
    <div className="staff-detail">
      <Link href="/admin/staff" className="staff-back">
        ← {t('back')}
      </Link>

      <section className="card staff-head">
        <div className="shop-card-head">
          <div>
            <h3>
              <span dir="ltr">{staff.username}</span>
            </h3>
            <small className="muted" dir="ltr">
              #{staff.accountNo} · {staff.email}
              {name ? ` · ${name}` : ''}
            </small>
          </div>
          <span className={`shop-status is-${staff.status}`}>{statusLabel(staff.status)}</span>
        </div>
        <div className="staff-facts">
          <div>
            <small className="muted">{t('created')}</small>
            <b>{when(staff.createdAt)}</b>
          </div>
          <div>
            <small className="muted">{t('lastLogin')}</small>
            <b>{when(staff.lastLoginAt)}</b>
          </div>
          <div>
            <small className="muted">{t('players')}</small>
            <b>{players.length}</b>
          </div>
          <div>
            <small className="muted">{t('playersTotal')}</small>
            <b dir="ltr">{totalText || '—'}</b>
          </div>
        </div>
        {error ? <div className="alert alert-error">{error}</div> : null}
        {notice ? <div className="alert alert-success">{notice}</div> : null}
        {temp ? (
          <div className="alert alert-success shop-password">
            <span>{tc('tempPasswordOnce', { username: staff.username })}</span>
            <strong style={{ fontFamily: 'monospace', fontSize: '1.2em' }}>{temp}</strong>
          </div>
        ) : null}
        <div className="shop-actions">
          {active ? (
            <button type="button" className="btn btn-ghost btn-sm shop-stop" disabled={busy} onClick={() => setStatus('suspended')}>
              {t('stopLogin')}
            </button>
          ) : (
            <button type="button" className="btn btn-gold btn-sm" disabled={busy} onClick={() => setStatus('active')}>
              {t('allowLogin')}
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={resetPassword}>
            {tCommon('resetPassword')}
          </button>
          <button type="button" className="btn btn-ghost btn-sm shop-stop" disabled={busy} onClick={remove}>
            {t('delete')}
          </button>
        </div>
      </section>

      <section className="card">
        <StaffCredit staff={staff} currencies={currencies} />
      </section>

      <section className="card">
        <h3>{t('playersTitle')}</h3>
        {players.length === 0 ? (
          <p className="muted">{t('noPlayers')}</p>
        ) : (
          <div className="aw-table-wrap">
            <table className="aw-table">
              <thead>
                <tr>
                  <th>{tp('account')}</th>
                  <th>{tp('player')}</th>
                  <th>{tp('status')}</th>
                  <th>{tp('balance')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {players.map((p) => (
                  <tr key={p.id}>
                    <td dir="ltr">{p.accountNo}</td>
                    <td>
                      <strong dir="ltr">{p.username}</strong>
                      {p.firstName || p.lastName ? <span className="muted"> · {`${p.firstName ?? ''} ${p.lastName ?? ''}`.trim()}</span> : null}
                    </td>
                    <td>{statusLabel(p.status)}</td>
                    <td dir="ltr">{p.balance ? `${fromMinor(BigInt(p.balance.amountMinor), decimalsOf(p.balance.currency))} ${p.balance.currency}` : p.accountCurrency ?? '—'}</td>
                    <td>
                      <Link href={`/admin/players/${p.id}`} className="btn btn-gold btn-sm">
                        {tp('open')}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <h3>{tc('permissions')}</h3>
        <small className="perm-hint">{t('permissionsHint')}</small>
        <div className="perm-grid">
          {PERMISSIONS.map((p) => (
            <label key={p} className={perms.includes(p) ? 'perm-chip is-on' : 'perm-chip'}>
              <input type="checkbox" checked={perms.includes(p)} onChange={() => setPerms((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]))} />
              <span>{PERM_LABEL[p] ? tc(PERM_LABEL[p] as never) : p}</span>
            </label>
          ))}
        </div>
        <div className="shop-actions">
          <button type="button" className="btn btn-gold btn-sm" disabled={busy || !permsChanged} onClick={() => void savePermissions()}>
            {t('savePermissions')}
          </button>
        </div>
      </section>
    </div>
  );
}
