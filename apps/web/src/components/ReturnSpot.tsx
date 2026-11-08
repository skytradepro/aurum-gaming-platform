'use client';

import { readSpot, showSpot, spotFromClick } from '@/lib/return-spot';
import { useEffect } from 'react';

/**
 * Game lobbies: remembers the game a player opens and, when he comes back to this page, scrolls to it and lights it
 * up. `pattern` is the part of the link that leads to a game, a match or an offer (e.g. "/casino/").
 */
export function ReturnSpot({ scope, pattern }: { scope: string; pattern: string | readonly string[] }) {
  const key = typeof pattern === 'string' ? pattern : pattern.join('|');
  useEffect(() => {
    const spot = readSpot(scope, true);
    if (spot) showSpot(spot);
    const main = document.querySelector('main') ?? document.body;
    const patterns = key.split('|');
    const onClick = (e: Event) => spotFromClick(scope, e, patterns);
    main.addEventListener('click', onClick, true);
    return () => main.removeEventListener('click', onClick, true);
  }, [scope, key]);
  return null;
}
