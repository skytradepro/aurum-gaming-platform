import { coverSrcSet, optimizedSrc } from '@/lib/img';
import type { GameItem } from '@/lib/types';
import { originalEmblem } from './OriginalArt';
import { themeEmblem } from './ThemeArt';

/** Deterministic pseudo-random number from a string. */
function seeded(text: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 10000) / 10000;
  };
}

const GOLD = '#f5c518';

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

function Burst({ cx, cy }: { cx: number; cy: number }) {
  const rays = 14;
  return (
    <g fill="#fff" opacity="0.06">
      {Array.from({ length: rays }, (_, i) => {
        const a0 = (i * 360) / rays;
        const a1 = a0 + 360 / rays / 2;
        const [x0, y0] = polar(cx, cy, 230, a0);
        const [x1, y1] = polar(cx, cy, 230, a1);
        return <polygon key={i} points={`${cx},${cy} ${x0.toFixed(1)},${y0.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`} />;
      })}
    </g>
  );
}

function Sparkle({ x, y, s }: { x: number; y: number; s: number }) {
  return (
    <path
      d={`M${x} ${y - s} L${x + s * 0.28} ${y - s * 0.28} L${x + s} ${y} L${x + s * 0.28} ${y + s * 0.28} L${x} ${y + s} L${x - s * 0.28} ${y + s * 0.28} L${x - s} ${y} L${x - s * 0.28} ${y - s * 0.28} Z`}
      fill="#fff"
      opacity="0.85"
    />
  );
}

const RED = '#d62828';
const SLOT_SETS: [string, string][][] = [
  [['7', RED], ['★', GOLD], ['7', RED]],
  [['♦', RED], ['♦', RED], ['♦', RED]],
  [['★', GOLD], ['★', GOLD], ['★', GOLD]],
  [['♣', '#15151a'], ['♥', RED], ['♠', '#15151a']],
  [['7', RED], ['7', RED], ['7', RED]],
  [['B', '#1d4ed8'], ['A', RED], ['R', '#15803d']],
];

function Slots({ variant }: { variant: number }) {
  const reels = SLOT_SETS[variant % SLOT_SETS.length] ?? [];
  return (
    <g>
      <rect x="22" y="64" width="156" height="84" rx="16" fill={GOLD} stroke="#fff3b0" strokeWidth="3" />
      <rect x="30" y="72" width="140" height="68" rx="10" fill="#1a1020" />
      {reels.map(([glyph, color], i) => (
        <g key={i}>
          <rect x={36 + i * 45} y="78" width="40" height="56" rx="7" fill="#fffdf2" />
          <text x={56 + i * 45} y="118" textAnchor="middle" fontSize="40" fontWeight="900" fill={color} fontFamily="Georgia, serif">
            {glyph}
          </text>
        </g>
      ))}
      <circle cx="100" cy="160" r="7" fill={GOLD} stroke="#fff3b0" strokeWidth="2" />
      <circle cx="78" cy="164" r="5" fill="#d99a00" stroke="#fff3b0" strokeWidth="1.5" />
      <circle cx="122" cy="164" r="5" fill="#d99a00" stroke="#fff3b0" strokeWidth="1.5" />
    </g>
  );
}

function Wheel() {
  const cx = 100;
  const cy = 98;
  const wedges = 16;
  return (
    <g>
      <circle cx={cx} cy={cy} r="62" fill="#3b2300" stroke={GOLD} strokeWidth="5" />
      {Array.from({ length: wedges }, (_, i) => {
        const a0 = (i * 360) / wedges;
        const a1 = ((i + 1) * 360) / wedges;
        const [x0, y0] = polar(cx, cy, 54, a0);
        const [x1, y1] = polar(cx, cy, 54, a1);
        const color = i === 0 ? '#16a34a' : i % 2 ? '#d62828' : '#15151a';
        return <path key={i} d={`M${cx} ${cy} L${x0.toFixed(1)} ${y0.toFixed(1)} A54 54 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)} Z`} fill={color} stroke="#2a1a00" strokeWidth="0.8" />;
      })}
      <circle cx={cx} cy={cy} r="26" fill="#2a1a00" stroke={GOLD} strokeWidth="3" />
      <circle cx={cx} cy={cy} r="11" fill={GOLD} />
      <circle cx="140" cy="76" r="4.5" fill="#fff" />
    </g>
  );
}

function Crash() {
  return (
    <g>
      <path d="M20 168 H182 M20 168 V40" stroke="#fff" strokeOpacity="0.25" strokeWidth="2" fill="none" />
      <path d="M24 160 C58 154 78 128 98 106 S146 58 176 40 L176 168 L24 168 Z" fill={GOLD} opacity="0.16" />
      <path d="M24 160 C58 154 78 128 98 106 S146 58 176 40" stroke={GOLD} strokeWidth="6" strokeLinecap="round" fill="none" />
      <path d="M176 40 l-14 3 l8 10 z" fill="#fff" />
      <g transform="translate(150 54) rotate(40)">
        <path d="M0 -18 C8 -8 8 6 0 14 C-8 6 -8 -8 0 -18Z" fill="#fff" />
        <circle cx="0" cy="-4" r="3.2" fill="#d62828" />
        <path d="M-6 8 L-12 16 L-4 12Z M6 8 L12 16 L4 12Z" fill={GOLD} />
      </g>
      <text x="100" y="152" textAnchor="middle" fontSize="22" fontWeight="900" fill="#fff" fontFamily="system-ui, sans-serif">
        x12.40
      </text>
    </g>
  );
}

