'use client';

/**
 * "Back to where you were": when a player opens a match or a game from a list, the list remembers the item (and its
 * filters). Coming back, the list shows the same filters and scrolls to that item, so it never seems to disappear.
 * Kept in this browser tab only (sessionStorage), for 30 minutes.
 */
export interface Spot {
  /** The link that was opened, as written in the page (e.g. "/en/match/123"). */
  href: string;
  /** Scroll position of the page when the link was opened. */
  y: number;
  /** Filters of the list (tab, day...), read back by the list itself. */
  extra?: Record<string, string | number>;
  at: number;
}

const KEY = (scope: string) => `hb-spot:${scope}`;
const scroller = (): Element => document.scrollingElement ?? document.documentElement;
const MAX_AGE_MS = 30 * 60_000;

export function saveSpot(scope: string, href: string, extra?: Spot['extra']): void {
  try {
    sessionStorage.setItem(KEY(scope), JSON.stringify({ href, y: scroller().scrollTop, extra, at: Date.now() } satisfies Spot));
  } catch {
    /* private mode: nothing is remembered */
  }
}

/** The saved spot of a list, if recent. `take` removes it (the list has used it). */
export function readSpot(scope: string, take = false): Spot | null {
  try {
    const raw = sessionStorage.getItem(KEY(scope));
    if (!raw) return null;
    if (take) sessionStorage.removeItem(KEY(scope));
    const spot = JSON.parse(raw) as Spot;
    if (typeof spot?.href !== 'string' || typeof spot.at !== 'number' || Date.now() - spot.at > MAX_AGE_MS) return null;
    return spot;
  } catch {
    return null;
  }
}

/** Scrolls to the link of a spot (waiting up to 3 s for the list to draw it) and lights it up for a moment. */
export function showSpot(spot: Spot): void {
  let tries = 0;
  const find = () => {
    const link = Array.from(document.querySelectorAll('main a[href]')).find((a) => a.getAttribute('href') === spot.href);
    if (!link) {
      tries += 1;
      if (tries < 30) window.setTimeout(find, 100);
      else scroller().scrollTo({ top: spot.y });
      return;
    }
    const box = (link.closest('[data-spot]') as HTMLElement | null) ?? (link as HTMLElement);
    box.scrollIntoView({ block: 'center' });
    box.classList.remove('hb-spot');
    void box.offsetWidth;
    box.classList.add('hb-spot');
    window.setTimeout(() => box.classList.remove('hb-spot'), 2600);
  };
  find();
}

/** Remembers the link a click opens, when it leads to a page matching `pattern` (e.g. "/casino/" or a list of them). */
export function spotFromClick(scope: string, event: { target: EventTarget | null }, pattern: string | readonly string[], extra?: Spot['extra']): void {
  const el = event.target instanceof Element ? event.target.closest('a[href]') : null;
  const href = el?.getAttribute('href');
  const patterns = typeof pattern === 'string' ? [pattern] : pattern;
  if (!el || !href || !href.startsWith('/') || !patterns.some((p) => href.includes(p)) || el.getAttribute('target') === '_blank') return;
  saveSpot(scope, href, extra);
}
