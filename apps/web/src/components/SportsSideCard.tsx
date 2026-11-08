'use client';

import { Link } from '@/i18n/routing';
import type { VideoPair } from '@/lib/videos';
import type { FootballMatch } from './FootballMatches';
import { isLive } from './HomeRails';
import { VideoBackdrop } from './VideoBackdrop';

/** Portrait video card under the bet slip: live (or next) matches and a link to live betting. */
export function SportsSideCard({
  pair,
  matches,
  locale,
  labels,
}: {
  pair: VideoPair;
  matches: FootballMatch[];
  locale: string;
  labels: { live: string; upcoming: string; cta: string; soundOn: string; soundOff: string };
}) {
  if (!pair.desktop && !pair.mobile) return null;
  const live = matches.filter(isLive).slice(0, 3);
  const list = live.length > 0 ? live : matches.filter((m) => m.status === 'NS').slice(0, 3);
  const time = (iso: string) => new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

  return (
    <section className="side-card">
      <VideoBackdrop pair={pair} className="vbd-side" soundOn={labels.soundOn} soundOff={labels.soundOff} />
      <div className="side-card-body">
        <span className={`side-card-tag${live.length > 0 ? ' is-live' : ''}`}>{live.length > 0 ? labels.live : labels.upcoming}</span>
        <ul className="side-card-list">
          {list.map((m) => (
            <li key={m.id}>
              <span className="side-team">
                {m.home.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.home.logo} alt="" width={18} height={18} />
                ) : null}
                {m.home.name}
              </span>
              <b>{live.length > 0 ? `${m.home.goals ?? 0} : ${m.away.goals ?? 0}` : time(m.kickoff)}</b>
              <span className="side-team end">
                {m.away.name}
                {m.away.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.away.logo} alt="" width={18} height={18} />
                ) : null}
              </span>
            </li>
          ))}
        </ul>
        <Link href="/live-betting" className="btn btn-gold side-card-cta">
          {labels.cta}
        </Link>
      </div>
    </section>
  );
}
