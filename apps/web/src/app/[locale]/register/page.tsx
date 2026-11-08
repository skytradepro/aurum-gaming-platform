import { RegisterForm } from '@/components/RegisterForm';
import { redirect } from '@/i18n/routing';
import { apiFetch } from '@/lib/api';
import { getSessionUser } from '@/lib/auth';
import type { PublicConfig } from '@/lib/types';
import { isLocale } from '@aurum/i18n';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function RegisterPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const user = await getSessionUser();
  if (user) return redirect({ href: '/account', locale });
  let config: PublicConfig | null = null;
  try {
    config = await apiFetch<PublicConfig>('/public/config', { locale });
  } catch {
    config = null;
  }
  return (
    <div className="auth-wrap">
      <div className="auth-card" style={{ width: 'min(560px, 100%)' }}>
        <RegisterForm config={config} />
      </div>
    </div>
  );
}
