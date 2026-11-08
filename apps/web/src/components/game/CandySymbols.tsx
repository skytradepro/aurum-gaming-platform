/**
 * Original HANNIBAL Candy Burst symbols (hand-made vector art, no third-party assets).
 * Index order = paytable order, lowest paying first (see CANDY_PAYS_TENTHS).
 */
import type { ReactNode } from 'react';

export const CANDY_NAMES = ['gumdrop', 'lemon', 'mint', 'heart', 'swirl', 'bonbon', 'cupcake', 'lollipop', 'crown'] as const;

/** Shared gradients, rendered once per page. */
export function CandyDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="cbg-red" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#ff9aa8" />
          <stop offset="0.45" stopColor="#f0283f" />
          <stop offset="1" stopColor="#8d0a1f" />
        </radialGradient>
        <radialGradient id="cbg-yellow" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#fffbd1" />
          <stop offset="0.45" stopColor="#ffd83a" />
          <stop offset="1" stopColor="#c27c06" />
        </radialGradient>
        <radialGradient id="cbg-green" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#d6ffe9" />
          <stop offset="0.5" stopColor="#2fd38a" />
          <stop offset="1" stopColor="#0b6b45" />
        </radialGradient>
        <radialGradient id="cbg-blue" cx="0.35" cy="0.3" r="0.85">
          <stop offset="0" stopColor="#d7f1ff" />
          <stop offset="0.45" stopColor="#3aa6ff" />
          <stop offset="1" stopColor="#1438a6" />
        </radialGradient>
        <radialGradient id="cbg-purple" cx="0.35" cy="0.3" r="0.85">
          <stop offset="0" stopColor="#f3dcff" />
          <stop offset="0.5" stopColor="#a855f7" />
          <stop offset="1" stopColor="#4c1d95" />
        </radialGradient>
        <radialGradient id="cbg-choc" cx="0.35" cy="0.25" r="0.85">
          <stop offset="0" stopColor="#c78a5a" />
          <stop offset="0.5" stopColor="#6b3416" />
          <stop offset="1" stopColor="#2b1206" />
        </radialGradient>
        <linearGradient id="cbg-pink" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe1f3" />
          <stop offset="0.5" stopColor="#ff7cc8" />
          <stop offset="1" stopColor="#c0267f" />
        </linearGradient>
        <linearGradient id="cbg-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff6c9" />
          <stop offset="0.45" stopColor="#ffd34d" />
          <stop offset="0.55" stopColor="#f0a91c" />
          <stop offset="1" stopColor="#8a5108" />
        </linearGradient>
        <linearGradient id="cbg-stick" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" />
          <stop offset="1" stopColor="#d9c6b0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

const shine = (d: string) => <path d={d} stroke="#fff" strokeWidth="5" strokeLinecap="round" fill="none" opacity="0.75" />;

