'use client';

import { Link } from '@/i18n/routing';
import type { PublicBanner } from '@/lib/types';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

const AUTOPLAY_MS = 6500;

/**
 * `wide`: the banner runs from edge to edge of the screen (home page).
 * `variant="promo"`: the promotions slider (middle of the home page, top of the promotions page); nothing is shown when it has no banner.
 */
export function HeroBanner({ banners, wide = false, variant }: { banners: PublicBanner[]; wide?: boolean; variant?: 'promo' }) {
  const t = useTranslations('home');
  const tn = useTranslations('nav');
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchX = useRef<number | null>(null);
  const count = banners.length;

  const go = useCallback((next: number) => setIndex(((next % count) + count) % count), [count]);

  useEffect(() => {
    if (count < 2 || paused) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setTimeout(() => go(index + 1), AUTOPLAY_MS);
    return () => window.clearTimeout(timer);
  }, [index, paused, count, go]);

  if (count === 0) {
    if (variant === 'promo') return null;
    return (
      <section className={wide ? 'hero hero-wide' : 'hero'} aria-label="HANNIBAL">
        <div className="hero-fallback" />
        <span className="hero-coin" style={{ insetInlineEnd: '14%', top: '22%' }} />
        <span className="hero-coin" style={{ insetInlineEnd: '26%', top: '58%', width: 50, height: 50, animationDelay: '1s' }} />
        <span className="hero-coin" style={{ insetInlineEnd: '6%', top: '60%', width: 40, height: 40, animationDelay: '2s' }} />
        <div className="hero-slide active">
          <div className="hero-copy">
            <h1 className="hero-title">HANNIBAL</h1>
            <p className="hero-sub">{tn('sportsBetting')} · {tn('casino')}</p>
            <Link href="/register" className="btn btn-gold btn-lg">
              {tn('register')}
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      className={`hero${wide ? ' hero-wide' : ''}${variant === 'promo' ? ' hero-promo' : ''}${paused ? ' paused' : ''}`}
      style={{ ['--hero-ms' as string]: `${AUTOPLAY_MS}ms` }}
      aria-roledescription="carousel"
      aria-label="HANNIBAL"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
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
      {banners.map((b, i) => {
        // No title and no subtitle: the picture carries its own design (text, faces), so it is shown alone
        // (no dark shade, no text on top) and the whole banner opens its link.
        const pictureOnly = !b.title.trim() && !b.subtitle.trim();
        return (
          <div key={b.id} className={`hero-slide${i === index ? ' active' : ''}${pictureOnly ? ' picture-only' : ''}`} aria-hidden={i !== index} role="group" aria-roledescription="slide">
            {pictureOnly ? (
              // the same picture, blurred, fills the space around a picture that is shown whole
              <picture className="hero-bg" aria-hidden="true">
                {b.imageMobile ? <source media="(max-width: 700px)" srcSet={b.imageMobile.url} /> : null}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={b.imageDesktop.url} alt="" loading={i === 0 ? 'eager' : 'lazy'} />
              </picture>
            ) : null}
            <picture>
              {b.imageMobile ? <source media="(max-width: 700px)" srcSet={b.imageMobile.url} /> : null}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="hero-img" src={b.imageDesktop.url} alt={b.alt} width={b.imageDesktop.width} height={b.imageDesktop.height} fetchPriority={i === 0 ? 'high' : 'auto'} />
            </picture>
            {pictureOnly ? (
              b.linkUrl.startsWith('/') ? <Link href={b.linkUrl} className="hero-hit" aria-label={b.alt || b.ctaLabel || 'HANNIBAL'} tabIndex={i === index ? 0 : -1} /> : null
            ) : (
              <>
                <div className="hero-shade" />
                <div className="hero-copy">
                  <h2 className="hero-title">{b.title}</h2>
                  {b.subtitle ? <p className="hero-sub">{b.subtitle}</p> : null}
                  {b.ctaLabel ? (
                    <Link href={b.linkUrl.startsWith('/') ? b.linkUrl : '/login'} className="btn btn-gold btn-lg" tabIndex={i === index ? 0 : -1}>
                      {b.ctaLabel}
                    </Link>
                  ) : null}
                </div>
              </>
            )}
          </div>
        );
      })}

      {count > 1 ? (
        <>
          <button type="button" className="hero-arrow prev" aria-label={t('heroPrevious')} onClick={() => go(index - 1)}>
            <Icon name="chevronLeft" className="flip-rtl" />
          </button>
          <button type="button" className="hero-arrow next" aria-label={t('heroNext')} onClick={() => go(index + 1)}>
            <Icon name="chevronRight" className="flip-rtl" />
          </button>
          <div className="hero-dots">
            {banners.map((b, i) => (
              <button
                key={b.id}
                type="button"
                className={i === index ? 'hero-dot active' : 'hero-dot'}
                aria-label={t('heroGoTo', { number: i + 1 })}
                aria-current={i === index}
                onClick={() => go(i)}
              />
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
