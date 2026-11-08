import { COVER_OF } from '@/lib/originals';
import { Link } from '@/i18n/routing';
import type { FootballMatch } from './FootballMatches';
import { GameArt } from './GameArt';
import type { OriginalGame } from './OriginalsLobby';

export function GameTile({ g }: { g: OriginalGame }) {
  return (
    <Link href={`/casino/${g.id}`} className="game-card rail-card" aria-label={g.title}>
      <div className="game-thumb">
        <GameArt game={{ id: `rail-${g.id}`, slug: g.id, name: g.title, category: g.category === 'instant' ? 'other' : g.category, thumbnail: null, art: COVER_OF[g.id] ? { hue: g.hue, title: g.title, image: COVER_OF[g.id] } : { hue: g.hue, title: g.title } }} />
      </div>
      <div className="game-info">
        <p className="game-name">{g.title}</p>
      </div>
    </Link>
  );
}

function time(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

const LIVE = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE', 'INT']);
export const isLive = (m: FootballMatch): boolean => LIVE.has(m.status);

export function MatchTile({ m, locale, liveLabel }: { m: FootballMatch; locale: string; liveLabel: string }) {
  const o = m.odds;
  const live = isLive(m);
  return (
    <Link href={`/match/${m.id}`} className={`match-tile${live ? ' live' : ''}`}>
      <div className="match-head">
        {m.leagueLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={m.leagueLogo} alt="" width={20} height={20} loading="lazy" />
        ) : null}
        <span className="match-league">{m.league}</span>
        {live ? (
          <span className="match-live">
            <i /> {liveLabel} {m.status === 'HT' ? 'HT' : m.elapsed !== null ? `${m.elapsed}′` : ''}
          </span>
        ) : (
          <span className="match-time">{time(m.kickoff, locale)}</span>
        )}
      </div>
      <div className="match-body">
        {[m.home, m.away].map((team) => (
          <div key={team.name} className="match-team">
            {team.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={team.logo} alt="" width={34} height={34} loading="lazy" />
            ) : (
              <span className="match-logo-empty" />
            )}
            <span className="match-name">{team.name}</span>
            {live ? <b className="match-goals">{team.goals ?? 0}</b> : null}
          </div>
        ))}
      </div>
      {o && !live ? (
        <div className="match-odds">
          <span>1 <b>{(o.home / 100).toFixed(2)}</b></span>
          <span>X <b>{(o.draw / 100).toFixed(2)}</b></span>
          <span>2 <b>{(o.away / 100).toFixed(2)}</b></span>
        </div>
      ) : null}
    </Link>
  );
}
