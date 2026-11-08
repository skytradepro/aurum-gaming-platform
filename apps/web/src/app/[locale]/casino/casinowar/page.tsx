import { CasinoWarGame } from '@/components/game/TableGames';
import { GameGate } from '@/components/game/GameGate';
import { isLocale } from '@aurum/i18n';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function CasinoWarPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <GameGate
      locale={locale}
      game="casinowar"
      titleKey="casinowarTitle"
      subtitleKey="casinowarSubtitle"
      render={({ currency, balanceMinor }) => <CasinoWarGame currency={currency} locale={locale} initialBalanceMinor={balanceMinor} />}
    />
  );
}
