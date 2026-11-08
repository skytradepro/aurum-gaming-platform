/**
 * Themed emblems for catalogue games that have no artwork yet (generic motifs only: a fish, a bolt,
 * a candy...). Replaced by the provider's own image once the aggregator catalogue is synced.
 */
import type { ReactNode } from 'react';

const G = { light: '#fff3c4', mid: '#f2c75c', dark: '#a8721c', deep: '#5a3a08' };

function Defs() {
  return (
    <defs>
      <linearGradient id="ta-gold" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={G.light} />
        <stop offset="0.5" stopColor={G.mid} />
        <stop offset="1" stopColor={G.dark} />
      </linearGradient>
      <linearGradient id="ta-red" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ff7a6b" />
        <stop offset="1" stopColor="#9b0f1f" />
      </linearGradient>
      <linearGradient id="ta-green" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#8af0b0" />
        <stop offset="1" stopColor="#0d6b3c" />
      </linearGradient>
      <linearGradient id="ta-blue" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#9fd8ff" />
        <stop offset="1" stopColor="#1546a3" />
      </linearGradient>
      <linearGradient id="ta-pink" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffc2e6" />
        <stop offset="1" stopColor="#c21c7a" />
      </linearGradient>
      <linearGradient id="ta-purple" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#d7b8ff" />
        <stop offset="1" stopColor="#4b1a8f" />
      </linearGradient>
      <radialGradient id="ta-shine" cx="0.35" cy="0.3" r="0.6">
        <stop offset="0" stopColor="#fff" stopOpacity="0.85" />
        <stop offset="1" stopColor="#fff" stopOpacity="0" />
      </radialGradient>
    </defs>
  );
}

const Fish = () => (
  <g>
    <path d="M40 100c20-34 74-44 104-10 6 7 6 13 0 20-30 34-84 24-104-10Z" fill="url(#ta-green)" stroke={G.deep} strokeWidth="3" />
    <path d="M144 100l26-24v48Z" fill="url(#ta-green)" stroke={G.deep} strokeWidth="3" strokeLinejoin="round" />
    <path d="M70 76c10 16 10 32 0 48M88 72c12 18 12 38 0 56" stroke="#0a4a2a" strokeWidth="2.5" fill="none" opacity="0.6" />
    <circle cx="58" cy="94" r="7" fill="#fff" stroke={G.deep} strokeWidth="2" />
    <circle cx="59" cy="94" r="3.4" fill="#111" />
    <path d="M44 106c6 4 12 4 18 1" stroke={G.deep} strokeWidth="3" fill="none" strokeLinecap="round" />
    <ellipse cx="96" cy="88" rx="40" ry="12" fill="url(#ta-shine)" opacity="0.5" />
    <path d="M150 52v26M150 52l-6 8" stroke={G.light} strokeWidth="2" fill="none" />
    <circle cx="160" cy="62" r="4" fill="none" stroke="#bfe8ff" strokeWidth="2" opacity="0.8" />
    <circle cx="168" cy="48" r="3" fill="none" stroke="#bfe8ff" strokeWidth="2" opacity="0.7" />
  </g>
);

const Bolt = () => (
  <g>
    <path d="M50 150c-14-30-4-66 22-84M150 150c14-30 4-66-22-84" stroke="url(#ta-gold)" strokeWidth="5" fill="none" strokeLinecap="round" />
    {[0, 1, 2, 3, 4].map((i) => (
      <g key={i}>
        <ellipse cx={52 - i * 1 + i * 2} cy={140 - i * 17} rx="9" ry="4.5" transform={`rotate(-50 ${52 + i} ${140 - i * 17})`} fill="url(#ta-gold)" />
        <ellipse cx={148 - i} cy={140 - i * 17} rx="9" ry="4.5" transform={`rotate(50 ${148 - i} ${140 - i * 17})`} fill="url(#ta-gold)" />
      </g>
    ))}
    <path d="M112 34 70 108h28l-12 58 48-82h-30l8-50Z" fill="url(#ta-gold)" stroke={G.deep} strokeWidth="3" strokeLinejoin="round" />
    <path d="M112 34 96 70" stroke="#fff" strokeWidth="3" opacity="0.7" strokeLinecap="round" />
  </g>
);

