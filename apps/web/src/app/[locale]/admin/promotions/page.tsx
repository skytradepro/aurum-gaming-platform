import { PromotionsManager } from '@/components/admin/PromotionsManager';
import { serverApiFetch } from '@/lib/api-server';
import type { AdminPromotion } from '@/lib/admin-content';
import { isLocale } from '@aurum/i18n';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function AdminPromotionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations('admin');
  let items: AdminPromotion[] = [];
  let denied = false;
  try {
    const res = await serverApiFetch<{ items: AdminPromotion[] }>('/admin/promotions', { locale });
    items = res.items;
  } catch {
    denied = true;
  }
  return (
    <>
      <h2>{t('promotions')}</h2>
      {denied ? <div className="alert alert-error">{t('noAccess')}</div> : <PromotionsManager initial={items} />}
    </>
  );
}
