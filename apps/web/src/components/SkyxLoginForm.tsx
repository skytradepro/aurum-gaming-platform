'use client';

import { errorMessageKey } from '@aurum/i18n';
import { ApiError, apiClient } from '@/lib/api';
import type { MeUser } from '@/lib/types';
import { Icon } from './Icon';
import { TwoFactorLoginStep } from './TwoFactorLoginStep';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';

/**
 * Admin Shop entrance (footer "Admin Shop" link, address /skyx). Only admin and super admin accounts get through;
 * anyone else is signed out again and sees the same message as a wrong password.
 */
export function SkyxLoginForm() {
  const t = useTranslations('auth.login');
  const ts = useTranslations('skyx');
  const tRoot = useTranslations();
  const locale = useLocale();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ticket, setTicket] = useState<string | null>(null);

  async function after(user: MeUser) {
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include', headers: { 'x-aurum-client': 'web' } }).catch(() => undefined);
      setTicket(null);
      setError(tRoot(errorMessageKey('invalid_credentials') as never));
      return;
    }
    if (user.mustChangePassword) {
      window.location.assign(`/${locale}/change-password`);
      return;
    }
    // The server checks the session again and only then opens the panel.
    window.location.assign(`/${locale}/skyx/enter`);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient<{ user?: MeUser; twoFactorRequired?: boolean; ticket?: string }>('/auth/login', { method: 'POST', json: { identifier, password } });
      setPassword('');
      if (res.twoFactorRequired && res.ticket) {
        setTicket(res.ticket);
        return;
      }
      if (res.user) await after(res.user);
    } catch (err) {
      setPassword('');
      setError(err instanceof ApiError ? tRoot(errorMessageKey(err.code) as never) : tRoot('errors.generic'));
    } finally {
      setLoading(false);
    }
  }

  if (ticket) return <TwoFactorLoginStep ticket={ticket} onDone={(u) => void after(u)} onBack={() => setTicket(null)} />;

  return (
    <form className="card skyx-card" onSubmit={(e) => void submit(e)} autoComplete="off">
      <div className="skyx-brand">
        <span className="skyx-logo" aria-hidden="true">
          <Icon name="shop" />
        </span>
        <span className="skyx-mark">{ts('title')}</span>
        <span className="muted">{ts('subtitle')}</span>
      </div>
      {error ? <div className="alert alert-error">{error}</div> : null}
      <div className="field">
        <label htmlFor="skyx-id">{t('identifier')}</label>
        <input id="skyx-id" value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" required />
      </div>
      <div className="field">
        <label htmlFor="skyx-pw">{t('password')}</label>
        <input id="skyx-pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
      </div>
      <button type="submit" className="btn btn-gold" disabled={loading}>
        {t('submit')}
      </button>
    </form>
  );
}
