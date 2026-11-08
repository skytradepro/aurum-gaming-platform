import { CreatePlayerForm } from '@/components/admin/CreatePlayerForm';
import { apiFetch } from '@/lib/api';
import { getSessionUser } from '@/lib/auth';
import type { PublicConfig } from '@/lib/types';
import { isLocale } from '@aurum/i18n';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function NewPlayerPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations('admin');
  const user = await getSessionUser();
  if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) return <p>{t('noAccess')}</p>;
  try {
    const config = await apiFetch<PublicConfig>('/public/config', { locale });
    return <CreatePlayerForm countries={config.countries} currencies={config.currencies} />;
  } catch {
    return <p>{t('noAccess')}</p>;
  }
}
