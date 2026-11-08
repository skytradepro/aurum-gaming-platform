import { ComingSoonPage } from '@/components/ComingSoonPage';
import type { FootballReply } from '@/components/FootballMatches';
import type { BetRulesDTO } from '@/components/BetSlip';
import { SportsBoard } from '@/components/SportsBoard';
import { Marquee } from '@/components/Marquee';
import { MatchHero } from '@/components/MatchHero';
import { HeroBanner } from '@/components/HeroBanner';
import type { PublicBanner } from '@/lib/types';
import { MatchTile, isLive } from '@/components/HomeRails';
import { VideoBackdrop } from '@/components/VideoBackdrop';
import { SportsSideCard } from '@/components/SportsSideCard';
import { loadVideos } from '@/lib/videos';
import { apiFetch } from '@/lib/api';
import { serverApiFetch } from '@/lib/api-server';
import { getSessionUser } from '@/lib/auth';
import { findCurrency } from '@/lib/money-display';
import { DisplayProvider } from '@/components/game/DisplayContext';
import { getDisplayCurrency } from '@/lib/display-currency';
import type { PublicRate } from '@/lib/rates';
import type { PublicConfig } from '@/lib/types';
import { isLocale } from '@aurum/i18n';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function SportsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const initial = await apiFetch<FootballReply>('/public/football/fixtures', { locale }).catch(() => null);
  if (!initial?.enabled) return <ComingSoonPage section="sports" />;

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
  const th = await getTranslations('home');
  const banners = await apiFetch<{ items: PublicBanner[] }>(`/public/banners?placement=sports_hero&locale=${locale}`, { locale }).catch(() => ({ items: [] as PublicBanner[] }));
  const live = initial.matches.filter(isLive);
  const band = [...live, ...initial.matches.filter((m) => m.status === 'NS' && m.odds), ...initial.matches.filter((m) => m.status === 'NS' && !m.odds)].slice(0, 18);
  // Featured matches: the big leagues first, then matches with prices, then live ones.
  const TOP = ['England|Premier League', 'Spain|La Liga', 'Italy|Serie A', 'Germany|Bundesliga', 'France|Ligue 1', 'World|UEFA Champions League', 'World|UEFA Europa League', 'Tunisia|Ligue 1'];
  const score = (m: (typeof initial.matches)[number]) => {
    const top = TOP.indexOf(`${m.country}|${m.league}`);
    return (top >= 0 ? 100 - top : 0) + (m.odds ? 10 : 0) + (isLive(m) ? 5 : 0);
  };
  const heroBase = initial.matches
    .filter((m) => m.status === 'NS' || isLive(m))
    .sort((a, b) => score(b) - score(a))
    .slice(0, 6);
  const heroMatches = heroBase;
  const videos = await loadVideos(locale);
  const tcm = await getTranslations('common');
  const tsp = await getTranslations('sports');
  return (
    <DisplayProvider display={display} rates={rates}>
      <h1 className="page-title">{t('sportsBetting')}</h1>
      {banners.items.length > 0 ? <HeroBanner banners={banners.items} /> : null}
      <MatchHero matches={heroMatches} locale={locale} liveLabel={th('live')} betLabel={th('betNow')} />
      {band.length > 0 ? (
        <div className="football-band">
          <div className="football-pitch" aria-hidden="true" />
          <VideoBackdrop pair={videos.sports_hero} className="vbd-band" soundOn={tcm('soundOn')} soundOff={tcm('soundOff')} />
          <Marquee count={band.length} seconds={Math.max(90, band.length * 12)}>
            {band.map((m) => (
              <MatchTile key={m.id} m={m} locale={locale} liveLabel={th('live')} />
            ))}
          </Marquee>
        </div>
      ) : null}
      <SportsBoard initial={initial} locale={locale} currency={currency} rules={rules} balanceMinor={user?.wallet?.balance.amountMinor ?? null}
        side={
          <SportsSideCard
            key="sports-side"
            pair={videos.sports_side}
            matches={initial.matches}
            locale={locale}
            labels={{ live: tsp('sideLive'), upcoming: tsp('sideUpcoming'), cta: tsp('sideCta'), soundOn: tcm('soundOn'), soundOff: tcm('soundOff') }}
          />
        }
      />
    </DisplayProvider>
  );
}