function Cards() {
  return (
    <g>
      <g transform="translate(78 108) rotate(-14)">
        <rect x="-34" y="-50" width="68" height="100" rx="8" fill="#fffdf2" stroke="#d6d0b8" />
        <text x="-24" y="-24" fontSize="22" fontWeight="900" fill="#15151a" fontFamily="Georgia, serif">
          A
        </text>
        <text x="0" y="22" textAnchor="middle" fontSize="44" fill="#15151a">
          ♠
        </text>
      </g>
      <g transform="translate(124 112) rotate(12)">
        <rect x="-34" y="-50" width="68" height="100" rx="8" fill="#fffdf2" stroke="#d6d0b8" />
        <text x="-24" y="-24" fontSize="22" fontWeight="900" fill="#d62828" fontFamily="Georgia, serif">
          K
        </text>
        <text x="0" y="22" textAnchor="middle" fontSize="44" fill="#d62828">
          ♥
        </text>
      </g>
    </g>
  );
}

function Pips({ cx, cy, s, dots }: { cx: number; cy: number; s: number; dots: [number, number][] }) {
  return (
    <>
      {dots.map(([dx, dy], i) => (
        <circle key={i} cx={cx + dx * s} cy={cy + dy * s} r={s * 0.11} fill="#15151a" />
      ))}
    </>
  );
}

function Dice() {
  return (
    <g>
      <g transform="rotate(-10 78 104)">
        <rect x="42" y="68" width="72" height="72" rx="14" fill="#fffdf2" stroke="#d6d0b8" strokeWidth="2" />
        <Pips cx={78} cy={104} s={72 / 2} dots={[[-0.5, -0.5], [0.5, -0.5], [0, 0], [-0.5, 0.5], [0.5, 0.5]]} />
      </g>
      <g transform="rotate(14 128 126)">
        <rect x="102" y="100" width="54" height="54" rx="11" fill={GOLD} stroke="#fff3b0" strokeWidth="2" />
        <Pips cx={129} cy={127} s={54 / 2} dots={[[-0.45, -0.45], [0.45, 0.45], [0, 0]]} />
      </g>
    </g>
  );
}

function Title({ text, uid }: { text: string; uid: string }) {
  const words = text.toUpperCase().split(' ');
  const mid = Math.ceil(words.length / 2);
  const lines = words.length > 1 && text.length > 9 ? [words.slice(0, mid).join(' '), words.slice(mid).join(' ')] : [text.toUpperCase()];
  const size = Math.max(...lines.map((l) => l.length)) > 11 ? 15 : 19;
  return (
    <g>
      <rect y="132" width="200" height="84" fill={`url(#${uid}-fade)`} />
      <rect x="40" y={lines.length === 1 ? 199 : 203} width="120" height="1" fill={`url(#${uid}-line)`} />
      {lines.map((line, i) => (
        <text
          key={i}
          x="100"
          y={(lines.length === 1 ? 190 : 175) + i * (size + 3)}
          textAnchor="middle"
          fontSize={size}
          fontWeight="800"
          letterSpacing="1.2"
          fill={`url(#${uid}-gold)`}
          stroke="#1a0f02"
          strokeWidth="2.6"
          paintOrder="stroke"
          style={{ fontFamily: 'var(--font-display, Georgia, serif)' }}
        >
          {line}
        </text>
      ))}
    </g>
  );
}

function pickEmblem(game: Pick<GameItem, 'category' | 'name'>): 'wheel' | 'crash' | 'cards' | 'dice' | 'slots' {
  const name = game.name.toLowerCase();
  if (game.category === 'crash') return 'crash';
  if (/roulette|wheel/.test(name)) return 'wheel';
  if (/black ?jack|poker|baccarat|hold.?em|tiger|bahar/.test(name)) return 'cards';
  if (/dice|sic bo|plinko|keno|scratch|mines/.test(name)) return 'dice';
  if (game.category === 'live') return 'wheel';
  if (game.category === 'table') return 'cards';
  if (game.category === 'other') return 'dice';
  return 'slots';
}

