'use client';

import { useId } from 'react';

/**
 * Joker, the Hannibal player-support character: jester hat with golden bells, smiling mask and ruff collar.
 * Pure SVG (a few KB, sharp at every size); the bells swing and one eye winks with CSS (off for reduced motion).
 */
export function JokerArt({ className = '', title }: { className?: string; title?: string }) {
  // unique ids per drawing: several jokers can be on one page (one of them may be hidden)
  const u = `jk${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <svg className={`joker-art ${className}`} viewBox="0 0 200 220" role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <defs>
        <linearGradient id={`${u}-gold`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff4c2" />
          <stop offset="0.45" stopColor="#ffd34d" />
          <stop offset="0.6" stopColor="#f0a91c" />
          <stop offset="1" stopColor="#7a4705" />
        </linearGradient>
        <linearGradient id={`${u}-red`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff5a6e" />
          <stop offset="1" stopColor="#8f0f2a" />
        </linearGradient>
        <linearGradient id={`${u}-purple`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#c084fc" />
          <stop offset="1" stopColor="#4c1d95" />
        </linearGradient>
        <linearGradient id={`${u}-teal`} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5eead4" />
          <stop offset="1" stopColor="#0f5f59" />
        </linearGradient>
        <radialGradient id={`${u}-face`} cx="0.45" cy="0.38" r="0.7">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.7" stopColor="#f6efe4" />
          <stop offset="1" stopColor="#d9c9b3" />
        </radialGradient>
        <pattern id={`${u}-diamonds`} width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="7" height="7" fill="rgba(255,255,255,0.13)" />
          <rect x="7" y="7" width="7" height="7" fill="rgba(255,255,255,0.13)" />
        </pattern>
      </defs>

      {/* ruff collar */}
      <g className="jk-ruff" transform="translate(0 -10)">
        <path d="M32 196 L48 176 L62 198 L78 178 L92 200 L108 178 L122 200 L138 178 L152 198 L168 176 L170 214 L30 214 Z" fill={`url(#${u}-purple)`} stroke="#2e1065" strokeWidth="2" />
        <path d="M40 206 L56 188 L70 208 L86 190 L100 210 L114 190 L130 208 L144 188 L160 206" fill="none" stroke={`url(#${u}-gold)`} strokeWidth="3" strokeLinejoin="round" />
      </g>

      {/* hat: three points with diamonds, golden bells */}
      <g className="jk-hat">
        <path d="M56 98 C30 86 14 62 18 30 C34 44 52 60 76 76 Z" fill={`url(#${u}-purple)`} stroke="#2e1065" strokeWidth="2.5" />
        <path d="M56 98 C30 86 14 62 18 30 C34 44 52 60 76 76 Z" fill={`url(#${u}-diamonds)`} />
        <path d="M144 98 C170 86 186 62 182 30 C166 44 148 60 124 76 Z" fill={`url(#${u}-teal)`} stroke="#063b37" strokeWidth="2.5" />
        <path d="M144 98 C170 86 186 62 182 30 C166 44 148 60 124 76 Z" fill={`url(#${u}-diamonds)`} />
        <path d="M64 84 C70 50 86 22 100 8 C114 22 130 50 136 84 Z" fill={`url(#${u}-red)`} stroke="#5c0a1c" strokeWidth="2.5" />
        <path d="M64 84 C70 50 86 22 100 8 C114 22 130 50 136 84 Z" fill={`url(#${u}-diamonds)`} />
        <g className="jk-bell jk-bell-l">
          <circle cx="18" cy="30" r="9" fill={`url(#${u}-gold)`} stroke="#6b3d04" strokeWidth="1.6" />
          <path d="M13 31 h10" stroke="#6b3d04" strokeWidth="1.6" />
        </g>
        <g className="jk-bell jk-bell-c">
          <circle cx="100" cy="9" r="9" fill={`url(#${u}-gold)`} stroke="#6b3d04" strokeWidth="1.6" />
          <path d="M95 10 h10" stroke="#6b3d04" strokeWidth="1.6" />
        </g>
        <g className="jk-bell jk-bell-r">
          <circle cx="182" cy="30" r="9" fill={`url(#${u}-gold)`} stroke="#6b3d04" strokeWidth="1.6" />
          <path d="M177 31 h10" stroke="#6b3d04" strokeWidth="1.6" />
        </g>
        {/* golden band with a gem */}
        <path d="M46 96 Q100 70 154 96 L150 110 Q100 86 50 110 Z" fill={`url(#${u}-gold)`} stroke="#6b3d04" strokeWidth="2" />
        <path d="M100 80 L108 90 L100 100 L92 90 Z" fill={`url(#${u}-red)`} stroke="#fff4c2" strokeWidth="1.5" />
      </g>

      {/* face */}
      <g className="jk-face">
        <path d="M54 106 Q100 88 146 106 Q150 150 128 172 Q100 192 72 172 Q50 150 54 106 Z" fill={`url(#${u}-face)`} stroke="#b8925a" strokeWidth="2" />
        {/* eye masks */}
        <path d="M66 126 Q80 112 94 126 Q80 136 66 126 Z" fill={`url(#${u}-purple)`} opacity="0.9" />
        <path d="M106 126 Q120 112 134 126 Q120 136 106 126 Z" fill={`url(#${u}-teal)`} opacity="0.9" />
        <ellipse cx="80" cy="125" rx="5.5" ry="5" fill="#1a0b2e" />
        <circle cx="82" cy="123" r="1.8" fill="#fff" />
        <g className="jk-wink">
          <ellipse cx="120" cy="125" rx="5.5" ry="5" fill="#1a0b2e" />
          <circle cx="122" cy="123" r="1.8" fill="#fff" />
        </g>
        {/* cheeks, star, nose, smile */}
        <circle cx="70" cy="148" r="7" fill="#fb7185" opacity="0.35" />
        <circle cx="130" cy="148" r="7" fill="#fb7185" opacity="0.35" />
        <path d="M128 136 l2.4 4.8 5.2 0.8 -3.8 3.6 0.9 5.2 -4.7 -2.5 -4.7 2.5 0.9 -5.2 -3.8 -3.6 5.2 -0.8 Z" fill={`url(#${u}-gold)`} />
        <circle cx="100" cy="142" r="5.5" fill={`url(#${u}-red)`} />
        <path d="M78 156 Q100 178 122 156 Q100 168 78 156 Z" fill="#7f1d1d" stroke="#5c0a1c" strokeWidth="1.5" />
        <path d="M86 160 Q100 166 114 160" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" />
      </g>
    </svg>
  );
}
