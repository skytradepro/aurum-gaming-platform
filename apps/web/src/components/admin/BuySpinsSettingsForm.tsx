'use client';

import { errorMessageKey } from '@aurum/i18n';
import { ApiError, apiClient } from '@/lib/api';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export interface BuySpinsSettings {
  buy_spins_enabled: boolean;
  buy_spins_discount_pct: number;
  buy_spins_pack1: number;
  buy_spins_pack2: number;
  buy_spins_pack3: number;
  buy_spins_pack4: number;
}

const PACKS = ['buy_spins_pack1', 'buy_spins_pack2', 'buy_spins_pack3', 'buy_spins_pack4'] as const;

/** Super Admin: Hannibal Big Bass "buy spins" (on/off, discount, spins in each package). */
export function BuySpinsSettingsForm({ settings }: { settings: BuySpinsSettings }) {
  const t = useTranslations('adminBuySpins');
  const tRoot = useTranslations();
  const router = useRouter();
  const [discount, setDiscount] = useState(String(settings.buy_spins_discount_pct));
  const [packs, setPacks] = useState<string[]>(PACKS.map((k) => String(settings[k])));
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
  function save(e: React.FormEvent) {
    e.preventDefault();
    const d = Number(discount.trim());
    const p = packs.map((v) => Number(v.trim()));
    if (!Number.isInteger(d) || d < 0 || d > 90 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 200)) {
      setError(t('range'));
      return;
    }
    void run(async () => {
      await put('buy_spins_discount_pct', d);
      for (let i = 0; i < PACKS.length; i += 1) await put(PACKS[i] as string, p[i] ?? 0);
    });
  }

  return (
    <form className="card" onSubmit={save} style={{ display: 'grid', gap: '0.7rem' }}>
      <h2 style={{ margin: 0 }}>🎣 {t('title')}</h2>
      <p className="muted" style={{ margin: 0 }}>
        {t('help')}
      </p>
      {error ? <div className="alert alert-error">{error}</div> : null}
      {msg ? <div className="alert alert-success">{msg}</div> : null}
      <label style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
        <input type="checkbox" checked={settings.buy_spins_enabled} disabled={busy} onChange={(e) => void run(() => put('buy_spins_enabled', e.target.checked))} />
        {t('enabled')}
      </label>
      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'end' }}>
        <div className="field" style={{ margin: 0 }}>
          <label>{t('discount')}</label>
          <input className="input" inputMode="numeric" value={discount} onChange={(e) => setDiscount(e.target.value)} style={{ width: '7rem' }} />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>{t('packs')}</label>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            {packs.map((v, i) => (
              <input key={PACKS[i]} className="input" inputMode="numeric" value={v} onChange={(e) => setPacks((p) => p.map((x, j) => (j === i ? e.target.value : x)))} style={{ width: '5rem' }} />
            ))}
          </div>
        </div>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {t('save')}
        </button>
      </div>
    </form>
  );
}