const Candy = () => (
  <g>
    <path d="M100 112v54" stroke="#f8f3ea" strokeWidth="7" strokeLinecap="round" />
    <circle cx="100" cy="82" r="40" fill="url(#ta-pink)" stroke="#7a0f4a" strokeWidth="3" />
    <path d="M100 82m-30 0a30 30 0 1 0 60 0a22 22 0 1 0-44 0a14 14 0 1 0 28 0a6 6 0 1 0-12 0" fill="none" stroke="#fff" strokeWidth="5" opacity="0.9" />
    <circle cx="86" cy="64" r="10" fill="url(#ta-shine)" />
    <g transform="rotate(-20 46 140)">
      <path d="M30 140l-10-8v16ZM62 140l10-8v16Z" fill="url(#ta-blue)" />
      <ellipse cx="46" cy="140" rx="17" ry="11" fill="url(#ta-blue)" stroke="#0d2c6b" strokeWidth="2" />
    </g>
    <g transform="rotate(18 156 136)">
      <path d="M140 136l-10-8v16ZM172 136l10-8v16Z" fill="url(#ta-gold)" />
      <ellipse cx="156" cy="136" rx="17" ry="11" fill="url(#ta-gold)" stroke={G.deep} strokeWidth="2" />
    </g>
    <circle cx="150" cy="56" r="9" fill="url(#ta-green)" />
    <circle cx="48" cy="58" r="7" fill="url(#ta-purple)" />
  </g>
);

const Seven = ({ color = 'url(#ta-red)' }: { color?: string }) => (
  <g>
    <circle cx="100" cy="96" r="58" fill="none" stroke="url(#ta-gold)" strokeWidth="6" />
    <circle cx="100" cy="96" r="50" fill="#1a0b10" opacity="0.55" />
    <text x="100" y="132" textAnchor="middle" fontSize="104" fontWeight="900" fill={color} stroke={G.light} strokeWidth="4" paintOrder="stroke" style={{ fontFamily: 'var(--font-display, Georgia, serif)' }}>
      7
    </text>
    {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
      <circle key={a} cx={(100 + 58 * Math.cos((a * Math.PI) / 180)).toFixed(1)} cy={(96 + 58 * Math.sin((a * Math.PI) / 180)).toFixed(1)} r="4" fill={G.light} />
    ))}
  </g>
);

const Chilli = () => (
  <g>
    <path d="M72 58c-6 22 2 40 18 60 16 20 30 32 54 40-28-2-52-12-70-32-16-18-22-42-14-62Z" fill="url(#ta-red)" stroke="#5a0610" strokeWidth="3" />
    <path d="M70 60c-2-10 4-18 14-20 2 8-2 14-8 18Z" fill="url(#ta-green)" stroke="#0a3d22" strokeWidth="2.5" />
    <path d="M84 40c0-10 6-16 14-18" stroke="#0d6b3c" strokeWidth="5" fill="none" strokeLinecap="round" />
    <path d="M80 72c4 18 14 32 28 44" stroke="#fff" strokeWidth="4" opacity="0.45" fill="none" strokeLinecap="round" />
    <path d="M130 70c10-14 6-28-4-36 14 4 26 18 22 36-2 10-10 16-18 18 6-6 6-12 0-18Z" fill="url(#ta-gold)" opacity="0.95" />
  </g>
);

const Book = () => (
  <g>
    <path d="M30 70c24-8 50-6 70 8v84c-20-14-46-16-70-8Z" fill="url(#ta-red)" stroke="#4a0710" strokeWidth="3" />
    <path d="M170 70c-24-8-50-6-70 8v84c20-14 46-16 70-8Z" fill="url(#ta-red)" stroke="#4a0710" strokeWidth="3" />
    <path d="M38 76c20-6 42-4 58 8v70c-16-10-38-12-58-8ZM162 76c-20-6-42-4-58 8v70c16-10 38-12 58-8Z" fill="#f4e4bc" />
    <path d="M100 96l9 18 20 3-14 14 3 20-18-9-18 9 3-20-14-14 20-3Z" fill="url(#ta-gold)" stroke={G.deep} strokeWidth="2" />
    <path d="M100 40v26M78 48l8 18M122 48l-8 18" stroke={G.light} strokeWidth="3" strokeLinecap="round" opacity="0.8" />
  </g>
);

const Pyramid = () => (
  <g>
    <circle cx="100" cy="56" r="20" fill="url(#ta-gold)" />
    {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
      const a = (i * Math.PI) / 4;
      return <path key={i} d={`M${(100 + 25 * Math.cos(a)).toFixed(1)} ${(56 + 25 * Math.sin(a)).toFixed(1)}L${(100 + 34 * Math.cos(a)).toFixed(1)} ${(56 + 34 * Math.sin(a)).toFixed(1)}`} stroke={G.mid} strokeWidth="4" strokeLinecap="round" />;
    })}
    <path d="M30 160h140l-14-18H44Z M44 142h112l-14-18H58Z M58 124h84l-14-18H72Z M72 106h56l-12-16H84Z" fill="url(#ta-gold)" stroke={G.deep} strokeWidth="2.5" strokeLinejoin="round" />
    <rect x="92" y="136" width="16" height="24" fill="#2a1604" />
    <path d="M30 160h140" stroke={G.light} strokeWidth="2" />
  </g>
);

