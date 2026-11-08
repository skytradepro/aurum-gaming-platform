'use client';

import { Link, useRouter } from '@/i18n/routing';
import { errorMessageKey } from '@aurum/i18n';
import { ApiError, apiClient } from '@/lib/api';
import type { MeUser } from '@/lib/types';
import { TwoFactorLoginStep } from './TwoFactorLoginStep';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export function LoginForm() {
  const t = useTranslations('auth.login');
  const tRoot = useTranslations();
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ticket, setTicket] = useState<string | null>(null);

  function go(user: MeUser) {
    if (user.mustChangePassword) router.push('/change-password');
    else if (user.role === 'cashier') router.push('/shop');
    else if (user.role === 'admin' || user.role === 'super_admin') router.push('/admin');
    else router.push('/account');
    router.refresh();
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
      if (res.user) go(res.user);
    } catch (err) {
      setError(err instanceof ApiError ? tRoot(errorMessageKey(err.code) as never) : tRoot('errors.generic'));
    } finally {
      setLoading(false);
    }
  }

  if (ticket) return <TwoFactorLoginStep ticket={ticket} onDone={go} onBack={() => setTicket(null)} />;

  return (
    <form className="card register-form" onSubmit={(e) => void submit(e)}>
      <h1>{t('title')}</h1>
      {error ? <div className="alert alert-error">{error}</div> : null}
      <div className="field">
        <label htmlFor="identifier">{t('identifier')}</label>
        <input id="identifier" value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" required />
      </div>
      <div className="field">
        <label htmlFor="password">{t('password')}</label>
        <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
      </div>
      <button type="submit" className="btn btn-gold register-submit" disabled={loading}>
        {t('submit')}
      </button>
      <p className="register-foot">
        {t('noAccount')} <Link href="/register">{t('registerLink')}</Link>
      </p>
    </form>
  );
}
