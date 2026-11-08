import { GameGate } from '@/components/game/GameGate';
import { TidalTreasureGame } from '@/components/game/TidalTreasureGame';
import { isLocale } from '@aurum/i18n';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function HannibalTidalTreasurePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <GameGate
      locale={locale}
      game="tidal"
      titleKey="tidalTitle"
      subtitleKey="tidalSubtitle"
      render={({ currency, balanceMinor }) => <TidalTreasureGame currency={currency} locale={locale} initialBalanceMinor={balanceMinor} />}
    />
  );
}