const ART: readonly (() => ReactNode)[] = [
  // 0 gumdrop
  () => (
    <>
      <path d="M16 80 C16 42 31 20 50 20 C69 20 84 42 84 80 Q50 92 16 80 Z" fill="url(#cbg-red)" stroke="#6d0716" strokeWidth="3" />
      {shine('M30 46 C33 34 40 28 48 26')}
      <g fill="#fff" opacity="0.85">
        <circle cx="58" cy="40" r="2.4" /><circle cx="68" cy="56" r="2" /><circle cx="44" cy="62" r="2.2" /><circle cx="60" cy="72" r="1.8" /><circle cx="30" cy="70" r="2" /><circle cx="72" cy="40" r="1.6" />
      </g>
    </>
  ),
  // 1 lemon drop
  () => (
    <>
      <path d="M8 50 L18 44 L18 56 Z" fill="#ffe680" stroke="#a16207" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M92 50 L82 44 L82 56 Z" fill="#ffe680" stroke="#a16207" strokeWidth="2.5" strokeLinejoin="round" />
      <ellipse cx="50" cy="50" rx="34" ry="27" fill="url(#cbg-yellow)" stroke="#a16207" strokeWidth="3" />
      <path d="M26 50 Q50 34 74 50 Q50 66 26 50" stroke="#fff3a6" strokeWidth="2" fill="none" opacity="0.8" />
      {shine('M30 40 C36 32 44 29 52 28')}
    </>
  ),
  // 2 mint wrap
  () => (
    <>
      <path d="M30 50 L8 30 Q4 50 8 70 Z" fill="#bff7da" stroke="#0b6b45" strokeWidth="3" strokeLinejoin="round" />
      <path d="M70 50 L92 30 Q96 50 92 70 Z" fill="#bff7da" stroke="#0b6b45" strokeWidth="3" strokeLinejoin="round" />
      <circle cx="50" cy="50" r="25" fill="url(#cbg-green)" stroke="#0b6b45" strokeWidth="3" />
      <path d="M50 25 C62 36 62 64 50 75 M36 30 C46 40 46 60 36 70 M64 30 C54 40 54 60 64 70" stroke="#fff" strokeWidth="3" fill="none" opacity="0.7" />
      {shine('M36 38 C40 32 45 29 50 28')}
    </>
  ),
  // 3 jelly heart
  () => (
    <>
      <path d="M50 86 C14 62 10 40 18 28 C27 15 44 18 50 32 C56 18 73 15 82 28 C90 40 86 62 50 86 Z" fill="url(#cbg-blue)" stroke="#132a7a" strokeWidth="3" strokeLinejoin="round" />
      {shine('M24 36 C26 28 32 24 39 25')}
      <circle cx="66" cy="34" r="4" fill="#fff" opacity="0.6" />
    </>
  ),
  // 4 purple swirl
  () => (
    <>
      <circle cx="50" cy="50" r="36" fill="url(#cbg-purple)" stroke="#3b0f73" strokeWidth="3" />
      <path d="M50 50 m0 -4 a4 4 0 1 1 -4 4 a10 10 0 1 1 10 10 a16 16 0 1 1 -16 -16 a22 22 0 1 1 22 22" stroke="#fff" strokeWidth="4.5" fill="none" strokeLinecap="round" opacity="0.85" />
      {shine('M26 36 C30 28 36 23 44 21')}
    </>
  ),
  // 5 chocolate bonbon
  () => (
    <>
      <path d="M14 66 C14 40 30 26 50 26 C70 26 86 40 86 66 C86 76 70 82 50 82 C30 82 14 76 14 66 Z" fill="url(#cbg-choc)" stroke="#1f0c03" strokeWidth="3" />
      <path d="M20 52 L30 44 L40 52 L50 44 L60 52 L70 44 L80 52" stroke="#e7c39b" strokeWidth="4" fill="none" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx="50" cy="22" r="9" fill="url(#cbg-red)" stroke="#6d0716" strokeWidth="2.5" />
      <path d="M50 13 C52 6 58 4 62 4" stroke="#14532d" strokeWidth="3" fill="none" strokeLinecap="round" />
      {shine('M26 62 C26 54 30 48 36 44')}
    </>
  ),
  // 6 cupcake
  () => (
    <>
      <path d="M22 56 L30 88 L70 88 L78 56 Z" fill="url(#cbg-pink)" stroke="#8a1659" strokeWidth="3" strokeLinejoin="round" />
      <path d="M34 58 L38 86 M46 58 L48 86 M58 58 L56 86 M70 58 L64 86" stroke="#fff" strokeWidth="2.5" opacity="0.6" />
      <path d="M16 58 C12 46 24 40 30 42 C30 30 44 26 50 32 C56 24 72 28 70 42 C80 40 90 50 82 58 Z" fill="#fff7fb" stroke="#c0267f" strokeWidth="3" strokeLinejoin="round" />
      <g fill="#ff4fa3"><rect x="34" y="44" width="6" height="2.6" rx="1.3" transform="rotate(-30 37 45)" /><rect x="56" y="40" width="6" height="2.6" rx="1.3" transform="rotate(25 59 41)" /></g>
      <g fill="#3aa6ff"><rect x="46" y="48" width="6" height="2.6" rx="1.3" transform="rotate(15 49 49)" /><rect x="66" y="50" width="6" height="2.6" rx="1.3" transform="rotate(-20 69 51)" /></g>
      <circle cx="52" cy="24" r="8" fill="url(#cbg-red)" stroke="#6d0716" strokeWidth="2.5" />
    </>
  ),
  // 7 rainbow lollipop
  () => (
    <>
      <rect x="47" y="58" width="6" height="38" rx="3" fill="url(#cbg-stick)" stroke="#9c8466" strokeWidth="1.5" />
      <circle cx="50" cy="40" r="34" fill="#ff4f7b" stroke="#7a1033" strokeWidth="3" />
      <circle cx="50" cy="40" r="27" fill="#ffb02e" />
      <circle cx="50" cy="40" r="20" fill="#ffe14d" />
      <circle cx="50" cy="40" r="13" fill="#3fdc8c" />
      <circle cx="50" cy="40" r="7" fill="#3aa6ff" />
      <path d="M50 40 m0 -3 a3 3 0 1 1 -3 3 a9 9 0 1 1 9 9 a15 15 0 1 1 -15 -15 a21 21 0 1 1 21 21" stroke="#fff" strokeWidth="2.5" fill="none" opacity="0.7" />
      {shine('M24 30 C28 20 36 14 44 12')}
    </>
  ),
  // 8 golden crown candy
  () => (
    <>
      <path d="M12 76 L16 32 L34 52 L50 22 L66 52 L84 32 L88 76 Z" fill="url(#cbg-gold)" stroke="#6b3d04" strokeWidth="3" strokeLinejoin="round" />
      <rect x="12" y="74" width="76" height="12" rx="4" fill="url(#cbg-gold)" stroke="#6b3d04" strokeWidth="3" />
      <circle cx="50" cy="60" r="8" fill="url(#cbg-red)" stroke="#fff3c4" strokeWidth="2" />
      <circle cx="30" cy="64" r="5" fill="url(#cbg-blue)" stroke="#fff3c4" strokeWidth="1.5" />
      <circle cx="70" cy="64" r="5" fill="url(#cbg-green)" stroke="#fff3c4" strokeWidth="1.5" />
      <circle cx="16" cy="30" r="4" fill="#fff3c4" /><circle cx="50" cy="20" r="4.5" fill="#fff3c4" /><circle cx="84" cy="30" r="4" fill="#fff3c4" />
      {shine('M22 44 L24 66')}
    </>
  ),
];

export function CandySymbol({ id, title }: { id: number; title?: string }) {
  const draw = ART[id] ?? ART[0];
  return (
    <svg viewBox="0 0 100 100" className={`cb-sym cb-sym-${CANDY_NAMES[id] ?? 'gumdrop'}`} role="img" aria-label={title ?? CANDY_NAMES[id]}>
      {draw ? draw() : null}
    </svg>
  );
}
