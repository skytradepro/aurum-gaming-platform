import { GiftBox } from '@/components/GiftBox';
import type { GiftStatusDTO } from '@/components/GiftBox';
import { apiFetch } from '@/lib/api';
import { serverApiFetch } from '@/lib/api-server';
import { getSessionUser } from '@/lib/auth';
import { findCurrency } from '@/lib/money-display';
import type { CurrencyDTO, PublicConfig } from '@/lib/types';
import { isLocale } from '@aurum/i18n';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

/** Daily gift page: one gift a day for every player. */
export default async function GiftPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const user = await getSessionUser();
  let status: GiftStatusDTO | null = null;
  let currency: CurrencyDTO | null = null;
  if (user && user.role === 'user') {
    try {
      status = await serverApiFetch<GiftStatusDTO>('/gift', { locale });
      const config = await apiFetch<PublicConfig>('/public/config', { locale });
      currency = findCurrency(config.currencies, status.currency) ?? null;
    } catch {
      status = { enabled: false, state: 'off', nextAt: new Date().toISOString(), currency: null, amountMinor: null, min: null, max: null };
    }
  }
  return <GiftBox initial={status} currency={currency} locale={locale} />;
}
