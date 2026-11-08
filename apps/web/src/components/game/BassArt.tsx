'use client';

import { useId } from 'react';

/**
 * Hannibal Big Bass symbols drawn in SVG (light, sharp on every phone): cash fish, fishing rod, float, tackle box
 * and dragonfly. Original HANNIBAL drawings in a bright cartoon style.
 */
export type BassArtKind = 'fish' | 'rod' | 'float' | 'tackle' | 'dragonfly';

export function BassArt({ kind, className = '' }: { kind: BassArtKind; className?: string }) {
  const u = `ba${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const cls = `bb-art is-${kind} ${className}`;
  if (kind === 'fish') {
    return (
      <svg className={cls} viewBox="0 0 120 80" aria-hidden="true">
        <defs>
          <linearGradient id={`${u}b`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1f8a3a" />
            <stop offset="0.45" stopColor="#7ad04a" />
            <stop offset="0.75" stopColor="#e9f27a" />
            <stop offset="1" stopColor="#f7f3c8" />
          </linearGradient>
          <linearGradient id={`${u}f`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#3fae4a" />
            <stop offset="1" stopColor="#0f5c2a" />
          </linearGradient>
        </defs>
        {/* tail */}
        <path d="M86 40 L114 18 Q108 40 114 62 Z" fill={`url(#${u}f)`} stroke="#0b3d1d" strokeWidth="2.5" strokeLinejoin="round" />
        {/* top fin */}
        <path d="M38 20 Q52 4 72 14 L66 24 Z" fill={`url(#${u}f)`} stroke="#0b3d1d" strokeWidth="2.5" strokeLinejoin="round" />
        {/* body */}
        <path d="M8 42 Q14 18 50 16 Q84 16 92 40 Q84 64 50 66 Q16 66 8 42 Z" fill={`url(#${u}b)`} stroke="#0b3d1d" strokeWidth="3" />
        {/* stripes */}
        <path d="M40 24 Q36 40 42 58 M56 22 Q52 40 58 60 M70 26 Q66 40 72 56" stroke="#2c7a2f" strokeWidth="3" fill="none" opacity="0.55" strokeLinecap="round" />
        {/* gill, eye, mouth */}
        <path d="M28 26 Q22 42 30 58" stroke="#0b3d1d" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        <circle cx="19" cy="35" r="6.5" fill="#fff" stroke="#0b3d1d" strokeWidth="2" />
        <circle cx="18" cy="35" r="3.2" fill="#111" />
        <circle cx="16.8" cy="33.6" r="1.2" fill="#fff" />
        <path d="M8 44 Q14 48 20 46" stroke="#0b3d1d" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        {/* belly fin */}
        <path d="M46 62 Q50 74 62 72 L58 62 Z" fill={`url(#${u}f)`} stroke="#0b3d1d" strokeWidth="2" strokeLinejoin="round" />
        {/* shine */}
        <path d="M30 24 Q46 18 64 22" stroke="#fff" strokeWidth="3" fill="none" opacity="0.55" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === 'rod') {
    return (
      <svg className={cls} viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <linearGradient id={`${u}r`} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="#5b3412" />
            <stop offset="0.5" stopColor="#c8892f" />
            <stop offset="1" stopColor="#f3d27a" />
          </linearGradient>
          <radialGradient id={`${u}m`} cx="0.35" cy="0.3" r="0.8">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.5" stopColor="#c7ced8" />
            <stop offset="1" stopColor="#5d6878" />
          </radialGradient>
          <radialGradient id={`${u}o`} cx="0.35" cy="0.3" r="0.8">
            <stop offset="0" stopColor="#ffe08a" />
            <stop offset="1" stopColor="#e07a0b" />
          </radialGradient>
        </defs>
        {/* line */}
        <path d="M88 10 Q92 40 80 70" stroke="#e5f6ff" strokeWidth="1.5" fill="none" opacity="0.9" />
        {/* rod */}
        <path d="M14 90 Q50 52 88 10" stroke="#2a1606" strokeWidth="9" fill="none" strokeLinecap="round" />
        <path d="M14 90 Q50 52 88 10" stroke={`url(#${u}r)`} strokeWidth="6" fill="none" strokeLinecap="round" />
        {/* handle */}
        <path d="M8 96 L24 80" stroke="#2a1606" strokeWidth="11" strokeLinecap="round" />
        <path d="M8 96 L24 80" stroke="#7c2d12" strokeWidth="8" strokeLinecap="round" />
        {/* rings */}
        <circle cx="52" cy="50" r="3" fill="none" stroke="#e2e8f0" strokeWidth="2" />
        <circle cx="72" cy="29" r="2.5" fill="none" stroke="#e2e8f0" strokeWidth="2" />
        {/* reel */}
        <circle cx="34" cy="72" r="15" fill={`url(#${u}o)`} stroke="#2a1606" strokeWidth="3" />
        <circle cx="34" cy="72" r="8" fill={`url(#${u}m)`} stroke="#2a1606" strokeWidth="2" />
        <path d="M34 72 L46 84" stroke="#2a1606" strokeWidth="3" strokeLinecap="round" />
        <circle cx="47" cy="85" r="4" fill="#111827" />
      </svg>
    );
  }
  if (kind === 'float') {
    return (
      <svg className={cls} viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <radialGradient id={`${u}t`} cx="0.35" cy="0.3" r="0.9">
            <stop offset="0" stopColor="#ffb4b4" />
            <stop offset="0.45" stopColor="#ef2b2b" />
            <stop offset="1" stopColor="#7f0b0b" />
          </radialGradient>
          <radialGradient id={`${u}g`} cx="0.35" cy="0.2" r="0.9">
            <stop offset="0" stopColor="#c9ffb0" />
            <stop offset="0.45" stopColor="#3fbf3a" />
            <stop offset="1" stopColor="#11621a" />
          </radialGradient>
        </defs>
        {/* water ripples */}
        <ellipse cx="50" cy="84" rx="38" ry="7" fill="none" stroke="#e0fbff" strokeWidth="2.5" opacity="0.7" />
        <ellipse cx="50" cy="84" rx="24" ry="4" fill="none" stroke="#e0fbff" strokeWidth="2" opacity="0.8" />
        {/* antenna */}
        <path d="M50 6 L50 34" stroke="#1f2937" strokeWidth="4" strokeLinecap="round" />
        <circle cx="50" cy="6" r="4" fill="#ffe14d" stroke="#1f2937" strokeWidth="2" />
        {/* body */}
        <path d="M24 52 A26 22 0 0 1 76 52 Z" fill={`url(#${u}t)`} stroke="#1f2937" strokeWidth="3" />
        <path d="M24 52 A26 26 0 0 0 76 52 Z" fill={`url(#${u}g)`} stroke="#1f2937" strokeWidth="3" />
        <rect x="23" y="48" width="54" height="8" rx="4" fill="#fff" stroke="#1f2937" strokeWidth="2.5" />
        <path d="M38 36 Q44 32 52 33" stroke="#fff" strokeWidth="3.5" fill="none" strokeLinecap="round" opacity="0.8" />
        {/* stem */}
        <path d="M50 78 L50 90" stroke="#1f2937" strokeWidth="4" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === 'tackle') {
    return (
      <svg className={cls} viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <linearGradient id={`${u}x`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ff6b5b" />
            <stop offset="0.55" stopColor="#d61f1f" />
            <stop offset="1" stopColor="#7a0c0c" />
          </linearGradient>
          <linearGradient id={`${u}l`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ff8a7a" />
            <stop offset="1" stopColor="#b91c1c" />
          </linearGradient>
        </defs>
        {/* open lid */}
        <path d="M18 40 L28 14 L82 14 L86 40 Z" fill={`url(#${u}l)`} stroke="#3b0707" strokeWidth="3" strokeLinejoin="round" />
        <path d="M30 20 L78 20" stroke="#fff" strokeWidth="2.5" opacity="0.5" strokeLinecap="round" />
        {/* lures in the tray */}
        <rect x="16" y="38" width="70" height="14" rx="3" fill="#e5e7eb" stroke="#3b0707" strokeWidth="2.5" />
        <circle cx="28" cy="45" r="4.5" fill="#22c55e" stroke="#14532d" strokeWidth="1.5" />
        <circle cx="42" cy="45" r="4.5" fill="#facc15" stroke="#713f12" strokeWidth="1.5" />
        <circle cx="56" cy="45" r="4.5" fill="#3b82f6" stroke="#1e3a8a" strokeWidth="1.5" />
        <circle cx="70" cy="45" r="4.5" fill="#f97316" stroke="#7c2d12" strokeWidth="1.5" />
        {/* box */}
        <path d="M12 52 L90 52 L86 88 Q85 92 80 92 L22 92 Q17 92 16 88 Z" fill={`url(#${u}x)`} stroke="#3b0707" strokeWidth="3" strokeLinejoin="round" />
        <rect x="40" y="62" width="22" height="10" rx="3" fill="#e5e7eb" stroke="#3b0707" strokeWidth="2" />
        <path d="M22 60 L22 84 M80 60 L80 84" stroke="#ffb4a8" strokeWidth="2.5" opacity="0.6" strokeLinecap="round" />
      </svg>
    );
  }
  // dragonfly
  return (
    <svg className={cls} viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient id={`${u}w`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e0f7ff" stopOpacity="0.95" />
          <stop offset="1" stopColor="#7cc8ff" stopOpacity="0.6" />
        </linearGradient>
        <linearGradient id={`${u}d`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5eead4" />
          <stop offset="1" stopColor="#0e7490" />
        </linearGradient>
      </defs>
      {/* wings */}
      <ellipse cx="34" cy="34" rx="28" ry="9" transform="rotate(-25 34 34)" fill={`url(#${u}w)`} stroke="#3b82f6" strokeWidth="1.5" />
      <ellipse cx="66" cy="34" rx="28" ry="9" transform="rotate(25 66 34)" fill={`url(#${u}w)`} stroke="#3b82f6" strokeWidth="1.5" />
      <ellipse cx="36" cy="50" rx="24" ry="8" transform="rotate(12 36 50)" fill={`url(#${u}w)`} stroke="#3b82f6" strokeWidth="1.5" />
      <ellipse cx="64" cy="50" rx="24" ry="8" transform="rotate(-12 64 50)" fill={`url(#${u}w)`} stroke="#3b82f6" strokeWidth="1.5" />
      {/* body */}
      <path d="M50 30 L50 94" stroke="#0b3b4a" strokeWidth="9" strokeLinecap="round" />
      <path d="M50 30 L50 94" stroke={`url(#${u}d)`} strokeWidth="6" strokeLinecap="round" />
      <path d="M46 52 L54 52 M46 62 L54 62 M46 72 L54 72 M46 82 L54 82" stroke="#0b3b4a" strokeWidth="1.5" />
      {/* head */}
      <circle cx="50" cy="24" r="9" fill={`url(#${u}d)`} stroke="#0b3b4a" strokeWidth="2.5" />
      <circle cx="45.5" cy="22" r="3.5" fill="#111" />
      <circle cx="54.5" cy="22" r="3.5" fill="#111" />
      <circle cx="44.5" cy="21" r="1.1" fill="#fff" />
      <circle cx="53.5" cy="21" r="1.1" fill="#fff" />
    </svg>
  );
}
