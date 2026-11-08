import { Link } from '@/i18n/routing';
import { Icon } from './Icon';
import type { IconName } from './Icon';

export interface Tile {
  href: string;
  label: string;
  icon: IconName;
  hue: number;
}

export function CategoryTiles({ tiles }: { tiles: Tile[] }) {
  return (
    <div className="tiles">
      {tiles.map((tile) => (
        <Link key={tile.label} href={tile.href} className="tile" style={{ ['--h' as string]: tile.hue }}>
          <Icon name={tile.icon} className="tile-art" strokeWidth={1.1} />
          <span className="tile-label">{tile.label}</span>
        </Link>
      ))}
    </div>
  );
}
