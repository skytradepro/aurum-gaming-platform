import { DisplayProvider } from '@/components/game/DisplayContext';
import { WheelGame } from '@/components/WheelGame';
import { GameInfoProvider, GameWinners } from '@/components/game/GameInfo';
import { Link } from '@/i18n/routing';
import { apiFetch } from '@/lib/api';
import { serverApiFetch } from '@/lib/api-server';
import { getSessionUser } from '@/lib/auth';
import { getDisplayCurrency } from '@/lib/display-currency';
import type { PublicRate } from '@/lib/rates';
import { findCurrency } from '@/lib/money-display';
import type { PublicConfig } from '@/lib/types';
import { isLocale } from '@aurum/i18n';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function WheelPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations('wheel');
  let config: PublicConfig | null = null;
  try {
    config = await apiFetch<PublicConfig>('/public/config', { locale });
  } catch {
    config = null;
  }
  if (!config?.inhouseGames) {
    return (
      <>
        <h1 className="page-title">{t('title')}</h1>
        <p>{t('notAvailable')}</p>
      </>
    );
  }
  const user = await getSessionUser();
  if (!user || user.role !== 'user' || !user.wallet) {
    return (
      <>
        <h1 className="page-title">{t('title')}</h1>
        <p>{t('loginRequired')}</p>
        <Link href="/login" className="btn btn-gold">
          {t('loginCta')}
        </Link>
      </>
    );
  }
  const currency = findCurrency(config.currencies, user.wallet.currency);
  if (!currency) return <p>{t('notAvailable')}</p>;
  let rates: PublicRate[] = [];
  try {
    rates = (await apiFetch<{ items: PublicRate[] }>('/public/rates', { locale })).items;
  } catch {
    rates = [];
  }
  const display = (await getDisplayCurrency(config.currencies)) ?? null;
  let limits: { min: string; max: string } | null = null;
  try {
    const rules = await serverApiFetch<{ games: Record<string, { enabled: boolean; min: string; max: string }> }>(`/games/rules?currency=${currency.code}`, { locale });
    const mine = rules.games.wheel;
    if (mine && !mine.enabled) {
      return (
        <>
          <h1 className="page-title">{t('title')}</h1>
          <p>{t('notAvailable')}</p>
        </>
      );
    }
    limits = mine ? { min: mine.min, max: mine.max } : null;
  } catch {
    limits = null;
  }
  return (
    <DisplayProvider display={display} rates={rates} limits={limits}>
      <GameInfoProvider value={{ game: 'wheel', title: t('title'), rules: t('subtitle') }}>
        <h1 className="page-title">{t('title')}</h1>
        <p className="muted">{t('subtitle')}</p>
        <WheelGame currency={currency} locale={locale} initialBalanceMinor={user.wallet.balance.amountMinor} />
        <GameWinners currency={currency} />
      </GameInfoProvider>
    </DisplayProvider>
  );
}
