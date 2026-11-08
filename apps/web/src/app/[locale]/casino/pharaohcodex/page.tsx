import { GameGate } from '@/components/game/GameGate';
import { PharaohCodexGame } from '@/components/game/LineGames';
import { isLocale } from '@aurum/i18n';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function HannibalPharaohCodexPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <GameGate
      locale={locale}
      game="pharaohcodex"
      titleKey="pharaohcodexTitle"
      subtitleKey="pharaohcodexSubtitle"
      render={({ currency, balanceMinor }) => <PharaohCodexGame currency={currency} locale={locale} initialBalanceMinor={balanceMinor} />}
    />
  );
}
