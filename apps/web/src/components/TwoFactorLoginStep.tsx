'use client';

import { errorMessageKey } from '@aurum/i18n';
import { ApiError, apiClient } from '@/lib/api';
import type { MeUser } from '@/lib/types';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

/** Second sign-in step when the account has two-factor sign-in on. */
export function TwoFactorLoginStep({ ticket, onDone, onBack }: { ticket: string; onDone: (user: MeUser) => void; onBack: () => void }) {
  const t = useTranslations('twoFactor');
  const tRoot = useTranslations();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { user } = await apiClient<{ user: MeUser }>('/auth/login/2fa', { method: 'POST', json: { ticket, code: code.replace(/\s/g, '') } });
      onDone(user);
    } catch (err) {
      setCode('');
      const key = err instanceof ApiError ? err.code : null;
      if (key === 'two_factor_expired') {
        onBack();
        return;
      }
      setError(key ? tRoot(errorMessageKey(key) as never) : tRoot('errors.generic'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="card" onSubmit={(e) => void submit(e)} autoComplete="off">
      <h1>{t('loginTitle')}</h1>
      <p className="muted">{t('loginHelp')}</p>
      {error ? <div className="alert alert-error">{error}</div> : null}
      <div className="field">
        <label htmlFor="otp">{t('codeLabel')}</label>
        <input
          id="otp"
          className="otp-input"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          autoFocus
          required
          dir="ltr"
        />
      </div>
      <button type="submit" className="btn btn-gold" disabled={loading || code.length !== 6}>
        {t('verify')}
      </button>
      <button type="button" className="btn btn-dark" style={{ marginTop: 8 }} onClick={onBack} disabled={loading}>
        {t('back')}
      </button>
    </form>
  );
}
