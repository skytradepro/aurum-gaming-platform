'use client';

import { errorMessageKey } from '@aurum/i18n';
import { ApiError, apiClient } from '@/lib/api';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export function ChangePasswordForm() {
  const t = useTranslations('account');
  const tRoot = useTranslations();
  const router = useRouter();
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMsg(null);
    try {
      await apiClient('/auth/change-password', { method: 'POST', json: { currentPassword, newPassword } });
      setMsg(t('passwordChanged'));
      setCurrent('');
      setNew('');
      router.push('/');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? tRoot(errorMessageKey(err.code) as never) : tRoot('errors.generic'));
    }
  }

  return (
    <form className="card" onSubmit={(e) => void submit(e)}>
      <h2>{t('changePassword')}</h2>
      {error ? <div className="alert alert-error">{error}</div> : null}
      {msg ? <div className="alert alert-success">{msg}</div> : null}
      <div className="field">
        <label>{t('currentPassword')}</label>
        <input type="password" value={currentPassword} onChange={(e) => setCurrent(e.target.value)} required />
      </div>
      <div className="field">
        <label>{t('newPassword')}</label>
        <input type="password" value={newPassword} onChange={(e) => setNew(e.target.value)} required />
      </div>
      <button type="submit" className="btn btn-gold">
        {t('changePassword')}
      </button>
    </form>
  );
}
