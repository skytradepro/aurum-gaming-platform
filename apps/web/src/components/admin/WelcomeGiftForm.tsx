'use client';

import { errorMessageKey } from '@aurum/i18n';
import { ApiError, apiClient } from '@/lib/api';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

/** Super Admin: the welcome gift every new player receives once (0 = off). Stored in hundredths of the account currency. */
export function WelcomeGiftForm({ cents }: { cents: number }) {
  const t = useTranslations('adminWelcome');
  const tRoot = useTranslations();
  const router = useRouter();
  const [value, setValue] = useState((cents / 100).toFixed(2));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setError(null);
    const n = Number(value.replace(',', '.'));
    if (!Number.isFinite(n) || n < 0 || n > 10) {
      setError(t('range'));
      return;
    }
    setBusy(true);
    try {
      await apiClient('/admin/settings/welcome_gift_cents', { method: 'PUT', json: { value: Math.round(n * 100) } });
      setMsg(t('saved'));
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? tRoot(errorMessageKey(err.code) as never) : tRoot('errors.generic' as never));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={(e) => void save(e)} style={{ display: 'grid', gap: '0.6rem' }}>
      <h2 style={{ margin: 0 }}>{t('title')}</h2>
      <p className="muted" style={{ margin: 0 }}>
        {t('help')}
      </p>
      {error ? <div className="alert alert-error">{error}</div> : null}
      {msg ? <div className="alert alert-success">{msg}</div> : null}
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} style={{ maxWidth: 140 }} aria-label={t('title')} />
        <button type="submit" className="btn btn-gold btn-sm" disabled={busy}>
          {t('save')}
        </button>
      </div>
    </form>
  );
}
