import { ComingSoonPage } from '@/components/ComingSoonPage';
import type { FootballReply } from '@/components/FootballMatches';
import type { BetRulesDTO } from '@/components/BetSlip';
import { SportsBoard } from '@/components/SportsBoard';
import { DisplayProvider } from '@/components/game/DisplayContext';
import { apiFetch } from '@/lib/api';
import { serverApiFetch } from '@/lib/api-server';
import { getSessionUser } from '@/lib/auth';
import { getDisplayCurrency } from '@/lib/display-currency';
import { findCurrency } from '@/lib/money-display';
import type { PublicRate } from '@/lib/rates';
import type { PublicConfig } from '@/lib/types';
import { isLocale } from '@aurum/i18n';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

/** Live betting: every match being played with its live prices, a link to its match centre and the bet slip. */
export default async function LiveBettingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const initial = await apiFetch<FootballReply>('/public/football/live', { locale }).catch(() => null);
  if (!initial?.enabled) return <ComingSoonPage section="live" />;

  const user = await getSessionUser();
  let rules: BetRulesDTO | null = null;
  let currency = null;
  let display = null;
  let rates: PublicRate[] = [];
  if (user && user.role === 'user' && user.wallet) {
    try {
      const config = await apiFetch<PublicConfig>('/public/config', { locale });
      currency = findCurrency(config.currencies, user.wallet.currency) ?? null;
      display = (await getDisplayCurrency(config.currencies)) ?? null;
      rates = (await apiFetch<{ items: PublicRate[] }>('/public/rates', { locale })).items;
      rules = await serverApiFetch<BetRulesDTO>('/bets/rules', { locale });
    } catch {
      rules = null;
    }
  }

  const t = await getTranslations('nav');
  const ts = await getTranslations('sbk');
  const liveOn = rules?.live?.enabled !== false;
  return (
    <DisplayProvider display={display} rates={rates}>
      <h1 className="page-title">
        {t('liveBetting')} <span className="sbk-title-count">{initial.matches.length}</span>
      </h1>
      <p className="muted sbk-intro">{liveOn ? ts('liveIntro') : ts('liveOff')}</p>
      <SportsBoard mode="live" initial={initial} locale={locale} currency={currency} rules={rules} balanceMinor={user?.wallet?.balance.amountMinor ?? null} />
    </DisplayProvider>
  );
}
