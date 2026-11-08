import { GameGate } from '@/components/game/GameGate';
import { VaultHeistGame } from '@/components/game/LineGames';
import { isLocale } from '@aurum/i18n';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function HannibalVaultHeistPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <GameGate
      locale={locale}
      game="vaultheist"
      titleKey="vaultheistTitle"
      subtitleKey="vaultheistSubtitle"
      render={({ currency, balanceMinor }) => <VaultHeistGame currency={currency} locale={locale} initialBalanceMinor={balanceMinor} />}
    />
  );
}
