'use client';

import { rouletteColor, roulettePocketLabel } from '@aurum/shared';
import { useEffect, useRef, useState } from 'react';

/** American wheel order, clockwise from 0. Pocket 37 is "00". */
export const WHEEL_ORDER = [0, 28, 9, 26, 30, 11, 7, 20, 32, 17, 5, 22, 34, 15, 3, 24, 36, 13, 1, 37, 27, 10, 25, 29, 12, 8, 19, 31, 18, 6, 21, 33, 16, 4, 23, 35, 14, 2] as const;
/** European (single zero) wheel order, clockwise from 0. */
export const EURO_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26] as const;
const FILL = { green: '#138a4a', red: '#b3201c', black: '#141418' } as const;

const pt = (r: number, deg: number): string => {
  const a = ((deg - 90) * Math.PI) / 180;
  return `${(200 + r * Math.cos(a)).toFixed(2)} ${(200 + r * Math.sin(a)).toFixed(2)}`;
};

/** Angle (degrees, clockwise from the top) of the centre of a pocket on the wheel face. */
export const pocketAngle = (pocket: number, order: readonly number[] = WHEEL_ORDER): number => order.indexOf(pocket) * (360 / order.length) + 360 / order.length / 2;

function WheelFace({ order = WHEEL_ORDER, jewels }: { order?: readonly number[]; jewels?: ReadonlyMap<number, number> }) {
  const slice = 360 / order.length;
  return (
    <svg viewBox="0 0 400 400" className="r3d-face" aria-hidden="true">
      <defs>
        <radialGradient id="r3d-wood" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0.82" stopColor="#5a2e0e" />
          <stop offset="0.9" stopColor="#8a4b1c" />
          <stop offset="1" stopColor="#3a1c06" />
        </radialGradient>
        <radialGradient id="r3d-cone" cx="0.45" cy="0.4" r="0.6">
          <stop offset="0" stopColor="#ffe9a6" />
          <stop offset="0.5" stopColor="#d4a53a" />
          <stop offset="1" stopColor="#7a5410" />
        </radialGradient>
      </defs>
      <circle cx="200" cy="200" r="198" fill="url(#r3d-wood)" />
      <circle cx="200" cy="200" r="172" fill="#2a1606" stroke="#d4a53a" strokeWidth="2" />
      {order.map((p, i) => {
        const a0 = i * slice;
        const a1 = a0 + slice;
        const gem = jewels?.get(p);
        return (
          <g key={p}>
            <path d={`M${pt(168, a0)} A168 168 0 0 1 ${pt(168, a1)} L${pt(118, a1)} A118 118 0 0 0 ${pt(118, a0)} Z`} fill={gem ? '#0891b2' : FILL[rouletteColor(p)]} stroke={gem ? '#a5f3fc' : '#d4a53a'} strokeWidth={gem ? 2.5 : 0.8} />
            <text
              x="200"
              y="48"
              textAnchor="middle"
              fontSize="13"
              fontWeight="800"
              fill="#fff"
              fontFamily="Georgia, serif"
              transform={`rotate(${(a0 + slice / 2).toFixed(2)} 200 200)`}
            >
              {roulettePocketLabel(p)}
            </text>
          </g>
        );
      })}
      <circle cx="200" cy="200" r="118" fill="#3a1c06" stroke="#d4a53a" strokeWidth="2" />
      <circle cx="200" cy="200" r="96" fill="url(#r3d-cone)" />
      {[0, 45, 90, 135].map((a) => (
        <rect key={a} x="194" y="120" width="12" height="160" rx="6" fill="#f3d27a" stroke="#7a5410" strokeWidth="1.5" transform={`rotate(${a} 200 200)`} />
      ))}
      <circle cx="200" cy="200" r="22" fill="#f3d27a" stroke="#7a5410" strokeWidth="2" />
      <circle cx="200" cy="200" r="8" fill="#7a5410" />
    </svg>
  );
}

/**
 * A tilted 3D roulette wheel (CSS 3D). `wheelDeg` and `ballDeg` are absolute rotations the parent animates to;
 * `ballIn` drops the ball from the outer track into the pocket ring.
 */
export function Roulette3D({
  wheelDeg,
  ballDeg,
  ballIn,
  spinning,
  landed,
  order,
  jewels,
  facePhoto,
}: {
  wheelDeg: number;
  ballDeg: number;
  ballIn: boolean;
  spinning: boolean;
  landed: number | null;
  order?: readonly number[];
  jewels?: ReadonlyMap<number, number>;
  /** Optional photo wheel (rotates with the SVG; same math). */
  facePhoto?: string;
}) {
  const [photoOk, setPhotoOk] = useState(Boolean(facePhoto));
  return (
    <div className="r3d-stage">
      <div className="r3d-tilt">
        <div className="r3d-rim" />
        <div className="r3d-wheel" style={{ transform: `rotate(${wheelDeg}deg)`, transitionDuration: spinning ? '5.2s' : '0s' }}>
          {photoOk && facePhoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="r3d-wheel-photo" src={facePhoto} alt="" draggable={false} onError={() => setPhotoOk(false)} />
          ) : null}
          {!photoOk || !facePhoto ? <WheelFace order={order} jewels={jewels} /> : null}
        </div>
        <div className="r3d-ball-layer" style={{ transform: `rotate(${ballDeg}deg)`, transitionDuration: spinning ? '5.2s' : '0s' }}>
          <div className={`r3d-ball${ballIn ? ' in' : ''}`} />
        </div>
      </div>
      {landed !== null && !spinning ? (
        <div className="r3d-result" style={{ background: FILL[rouletteColor(landed)] }}>
          {roulettePocketLabel(landed)}
        </div>
      ) : null}
    </div>
  );
}

/** Small synthesized sounds (no audio files): ball ticks slowing down, and a chime on a win. */
export function useRouletteSound(enabled: boolean) {
  const ctx = useRef<AudioContext | null>(null);
  useEffect(() => () => void ctx.current?.close(), []);
  const ac = (): AudioContext | null => {
    if (!enabled || typeof window === 'undefined') return null;
    try {
      ctx.current ??= new AudioContext();
      return ctx.current;
    } catch {
      return null;
    }
  };
  const blip = (a: AudioContext, at: number, freq: number, dur: number, gain: number, type: OscillatorType = 'triangle') => {
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(a.destination);
    o.start(at);
    o.stop(at + dur + 0.02);
  };
  return {
    spin(seconds: number) {
      const a = ac();
      if (!a) return;
      let t = a.currentTime;
      let gap = 0.05;
      while (t < a.currentTime + seconds) {
        blip(a, t, 1800 + Math.random() * 400, 0.03, 0.05, 'square');
        t += gap;
        gap *= 1.045;
      }
    },
    win() {
      const a = ac();
      if (!a) return;
      [880, 1108, 1318, 1760].forEach((f, i) => blip(a, a.currentTime + i * 0.12, f, 0.4, 0.12));
    },
    lose() {
      const a = ac();
      if (!a) return;
      blip(a, a.currentTime, 220, 0.35, 0.08, 'sawtooth');
    },
  };
}
