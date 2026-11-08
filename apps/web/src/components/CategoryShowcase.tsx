import { Link } from '@/i18n/routing';
import { GameArt } from './GameArt';

const JEWEL: Record<string, string> = { slots: '#6d0f24', table: '#0b4d3b', instant: '#10285a', crash: '#3c1660' };

export interface ShowcaseGame {
  id: string;
  title: string;
  hue: number;
  category: 'slots' | 'table' | 'crash' | 'instant';
}

/** Home "game categories": each card shows a fan of real Carthagenet game artworks from that category. */
export function CategoryShowcase({ items }: { items: { key: string; label: string; count: string; href: string; games: ShowcaseGame[] }[] }) {
  return (
    <div className="cat-grid">
      {items.map((it) => (
        <Link key={it.key} href={it.href} className="cat-card cat-card-art" style={{ ['--jewel' as string]: JEWEL[it.key] }}>
          <span className="cat-fan" aria-hidden="true">
            {it.games.slice(0, 3).map((g, i, all) => (
              <span key={g.id} className={`cat-fan-card n${all.length} i${i}`}>
                <GameArt game={{ id: `cat-${it.key}-${g.id}`, slug: g.id, name: g.title, category: g.category === 'instant' ? 'other' : g.category, thumbnail: null, art: { hue: g.hue, title: g.title, noTitle: true } }} />
              </span>
            ))}
          </span>
          <span className="cat-name">{it.label}</span>
          <span className="cat-count">{it.count}</span>
        </Link>
      ))}
    </div>
  );
}
