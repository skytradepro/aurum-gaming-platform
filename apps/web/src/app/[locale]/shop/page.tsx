import { ShopCounter } from '@/components/ShopCounter';
import type { PublicConfig } from '@/lib/types';
import { apiFetch } from '@/lib/api';
import { serverApiFetch } from '@/lib/api-server';
import { isLocale } from '@aurum/i18n';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

interface Summary {
  shop: { name: string; code: string; currency: string; creditBalance: { amountMinor: string; currency: string } };
}

/** The shop: its prepaid balance (recharged by head office) and the player recharge counter. */
export default async function ShopPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations('shop');
  let summary: Summary | null = null;
  try {
    summary = await serverApiFetch<Summary>('/shop/summary', { locale });
  } catch {
    summary = null;
  }
  if (!summary) return <p className="alert alert-error">{t('unavailable')}</p>;
  const shop = summary.shop;
  let decimals = 3;
  try {
    decimals = (await apiFetch<PublicConfig>('/public/config', { locale })).currencies.find((c) => c.code === shop.currency)?.decimals ?? 3;
  } catch {
    decimals = 3;
  }
  const unit = 10n ** BigInt(decimals);
  const minor = BigInt(shop.creditBalance.amountMinor);
  const shown = decimals > 0 ? `${minor / unit}.${(minor % unit).toString().padStart(decimals, '0')}` : `${minor}`;
  return (
    <>
      <section className={minor > 0n ? 'card shop-balance-card' : 'card shop-balance-card is-empty'}>
        <div>
          <strong>{shop.name}</strong>
          <small className="muted">
            {' · '}
            <span dir="ltr">{shop.code}</span>
          </small>
        </div>
        <div className="shop-balance">
          <span>{t('balance')}</span>
          <b dir="ltr">
            {shown} {shop.currency}
          </b>
        </div>
        <p className="muted">{minor > 0n ? t('balanceHint') : t('balanceEmpty')}</p>
      </section>
      <ShopCounter balanceMinor={shop.creditBalance.amountMinor} currency={shop.currency} decimals={decimals} />
    </>
  );
}
