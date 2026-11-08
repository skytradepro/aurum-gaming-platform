'use client';

import { errorMessageKey } from '@aurum/i18n';
import { ApiError, apiClient } from '@/lib/api';
import type { CurrencyDTO } from '@/lib/types';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

/** Staff creates a player at the counter. The player gets a one-time temporary password. No phone, no date of birth. */
export function CreatePlayerForm({ countries, currencies }: { countries: { code: string; callingCode: string }[]; currencies: CurrencyDTO[] }) {
  const t = useTranslations('adminContent');
  const tRoot = useTranslations();
  const locale = useLocale();
  const [f, setF] = useState({
    username: '',
    email: '',
    firstName: '',
    lastName: '',
    country: countries.find((c) => c.code === 'TN')?.code ?? countries[0]?.code ?? '',
    currency: currencies[0]?.code ?? '',
  });
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ username: string; password: string } | null>(null);

  const countryName = useMemo(() => {
    try {
      const names = new Intl.DisplayNames([locale], { type: 'region' });
      return (code: string) => names.of(code) ?? code;
    } catch {
      return (code: string) => code;
    }
  }, [locale]);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((cur) => ({ ...cur, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(null);
    setBusy(true);
    try {
      const res = await apiClient<{ username: string; temporaryPassword: string }>('/admin/players', {
        method: 'POST',
        json: { ...f, confirmed },
      });
      setDone({ username: res.username, password: res.temporaryPassword });
      setF((cur) => ({ ...cur, username: '', email: '', firstName: '', lastName: '' }));
      setConfirmed(false);
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

  return (
    <form className="card staff-form" onSubmit={(e) => void submit(e)} style={{ display: 'grid', gap: '0.9rem' }}>
      <h2>{t('newPlayerTitle')}</h2>
      {error ? <div className="alert alert-error">{error}</div> : null}
      {done ? (
        <div className="alert alert-success">
          <p>
            {t('playerCreated')} <strong>{done.username}</strong>
          </p>
          <p>{t('tempPasswordOnce', { username: done.username })}</p>
          <p>
            <strong style={{ fontFamily: 'monospace', fontSize: '1.2em' }}>{done.password}</strong>
          </p>
        </div>
      ) : null}
      <div className="admin-cols">
        <div className="field">
          <label>{t('username')}</label>
          <input value={f.username} onChange={set('username')} required disabled={busy} />
        </div>
        <div className="field">
          <label>{t('email')}</label>
          <input type="email" value={f.email} onChange={set('email')} required disabled={busy} />
        </div>
        <div className="field">
          <label>{t('firstName')}</label>
          <input value={f.firstName} onChange={set('firstName')} required disabled={busy} />
        </div>
        <div className="field">
          <label>{t('lastName')}</label>
          <input value={f.lastName} onChange={set('lastName')} required disabled={busy} />
        </div>
        <div className="field">
          <label>{t('country')}</label>
          <select value={f.country} onChange={set('country')} disabled={busy}>
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {countryName(c.code)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>{t('accountCurrency')}</label>
          <select value={f.currency} onChange={set('currency')} disabled={busy}>
            {currencies.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code}
              </option>
            ))}
          </select>
        </div>
      </div>
      <label className="register-check" style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start' }}>
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} disabled={busy} style={{ marginTop: '0.2rem' }} />
        <span>{t('confirmAdult')}</span>
      </label>
      <button type="submit" className="btn btn-gold staff-submit" disabled={busy || !confirmed}>
        {t('createPlayer')}
      </button>
    </form>
  );
}
