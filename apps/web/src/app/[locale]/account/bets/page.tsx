import { BetsList } from '@/components/BetsList';
import type { BetView } from '@/components/BetsList';
import { serverApiFetch } from '@/lib/api-server';
import type { PublicConfig } from '@/lib/types';
import { isLocale } from '@aurum/i18n';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function MyBetsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations('bets');
  let bets: BetView[] = [];
  let config: PublicConfig | null = null;
  try {
    config = await serverApiFetch<PublicConfig>('/public/config', { locale });
    bets = (await serverApiFetch<{ items: BetView[] }>('/bets/mine?limit=50', { locale })).items;
  } catch {
    bets = [];
  }
  return (
    <>
      <h2>{t('myBets')}</h2>
      <BetsList bets={bets} currencies={config?.currencies ?? []} locale={locale} />
    </>
  );
}