export function GameArt({ game }: { game: Pick<GameItem, 'id' | 'slug' | 'category' | 'thumbnail' | 'art' | 'name'> }) {
  if (game.thumbnail) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={game.thumbnail.url} alt="" loading="lazy" width={game.thumbnail.width} height={game.thumbnail.height} />
    );
  }
  if (typeof game.art.image === 'string' && (game.art.image.startsWith('https://') || /^\/media\/games\/[a-z0-9-]+\.(svg|png|jpg|webp)$/.test(game.art.image))) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={optimizedSrc(game.art.image, 640)}
        srcSet={coverSrcSet(game.art.image)}
        sizes="(max-width: 700px) 46vw, 240px"
        alt=""
        loading="lazy"
        decoding="async"
      />
    );
  }
  const rand = seeded(game.slug);
  const hue = typeof game.art.hue === 'number' ? game.art.hue : Math.floor(rand() * 360);
  const uid = `ga-${game.id}`;
  const emblem = pickEmblem(game);
  const custom = typeof game.art.title === 'string' ? originalEmblem(game.slug) : null;
  const slotVariant = Math.floor(rand() * 100);
  const sparkles = Array.from({ length: 5 }, () => ({ x: 14 + rand() * 172, y: 12 + rand() * 190, s: 3 + rand() * 6 }));

  const theme = custom ? null : themeEmblem(game.name);
  const bokeh = Array.from({ length: 7 }, () => ({ x: rand() * 200, y: rand() * 120, r: 4 + rand() * 12, o: 0.05 + rand() * 0.12 }));

  return (
    <svg viewBox="0 0 200 216" preserveAspectRatio="xMidYMid slice" role="img" aria-label={game.name}>
      <defs>
        <radialGradient id={`${uid}-bg`} cx="0.5" cy="0.22" r="0.95">
          <stop offset="0" stopColor={`hsl(${hue} 78% 46%)`} />
          <stop offset="0.45" stopColor={`hsl(${(hue + 18) % 360} 70% 20%)`} />
          <stop offset="1" stopColor={`hsl(${(hue + 30) % 360} 60% 5%)`} />
        </radialGradient>
        <radialGradient id={`${uid}-glow`} cx="0.5" cy="0.45" r="0.5">
          <stop offset="0" stopColor="#ffe9a8" stopOpacity="0.5" />
          <stop offset="1" stopColor="#ffe9a8" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${uid}-floor`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#000" stopOpacity="0.55" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${uid}-vig`} cx="0.5" cy="0.45" r="0.75">
          <stop offset="0.6" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.65" />
        </radialGradient>
        <linearGradient id={`${uid}-fade`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0" />
          <stop offset="0.55" stopColor="#07050a" stopOpacity="0.82" />
          <stop offset="1" stopColor="#07050a" stopOpacity="0.95" />
        </linearGradient>
        <linearGradient id={`${uid}-gold`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff6d6" />
          <stop offset="0.45" stopColor="#f4cf6e" />
          <stop offset="1" stopColor="#b8862a" />
        </linearGradient>
        <linearGradient id={`${uid}-line`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#e9c46a" stopOpacity="0" />
          <stop offset="0.5" stopColor="#e9c46a" />
          <stop offset="1" stopColor="#e9c46a" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${uid}-frame`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff1c4" stopOpacity="0.9" />
          <stop offset="0.5" stopColor="#c8962c" stopOpacity="0.25" />
          <stop offset="1" stopColor="#fff1c4" stopOpacity="0.7" />
        </linearGradient>
        <filter id={`${uid}-shadow`} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="6" stdDeviation="5" floodColor="#000" floodOpacity="0.6" />
        </filter>
      </defs>
      <rect width="200" height="216" fill={`url(#${uid}-bg)`} />
      <Burst cx={100} cy={96} />
      {bokeh.map((b, i) => (
        <circle key={i} cx={b.x.toFixed(1)} cy={b.y.toFixed(1)} r={b.r.toFixed(1)} fill="#fff6d6" opacity={b.o.toFixed(2)} />
      ))}
      <rect width="200" height="216" fill={`url(#${uid}-glow)`} />
      <ellipse cx="100" cy="166" rx="70" ry="12" fill={`url(#${uid}-floor)`} />
      <g filter={`url(#${uid}-shadow)`}>
      {custom}
      {custom || theme ? null : emblem === 'wheel' ? <Wheel /> : null}
      {custom || theme ? null : emblem === 'crash' ? <Crash /> : null}
      {custom || theme ? null : emblem === 'cards' ? <Cards /> : null}
      {custom || theme ? null : emblem === 'dice' ? <Dice /> : null}
      {custom || theme ? null : emblem === 'slots' ? <Slots variant={slotVariant} /> : null}
      {theme}
      </g>
      {sparkles.map((p, i) => (
        <Sparkle key={i} x={p.x} y={p.y} s={p.s} />
      ))}
      <rect width="200" height="216" fill={`url(#${uid}-vig)`} />
      {typeof game.art.title === 'string' && game.art.noTitle !== true ? <Title text={game.art.title} uid={uid} /> : null}
      <rect x="4.5" y="4.5" width="191" height="207" rx="12" fill="none" stroke={`url(#${uid}-frame)`} strokeWidth="1.2" />
    </svg>
  );
}
