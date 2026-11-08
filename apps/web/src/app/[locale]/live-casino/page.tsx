import { HeroBanner } from '@/components/HeroBanner';
import type { PublicBanner } from '@/lib/types';
import { ComingSoonPage } from '@/components/ComingSoonPage';
import { CasinoBrowser } from '@/components/CasinoBrowser';
import { LiveTables, type LiveTable } from '@/components/LiveTables';
import { OriginalsLobby, type OriginalGame } from '@/components/OriginalsLobby';
import { ReturnSpot } from '@/components/ReturnSpot';
import { apiFetch } from '@/lib/api';
import { ORIGINALS, originalHue } from '@/lib/originals';
import { WinnersTicker } from '@/components/WinnersTicker';
import { findCurrency, formatAmountMinor } from '@/lib/money-display';
import type { PublicConfig } from '@/lib/types';
import { isLocale } from '@aurum/i18n';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { loadCasino } from '@/lib/casino-data';
import { VideoBackdrop } from '@/components/VideoBackdrop';
import { loadVideos } from '@/lib/videos';

export default async function LiveCasinoPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations('casino');
  const tg = await getTranslations('games');
  const tw = await getTranslations('wheel');
  const tcm = await getTranslations('common');
  const { games, providers } = await loadCasino(locale, 'live');
  const videos = await loadVideos(locale);

  let inhouse = false;
  let config: PublicConfig | null = null;
  try {
    config = await apiFetch<PublicConfig>('/public/config', { locale });
    inhouse = config.inhouseGames;
  } catch {
    inhouse = false;
  }

  // Our own table games, shown as computer-dealt virtual tables (not live dealers).
  const tables: LiveTable[] = ORIGINALS.filter(([id, category]) => category === 'table' || id === 'wheel').map(([id, , , , isNew]) => ({
    id,
    isNew,
    title: id === 'wheel' ? tw('title') : tg(`${id}Title`),
  }));
  // Newest tables first.
  const NEWEST = ['blackjack', 'thunderroulette', 'crazytime', 'jewelroulette', 'teenpatti', 'lucky7', 'carthagecards'];
  const rank = (id: string) => (NEWEST.includes(id) ? NEWEST.indexOf(id) : NEWEST.length);
  tables.sort((x, y) => rank(x.id) - rank(y.id));

  if (games.items.length === 0 && !inhouse) return <ComingSoonPage section="liveCasino" />;

  // Every casino game also shows here, under the live tables (same list as the casino lobby).
  const allGames: OriginalGame[] = ORIGINALS.map(([id, category, hue, featured, isNew]) => ({
    id,
    category,
    hue,
    featured,
    isNew,
    title: id === 'wheel' ? tw('title') : tg(`${id}Title`),
    tile: id === 'wheel' ? tw('tileText') : tg(`${id}Tile`),
  }));

  // Real recent wins on our tables only (the API masks usernames); hidden when there are none.
  const tableIds = new Set(tables.map((x) => x.id));
  const winners = inhouse
    ? await apiFetch<{ items: { username: string; game: string; currency: string; amountMinor: string }[] }>('/public/winners', { locale }).catch(() => ({ items: [] }))
    : { items: [] };
  const tableWins = winners.items.flatMap((w) => {
    const cur = findCurrency(config?.currencies ?? [], w.currency);
    if (!cur || !tableIds.has(w.game)) return [];
    return [{ username: w.username, gameId: w.game, hue: originalHue(w.game), game: tables.find((x) => x.id === w.game)?.title ?? w.game, amount: formatAmountMinor(w.amountMinor, cur, locale) }];
  });

  const heroes = await apiFetch<{ items: PublicBanner[] }>(`/public/banners?placement=live_casino_hero&locale=${locale}`, { locale }).catch(() => ({ items: [] as PublicBanner[] }));
  return (
    <>
      <ReturnSpot scope="live-casino" pattern="/casino/" />
      {heroes.items.length > 0 ? <HeroBanner banners={heroes.items} /> : null}
      {videos.live_casino_hero.desktop || videos.live_casino_hero.mobile ? (
        <section className="video-band video-hero">
          <VideoBackdrop pair={videos.live_casino_hero} soundOn={tcm('soundOn')} soundOff={tcm('soundOff')} />
          <div className="video-band-copy">
            <h1 className="video-band-title">{t('liveCasino')}</h1>
          </div>
        </section>
      ) : (
        <h1 className="page-title">{t('liveCasino')}</h1>
      )}
      {inhouse ? (
        <section style={{ marginBottom: '2rem' }}>
          <h2 className="section-title">{tg('virtualTablesTitle')}</h2>
          {tableWins.length > 0 ? <WinnersTicker emptyText="" winners={tableWins} /> : null}
          <LiveTables
            tables={tables}
            labels={{ all: t('liveAll'), shows: t('liveShows'), roulette: t('liveRoulette'), cards: t('liveCards'), dice: t('liveDice'), count: t('liveCount', { count: tables.length }), studio: 'HANNIBAL PLAY', isNew: tg('playNewBadge'), play: tg('playNewBadge') }}
          />
        </section>
      ) : null}
      {games.items.length > 0 ? <CasinoBrowser initialTab="live" initial={games} providers={providers} /> : null}
      {inhouse ? (
        <section style={{ marginBottom: '1.5rem' }}>
          <h2 className="section-title">{tw('originals')}</h2>
          <OriginalsLobby games={allGames} />
        </section>
      ) : null}
    </>
  );
}
