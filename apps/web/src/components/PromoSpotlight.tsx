'use client';

import { Link } from '@/i18n/routing';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface SpotlightItem {
  slug: string;
  title: string;
  summary: string;
  image: string | null;
  badge: string | null;
  playHref: string;
}

const AUTOPLAY_MS = 6000;

/**
 * Big promotions slider made from the real promotions (used when the admin has not put pictures in the promotions
 * slider): picture, big badge, title, text and buttons, with a moving gold line that shows the time to the next slide.
 */
export function PromoSpotlight({ items, labels }: { items: SpotlightItem[]; labels: { kicker: string; play: string; readMore: string; prev: string; next: string } }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchX = useRef<number | null>(null);
  const count = items.length;
  const go = useCallback((n: number) => setIndex(((n % count) + count) % count), [count]);

  useEffect(() => {
    if (count < 2 || paused) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setTimeout(() => go(index + 1), AUTOPLAY_MS);
    return () => window.clearTimeout(timer);
  }, [index, paused, count, go]);

  if (count === 0) return null;
  return (
    <section
      className={`pspot${paused ? ' paused' : ''}`}
      style={{ ['--pspot-ms' as string]: `${AUTOPLAY_MS}ms` }}
      aria-roledescription="carousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={(e) => {
        touchX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        const start = touchX.current;
        const end = e.changedTouches[0]?.clientX;
        touchX.current = null;
        if (start === null || end === undefined || Math.abs(end - start) < 40) return;
        const rtl = document.documentElement.dir === 'rtl';
        go(index + ((end < start) !== rtl ? 1 : -1));
      }}
    >
      {items.map((p, i) => (
        <article key={p.slug} className={`pspot-slide${i === index ? ' active' : ''}`} aria-hidden={i !== index} role="group" aria-roledescription="slide">
          {p.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="pspot-bg" src={p.image} alt="" loading={i === 0 ? 'eager' : 'lazy'} />
          ) : null}
          <div className="pspot-shade" />
          <div className="pspot-copy">
            <span className="pspot-kicker">✦ {labels.kicker}</span>
            {p.badge ? <strong className="pspot-badge">{p.badge}</strong> : null}
            <h2 className="pspot-title">{p.title}</h2>
            {p.summary ? <p className="pspot-sub">{p.summary}</p> : null}
            <div className="pspot-actions">
              <Link href={p.playHref} className="btn btn-gold" tabIndex={i === index ? 0 : -1}>
                {labels.play}
              </Link>
              <Link href={`/promotions/${p.slug}`} className="btn btn-dark" tabIndex={i === index ? 0 : -1}>
                {labels.readMore}
              </Link>
            </div>
          </div>
        </article>
      ))}
      {count > 1 ? (
        <>
          <button type="button" className="pspot-arrow prev" aria-label={labels.prev} onClick={() => go(index - 1)}>
            ‹
          </button>
          <button type="button" className="pspot-arrow next" aria-label={labels.next} onClick={() => go(index + 1)}>
            ›
          </button>
          <div className="pspot-dots">
            {items.map((p, i) => (
              <button key={p.slug} type="button" className={i === index ? 'on' : ''} aria-label={`${i + 1}`} aria-current={i === index} onClick={() => go(i)}>
                <i key={i === index ? `run-${index}` : 'idle'} />
              </button>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
