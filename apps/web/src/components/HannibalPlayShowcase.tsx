import { Link } from '@/i18n/routing';
import { coverSrcSet, optimizedSrc } from '@/lib/img';
import { ORIGINAL_COVERS } from '@/lib/originals';
import type { VideoPair } from '@/lib/videos';
import { VideoBackdrop } from './VideoBackdrop';

export interface ShowcaseGame {
  id: string;
  title: string;
  tile: string;
}

/** Home page band: the Hannibal Play games with their cover art, newest first, over a casino video. */
export function HannibalPlayShowcase({
  games,
  video,
  labels,
}: {
  games: ShowcaseGame[];
  video: VideoPair;
  labels: { kicker: string; title: string; sub: string; play: string; isNew: string; all: string; soundOn: string; soundOff: string };
}) {
  if (games.length === 0) return null;
  return (
    <section className="hp-show" aria-label={labels.title}>
      {video.desktop || video.mobile ? <VideoBackdrop pair={video} className="hp-video" soundOn={labels.soundOn} soundOff={labels.soundOff} /> : null}
      <div className="hp-head">
        <div>
          <span className="hp-kicker">{labels.kicker}</span>
          <h2 className="hp-title">{labels.title}</h2>
          <p className="hp-sub">{labels.sub}</p>
        </div>
        <Link href="/casino" className="btn btn-gold hp-all">
          {labels.all}
        </Link>
      </div>
      <div className="hp-row">
        {games.map((g, i) => (
          <Link key={g.id} href={`/casino/${g.id}`} className="hp-card" style={{ ['--i' as string]: i }} aria-label={g.title}>
            <span className="hp-card-media">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={optimizedSrc(ORIGINAL_COVERS[g.id], 640)}
                srcSet={coverSrcSet(ORIGINAL_COVERS[g.id])}
                sizes="(max-width: 700px) 46vw, 220px"
                alt=""
                loading={i < 5 ? 'eager' : 'lazy'}
                decoding="async"
                draggable={false}
              />
              {i < 4 ? <span className="hp-ribbon">{labels.isNew}</span> : null}
              <span className="hp-play" aria-hidden="true">
                ▶
              </span>
            </span>
            <span className="hp-card-body">
              <strong>{g.title.replace(/^(Hannibal|حنبعل)\s+/i, '')}</strong>
              <small>{g.tile}</small>
              <span className="hp-cta">{labels.play}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
