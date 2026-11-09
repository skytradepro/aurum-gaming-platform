'use client';

import { useEffect } from 'react';

/** Scroll to provider catalog after ?provider=… or #provider-catalog navigation. */
export function CasinoScrollToCatalog({ active }: { active: boolean }) {
  useEffect(() => {
    if (!active) return;
    const run = () => {
      const el = document.getElementById('provider-catalog');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    const t = window.setTimeout(run, 80);
    return () => window.clearTimeout(t);
  }, [active]);
  return null;
}
