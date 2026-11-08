import { SicBoGame } from '@/components/game/SicBoGame';
import { GameGate } from '@/components/game/GameGate';
import { isLocale } from '@aurum/i18n';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function SicBoPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <GameGate
      locale={locale}
      game="sicbo"
      titleKey="sicboTitle"
      subtitleKey="sicboSubtitle"
      render={({ currency, balanceMinor }) => <SicBoGame currency={currency} locale={locale} initialBalanceMinor={balanceMinor} />}
    />
  );
}
