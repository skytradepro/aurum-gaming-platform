'use client';

import { Link } from '@/i18n/routing';
import { useEffect, useState } from 'react';
import type { FootballMatch } from './FootballMatches';

const LIVE = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE', 'INT']);

/** Big featured-match banner from the real fixtures (team and league logos from the data feed). Changes slowly. */
export function MatchHero({ matches, locale, liveLabel, betLabel }: { matches: FootballMatch[]; locale: string; liveLabel: string; betLabel: string }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (matches.length < 2) return;
    const timer = setInterval(() => setI((n) => (n + 1) % matches.length), 9000);
    return () => clearInterval(timer);
  }, [matches.length]);
  if (matches.length === 0) return null;
  const m = matches[i % matches.length] as FootballMatch;
  const live = LIVE.has(m.status);
  const when = new Intl.DateTimeFormat(locale, { weekday: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(m.kickoff));
  return (
    <section className="mhero2" key={m.id}>
      <div className="mh2-bg" aria-hidden="true" />
      <div className="mh2-rays" aria-hidden="true" />
      <div className="mh2-sparks" aria-hidden="true" />
      {[m.home, m.away].map((team, side) => (
        <div key={team.name} className={`mh2-side ${side === 0 ? 'l' : 'r'}`}>
          <div className="mh2-badge">
            <span className="mh2-ring" aria-hidden="true" />
            {team.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="mh2-crest" src={team.logo} alt="" width={200} height={200} />
            ) : (
              <span className="mh2-initial">{team.name.slice(0, 1)}</span>
            )}
          </div>
          <div className="mh2-name">
            <b>{team.name}</b>
          </div>
        </div>
      ))}
      <div className="mh2-center">
        {m.leagueLogo ? (
          <div className="mh2-league">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={m.leagueLogo} alt="" width={96} height={96} />
          </div>
        ) : null}
        <strong className="mh2-league-name">{m.league}</strong>
        {live ? (
          <>
            <span className="match-live">
              <i /> {liveLabel} {m.status === 'HT' ? 'HT' : m.elapsed !== null ? `${m.elapsed}′` : ''}
            </span>
            <em className="mh2-vs">
              {m.home.goals ?? 0} : {m.away.goals ?? 0}
            </em>
          </>
        ) : (
          <>
            <em className="mh2-vs">VS</em>
            <span className="mh2-when">{when}</span>
          </>
        )}
        {live ? (
          <Link href={`/match/${m.id}`} className="mhero-odds">
            <strong>{betLabel}</strong>
          </Link>
        ) : null}
        {m.odds && !live ? (
          <Link href={`/match/${m.id}`} className="mhero-odds">
            <span>1 <b>{(m.odds.home / 100).toFixed(2)}</b></span>
            <span>X <b>{(m.odds.draw / 100).toFixed(2)}</b></span>
            <span>2 <b>{(m.odds.away / 100).toFixed(2)}</b></span>
            <strong>{betLabel}</strong>
          </Link>
        ) : null}
      </div>
      {matches.length > 1 ? (
        <div className="mhero-dots">
          {matches.map((x, n) => (
            <button key={x.id} type="button" aria-label={`${n + 1}`} className={n === i % matches.length ? 'on' : ''} onClick={() => setI(n)} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
