'use client';

import { formatAmountMinor } from '@/lib/money-display';
import type { CurrencyDTO } from '@/lib/types';
import { useEffect, useRef, useState } from 'react';

interface Tier {
  key: 'ultimate' | 'vip' | 'plus' | 'basic';
  label: string;
  amountMinor: string;
}

/** Counts up to the real figure when the cards scroll into view. The amounts are exact integers (BigInt). */
function Amount({ amountMinor, currency, locale }: { amountMinor: string; currency: CurrencyDTO; locale: string }) {
  const target = BigInt(amountMinor);
  const [value, setValue] = useState((target * 90n) / 100n);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(target);
      return;
    }
    let raf = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        const start = performance.now();
        const from = (target * 90n) / 100n;
        const tick = (now: number) => {
          const p = Math.min(1, (now - start) / 1600);
          const eased = 1 - Math.pow(1 - p, 3);
          setValue(from + ((target - from) * BigInt(Math.round(eased * 10000))) / 10000n);
          if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [target]);

  return (
    <strong ref={ref} className="vip-amount">
      {formatAmountMinor(value.toString(), currency, locale)}
    </strong>
  );
}

export function JackpotTiers({ tiers, currency, locale }: { tiers: Tier[]; currency: CurrencyDTO; locale: string }) {
  return (
    <div className="vip-grid">
      {tiers.map((tier, i) => (
        <div key={tier.key} className={`vip-card ${tier.key}`}>
          <div className="vip-name">
            <span className="vip-medal">{i + 1}</span>
            {tier.label}
          </div>
          <Amount amountMinor={tier.amountMinor} currency={currency} locale={locale} />
        </div>
      ))}
    </div>
  );
}
