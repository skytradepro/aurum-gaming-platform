import { StrikeGame } from '@/components/game/StrikeGame';
import { GameGate } from '@/components/game/GameGate';
import { isLocale } from '@aurum/i18n';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function StrikePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <GameGate
      locale={locale}
      game="strike"
      titleKey="strikeTitle"
      subtitleKey="strikeSubtitle"
      render={({ currency, balanceMinor }) => <StrikeGame currency={currency} locale={locale} initialBalanceMinor={balanceMinor} />}
    />
  );
}
