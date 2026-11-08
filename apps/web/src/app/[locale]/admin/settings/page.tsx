import { SiteSwitchesForm } from '@/components/admin/SiteSwitchesForm';
import { WelcomeGiftForm } from '@/components/admin/WelcomeGiftForm';
import { FreeSpinsForm } from '@/components/admin/FreeSpinsForm';
import { GiftSettingsForm } from '@/components/admin/GiftSettingsForm';
import { BuySpinsSettingsForm } from '@/components/admin/BuySpinsSettingsForm';
import { serverApiFetch } from '@/lib/api-server';
import { isLocale } from '@aurum/i18n';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';

export default async function AdminSettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations('admin');
  const user = await getSessionUser();
  if (user?.role !== 'super_admin') return <p>{t('superOnly')}</p>;

  let settings: Record<string, boolean | number> | null = null;
  try {
    const res = await serverApiFetch<{ settings: Record<string, boolean | number> }>('/admin/settings', { locale });
    settings = res.settings;
  } catch {
    settings = null;
  }
  if (!settings) return <p className="card">{t('noAccess')}</p>;

  const secret = (process.env.ADMIN_SECRET_PATH ?? '').trim().replace(/^\/+|\/+$/g, '');
  const secretPath = /^[a-z0-9-]{16,80}$/.test(secret) ? secret : null;

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <SiteSwitchesForm
        secretPath={secretPath}
        settings={{
          registration_open: settings.registration_open === true,
          withdrawals_open: settings.withdrawals_open === true,
          admin_secret_link_enabled: settings.admin_secret_link_enabled === true,
        }}
      />
      <WelcomeGiftForm cents={typeof settings.welcome_gift_cents === 'number' ? settings.welcome_gift_cents : 50} />
      <FreeSpinsForm oneIn={typeof settings.free_spins_one_in === 'number' ? settings.free_spins_one_in : 400} />
      <GiftSettingsForm
        settings={{
          gift_enabled: settings.gift_enabled === true,
          gift_min_cents: typeof settings.gift_min_cents === 'number' ? settings.gift_min_cents : 10,
          gift_max_cents: typeof settings.gift_max_cents === 'number' ? settings.gift_max_cents : 100,
          gift_daily_limit: typeof settings.gift_daily_limit === 'number' ? settings.gift_daily_limit : 200,
          gift_need_deposit: settings.gift_need_deposit !== false,
        }}
      />
      <BuySpinsSettingsForm
        settings={{
          buy_spins_enabled: settings.buy_spins_enabled !== false,
          buy_spins_discount_pct: typeof settings.buy_spins_discount_pct === 'number' ? settings.buy_spins_discount_pct : 30,
          buy_spins_pack1: typeof settings.buy_spins_pack1 === 'number' ? settings.buy_spins_pack1 : 20,
          buy_spins_pack2: typeof settings.buy_spins_pack2 === 'number' ? settings.buy_spins_pack2 : 40,
          buy_spins_pack3: typeof settings.buy_spins_pack3 === 'number' ? settings.buy_spins_pack3 : 60,
          buy_spins_pack4: typeof settings.buy_spins_pack4 === 'number' ? settings.buy_spins_pack4 : 100,
        }}
      />
      <div className="card">
        <p>
          {t('withdrawalExpiryHours')}: {String(settings.withdrawal_expiry_hours)}
        </p>
      </div>
    </div>
  );
}
