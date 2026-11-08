import { GameGate } from '@/components/game/GameGate';
import { PowerHotGame } from '@/components/game/LineGames';
import { isLocale } from '@aurum/i18n';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function PowerHotPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <GameGate
      locale={locale}
      game="powerhot"
      titleKey="powerhotTitle"
      subtitleKey="powerhotSubtitle"
      render={({ currency, balanceMinor }) => <PowerHotGame currency={currency} locale={locale} initialBalanceMinor={balanceMinor} />}
    />
  );
}
