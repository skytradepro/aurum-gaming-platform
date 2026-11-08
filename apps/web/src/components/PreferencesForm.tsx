'use client';

import { LOCALES } from '@aurum/i18n';
import { errorMessageKey } from '@aurum/i18n';
import { ApiError, apiClient } from '@/lib/api';
import type { CurrencyDTO, MeUser } from '@/lib/types';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { useState } from 'react';

export function PreferencesForm({ user, currencies }: { user: MeUser; currencies: CurrencyDTO[] }) {
  const t = useTranslations('account');
  const tCommon = useTranslations('common');
  const tRoot = useTranslations();
  const router = useRouter();
  const [preferredLocale, setPreferredLocale] = useState(user.preferredLocale ?? 'en');
  const [displayCurrency, setDisplayCurrency] = useState(user.displayCurrency ?? '');
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMsg(null);
    try {
      await apiClient('/account/preferences', {
        method: 'PATCH',
        json: {
          preferredLocale,
          displayCurrency: displayCurrency || null,
        },
      });
      setMsg(t('profileSaved'));
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? tRoot(errorMessageKey(err.code) as never) : tRoot('errors.generic'));
    }
  }

  return (
    <form className="card" onSubmit={(e) => void save(e)}>
      <h2>{t('preferences')}</h2>
      {error ? <div className="alert alert-error">{error}</div> : null}
      {msg ? <div className="alert alert-success">{msg}</div> : null}
      <div className="field">
        <label>{t('preferredLanguage')}</label>
        <select value={preferredLocale} onChange={(e) => setPreferredLocale(e.target.value)}>
          {LOCALES.map((code) => (
            <option key={code} value={code}>
              {code.toUpperCase()}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>{t('displayCurrency')}</label>
        <select value={displayCurrency} onChange={(e) => setDisplayCurrency(e.target.value)}>
          <option value="">{t('displayCurrencyNone')}</option>
          {currencies.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" className="btn btn-gold">
        {tCommon('save')}
      </button>
    </form>
  );
}
