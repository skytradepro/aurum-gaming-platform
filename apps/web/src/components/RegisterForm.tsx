'use client';

import { Link, useRouter } from '@/i18n/routing';
import { errorMessageKey } from '@aurum/i18n';
import { ApiError, apiClient } from '@/lib/api';
import type { PublicConfig } from '@/lib/types';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

/** Simple sign-up: username, e-mail, password (typed twice) and currency. */
export function RegisterForm({ config }: { config: PublicConfig | null }) {
  const t = useTranslations('auth.register');
  const tRoot = useTranslations();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState('');
  const countries = config?.countries ?? [];
  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
    country: countries.find((c) => c.code === 'TN')?.code ?? countries[0]?.code ?? 'TN',
    currency: config?.currencies[0]?.code ?? 'TND',
    acceptTerms: false,
    marketingOptIn: false,
  });

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (form.password !== confirm) {
      setError(t('passwordsDiffer'));
      return;
    }
    if (!form.acceptTerms) {
      setError(tRoot('validation.mustAcceptTerms'));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await apiClient('/auth/register', {
        method: 'POST',
        json: { ...form, acceptTerms: true, preferredLocale: undefined, captchaToken: undefined },
      });
      router.push('/account?welcome=1');
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) setError(tRoot(errorMessageKey(err.code) as never));
      else setError(tRoot('errors.generic'));
    } finally {
      setLoading(false);
    }
  }

  if (config && !config.registrationOpen) {
    return (
      <div className="card">
        <p>{tRoot('errors.codes.registration_closed')}</p>
      </div>
    );
  }

  const mismatch = confirm.length > 0 && confirm !== form.password;

  return (
    <form className="card register-form" onSubmit={(e) => void submit(e)}>
      <h1>{t('title')}</h1>
      {error ? <div className="alert alert-error">{error}</div> : null}
      <div className="field">
        <label htmlFor="reg-username">{t('username')}</label>
        <input id="reg-username" autoComplete="username" value={form.username} onChange={(e) => set('username', e.target.value)} required />
      </div>
      <div className="field">
        <label htmlFor="reg-email">{t('email')}</label>
        <input id="reg-email" type="email" autoComplete="email" value={form.email} onChange={(e) => set('email', e.target.value)} required />
      </div>
      <div className="field">
        <label htmlFor="reg-password">{t('password')}</label>
        <input id="reg-password" type="password" autoComplete="new-password" value={form.password} onChange={(e) => set('password', e.target.value)} required />
        <small>{t('passwordHint')}</small>
      </div>
      <div className="field">
        <label htmlFor="reg-password2">{t('passwordConfirm')}</label>
        <input
          id="reg-password2"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          aria-invalid={mismatch}
          required
        />
        {mismatch ? <small className="register-error">{t('passwordsDiffer')}</small> : null}
      </div>
      <div className="field">
        <label htmlFor="reg-currency">{t('currency')}</label>
        <select id="reg-currency" value={form.currency} onChange={(e) => set('currency', e.target.value)}>
          {(config?.currencies ?? []).map((c) => (
            <option key={c.code} value={c.code}>
              {c.code}
            </option>
          ))}
        </select>
        <small>{t('currencyHint')}</small>
      </div>
      <label className="register-check">
        <input type="checkbox" checked={form.acceptTerms} onChange={(e) => set('acceptTerms', e.target.checked)} />
        <span>{t('acceptTerms', { terms: t('termsLink') })}</span>
      </label>
      <label className="register-check">
        <input type="checkbox" checked={form.marketingOptIn} onChange={(e) => set('marketingOptIn', e.target.checked)} />
        <span>{t('marketingOptIn')}</span>
      </label>
      <button type="submit" className="btn btn-gold register-submit" disabled={loading}>
        {t('submit')}
      </button>
      <p className="register-foot">
        {t('haveAccount')} <Link href="/login">{t('loginLink')}</Link>
      </p>
    </form>
  );
}
