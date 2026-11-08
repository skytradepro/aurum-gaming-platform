'use client';

import { Link } from '@/i18n/routing';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GameArt } from './GameArt';

export interface PickGame {
  id: string;
  title: string;
  hue: number;
  category: 'slots' | 'table' | 'crash' | 'instant';
}

const HISTORY_KEY = 'smart-pick-history';

function readHistory(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 6) : [];
  } catch {
    return [];
  }
}

function writeHistory(list: string[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 6)));
  } catch {
    /* storage unavailable: picks still work */
  }
}

/**
 * Suggests one Hannibal game: popular and new games weigh more, recently suggested ones less.
 * It only chooses which game to open; every game result stays random on the server.
 */
function choose(games: PickGame[], popular: string[], recent: string[]): PickGame | null {
  if (games.length === 0) return null;
  const weights = games.map((g) => {
    let w = 1;
    const rank = popular.indexOf(g.id);
    if (rank >= 0) w += Math.max(0.5, 3 - rank * 0.4);
    if (recent.includes(g.id)) w *= 0.15;
    return w;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < games.length; i++) {
    r -= weights[i] as number;
    if (r <= 0) return games[i] as PickGame;
  }
  return games[games.length - 1] as PickGame;
}

const art = (g: PickGame) => ({ id: `pick-${g.id}`, slug: g.id, name: g.title, category: g.category === 'instant' ? ('other' as const) : g.category, thumbnail: null, art: { hue: g.hue, title: g.title } });

export function SmartPick({
  games,
  popular,
  labels,
}: {
  games: PickGame[];
  popular: string[];
  labels: { button: string; title: string; scanning: string; play: string; again: string; note: string; close: string };
}) {
  const [open, setOpen] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [shown, setShown] = useState<PickGame | null>(null);
  const timer = useRef<number | null>(null);

  const run = () => {
    const recent = readHistory();
    const final = choose(games, popular, recent);
    if (!final) return;
    setRolling(true);
    let n = 0;
    const steps = 14;
    const tick = () => {
      n += 1;
      if (n >= steps) {
        setShown(final);
        setRolling(false);
        writeHistory([final.id, ...recent.filter((id) => id !== final.id)]);
        return;
      }
      setShown(games[Math.floor(Math.random() * games.length)] ?? final);
      timer.current = window.setTimeout(tick, 60 + n * 14);
    };
    tick();
  };

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open]);

  if (games.length === 0) return null;

  return (
    <>
      <button
        type="button"
        className="btn btn-lg smart-pick-btn"
        onClick={() => {
          setOpen(true);
          run();
        }}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
          <circle cx="12" cy="12" r="3.2" fill="currentColor" fillOpacity="0.25" />
        </svg>
        {labels.button}
      </button>
      {open && typeof document !== 'undefined'
        ? createPortal(
        <div className="modal-backdrop" onClick={() => !rolling && setOpen(false)}>
          <div className="modal smart-pick" role="dialog" aria-modal="true" aria-label={labels.title} onClick={(e) => e.stopPropagation()}>
            <button type="button" className="smart-pick-close" aria-label={labels.close} onClick={() => setOpen(false)}>
              ×
            </button>
            <p className="smart-pick-title">{rolling ? labels.scanning : labels.title}</p>
            <div className={`smart-pick-stage${rolling ? ' rolling' : ' landed'}`}>
              <span className="smart-pick-ring" aria-hidden="true" />
              {shown ? (
                <div className="smart-pick-card">
                  <GameArt game={art(shown)} />
                </div>
              ) : null}
            </div>
            <div className="smart-pick-actions">
              {shown && !rolling ? (
                <Link href={`/casino/${shown.id}`} className="btn btn-gold btn-lg">
                  {labels.play} · {shown.title}
                </Link>
              ) : null}
              <button type="button" className="btn btn-dark" disabled={rolling} onClick={run}>
                {labels.again}
              </button>
            </div>
            <p className="smart-pick-note">{labels.note}</p>
          </div>
        </div>,
            document.body,
          )
        : null}
    </>
  );
}
