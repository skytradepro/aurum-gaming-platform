import { CategoryTiles } from '@/components/CategoryTiles';
import type { Tile } from '@/components/CategoryTiles';
import { GameRail } from '@/components/GameRail';
import { HeroBanner } from '@/components/HeroBanner';
import { Icon } from '@/components/Icon';
import { JackpotTiers } from '@/components/JackpotTiers';
import { PromoCard } from '@/components/PromoCard';
import { WinnersTicker } from '@/components/WinnersTicker';
import { CategoryShowcase } from '@/components/CategoryShowcase';
import { Marquee } from '@/components/Marquee';
import { GameTile, MatchTile, isLive } from '@/components/HomeRails';
import { VideoBackdrop } from '@/components/VideoBackdrop';
import { SmartPick } from '@/components/SmartPick';
import { loadVideos } from '@/lib/videos';
import type { OriginalGame } from '@/components/OriginalsLobby';
import type { FootballReply } from '@/components/FootballMatches';
import { ORIGINALS, SHOWCASE_IDS } from '@/lib/originals';
import { HannibalPlayShowcase } from '@/components/HannibalPlayShowcase';
import { Link } from '@/i18n/routing';
import { apiFetch } from '@/lib/api';
import { getDisplayCurrency } from '@/lib/display-currency';
import { findCurrency, formatAmountMinor } from '@/lib/money-display';
import { originalHue } from '@/lib/originals';
import type { GameItem, PublicBanner, PublicConfig, PublicPromotion } from '@/lib/types';
import { isLocale } from '@aurum/i18n';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { ReturnSpot } from '@/components/ReturnSpot';

