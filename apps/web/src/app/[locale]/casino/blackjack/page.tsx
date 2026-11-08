import { GameGate } from '@/components/game/GameGate';
import { BlackjackGame } from '@/components/game/BlackjackGame';
import { isLocale } from '@aurum/i18n';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function HannibalBlackjackPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <GameGate
      locale={locale}
      game="blackjack"
      titleKey="blackjackTitle"
      subtitleKey="blackjackSubtitle"
      render={({ currency, balanceMinor }) => <BlackjackGame currency={currency} locale={locale} initialBalanceMinor={balanceMinor} />}
    />
  );
}
