import { AdminDashboard } from '@/components/admin/AdminDashboard';
import { serverApiFetch } from '@/lib/api-server';
import { getSessionUser } from '@/lib/auth';
import type { DashboardSummary, PublicConfig } from '@/lib/types';
import { isLocale, type Locale } from '@aurum/i18n';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function AdminDashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations('admin');
  const user = await getSessionUser();
  if (!user) notFound();

  let dash: DashboardSummary | null = null;
  try {
    dash = await serverApiFetch<DashboardSummary>('/admin/dashboard', { locale });
  } catch {
    dash = null;
  }

  if (!dash) {
    return <p className="muted">{t('dash.noReports')}</p>;
  }

  let currencies = [] as PublicConfig['currencies'];
  try {
    currencies = (await serverApiFetch<PublicConfig>('/public/config', { locale })).currencies;
  } catch {
    currencies = [];
  }

  const scopedToShop = user.role === 'admin';

  return (
    <AdminDashboard
      dash={dash}
      currencies={currencies}
      locale={locale as Locale}
      username={user.username}
      isSuper={user.role === 'super_admin'}
      scopedToShop={scopedToShop}
    />
  );
}
