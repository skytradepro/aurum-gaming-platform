import { HeroBanner } from '@/components/HeroBanner';
import type { PublicBanner } from '@/lib/types';
import { CasinoBrowser } from '@/components/CasinoBrowser';
import { ReturnSpot } from '@/components/ReturnSpot';
import { NEWEST_IDS, ORIGINALS } from '@/lib/originals';
import { OriginalsGrid, OriginalsLobby, type OriginalGame } from '@/components/OriginalsLobby';
import { GameTile } from '@/components/HomeRails';
import { Icon } from '@/components/Icon';
import { Marquee } from '@/components/Marquee';
import { apiFetch } from '@/lib/api';
import { loadCasino } from '@/lib/casino-data';
import { VideoBackdrop } from '@/components/VideoBackdrop';
import { loadVideos } from '@/lib/videos';
import type { PublicConfig } from '@/lib/types';
import { isLocale } from '@aurum/i18n';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function CasinoPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations('casino');
  const { games, providers } = await loadCasino(locale);
  const tw = await getTranslations('wheel');
  const tg = await getTranslations('games');
  let inhouse = false;
  try {
    inhouse = (await apiFetch<PublicConfig>('/public/config', { locale })).inhouseGames;
  } catch {
    inhouse = false;
  }

  const originals: OriginalGame[] = ORIGINALS.map(([id, category, hue, featured, isNew]) => ({
    id,
    category,
    hue,
    featured,
    isNew,
    title: id === 'wheel' ? tw('title') : tg(`${id}Title`),
    tile: id === 'wheel' ? tw('tileText') : tg(`${id}Tile`),
  }));

  // "Popular now": the Hannibal Play games played the most, then the featured ones (always a full row)
  const th = await getTranslations('home');
  const popular = inhouse
    ? await apiFetch<{ items: { game: string; rounds: number }[] }>('/public/popular-games', { locale }).catch(() => ({ items: [] as { game: string; rounds: number }[] }))
    : { items: [] as { game: string; rounds: number }[] };
  const played = popular.items.flatMap((p) => originals.filter((o) => o.id === p.game));
  // "New games": the newest Hannibal Play games (the last ones added come first), right under the banner
  const newest = NEWEST_IDS.flatMap((id) => originals.filter((o) => o.id === id)).slice(0, 8);
  const popularGames = [...played, ...originals.filter((o) => o.featured && !played.some((p) => p.id === o.id))].slice(0, 16);

  const videos = await loadVideos(locale);
  const tcm = await getTranslations('common');
  const heroes = await apiFetch<{ items: PublicBanner[] }>(`/public/banners?placement=casino_hero&locale=${locale}`, { locale }).catch(() => ({ items: [] as PublicBanner[] }));
  return (
    <>
      <ReturnSpot scope="casino" pattern="/casino/" />
      {heroes.items.length > 0 ? <HeroBanner banners={heroes.items} /> : null}
      {inhouse && newest.length > 0 ? (
        <section style={{ marginBottom: '1.5rem' }}>
          <div className="section-head">
            <h2 className="section-title">
              <Icon name="promo" />
              {th('newGames')}
            </h2>
          </div>
          <OriginalsGrid games={newest} />
        </section>
      ) : null}
      {videos.casino_hero.desktop || videos.casino_hero.mobile ? (
        <section className="video-band video-hero">
          <VideoBackdrop pair={videos.casino_hero} soundOn={tcm('soundOn')} soundOff={tcm('soundOff')} />
          <div className="video-band-copy">
            <h1 className="video-band-title">{t('lobby')}</h1>
          </div>
        </section>
      ) : (
        <h1 className="page-title">{t('lobby')}</h1>
      )}
      {popularGames.length > 0 ? (
        <section style={{ marginBottom: '1.5rem' }}>
          <div className="section-head">
            <h2 className="section-title">
              <Icon name="trophy" />
              {th('railPopular')}
            </h2>
          </div>
          <Marquee count={popularGames.length} seconds={45}>
            {popularGames.map((g) => (
              <GameTile key={g.id} g={g} />
            ))}
          </Marquee>
        </section>
      ) : null}
      <section style={{ marginBottom: inhouse ? '2rem' : 0 }}>
        <h2 className="section-title">{t('providerCatalog')}</h2>
        <CasinoBrowser initial={games} providers={providers} />
      </section>
      {inhouse ? (
        <section>
          <h2 className="section-title">{tw('originals')}</h2>
          <OriginalsLobby games={originals} />
        </section>
      ) : null}
    </>
  );
}
