import { BannersManager } from '@/components/admin/BannersManager';
import { serverApiFetch } from '@/lib/api-server';
import type { AdminBanner } from '@/lib/admin-content';
import { isLocale } from '@aurum/i18n';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function AdminBannersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations('admin');
  let items: AdminBanner[] = [];
  let denied = false;
  try {
    const res = await serverApiFetch<{ items: AdminBanner[] }>('/admin/banners', { locale });
    items = res.items;
  } catch {
    denied = true;
  }
  return (
    <>
      <h2>{t('banners')}</h2>
      {denied ? <div className="alert alert-error">{t('noAccess')}</div> : <BannersManager initial={items} />}
    </>
  );
}
