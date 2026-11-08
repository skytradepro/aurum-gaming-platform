import { GameGate } from '@/components/game/GameGate';
import { CherryPartyGame } from '@/components/game/LineGames';
import { isLocale } from '@aurum/i18n';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function CherryPartyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <GameGate
      locale={locale}
      game="cherryparty"
      titleKey="cherrypartyTitle"
      subtitleKey="cherrypartySubtitle"
      render={({ currency, balanceMinor }) => <CherryPartyGame currency={currency} locale={locale} initialBalanceMinor={balanceMinor} />}
    />
  );
}
