import { GameGate } from '@/components/game/GameGate';
import { SugarHannibalGame } from '@/components/game/SugarHannibalGame';
import { isLocale } from '@aurum/i18n';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function SugarHannibalPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <GameGate
      locale={locale}
      game="sugarhannibal"
      titleKey="sugarhannibalTitle"
      subtitleKey="sugarhannibalSubtitle"
      render={({ currency, balanceMinor }) => <SugarHannibalGame currency={currency} locale={locale} initialBalanceMinor={balanceMinor} />}
    />
  );
}