const Volcano = () => (
  <g>
    <path d="M24 162l48-74h56l48 74Z" fill="#3a2418" stroke="#140a05" strokeWidth="3" />
    <path d="M72 88c8 10 14 4 20 14 6-10 12-4 16-14h20l-10 16c-8-4-12 8-20 2-8 6-14-6-22 0Z" fill="url(#ta-red)" />
    <path d="M86 88c-6-18-2-34 12-46 2 12 10 14 16 6 8 14 4 28-6 40Z" fill="url(#ta-gold)" opacity="0.9" />
    <circle cx="70" cy="44" r="12" fill="#5b4a44" opacity="0.7" />
    <circle cx="128" cy="38" r="15" fill="#5b4a44" opacity="0.6" />
    <circle cx="150" cy="58" r="5" fill="url(#ta-red)" />
    <circle cx="48" cy="66" r="4" fill="url(#ta-red)" />
    <path d="M40 162h16v-34h-6v-6h18v6h-6v34" fill="none" stroke={G.mid} strokeWidth="3" opacity="0.8" />
  </g>
);

const Moon = () => (
  <g>
    <circle cx="100" cy="88" r="52" fill="url(#ta-gold)" opacity="0.95" />
    <circle cx="80" cy="74" r="8" fill={G.dark} opacity="0.35" />
    <circle cx="118" cy="104" r="11" fill={G.dark} opacity="0.3" />
    <circle cx="112" cy="66" r="5" fill={G.dark} opacity="0.3" />
    {[[52, 70, 1], [150, 56, 0.8], [140, 124, 0.9]].map(([x, y, k], i) => (
      <path key={i} transform={`translate(${x} ${y}) scale(${k})`} d="M0 0c-6-8-14-8-20-2 6 0 8 4 8 8 4-4 8-4 12-2 4-2 8-2 12 2 0-4 2-8 8-8-6-6-14-6-20 2Z" fill="#0b0710" />
    ))}
    <path d="M40 166c20-26 40-30 60-30s40 4 60 30Z" fill="#0b0710" />
  </g>
);

const Crown = () => (
  <g>
    <path d="M40 140l-8-70 34 28 34-46 34 46 34-28-8 70Z" fill="url(#ta-gold)" stroke={G.deep} strokeWidth="3" strokeLinejoin="round" />
    <rect x="38" y="138" width="124" height="20" rx="6" fill="url(#ta-gold)" stroke={G.deep} strokeWidth="3" />
    <circle cx="100" cy="114" r="12" fill="url(#ta-red)" stroke={G.light} strokeWidth="2" />
    <circle cx="66" cy="120" r="7" fill="url(#ta-blue)" />
    <circle cx="134" cy="120" r="7" fill="url(#ta-green)" />
    <circle cx="32" cy="70" r="6" fill={G.light} />
    <circle cx="100" cy="52" r="7" fill={G.light} />
    <circle cx="168" cy="70" r="6" fill={G.light} />
  </g>
);

const Paw = () => (
  <g>
    <path d="M100 98c-24 0-44 22-44 40 0 16 16 20 28 16 10-3 22-3 32 0 12 4 28 0 28-16 0-18-20-40-44-40Z" fill="url(#ta-gold)" stroke={G.deep} strokeWidth="3" />
    {[[60, 78, -20], [86, 56, -6], [114, 56, 6], [140, 78, 20]].map(([x, y, r], i) => (
      <ellipse key={i} cx={x} cy={y} rx="13" ry="18" transform={`rotate(${r} ${x} ${y})`} fill="url(#ta-gold)" stroke={G.deep} strokeWidth="3" />
    ))}
    <ellipse cx="90" cy="112" rx="14" ry="6" fill="url(#ta-shine)" />
  </g>
);

const Shield = () => (
  <g>
    <circle cx="100" cy="96" r="60" fill="url(#ta-blue)" stroke={G.deep} strokeWidth="4" />
    <circle cx="100" cy="96" r="60" fill="none" stroke="url(#ta-gold)" strokeWidth="8" />
    {[0, 60, 120, 180, 240, 300].map((a) => (
      <path key={a} d={`M100 96L${(100 + 56 * Math.cos((a * Math.PI) / 180)).toFixed(1)} ${(96 + 56 * Math.sin((a * Math.PI) / 180)).toFixed(1)}`} stroke={G.mid} strokeWidth="3" opacity="0.6" />
    ))}
    <circle cx="100" cy="96" r="18" fill="url(#ta-gold)" stroke={G.deep} strokeWidth="3" />
    <path d="M100 86v20M92 90l8 6 8-6" stroke={G.deep} strokeWidth="3" fill="none" strokeLinecap="round" />
    {[0, 90, 180, 270].map((a) => (
      <circle key={a} cx={(100 + 60 * Math.cos((a * Math.PI) / 180)).toFixed(1)} cy={(96 + 60 * Math.sin((a * Math.PI) / 180)).toFixed(1)} r="5" fill={G.light} />
    ))}
  </g>
);

