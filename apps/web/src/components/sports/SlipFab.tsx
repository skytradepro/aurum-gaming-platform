'use client';

import { slipSheet, useSlip, useSlipSheet } from '@/lib/sports-slip';
import { useEffect } from 'react';

const PHONE = '(max-width: 999px)';

/**
 * Phone / tablet: a bar above the bottom menu with the number of selections and the total odds. It opens the bet
 * slip as a sheet over the page, so the player stays at the same place in the list of matches.
 */
export function SlipFab({ count, label }: { count: number; label: string }) {
  const items = useSlip();
  const open = useSlipSheet();

  // a link to #bet-slip (the "added to slip" notice) opens the sheet instead of jumping down the page
  useEffect(() => {
    const onHash = () => {
      if (window.location.hash !== '#bet-slip' || !window.matchMedia(PHONE).matches) return;
      slipSheet.open();
      history.replaceState(null, '', window.location.pathname + window.location.search);
    };
    onHash();
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (count === 0 || open) return null;
  const total = items.reduce((acc, i) => (acc * i.oddsX100) / 100, 100) / 100;
  return (
    <button type="button" className="sbk-slip-fab" onClick={() => slipSheet.open()} aria-haspopup="dialog">
      <span className="sbk-fab-l">
        <b>{count}</b> {label}
      </span>
      <span className="sbk-fab-r">
        {total.toFixed(2)} <i aria-hidden="true">⌃</i>
      </span>
    </button>
  );
}
