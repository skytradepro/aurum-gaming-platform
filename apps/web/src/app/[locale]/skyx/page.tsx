import { SkyxLoginForm } from '@/components/SkyxLoginForm';
import { getSessionUser, isStaff } from '@/lib/auth';
import { isLocale } from '@aurum/i18n';
import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';

export const metadata: Metadata = { title: 'Admin Shop', robots: { index: false, follow: false } };

export default async function SkyxPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const user = await getSessionUser();
  if (user && isStaff(user)) redirect(`/${locale}/skyx/enter`);
  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <SkyxLoginForm />
      </div>
    </div>
  );
}
