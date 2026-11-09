import { StaffDetail } from '@/components/admin/StaffDetail';
import type { StaffPlayer } from '@/components/admin/StaffDetail';
import { StaffManager } from '@/components/admin/StaffManager';
import type { StaffRow } from '@/components/admin/StaffManager';
import { apiFetch } from '@/lib/api';
import { serverApiFetch } from '@/lib/api-server';
import { getSessionUser } from '@/lib/auth';
import type { DashboardSummary, PublicConfig } from '@/lib/types';
import { AdminDashboard } from '@/components/admin/AdminDashboard';
import type { Locale } from '@aurum/i18n';
import { isLocale } from '@aurum/i18n';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Super Admin: all admins (?admin=<id> opens the page of one admin: balance, players, options). */
export default async function AdminStaffPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ admin?: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations('admin');
  const user = await getSessionUser();
  if (!user || user.role !== 'super_admin') return <p>{t('noAccess')}</p>;
  let currencies: { code: string; decimals: number }[] = [];
  try {
    currencies = (await apiFetch<PublicConfig>('/public/config', { locale })).currencies.map((c) => ({ code: c.code, decimals: c.decimals }));
  } catch {
    currencies = [{ code: 'TND', decimals: 3 }];
  }

  const adminId = ((await searchParams).admin ?? '').trim();
  if (adminId && UUID.test(adminId)) {
    try {
      const [{ staff }, { items }, dash] = await Promise.all([
        serverApiFetch<{ staff: StaffRow }>(`/admin/staff/${adminId}`, { locale }),
        serverApiFetch<{ items: StaffPlayer[] }>(`/admin/players?ownerId=${adminId}&limit=100`, { locale }),
        serverApiFetch<DashboardSummary>(`/admin/dashboard?ownerId=${adminId}`, { locale }).catch(() => null),
      ]);
      const configCurrencies = (await serverApiFetch<PublicConfig>('/public/config', { locale }).catch(() => null))?.currencies ?? [];
      return (
        <StaffDetail key={staff.id} staff={staff} players={items} currencies={currencies}>
          {dash ? (
            <AdminDashboard
              dash={dash}
              currencies={configCurrencies}
              locale={locale as Locale}
              username={staff.username}
              isSuper={false}
              scopedToShop
            />
          ) : null}
        </StaffDetail>
      );
    } catch {
      // unknown or deleted admin: show the list
    }
  }

  try {
    const { items } = await serverApiFetch<{ items: StaffRow[] }>('/admin/staff', { locale });
    return <StaffManager staff={items} currencies={currencies} />;
  } catch {
    return <p>{t('noAccess')}</p>;
  }
}
