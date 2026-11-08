import type { BetRulesDTO } from '@/components/BetSlip';
import { MatchCenter } from '@/components/sports/MatchCenter';
import type { MatchReply } from '@/components/sports/MatchCenter';
import { DisplayProvider } from '@/components/game/DisplayContext';
import { ApiError, apiFetch } from '@/lib/api';
import { serverApiFetch } from '@/lib/api-server';
import { getSessionUser } from '@/lib/auth';
import { getDisplayCurrency } from '@/lib/display-currency';
import { findCurrency } from '@/lib/money-display';
import type { PublicRate } from '@/lib/rates';
import type { PublicConfig } from '@/lib/types';
import { Link } from '@/i18n/routing';
import { isLocale } from '@aurum/i18n';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

/** Match centre: live score, timeline, statistics and every market of one football match. */
export default async function MatchPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  if (!/^\d{1,10}$/.test(id)) notFound();
  setRequestLocale(locale);

  let initial: MatchReply | null = null;
  try {
    initial = await apiFetch<MatchReply>(`/public/football/match/${id}`, { locale, cache: 'no-store' });
  } catch (err) {
    if (err instanceof ApiError && err.code === 'not_found') notFound();
    initial = null;
  }
  if (!initial) {
    const tf = await getTranslations('football');
    const ts = await getTranslations('sbk');
    return (
      <div className="card" style={{ maxWidth: 560, margin: '2rem auto', textAlign: 'center' }}>
        <p>{tf('loadError')}</p>
        <Link href="/sports" className="btn btn-gold">
          {ts('back')}
        </Link>
      </div>
    );
  }

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

  return (
    <DisplayProvider display={display} rates={rates}>
      <MatchCenter initial={initial} locale={locale} currency={currency} rules={rules} balanceMinor={user?.wallet?.balance.amountMinor ?? null} />
    </DisplayProvider>
  );
}
