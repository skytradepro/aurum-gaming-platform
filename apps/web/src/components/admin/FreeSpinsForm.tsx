'use client';

import { errorMessageKey } from '@aurum/i18n';
import { ApiError, apiClient } from '@/lib/api';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

/** Super Admin: how often a paid slot spin also wins 5 free spins (1 in N spins, 0 = off). */
export function FreeSpinsForm({ oneIn }: { oneIn: number }) {
  const t = useTranslations('adminFreeSpins');
  const tRoot = useTranslations();
  const router = useRouter();
  const [value, setValue] = useState(String(oneIn));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setError(null);
    const n = Number(value.trim());
    if (!Number.isInteger(n) || n < 0 || n > 100000 || (n > 0 && n < 50)) {
      setError(t('range'));
      return;
    }
    setBusy(true);
    try {
      await apiClient('/admin/settings/free_spins_one_in', { method: 'PUT', json: { value: n } });
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
        <span>{t('oneIn')}</span>
        <input inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} style={{ maxWidth: 120 }} aria-label={t('title')} />
        <span>{t('spins')}</span>
        <button type="submit" className="btn btn-gold btn-sm" disabled={busy}>
          {t('save')}
        </button>
      </div>
    </form>
  );
}
