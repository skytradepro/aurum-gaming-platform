import { CrashGame } from '@/components/game/CrashGame';
import { GameGate } from '@/components/game/GameGate';
import { isLocale } from '@aurum/i18n';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function CrashPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <GameGate
      locale={locale}
      game="crash"
      titleKey="crashTitle"
      subtitleKey="crashSubtitle"
      render={({ currency, balanceMinor }) => <CrashGame currency={currency} locale={locale} initialBalanceMinor={balanceMinor} />}
    />
  );
}
