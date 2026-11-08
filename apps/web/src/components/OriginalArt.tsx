import type { ReactNode } from 'react';

const GOLD = '#f5c518';
const LIGHT = '#fff3b0';
const RED = '#d62828';
const DARK = '#15151a';

function Coin({ cx, cy, r, label }: { cx: number; cy: number; r: number; label?: string }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={GOLD} stroke={LIGHT} strokeWidth="3" />
      <circle cx={cx} cy={cy} r={r * 0.74} fill="none" stroke="#b07a00" strokeWidth="2" />
      {label ? (
        <text x={cx} y={cy + r * 0.3} textAnchor="middle" fontSize={r * 0.9} fontWeight="900" fill="#7a4d00" fontFamily="Georgia, serif">
          {label}
        </text>
      ) : null}
    </g>
  );
}

function DiceFace({ x, y, s, dots, fill = '#fffdf2', pip = DARK, rot = 0 }: { x: number; y: number; s: number; dots: [number, number][]; fill?: string; pip?: string; rot?: number }) {
  return (
    <g transform={`rotate(${rot} ${x + s / 2} ${y + s / 2})`}>
      <rect x={x} y={y} width={s} height={s} rx={s * 0.18} fill={fill} stroke="#d6d0b8" strokeWidth="2" />
      {dots.map(([dx, dy], i) => (
        <circle key={i} cx={x + s / 2 + dx * s} cy={y + s / 2 + dy * s} r={s * 0.085} fill={pip} />
      ))}
    </g>
  );
}

