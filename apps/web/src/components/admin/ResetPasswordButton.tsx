'use client';

import { errorMessageKey } from '@aurum/i18n';
import { ApiError, apiClient } from '@/lib/api';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

/** Uses existing POST /admin/players/:id/reset-password (same API as local backend). */
export function ResetPasswordButton({ userId, username }: { userId: string; username: string }) {
  const t = useTranslations('admin.common');
  const tRoot = useTranslations();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [temp, setTemp] = useState<string | null>(null);

  async function reset() {
    if (!window.confirm(t('resetConfirm'))) return;
    setBusy(true);
    setError(null);
    setTemp(null);
    try {
      const res = await apiClient<{ temporaryPassword: string }>(`/admin/players/${userId}/reset-password`, {
        method: 'POST',
      });
      setTemp(res.temporaryPassword);
    } catch (err) {
      setError(err instanceof ApiError ? tRoot(errorMessageKey(err.code) as never) : tRoot('errors.generic'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h3>{tRoot('admin.resetPassword')}</h3>
      {error ? <div className="alert alert-error">{error}</div> : null}
      {temp ? (
        <div className="alert alert-success">
          <p>{t('passwordReset')}</p>
          <p>
            <strong style={{ fontFamily: 'monospace', fontSize: '1.1em' }}>{temp}</strong>
          </p>
          <p className="muted">{t('temporaryPasswordNote')}</p>
        </div>
      ) : (
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void reset()}>
          {t('resetPassword')} ({username})
        </button>
      )}
    </div>
  );
}
