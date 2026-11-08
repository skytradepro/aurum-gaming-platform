'use client';

import { errorMessageKey } from '@aurum/i18n';
import { ApiError, apiClient } from '@/lib/api';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

interface Status {
  enabled: boolean;
  enabledAt: string | null;
}

/** Turn two-factor sign-in on or off for the signed-in account (players and staff). */
export function TwoFactorSettings() {
  const t = useTranslations('twoFactor');
  const tRoot = useTranslations();
  const [status, setStatus] = useState<Status | null>(null);
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    apiClient<Status>('/account/2fa')
      .then(setStatus)
      .catch(() => setStatus({ enabled: false, enabledAt: null }));
  }, []);

  function fail(err: unknown) {
    setError(err instanceof ApiError ? tRoot(errorMessageKey(err.code) as never) : tRoot('errors.generic'));
  }

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  const start = () =>
    run(async () => {
      setSetup(await apiClient<{ secret: string; otpauthUrl: string }>('/account/2fa/setup', { method: 'POST', json: {} }));
      setCode('');
    });

  const confirm = () =>
    run(async () => {
      setStatus(await apiClient<Status>('/account/2fa/enable', { method: 'POST', json: { code } }));
      setSetup(null);
      setCode('');
      setNotice(t('enabledNotice'));
    });

  const disable = () =>
    run(async () => {
      setStatus(await apiClient<Status>('/account/2fa/disable', { method: 'POST', json: { password, code } }));
      setPassword('');
      setCode('');
      setNotice(t('disabledNotice'));
    });

  const grouped = setup ? setup.secret.replace(/(.{4})/g, '$1 ').trim() : '';
  const codeInput = (
    <input
      className="otp-input"
      value={code}
      onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={6}
      dir="ltr"
      aria-label={t('codeLabel')}
      placeholder="000000"
    />
  );

  return (
    <div className="card twofa-card">
      <h2>{t('title')}</h2>
      <p className="muted">{t('intro')}</p>
      {status ? (
        <p className={status.enabled ? 'twofa-status is-on' : 'twofa-status'}>
          <span className="twofa-dot" />
          {status.enabled ? t('statusOn') : t('statusOff')}
        </p>
      ) : null}
      {error ? <div className="alert alert-error">{error}</div> : null}
      {notice ? <div className="alert alert-success">{notice}</div> : null}

      {status && !status.enabled && !setup ? (
        <button type="button" className="btn btn-gold" disabled={busy} onClick={() => void start()}>
          {t('start')}
        </button>
      ) : null}

      {setup ? (
        <div className="twofa-setup">
          <p>{t('step1')}</p>
          <p>{t('step2')}</p>
          <code className="twofa-secret" dir="ltr">
            {grouped}
          </code>
          <a className="btn btn-dark btn-sm" href={setup.otpauthUrl}>
            {t('openApp')}
          </a>
          <p>{t('step3')}</p>
          {codeInput}
          <button type="button" className="btn btn-gold" disabled={busy || code.length !== 6} onClick={() => void confirm()}>
            {t('confirm')}
          </button>
          <p className="muted twofa-warn">{t('keepSecret')}</p>
        </div>
      ) : null}

      {status?.enabled ? (
        <div className="twofa-setup">
          <h3>{t('disableTitle')}</h3>
          <div className="field">
            <label htmlFor="twofa-pw">{t('passwordLabel')}</label>
            <input id="twofa-pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </div>
          <div className="field">
            <label>{t('codeLabel')}</label>
            {codeInput}
          </div>
          <button type="button" className="btn btn-dark" disabled={busy || code.length !== 6 || !password} onClick={() => void disable()}>
            {t('disable')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
