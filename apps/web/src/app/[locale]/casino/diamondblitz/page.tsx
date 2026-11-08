import { GameGate } from '@/components/game/GameGate';
import { DiamondBlitzGame } from '@/components/game/DiamondBlitzGame';
import { isLocale } from '@aurum/i18n';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function HannibalDiamondBlitzPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <GameGate
      locale={locale}
      game="diamondblitz"
      titleKey="diamondblitzTitle"
      subtitleKey="diamondblitzSubtitle"
      render={({ currency, balanceMinor }) => <DiamondBlitzGame currency={currency} locale={locale} initialBalanceMinor={balanceMinor} />}
    />
  );
}