async function safe<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch {
    return fallback;
  }
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations('home');
  const tc = await getTranslations('common');
  const tg = await getTranslations('games');

  const config = await safe(apiFetch<PublicConfig>('/public/config', { locale }), null);
  const currency = await getDisplayCurrency(config?.currencies ?? []);

  const [banners, featured, live, everything, promos, winners, jackpots, football, popular, promoSlides, pragmatic] = await Promise.all([
    safe(apiFetch<{ items: PublicBanner[] }>(`/public/banners?placement=home_hero&locale=${locale}`, { locale }), { items: [] }),
    safe(apiFetch<{ items: GameItem[] }>('/public/games?featured=true&limit=16', { locale }), { items: [] }),
    safe(apiFetch<{ items: GameItem[] }>('/public/games?category=live&limit=16', { locale }), { items: [] }),
    safe(apiFetch<{ items: GameItem[] }>('/public/games?limit=200', { locale }), { items: [] }),
    safe(apiFetch<{ items: PublicPromotion[] }>(`/public/promotions?locale=${locale}`, { locale }), { items: [] }),
    safe(apiFetch<{ items: { username: string; game: string; currency: string; amountMinor: string }[] }>('/public/winners', { locale }), { items: [] }),
    config?.demo && currency
      ? safe(apiFetch<{ items: { level: string; amountMinor: string }[] }>(`/public/demo/jackpots?currency=${currency.code}`, { locale }), { items: [] })
      : Promise.resolve({ items: [] }),
    safe(apiFetch<FootballReply>('/public/football/fixtures', { locale }), { enabled: false, matches: [], updatedAt: null } as FootballReply),
    safe(apiFetch<{ items: { game: string; rounds: number }[] }>('/public/popular-games', { locale }), { items: [] }),
    // promotions slider in the middle of the page (Admin > Banners > "Home page - promotions slider")
    safe(apiFetch<{ items: PublicBanner[] }>(`/public/banners?placement=home_promo&locale=${locale}`, { locale }), { items: [] }),
    safe(apiFetch<{ items: GameItem[] }>('/public/games?provider=pragmatic-play&limit=16&sort=newest', { locale }), { items: [] }),
  ]);

  const newGames = everything.items.filter((g) => g.isNew).slice(0, 16);
  const tw = await getTranslations('wheel');
  const originals: OriginalGame[] = config?.inhouseGames
    ? ORIGINALS.map(([id, category, hue, featured, isNew]) => ({ id, category, hue, featured, isNew, title: id === 'wheel' ? tw('title') : tg(`${id}Title`), tile: '' }))
    : [];
  const popularGames = popular.items.flatMap((p) => originals.filter((o) => o.id === p.game));
  const upcoming = football.matches.filter((m) => m.status === 'NS');
  const liveNow = football.matches.filter(isLive).slice(0, 10);
  const matches = [...liveNow, ...upcoming.filter((m) => m.odds), ...upcoming.filter((m) => !m.odds)].slice(0, 18);
  const videos = await loadVideos(locale);
  const sound = { soundOn: tc('soundOn'), soundOff: tc('soundOff') };

  const tiles: Tile[] = [
    { href: '/sports', label: t('tiles.sports'), icon: 'sports', hue: 262 },
    { href: '/live-betting', label: t('tiles.liveSports'), icon: 'live', hue: 205 },
    { href: '/promotions', label: t('tiles.promos'), icon: 'promo', hue: 330 },
    { href: '/casino', label: t('tiles.casino'), icon: 'casino', hue: 282 },
    { href: '/live-casino', label: t('tiles.liveCasino'), icon: 'liveCasino', hue: 165 },
  ];

  const tierKeys = ['ultimate', 'vip', 'plus', 'basic'] as const;
  const tiers = currency
    ? tierKeys.flatMap((key) => {
        const row = jackpots.items.find((j) => j.level === key);
        return row ? [{ key, label: t(`tiers.${key}`), amountMinor: row.amountMinor }] : [];
      })
    : [];

  return (
    <>
      <ReturnSpot scope="home" pattern={['/casino/', '/match/', '/promotions/']} />
      <HeroBanner banners={banners.items} wide />
      {config?.inhouseGames ? (
        <HannibalPlayShowcase
          games={SHOWCASE_IDS.map((id) => ({ id, title: tg(`${id}Title`), tile: tg(`${id}Tile`) }))}
          video={videos.casino_hero.desktop || videos.casino_hero.mobile ? videos.casino_hero : videos.home_casino}
          labels={{ kicker: t('playKicker'), title: t('playTitle'), sub: t('playSub'), play: t('playCta'), isNew: t('playNew'), all: tc('viewAll'), ...sound }}
        />
      ) : null}
      {config?.demo ? <p className="demo-flag">{tc('demoData')}</p> : null}

      {pragmatic.items.length > 0 ? (
        <GameRail title={t('pragmaticPlayRail')} icon="casino" games={pragmatic.items} href="/casino?provider=pragmatic-play" />
      ) : null}

      <div className="section-head">
        <h2 className="section-title">
          <Icon name="trophy" />
          {t('topWinners')}
        </h2>
      </div>
      <WinnersTicker
        emptyText={t('noWinnersYet')}
        winners={winners.items.flatMap((w) => {
          const cur = findCurrency(config?.currencies ?? [], w.currency);
          if (!cur) return [];
          const known = tg.has(`${w.game}Title`);
          return [{ username: w.username, gameId: w.game, hue: originalHue(w.game), game: known ? tg(`${w.game}Title`) : w.game, amount: formatAmountMinor(w.amountMinor, cur, locale) }];
        })}
      />

      <div style={{ height: '1.2rem' }} />
      <CategoryTiles tiles={tiles} />

      {videos.home_casino.desktop || videos.home_casino.mobile ? (
        <section className="video-band">
          <VideoBackdrop pair={videos.home_casino} {...sound} />
          <div className="video-band-copy">
            <h2 className="video-band-title">{t('videoCasinoTitle')}</h2>
            <div className="video-band-actions">
              <Link href="/casino" className="btn btn-gold btn-lg">
                {t('videoCasinoCta')}
              </Link>
              <Link href="/live-casino" className="btn btn-dark btn-lg">
                {t('videoLiveCta')}
              </Link>
              <SmartPick
                games={originals.map((o) => ({ id: o.id, title: o.title, hue: o.hue, category: o.category }))}
                popular={popular.items.map((p) => p.game)}
                labels={{ button: t('smartPick'), title: t('smartPickTitle'), scanning: t('smartPickScanning'), play: t('smartPickPlay'), again: t('smartPickAgain'), note: t('smartPickNote'), close: tc('close') }}
              />
            </div>
          </div>
        </section>
      ) : null}

      {originals.length > 0 ? (
        <>
          <div className="section-head">
            <h2 className="section-title">
              <Icon name="casino" />
              {t('railGames')}
            </h2>
            <Link href="/casino" className="section-link">
              {tc('viewAll')}
            </Link>
          </div>
          <Marquee count={originals.length} seconds={70}>
            {originals.map((g) => (
              <GameTile key={g.id} g={g} />
            ))}
          </Marquee>
        </>
      ) : null}

      {originals.length > 0 ? (
        <>
          <div className="section-head">
            <h2 className="section-title">
              <Icon name="casino" />
              {t('railCategories')}
            </h2>
          </div>
          <CategoryShowcase
            items={(['slots', 'table', 'instant', 'crash'] as const).map((c) => ({
              key: c,
              label: t(`cat_${c}`),
              count: t('gamesCount', { count: originals.filter((o) => o.category === c).length }),
              href: c === 'table' ? '/live-casino' : '/casino',
              games: [...originals.filter((o) => o.category === c && o.featured), ...originals.filter((o) => o.category === c && !o.featured)].slice(0, 3),
            }))}
          />
        </>
      ) : null}

      {promoSlides.items.length > 0 ? (
        <>
          <div className="section-head">
            <h2 className="section-title">
              <Icon name="promo" />
              {t('promotionsTitle')}
            </h2>
            <Link href="/promotions" className="section-link">
              {tc('viewAll')}
            </Link>
          </div>
          <HeroBanner banners={promoSlides.items} variant="promo" />
        </>
      ) : null}

      {matches.length > 0 ? (
        <>
          <div className="section-head">
            <h2 className="section-title">
              <Icon name="sports" />
              {t('railFootball')}
            </h2>
            <Link href="/sports" className="section-link">
              {tc('viewAll')}
            </Link>
          </div>
          <div className="football-band">
            <div className="football-pitch" aria-hidden="true" />
            <VideoBackdrop pair={videos.home_football} className="vbd-band" {...sound} />
            <Marquee count={matches.length} seconds={Math.max(90, matches.length * 12)}>
              {matches.map((m) => (
                <MatchTile key={m.id} m={m} locale={locale} liveLabel={t('live')} />
              ))}
            </Marquee>
          </div>
        </>
      ) : null}

      {popularGames.length > 0 ? (
        <>
          <div className="section-head">
            <h2 className="section-title">
              <Icon name="trophy" />
              {t('railPopular')}
            </h2>
          </div>
          <Marquee count={popularGames.length} seconds={45}>
            {popularGames.map((g) => (
              <GameTile key={g.id} g={g} />
            ))}
          </Marquee>
        </>
      ) : null}

      <GameRail title={t('featuredGames')} icon="casino" games={featured.items} href="/casino" />
      <GameRail title={t('newGames')} icon="promo" games={newGames} href="/casino" />
      <GameRail title={t('liveTables')} icon="liveCasino" games={live.items} href="/live-casino" />

      <div className="section-head">
        <h2 className="section-title">
          <Icon name="info" />
          {t('howItWorksTitle')}
        </h2>
      </div>
      <div className="card steps">
        {(['register', 'deposit', 'collect'] as const).map((step, i) => (
          <div key={step} className="step">
            <span className="step-num">{i + 1}</span>
            <div>
              <h3>{t(`steps.${step}.title`)}</h3>
              <p>{t(`steps.${step}.body`)}</p>
            </div>
          </div>
        ))}
      </div>

      {tiers.length > 0 && currency ? (
        <>
          <div className="section-head">
            <h2 className="section-title">
              <Icon name="trophy" />
              {t('jackpotLevels')}
            </h2>
          </div>
          <JackpotTiers tiers={tiers} currency={currency} locale={locale} />
        </>
      ) : null}

      {promos.items.length > 0 ? (
        <>
          <div className="section-head">
            <h2 className="section-title">
              <Icon name="promo" />
              {t('promotionsTitle')}
            </h2>
            <Link href="/promotions" className="section-link">
              {tc('viewAll')}
            </Link>
          </div>
          <Marquee count={promos.items.length} seconds={55}>
            {promos.items.map((p) => (
              <div key={p.slug} className="promo-rail-item">
                <PromoCard promo={p} />
              </div>
            ))}
          </Marquee>
        </>
      ) : null}

      <section className="cta-band">
        <div>
          <h2>{t('shopTitle')}</h2>
          <p>{t('shopBody')}</p>
        </div>
        <Link href="/shops" className="btn btn-gold btn-lg">
          <Icon name="shop" />
          {t('shopCta')}
        </Link>
      </section>
    </>
  );
}
