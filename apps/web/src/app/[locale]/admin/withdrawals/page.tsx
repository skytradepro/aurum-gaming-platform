import { AdminWithdrawals } from '@/components/admin/AdminWithdrawals';
import type { AdminOnlineItem, AdminShopItem } from '@/components/admin/AdminWithdrawals';
import { serverApiFetch } from '@/lib/api-server';
import { getSessionUser, hasPermission } from '@/lib/auth';
import type { PublicConfig } from '@/lib/types';
import { isLocale } from '@aurum/i18n';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function AdminWithdrawalsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations('admin');
  const user = await getSessionUser();
  let shop: AdminShopItem[] = [];
  let online: AdminOnlineItem[] = [];
  let config: PublicConfig | null = null;
  try {
    shop = (await serverApiFetch<{ items: AdminShopItem[] }>('/admin/withdrawals?limit=50', { locale })).items;
  } catch {
    shop = [];
  }
  try {
    online = (await serverApiFetch<{ items: AdminOnlineItem[] }>('/admin/online-withdrawals', { locale })).items;
  } catch {
    online = [];
  }
  try {
    config = await serverApiFetch<PublicConfig>('/public/config', { locale });
  } catch {
    config = null;
  }
  return (
    <>
      <h2>{t('withdrawals')}</h2>
      <AdminWithdrawals
        online={online}
        shop={shop}
        currencies={config?.currencies ?? []}
        locale={locale}
        canManage={user ? hasPermission(user, 'withdrawals.manage') : false}
        isSuper={user?.role === 'super_admin'}
        open={config?.withdrawalsOpen ?? false}
      />
    </>
  );
}
