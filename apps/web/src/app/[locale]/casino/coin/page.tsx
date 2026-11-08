import { CoinGame } from '@/components/game/CoinGame';
import { GameGate } from '@/components/game/GameGate';
import { isLocale } from '@aurum/i18n';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function CoinPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <GameGate
      locale={locale}
      game="coin"
      titleKey="coinTitle"
      subtitleKey="coinSubtitle"
      render={({ currency, balanceMinor }) => <CoinGame currency={currency} locale={locale} initialBalanceMinor={balanceMinor} />}
    />
  );
}
