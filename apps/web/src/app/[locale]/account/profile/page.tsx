import { PreferencesForm } from '@/components/PreferencesForm';
import { serverApiFetch } from '@/lib/api-server';
import { getSessionUser } from '@/lib/auth';
import type { PublicConfig } from '@/lib/types';
import { isLocale } from '@aurum/i18n';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function ProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const user = await getSessionUser();
  if (!user) return null;
  let config: PublicConfig | null = null;
  try {
    config = await serverApiFetch<PublicConfig>('/public/config', { locale });
  } catch {
    config = null;
  }
  return <PreferencesForm user={user} currencies={config?.currencies ?? []} />;
}
