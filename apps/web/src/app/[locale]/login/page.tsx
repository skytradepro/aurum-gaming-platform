import { LoginForm } from '@/components/LoginForm';
import { redirect } from '@/i18n/routing';
import { getSessionUser } from '@/lib/auth';
import { isLocale } from '@aurum/i18n';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const user = await getSessionUser();
  if (user) return redirect({ href: '/account', locale });
  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <LoginForm />
      </div>
    </div>
  );
}
