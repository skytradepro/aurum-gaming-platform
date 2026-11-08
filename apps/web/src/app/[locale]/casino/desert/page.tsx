import { GameGate } from '@/components/game/GameGate';
import { DesertRichesGame } from '@/components/game/DesertRichesGame';
import { isLocale } from '@aurum/i18n';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function DesertRichesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <GameGate
      locale={locale}
      game="desert"
      titleKey="desertTitle"
      subtitleKey="desertSubtitle"
      render={({ currency, balanceMinor }) => <DesertRichesGame currency={currency} locale={locale} initialBalanceMinor={balanceMinor} />}
    />
  );
}
