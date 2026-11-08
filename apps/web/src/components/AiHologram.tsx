'use client';

import '@/styles/joker.css';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { AI_OPEN_EVENT } from './game/GameInfo';
import { JokerArt } from './JokerArt';

/**
 * AI panel in the page margin (wide screens only): the AI casino artwork with slow camera motion, glowing AI heads and a light beam.
 * Clicking it opens Hannibal AI. CSS animation only; off for reduced motion.
 */
export function AiHologram() {
  const t = useTranslations('ai');
  const box = useRef<HTMLButtonElement>(null);

  // Fit the panel into the free margin left of the content, and stop it above the footer line.
  useEffect(() => {
    const btn = box.current;
    if (!btn) return;
    let raf = 0;
    const place = () => {
      raf = 0;
      const main = document.querySelector<HTMLElement>('.site-main');
      const header = document.querySelector<HTMLElement>('.site-header');
      const footer = document.querySelector<HTMLElement>('.site-footer');
      if (!main) return;
      const rect = main.getBoundingClientRect();
      const rtl = document.documentElement.dir === 'rtl';
      const style = getComputedStyle(main);
      const free = rtl ? window.innerWidth - (rect.right - parseFloat(style.paddingRight)) : rect.left + parseFloat(style.paddingLeft);
      const width = Math.min(200, free - 44);
      if (width < 140) {
        btn.classList.remove('is-on');
        return;
      }
      const height = (width * 600) / 384;
      // never cover a full-width banner (home hero, sports match hero): wait until it has scrolled away
      const wide = document.querySelector<HTMLElement>('.hero-wide, .mhero2');
      const top = Math.max(header?.getBoundingClientRect().bottom ?? 80, wide ? wide.getBoundingClientRect().bottom : 0) + 12;
      const limit = footer ? footer.getBoundingClientRect().top - 16 : window.innerHeight;
      const bottomEdge = Math.min(window.innerHeight - 24, limit);
      if (bottomEdge - height < top) {
        btn.classList.remove('is-on');
        return;
      }
      btn.style.width = `${Math.round(width)}px`;
      btn.style.bottom = `${Math.round(window.innerHeight - bottomEdge)}px`;
      btn.classList.add('is-on');
    };
    // Placed at once on every scroll (a few layout reads), so the panel never slides over the footer.
    const queue = () => place();
    place();
    window.addEventListener('scroll', queue, { passive: true });
    window.addEventListener('resize', queue);
    const ro = new ResizeObserver(queue);
    ro.observe(document.body);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', queue);
      window.removeEventListener('resize', queue);
      ro.disconnect();
    };
  }, []);


  return (
    <button ref={box} type="button" className="ai-holo is-joker" aria-label={t('open')} onClick={() => window.dispatchEvent(new CustomEvent(AI_OPEN_EVENT, { detail: {} }))}>
      <span className="jk-rays" aria-hidden="true" />
      <span className="jk-stage" aria-hidden="true">
        <JokerArt />
      </span>
      <span className="ai-holo-glow g1" aria-hidden="true" />
      <span className="ai-holo-glow g2" aria-hidden="true" />
      <span className="ai-holo-glow g3" aria-hidden="true" />
      <span className="ai-holo-sparks" aria-hidden="true" />
      <span className="ai-holo-scan" aria-hidden="true" />
      <span className="ai-holo-tag">
        <i aria-hidden="true" />
        {t('holoTag')}
      </span>
      <span className="ai-holo-text">
        <strong>{t('holoTitle')}</strong>
        <small>{t('holoSub')}</small>
        <em>{t('holoCta')}</em>
      </span>
    </button>
  );
}