function Card({ x, y, rot, rank, suit, color }: { x: number; y: number; rot: number; rank: string; suit: string; color: string }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`}>
      <rect x="-30" y="-44" width="60" height="88" rx="7" fill="#fffdf2" stroke="#d6d0b8" />
      <text x="-22" y="-24" fontSize="20" fontWeight="900" fill={color} fontFamily="Georgia, serif">{rank}</text>
      <text x="0" y="18" textAnchor="middle" fontSize="38" fill={color}>{suit}</text>
    </g>
  );
}

const EMBLEMS: Record<string, () => ReactNode> = {
  // Fortune wheel: multicolour segments with a pointer.
  wheel: () => {
    const cols = ['#e11d48', '#f59e0b', '#16a34a', '#2563eb', '#a855f7', '#f97316', '#14b8a6', '#eab308'];
    const cx = 100, cy = 92, r = 58;
    return (
      <g>
        <circle cx={cx} cy={cy} r={r + 7} fill="#3b2300" stroke={GOLD} strokeWidth="4" />
        {cols.map((c, i) => {
          const a0 = ((i * 45 - 90) * Math.PI) / 180, a1 = (((i + 1) * 45 - 90) * Math.PI) / 180;
          return <path key={i} d={`M${cx} ${cy} L${(cx + r * Math.cos(a0)).toFixed(2)} ${(cy + r * Math.sin(a0)).toFixed(2)} A${r} ${r} 0 0 1 ${(cx + r * Math.cos(a1)).toFixed(2)} ${(cy + r * Math.sin(a1)).toFixed(2)} Z`} fill={c} stroke="#fff" strokeWidth="1.5" />;
        })}
        <circle cx={cx} cy={cy} r="14" fill={GOLD} stroke={LIGHT} strokeWidth="3" />
        <path d="M100 18 l-9 -14 h18 z" fill="#fff" stroke="#3b2300" strokeWidth="2" transform="translate(0 6)" />
      </g>
    );
  },
  coin: () => (
    <g>
      <ellipse cx="100" cy="148" rx="48" ry="9" fill="#000" opacity="0.3" />
      <Coin cx={100} cy={92} r={52} label="1.88×" />
      <path d="M62 64 q20 -22 52 -18" stroke="#fff" strokeWidth="5" fill="none" opacity="0.55" strokeLinecap="round" />
    </g>
  ),
  dice: () => (
    <g>
      <DiceFace x={38} y={64} s={68} dots={[[-0.25, -0.25], [0.25, -0.25], [0, 0], [-0.25, 0.25], [0.25, 0.25]]} rot={-12} />
      <DiceFace x={104} y={80} s={56} dots={[[-0.25, -0.25], [0.25, 0.25], [0, 0]]} fill={GOLD} rot={14} />
    </g>
  ),
  roulette: () => {
    const r = 56, cx = 100, cy = 92;
    return (
      <g>
        <circle cx={cx} cy={cy} r={r + 8} fill="#5a3410" stroke={GOLD} strokeWidth="4" />
        {Array.from({ length: 24 }, (_, i) => {
          const a0 = ((i * 15 - 90) * Math.PI) / 180, a1 = (((i + 1) * 15 - 90) * Math.PI) / 180;
          return <path key={i} d={`M${cx} ${cy} L${(cx + r * Math.cos(a0)).toFixed(2)} ${(cy + r * Math.sin(a0)).toFixed(2)} A${r} ${r} 0 0 1 ${(cx + r * Math.cos(a1)).toFixed(2)} ${(cy + r * Math.sin(a1)).toFixed(2)} Z`} fill={i === 0 ? '#16a34a' : i % 2 ? RED : DARK} />;
        })}
        <circle cx={cx} cy={cy} r="30" fill="#3b2300" stroke={GOLD} strokeWidth="3" />
        <path d="M100 74 v36 M82 92 h36" stroke={GOLD} strokeWidth="5" strokeLinecap="round" />
        <circle cx="136" cy="62" r="5.5" fill="#fff" />
      </g>
    );
  },
  plinko: () => {
    const pegs: ReactNode[] = [];
    for (let row = 0; row < 5; row++) for (let i = 0; i <= row; i++) pegs.push(<circle key={`${row}-${i}`} cx={100 + (i - row / 2) * 26} cy={40 + row * 22} r="4.5" fill="#fff" />);
    return (
      <g>
        {pegs}
        <circle cx="113" cy="30" r="9" fill={GOLD} stroke={LIGHT} strokeWidth="2" />
        {['#e11d48', '#f59e0b', '#16a34a', '#f59e0b', '#e11d48'].map((c, i) => (
          <rect key={i} x={38 + i * 26} y="138" width="22" height="16" rx="4" fill={c} />
        ))}
      </g>
    );
  },
  keno: () => {
    const hit = new Set([2, 5, 9, 12, 14]);
    return (
      <g>
        {Array.from({ length: 16 }, (_, i) => (
          <g key={i}>
            <circle cx={52 + (i % 4) * 32} cy={44 + Math.floor(i / 4) * 30} r="12.5" fill={hit.has(i) ? GOLD : '#ffffff'} fillOpacity={hit.has(i) ? 1 : 0.18} stroke={hit.has(i) ? LIGHT : '#fff'} strokeOpacity={hit.has(i) ? 1 : 0.4} strokeWidth="2" />
            <text x={52 + (i % 4) * 32} y={49 + Math.floor(i / 4) * 30} textAnchor="middle" fontSize="13" fontWeight="900" fill={hit.has(i) ? '#5a3a00' : '#fff'}>{(i * 5 + 3) % 80 || 7}</text>
          </g>
        ))}
      </g>
    );
  },
  mines: () => (
    <g>
      <path d="M100 34 l34 26 l-14 44 h-40 l-14 -44 z" fill="#38bdf8" stroke="#e0f7ff" strokeWidth="3" />
      <path d="M66 60 h68 M100 34 l-14 26 l14 44 l14 -44 z" stroke="#e0f7ff" strokeWidth="2" fill="none" />
      <circle cx="56" cy="128" r="22" fill={DARK} stroke="#6b7280" strokeWidth="3" />
      <path d="M72 112 l10 -10 M80 98 l6 -6 M86 92 l-3 -8 m3 8 l8 -3 m-8 3 l0 8" stroke={GOLD} strokeWidth="3" strokeLinecap="round" />
      <circle cx="50" cy="122" r="5" fill="#fff" opacity="0.4" />
    </g>
  ),
  dragontiger: () => (
    <g>
      <circle cx="62" cy="92" r="40" fill="#b91c1c" stroke={GOLD} strokeWidth="4" />
      <text x="62" y="108" textAnchor="middle" fontSize="48" fontWeight="900" fill={GOLD} fontFamily="Georgia, serif">龍</text>
      <circle cx="138" cy="92" r="40" fill="#c2410c" stroke={GOLD} strokeWidth="4" />
      <text x="138" y="108" textAnchor="middle" fontSize="48" fontWeight="900" fill="#fff3b0" fontFamily="Georgia, serif">虎</text>
      <text x="100" y="100" textAnchor="middle" fontSize="20" fontWeight="900" fill="#fff" stroke="#000" strokeWidth="3" paintOrder="stroke">VS</text>
    </g>
  ),
  baccarat: () => (
    <g>
      <Card x={74} y={90} rot={-12} rank="9" suit="♠" color={DARK} />
      <Card x={128} y={92} rot={10} rank="9" suit="♦" color={RED} />
      <circle cx="100" cy="140" r="12" fill={GOLD} stroke={LIGHT} strokeWidth="2" />
    </g>
  ),
  sicbo: () => (
    <g>
      <DiceFace x={30} y={74} s={50} dots={[[-0.25, -0.25], [0.25, 0.25]]} rot={-14} />
      <DiceFace x={78} y={52} s={50} dots={[[-0.25, -0.25], [0.25, -0.25], [0, 0], [-0.25, 0.25], [0.25, 0.25]]} fill={RED} pip="#fff" rot={6} />
      <DiceFace x={120} y={86} s={50} dots={[[-0.25, -0.25], [0.25, -0.25], [-0.25, 0], [0.25, 0], [-0.25, 0.25], [0.25, 0.25]]} fill="#1d4ed8" pip="#fff" rot={14} />
    </g>
  ),
  pairplus: () => (
    <g>
      <Card x={74} y={90} rot={-10} rank="Q" suit="♥" color={RED} />
      <Card x={126} y={90} rot={10} rank="Q" suit="♠" color={DARK} />
      <text x="100" y="146" textAnchor="middle" fontSize="16" fontWeight="900" fill={GOLD} stroke="#000" strokeWidth="3" paintOrder="stroke">PAIR +</text>
    </g>
  ),
  scratch: () => (
    <g>
      <rect x="34" y="42" width="132" height="94" rx="10" fill="#fde68a" stroke={GOLD} strokeWidth="3" />
      <rect x="46" y="62" width="108" height="62" rx="6" fill="#9ca3af" />
      <path d="M52 112 l36 -40 M74 120 l40 -46 M100 120 l40 -46" stroke="#e5e7eb" strokeWidth="6" strokeLinecap="round" opacity="0.7" />
      <text x="100" y="56" textAnchor="middle" fontSize="13" fontWeight="900" fill="#7a4d00">SCRATCH & WIN</text>
      <text x="124" y="108" textAnchor="middle" fontSize="26" fontWeight="900" fill={RED}>$</text>
    </g>
  ),
  goldrush: () => (
    <g>
      <path d="M52 84 h96 l-12 46 h-72 z" fill="#92400e" stroke="#451a03" strokeWidth="3" />
      <circle cx="74" cy="76" r="13" fill={GOLD} stroke={LIGHT} strokeWidth="2" />
      <circle cx="100" cy="66" r="15" fill={GOLD} stroke={LIGHT} strokeWidth="2" />
      <circle cx="126" cy="76" r="13" fill={GOLD} stroke={LIGHT} strokeWidth="2" />
      <circle cx="76" cy="140" r="9" fill="#374151" stroke="#9ca3af" strokeWidth="2" />
      <circle cx="124" cy="140" r="9" fill="#374151" stroke="#9ca3af" strokeWidth="2" />
    </g>
  ),
  strike: () => (
    <g>
      <path d="M112 22 L66 94 h30 L80 152 L142 70 h-32 z" fill={GOLD} stroke={LIGHT} strokeWidth="4" strokeLinejoin="round" />
      <path d="M112 22 L66 94 h30" fill="#fff" opacity="0.35" />
    </g>
  ),
  raptor: () => (
    <g>
      <path d="M46 130 C52 70 92 38 148 46 C138 58 130 66 134 78 C112 80 104 100 110 130 Z" fill="#16a34a" stroke="#052e16" strokeWidth="3" />
      <path d="M118 52 l18 -2 l-6 12 z" fill="#fff" />
      <circle cx="124" cy="58" r="4.5" fill="#fde047" stroke="#052e16" strokeWidth="2" />
      <path d="M86 126 l8 -16 l8 16 M104 126 l8 -16 l8 16" stroke="#fff" strokeWidth="3" fill="none" strokeLinejoin="round" />
    </g>
  ),
  candy: () => (
    <g>
      <rect x="96" y="78" width="8" height="70" rx="4" fill="#f5f5f4" />
      <circle cx="100" cy="64" r="36" fill="#ec4899" stroke="#fff" strokeWidth="4" />
      <path d="M100 64 m0 -26 a26 26 0 1 1 -18 8 M100 64 m0 -14 a14 14 0 1 1 -10 4" stroke="#fff" strokeWidth="6" fill="none" strokeLinecap="round" />
      <circle cx="48" cy="120" r="12" fill="#22c55e" stroke="#fff" strokeWidth="3" />
      <circle cx="154" cy="116" r="12" fill="#f59e0b" stroke="#fff" strokeWidth="3" />
    </g>
  ),
  thunder: () => (
    <g>
      <path d="M52 78 a22 22 0 0 1 22 -22 a30 30 0 0 1 56 6 a20 20 0 0 1 4 40 h-82 a22 22 0 0 1 0 -24 z" fill="#475569" stroke="#cbd5e1" strokeWidth="3" />
      <path d="M106 80 l-18 30 h14 l-8 30 l30 -40 h-16 l10 -20 z" fill={GOLD} stroke={LIGHT} strokeWidth="2" strokeLinejoin="round" />
    </g>
  ),
  ocean: () => (
    <g>
      <path d="M40 98 C60 70 100 66 130 90 L160 70 L156 114 L130 100 C100 128 60 124 40 98 Z" fill="#fb923c" stroke="#fff" strokeWidth="3" />
      <circle cx="70" cy="92" r="5" fill="#fff" /><circle cx="70" cy="92" r="2.5" fill={DARK} />
      <circle cx="152" cy="40" r="6" fill="#fff" opacity="0.5" /><circle cx="138" cy="26" r="4" fill="#fff" opacity="0.5" /><circle cx="162" cy="22" r="3" fill="#fff" opacity="0.5" />
      <path d="M20 146 q20 -14 40 0 t40 0 t40 0 t40 0" stroke="#7dd3fc" strokeWidth="5" fill="none" strokeLinecap="round" />
    </g>
  ),
  aztec: () => (
    <g>
      <circle cx="100" cy="40" r="20" fill={GOLD} stroke={LIGHT} strokeWidth="3" />
      <path d="M44 150 h112 v-18 h-14 v-18 h-16 v-18 h-16 v-18 h-20 v18 h-16 v18 h-16 v18 h-14 z" fill="#a16207" stroke="#451a03" strokeWidth="3" strokeLinejoin="round" />
      <rect x="92" y="122" width="16" height="28" fill="#1c1917" />
    </g>
  ),
  hotfruits: () => (
    <g>
      <path d="M100 150 C60 132 60 86 100 42 C140 86 140 132 100 150 Z" fill="#f97316" stroke="#fde047" strokeWidth="3" />
      <path d="M100 150 C80 138 80 112 100 86 C120 112 120 138 100 150 Z" fill="#fde047" />
      <circle cx="58" cy="124" r="16" fill={RED} stroke="#fff" strokeWidth="3" />
      <circle cx="146" cy="128" r="16" fill="#16a34a" stroke="#fff" strokeWidth="3" />
    </g>
  ),
  ancientbook: () => (
    <g>
      <path d="M100 52 C80 40 52 42 40 50 v82 c14 -8 42 -10 60 2 z" fill="#92400e" stroke={GOLD} strokeWidth="3" />
      <path d="M100 52 C120 40 148 42 160 50 v82 c-14 -8 -42 -10 -60 2 z" fill="#b45309" stroke={GOLD} strokeWidth="3" />
      <path d="M100 76 l8 14 l16 2 l-12 11 l3 16 l-15 -8 l-15 8 l3 -16 l-12 -11 l16 -2 z" fill={GOLD} stroke={LIGHT} strokeWidth="2" />
    </g>
  ),
  desert: () => (
    <g>
      <circle cx="100" cy="58" r="24" fill="#ffdf7d" stroke={GOLD} strokeWidth="3" />
      <path d="M20 150 C55 112 85 112 110 132 C130 116 160 112 180 150 Z" fill="#c2721f" stroke="#7c3f10" strokeWidth="3" />
      <path d="M58 134 c4 -14 14 -18 20 -10 c4 -10 14 -10 16 0 l4 12 l-6 0 l-2 -8 l-4 10 l-6 0 l2 -10 l-10 6 l-2 10 l-6 0 z" fill="#3b1d0c" />
      <path d="M128 132 l10 -26 l10 26 z" fill={GOLD} stroke={LIGHT} strokeWidth="2" />
    </g>
  ),
  chilli: () => (
    <g>
      <path d="M62 64 C40 92 52 140 96 154 C132 166 156 146 150 128 C122 140 92 128 84 100 C80 86 82 74 88 66 Z" fill={RED} stroke="#fde047" strokeWidth="3" strokeLinejoin="round" />
      <path d="M88 66 C86 54 92 44 104 40 C100 50 100 58 104 64 Z" fill="#16a34a" stroke="#14532d" strokeWidth="2" />
      <path d="M70 92 C72 112 84 128 104 136" stroke="#fff" strokeWidth="4" strokeLinecap="round" fill="none" opacity="0.45" />
      <path d="M140 40 C130 58 150 64 142 82 C160 72 164 52 140 40 Z" fill="#f97316" stroke="#fde047" strokeWidth="2" />
    </g>
  ),
  candyburst: () => (
    <g>
      <circle cx="100" cy="86" r="40" fill="#ec4899" stroke="#fff" strokeWidth="4" />
      <path d="M100 86 m-28 0 a28 28 0 1 1 56 0 a20 20 0 1 1 -40 0 a12 12 0 1 1 24 0" stroke="#fff" strokeWidth="6" fill="none" />
      <rect x="96" y="126" width="8" height="34" rx="3" fill="#fde68a" />
    </g>
  ),
  lionsroar: () => (
    <g>
      <circle cx="100" cy="88" r="46" fill="#a16207" stroke={GOLD} strokeWidth="4" />
      <circle cx="100" cy="92" r="28" fill={GOLD} stroke="#78350f" strokeWidth="3" />
      <circle cx="90" cy="86" r="4" fill="#16a34a" /><circle cx="110" cy="86" r="4" fill="#16a34a" />
      <path d="M92 104 q8 8 16 0" stroke="#78350f" strokeWidth="3" fill="none" />
    </g>
  ),
  andarbahar: () => (
    <g>
      <Card x={100} y={64} rot={0} rank="J" suit="★" color="#b45309" />
      <Card x={58} y={112} rot={-12} rank="7" suit="♥" color={RED} />
      <Card x={142} y={112} rot={12} rank="7" suit="♠" color={DARK} />
    </g>
  ),
  casinowar: () => (
    <g>
      <Card x={70} y={92} rot={-14} rank="K" suit="♣" color={DARK} />
      <Card x={130} y={92} rot={14} rank="A" suit="♦" color={RED} />
      <path d="M100 30 l6 6 l-40 40 l-6 -6 z M100 30 l-6 6 l40 40 l6 -6 z" fill={GOLD} stroke="#3b2300" strokeWidth="2" />
    </g>
  ),
  slots: () => (
    <g>
      <rect x="22" y="56" width="156" height="90" rx="16" fill={GOLD} stroke={LIGHT} strokeWidth="3" />
      <rect x="30" y="66" width="140" height="70" rx="10" fill="#1a1020" />
      {['7', '★', '7'].map((g, i) => (
        <g key={i}>
          <rect x={36 + i * 45} y="72" width="40" height="58" rx="7" fill="#fffdf2" />
          <text x={56 + i * 45} y="112" textAnchor="middle" fontSize="40" fontWeight="900" fill={i === 1 ? '#d99a00' : RED} fontFamily="Georgia, serif">{g}</text>
        </g>
      ))}
    </g>
  ),
  crash: () => (
    <g>
      <path d="M24 150 C58 144 78 120 98 98 S146 50 176 32" stroke={GOLD} strokeWidth="6" strokeLinecap="round" fill="none" />
      <g transform="translate(150 54) rotate(40)">
        <path d="M0 -18 C8 -8 8 6 0 14 C-8 6 -8 -8 0 -18Z" fill="#fff" />
        <circle cx="0" cy="-4" r="3.2" fill={RED} />
        <path d="M-6 8 L-12 16 L-4 12Z M6 8 L12 16 L4 12Z" fill={GOLD} />
      </g>
      <text x="100" y="140" textAnchor="middle" fontSize="22" fontWeight="900" fill="#fff">x12.40</text>
    </g>
  ),
};

export function originalEmblem(id: string): ReactNode | null {
  const draw = EMBLEMS[id];
  return draw ? draw() : null;
}
