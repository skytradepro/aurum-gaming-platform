'use client';

import { errorMessageKey } from '@aurum/i18n';
import { ApiError, apiClient } from '@/lib/api';
import { useRouter } from '@/i18n/routing';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';

type Key = 'registration_open' | 'withdrawals_open' | 'admin_secret_link_enabled';

/** Super Admin: site switches that can be turned on and off at any time. Each change is audited. */
export function SiteSwitchesForm({ settings, secretPath }: { settings: Record<Key, boolean>; secretPath: string | null }) {
  const t = useTranslations('admin');
  const tRoot = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const secretUrl = secretPath ? `/${locale}/${secretPath}` : null;

  async function save(key: Key, value: boolean) {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await apiClient(`/admin/settings/${key}`, { method: 'PUT', json: { value } });
      setNotice(t('switchSaved'));
      // Turning the secret link on: open it once so this browser keeps access to the panel.
      if (key === 'admin_secret_link_enabled' && value && secretUrl) {
        window.location.assign(secretUrl);
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? tRoot(errorMessageKey(err.code) as never) : tRoot('errors.generic' as never));
    } finally {
      setBusy(false);
    }
  }

  const rows: { key: Key; label: string; help: string; disabled?: boolean }[] = [
    { key: 'registration_open', label: t('registrationOpen'), help: t('registrationOpenHelp') },
    { key: 'withdrawals_open', label: t('withdrawalsOpen'), help: t('withdrawalsOpenHelp') },
    { key: 'admin_secret_link_enabled', label: t('secretLink'), help: t('secretLinkHelp'), disabled: !secretPath },
  ];

  return (
    <div className="card switches-card">
      <h2>{t('settings')}</h2>
      {error ? <div className="alert alert-error">{error}</div> : null}
      {notice ? <div className="alert alert-success">{notice}</div> : null}
      {rows.map((r) => {
        const on = settings[r.key];
        return (
          <div key={r.key} className="switch-row">
            <div className="switch-text">
              <strong>{r.label}</strong>
              <span className="muted">{r.help}</span>
            </div>
            <span className={on ? 'switch-state is-on' : 'switch-state'}>{on ? t('stateOn') : t('stateOff')}</span>
            <button
              type="button"
              role="switch"
              aria-checked={on}
              aria-label={r.label}
              className={on ? 'switch is-on' : 'switch'}
              disabled={busy || r.disabled}
              onClick={() => void save(r.key, !on)}
            >
              <span />
            </button>
          </div>
        );
      })}
      <div className="secret-link-box">
        <strong>{t('secretLinkYours')}</strong>
        {secretUrl ? (
          <code dir="ltr">{secretUrl}</code>
        ) : (
          <span className="muted">{t('secretLinkMissing')}</span>
        )}
        <span className="muted">{t('secretLinkKeep')}</span>
      </div>
    </div>
  );
}
