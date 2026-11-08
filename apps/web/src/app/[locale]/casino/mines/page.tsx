import { MinesGame } from '@/components/game/MinesGame';
import { GameGate } from '@/components/game/GameGate';
import { isLocale } from '@aurum/i18n';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function MinesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <GameGate
      locale={locale}
      game="mines"
      titleKey="minesTitle"
      subtitleKey="minesSubtitle"
      render={({ currency, balanceMinor }) => <MinesGame currency={currency} locale={locale} initialBalanceMinor={balanceMinor} />}
    />
  );
}
