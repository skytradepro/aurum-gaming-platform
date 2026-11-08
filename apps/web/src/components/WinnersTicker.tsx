import { GameArt } from './GameArt';

interface Winner {
  username: string;
  game: string;
  gameId: string;
  hue: number;
  amount: string;
}

/** Endless horizontal ticker (pure CSS animation). The list is repeated so the loop is seamless. */
export function WinnersTicker({ winners, emptyText }: { winners: Winner[]; emptyText: string }) {
  if (winners.length === 0) {
    return (
      <div className="ticker ticker-empty">
        <p>{emptyText}</p>
      </div>
    );
  }
  // Repeat until the track is clearly wider than the screen, then twice for the -50% loop.
  const reps = Math.max(2, Math.ceil(12 / winners.length));
  const half = Array.from({ length: reps }, () => winners).flat();
  const loop = [...half, ...half];
  return (
    <div className="ticker">
      <div className="ticker-track">
        {loop.map((w, i) => (
          <div key={i} className="winner-tile" aria-hidden={i >= winners.length}>
            <div className="winner-art">
              <GameArt game={{ id: `w${i}-${w.gameId}`, slug: w.gameId, name: w.game, category: 'other', thumbnail: null, art: { hue: w.hue, title: w.game } }} />
            </div>
            <strong>{w.username}</strong>
            <span className="winner-amount">{w.amount}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
