import { AndarBaharGame } from '@/components/game/TableGames';
import { GameGate } from '@/components/game/GameGate';
import { isLocale } from '@aurum/i18n';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function AndarBaharPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <GameGate
      locale={locale}
      game="andarbahar"
      titleKey="andarbaharTitle"
      subtitleKey="andarbaharSubtitle"
      render={({ currency, balanceMinor }) => <AndarBaharGame currency={currency} locale={locale} initialBalanceMinor={balanceMinor} />}
    />
  );
}
