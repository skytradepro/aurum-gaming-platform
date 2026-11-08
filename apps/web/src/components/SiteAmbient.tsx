'use client';

import { useEffect, useRef } from 'react';

/**
 * Page-wide ambience behind the content: the Hannibal flame artwork across the screen and slow rising embers.
 * Fixed, non-interactive, paused when the tab is hidden, off for visitors who ask for reduced motion.
 */
export function SiteAmbient() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = el.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, window.innerWidth < 768 ? 1 : 1.5);
    let w = 0;
    let h = 0;
    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const count = w < 700 ? 26 : 70;
    type P = { x: number; y: number; r: number; vy: number; vx: number; life: number; max: number; hue: number };
    const spawn = (anywhere: boolean): P => ({
      x: Math.random() * w,
      y: anywhere ? Math.random() * h : h + 10,
      r: 0.9 + Math.random() * 2.2,
      vy: 0.25 + Math.random() * 0.75,
      vx: (Math.random() - 0.5) * 0.25,
      life: 0,
      max: 260 + Math.random() * 420,
      hue: 28 + Math.random() * 22,
    });
    const parts: P[] = Array.from({ length: count }, () => spawn(true));

    let raf = 0;
    let t = 0;
    const frame = () => {
      t += 1;
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i] as P;
        p.life += 1;
        p.y -= p.vy;
        p.x += p.vx + Math.sin((t + i * 37) / 60) * 0.18;
        if (p.y < -10 || p.life > p.max) parts[i] = spawn(false);
        const fade = Math.min(1, p.life / 40) * Math.max(0, 1 - p.life / p.max);
        const flicker = 0.6 + 0.4 * Math.sin((t + i * 13) / 6);
        const a = 0.95 * fade * flicker;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 5);
        g.addColorStop(0, `hsla(${p.hue}, 100%, 70%, ${a})`);
        g.addColorStop(0.35, `hsla(${p.hue - 8}, 100%, 55%, ${a * 0.45})`);
        g.addColorStop(1, `hsla(${p.hue - 12}, 100%, 45%, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      raf = requestAnimationFrame(frame);
    };
    const start = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(frame);
    };
    document.addEventListener('visibilitychange', start);
    start();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', start);
    };
  }, []);

  return (
    <div className="ambient" aria-hidden="true">
      <div className="ambient-art" />
      <canvas ref={canvas} className="ambient-embers" />
    </div>
  );
}
