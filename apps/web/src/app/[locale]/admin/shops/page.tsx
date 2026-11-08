import { ShopsManager } from '@/components/admin/ShopsManager';
import type { AdminShop } from '@/components/admin/ShopsManager';
import { apiFetch } from '@/lib/api';
import { serverApiFetch } from '@/lib/api-server';
import { getSessionUser, hasPermission } from '@/lib/auth';
import type { PublicConfig } from '@/lib/types';
import { isLocale } from '@aurum/i18n';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

/** Head office: shops, their prepaid balance (recharge), their logins and open / stop. */
export default async function AdminShopsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations('shopAdmin');
  const user = await getSessionUser();
  let items: AdminShop[] = [];
  try {
    items = (await serverApiFetch<{ items: AdminShop[] }>('/admin/shops', { locale })).items;
  } catch {
    items = [];
  }
  let currencies: { code: string; decimals: number }[] = [];
  try {
    currencies = (await apiFetch<PublicConfig>('/public/config', { locale })).currencies.map((c) => ({ code: c.code, decimals: c.decimals }));
  } catch {
    currencies = [{ code: 'TND', decimals: 3 }];
  }
  return (
    <>
      <h2>{t('title')}</h2>
      <p className="muted">{t('intro')}</p>
      <ShopsManager
        initial={items}
        currencies={currencies}
        canManage={user ? hasPermission(user, 'shops.manage') : false}
        canCash={user ? hasPermission(user, 'shops.cash') : false}
      />
    </>
  );
}
