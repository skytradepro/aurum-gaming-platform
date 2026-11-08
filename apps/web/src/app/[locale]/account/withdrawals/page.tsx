import { WithdrawalCenter } from '@/components/WithdrawalCenter';
import type { OnlineWithdrawalItem, PayoutNetwork } from '@/components/WithdrawalCenter';
import { serverApiFetch } from '@/lib/api-server';
import type { PublicConfig, WithdrawalItem } from '@/lib/types';
import { isLocale } from '@aurum/i18n';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function WithdrawalsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  let config: PublicConfig | null = null;
  let shopItems: WithdrawalItem[] = [];
  let online: { items: OnlineWithdrawalItem[]; open: boolean; hasDeposit: boolean } = { items: [], open: false, hasDeposit: false };
  let networks: PayoutNetwork[] = [];
  try {
    config = await serverApiFetch<PublicConfig>('/public/config', { locale });
  } catch {
    config = null;
  }
  try {
    shopItems = (await serverApiFetch<{ items: WithdrawalItem[] }>('/account/withdrawals?limit=50', { locale })).items;
  } catch {
    shopItems = [];
  }
  try {
    online = await serverApiFetch<typeof online>('/account/online-withdrawals', { locale });
  } catch {
    online = { items: [], open: config?.withdrawalsOpen ?? false, hasDeposit: false };
  }
  try {
    networks = (await serverApiFetch<{ items: PayoutNetwork[] }>('/crypto/networks', { locale })).items.map((n) => ({ code: n.code, coin: n.coin, chain: n.chain }));
  } catch {
    networks = [];
  }
  return (
    <WithdrawalCenter
      shopItems={shopItems}
      onlineItems={online.items}
      open={config?.withdrawalsOpen ?? online.open}
      hasDeposit={online.hasDeposit}
      networks={networks}
      currencies={config?.currencies ?? []}
      locale={locale}
    />
  );
}
