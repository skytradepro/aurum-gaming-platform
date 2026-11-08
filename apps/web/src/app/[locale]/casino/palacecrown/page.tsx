import { GameGate } from '@/components/game/GameGate';
import { PalaceCrownGame } from '@/components/game/LineGames';
import { isLocale } from '@aurum/i18n';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function HannibalPalaceCrownPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <GameGate
      locale={locale}
      game="palacecrown"
      titleKey="palacecrownTitle"
      subtitleKey="palacecrownSubtitle"
      render={({ currency, balanceMinor }) => <PalaceCrownGame currency={currency} locale={locale} initialBalanceMinor={balanceMinor} />}
    />
  );
}
