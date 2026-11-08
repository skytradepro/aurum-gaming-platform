import { ChangePasswordForm } from '@/components/ChangePasswordForm';
import { redirect } from '@/i18n/routing';
import { getSessionUser } from '@/lib/auth';
import { isLocale } from '@aurum/i18n';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

/** Where anyone (player, admin, cashier) who must change a temporary password lands. */
export default async function ChangePasswordPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const user = await getSessionUser();
  if (!user) return redirect({ href: '/login', locale });
  return <ChangePasswordForm />;
}
