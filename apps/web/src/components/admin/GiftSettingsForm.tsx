'use client';

import { errorMessageKey } from '@aurum/i18n';
import { ApiError, apiClient } from '@/lib/api';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export interface GiftSettings {
  gift_enabled: boolean;
  gift_min_cents: number;
  gift_max_cents: number;
  gift_daily_limit: number;
  gift_need_deposit: boolean;
}

/** Super Admin: the daily gift of the gift page (on/off, smallest and biggest gift, gifts per day, deposit first). */
export function GiftSettingsForm({ settings }: { settings: GiftSettings }) {
  const t = useTranslations('adminGift');
  const tRoot = useTranslations();
  const router = useRouter();
  const [min, setMin] = useState((settings.gift_min_cents / 100).toFixed(2));
  const [max, setMax] = useState((settings.gift_max_cents / 100).toFixed(2));
  const [limit, setLimit] = useState(String(settings.gift_daily_limit));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function put(key: string, value: number | boolean) {
    await apiClient(`/admin/settings/${key}`, { method: 'PUT', json: { value } });
  }
  async function run(fn: () => Promise<void>) {
    setMsg(null);
    setError(null);
    setBusy(true);
    try {
      await fn();
      setMsg(t('saved'));
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? tRoot(errorMessageKey(err.code) as never) : tRoot('errors.generic' as never));
    } finally {
      setBusy(false);
    }
  }
  function saveAmounts(e: React.FormEvent) {
    e.preventDefault();
    const a = Number(min.replace(',', '.'));
    const b = Number(max.replace(',', '.'));
    const n = Number(limit.trim());
    if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0.01 || b < a || b > 1000 || !Number.isInteger(n) || n < 0 || n > 100000) {
      setError(t('range'));
      return;
    }
    void run(async () => {
      await put('gift_min_cents', Math.round(a * 100));
      await put('gift_max_cents', Math.round(b * 100));
      await put('gift_daily_limit', n);
    });
  }

  return (
    <form className="card" onSubmit={saveAmounts} style={{ display: 'grid', gap: '0.7rem' }}>
      <h2 style={{ margin: 0 }}>🎁 {t('title')}</h2>
      <p className="muted" style={{ margin: 0 }}>
        {t('help')}
      </p>
      {error ? <div className="alert alert-error">{error}</div> : null}
      {msg ? <div className="alert alert-success">{msg}</div> : null}
      <label style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
        <input type="checkbox" checked={settings.gift_enabled} disabled={busy} onChange={(e) => void run(() => put('gift_enabled', e.target.checked))} />
        {t('enabled')}
      </label>
      <label style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
        <input type="checkbox" checked={settings.gift_need_deposit} disabled={busy} onChange={(e) => void run(() => put('gift_need_deposit', e.target.checked))} />
        {t('needDeposit')}
      </label>
      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'end' }}>
        <div className="field" style={{ margin: 0 }}>
          <label>{t('min')}</label>
          <input inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} style={{ maxWidth: 120 }} />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>{t('max')}</label>
          <input inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} style={{ maxWidth: 120 }} />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>{t('limit')}</label>
          <input inputMode="numeric" value={limit} onChange={(e) => setLimit(e.target.value)} style={{ maxWidth: 120 }} />
        </div>
        <button type="submit" className="btn btn-gold btn-sm" disabled={busy}>
          {t('save')}
        </button>
      </div>
      <small className="muted">{t('note')}</small>
    </form>
  );
}