const Striker = () => (
  <g>
    <rect x="88" y="34" width="24" height="120" rx="8" fill="#1a1020" stroke="url(#ta-gold)" strokeWidth="4" />
    {[0, 1, 2, 3, 4, 5].map((i) => (
      <rect key={i} x="94" y={136 - i * 18} width="12" height="12" rx="3" fill={i < 4 ? 'url(#ta-red)' : '#3a2a30'} />
    ))}
    <circle cx="100" cy="30" r="14" fill="url(#ta-gold)" stroke={G.deep} strokeWidth="3" />
    <g transform="rotate(-35 150 140)">
      <rect x="146" y="96" width="9" height="62" rx="4" fill="#7a4a1c" />
      <rect x="128" y="86" width="46" height="22" rx="6" fill="url(#ta-gold)" stroke={G.deep} strokeWidth="3" />
    </g>
    <rect x="60" y="154" width="80" height="10" rx="4" fill="url(#ta-gold)" />
  </g>
);

const Gems = () => (
  <g>
    {[[100, 70, 34, 'url(#ta-blue)'], [62, 120, 26, 'url(#ta-red)'], [138, 120, 26, 'url(#ta-green)']].map(([x, y, s, f], i) => {
      const X = Number(x);
      const Y = Number(y);
      const S = Number(s);
      return (
        <g key={i}>
          <path d={`M${X - S} ${Y - S * 0.3}L${X - S * 0.55} ${Y - S * 0.8}H${X + S * 0.55}L${X + S} ${Y - S * 0.3}L${X} ${Y + S}Z`} fill={String(f)} stroke="#fff" strokeOpacity="0.7" strokeWidth="2" strokeLinejoin="round" />
          <path d={`M${X - S} ${Y - S * 0.3}H${X + S}M${X - S * 0.55} ${Y - S * 0.8}L${X - S * 0.25} ${Y - S * 0.3}L${X} ${Y + S}L${X + S * 0.25} ${Y - S * 0.3}L${X + S * 0.55} ${Y - S * 0.8}`} fill="none" stroke="#fff" strokeOpacity="0.55" strokeWidth="1.5" />
        </g>
      );
    })}
  </g>
);

const Riches = () => (
  <g>
    <path d="M48 110h104l-10 52H58Z" fill="#3a2410" stroke={G.deep} strokeWidth="3" />
    <rect x="42" y="100" width="116" height="14" rx="5" fill="url(#ta-gold)" stroke={G.deep} strokeWidth="2" />
    {[[70, 92], [92, 84], [114, 88], [134, 94], [82, 72], [106, 68], [124, 76], [96, 54]].map(([x, y], i) => (
      <g key={i}>
        <circle cx={x} cy={y} r="13" fill="url(#ta-gold)" stroke={G.deep} strokeWidth="2" />
        <circle cx={x} cy={y} r="7" fill="none" stroke={G.dark} strokeWidth="1.5" />
      </g>
    ))}
    <path d="M100 130l5 10 11 2-8 8 2 11-10-5-10 5 2-11-8-8 11-2Z" fill="url(#ta-gold)" />
  </g>
);

const RULES: [RegExp, () => ReactNode][] = [
  [/\b7\b|seven/i, () => <Seven />],
  [/bass|fish|sea|pelican|frenzy/i, () => <Fish />],
  [/olympus|zeus|thunder/i, () => <Bolt />],
  [/sugar|sweet|bonanza|candy/i, () => <Candy />],
  [/chilli|chili|heat|pepper/i, () => <Chilli />],
  [/book/i, () => <Book />],
  [/aztec|maya|inca/i, () => <Pyramid />],
  [/pompeii|volcano/i, () => <Volcano />],
  [/night|vampire|killer/i, () => <Moon />],
  [/royale|king|queen|crown/i, () => <Crown />],
  [/cheetah|tiger|lion|paw/i, () => <Paw />],
  [/freya|viking|odin|thor/i, () => <Shield />],
  [/striker/i, () => <Striker />],
  [/split|megaways|gem|diamond/i, () => <Gems />],
  [/riches|gold|fortune|treasure/i, () => <Riches />],
];

export function themeEmblem(name: string): ReactNode | null {
  const rule = RULES.find(([re]) => re.test(name));
  if (!rule) return null;
  return (
    <g>
      <Defs />
      {rule[1]()}
    </g>
  );
}
