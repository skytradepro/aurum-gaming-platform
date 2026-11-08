'use client';

import { cardRank, cardSuit } from '@aurum/shared';

const SUIT_GLYPH = ['♠', '♥', '♦', '♣'] as const;
const RANK_LABEL = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;

/** A playing card. `rank` 1..13 (1 = ace) and `suit` 0..3 (spades, hearts, diamonds, clubs). `index` staggers the dealing animation. */
export function PlayingCard({ rank, suit, index = 0, hidden = false, win = false }: { rank: number; suit: number; index?: number; hidden?: boolean; win?: boolean }) {
  if (hidden) return <div className="pcard back">?</div>;
  const red = suit === 1 || suit === 2;
  const label = RANK_LABEL[rank] ?? '?';
  const glyph = SUIT_GLYPH[suit % 4] ?? '♠';
  return (
    <div className={`pcard deal${red ? ' red' : ''}${win ? ' win' : ''}`} style={{ ['--delay' as string]: `${index * 0.22}s` }}>
      <span className="corner">
        {label}
        <br />
        {glyph}
      </span>
      <span>{glyph}</span>
      <span className="corner b">
        {label}
        <br />
        {glyph}
      </span>
    </div>
  );
}

/** A card from a 0..51 deck id. */
export function DeckCard({ id, index = 0, win = false }: { id: number; index?: number; win?: boolean }) {
  return <PlayingCard rank={cardRank(id)} suit={cardSuit(id)} index={index} win={win} />;
}

const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

/** A die face 1..6 with pips; `rolling` tumbles it. */
export function Die({ value, rolling = false, hit = false }: { value: number; rolling?: boolean; hit?: boolean }) {
  const on = PIPS[value] ?? [];
  return (
    <div className={`die${rolling ? ' roll' : ' land'}${hit ? ' hit' : ''}`} aria-label={String(value)}>
      {Array.from({ length: 9 }, (_, i) => (
        <b key={i} className={on.includes(i) ? 'on' : ''} />
      ))}
    </div>
  );
}

const COLORS = ['#f5c518', '#3ddc97', '#ff5a6e', '#5ab0ff', '#ffffff'];
/** Confetti shown when a round is won. Pure CSS, a new `seed` replays it. */
export function WinBurst({ seed }: { seed: string }) {
  return (
    <div className="fx-burst" key={seed} aria-hidden="true">
      {Array.from({ length: 28 }, (_, i) => {
        const angle = (i / 28) * Math.PI * 2;
        const dist = 90 + ((i * 37) % 70);
        return (
          <i
            key={i}
            style={{
              ['--x' as string]: `${Math.cos(angle) * dist}px`,
              ['--y' as string]: `${Math.sin(angle) * dist + 40}px`,
              ['--r' as string]: `${(i * 53) % 540}deg`,
              ['--c' as string]: COLORS[i % COLORS.length],
              ['--d' as string]: `${(i % 7) * 0.03}s`,
            }}
          />
        );
      })}
    </div>
  );
}
