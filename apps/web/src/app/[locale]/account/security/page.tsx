import { ChangePasswordForm } from '@/components/ChangePasswordForm';
import { TwoFactorSettings } from '@/components/TwoFactorSettings';
import { isLocale } from '@aurum/i18n';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function SecurityPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <TwoFactorSettings />
      <ChangePasswordForm />
    </div>
  );
}
