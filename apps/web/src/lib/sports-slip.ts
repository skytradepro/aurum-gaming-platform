'use client';

import type { SportMarket } from '@aurum/shared';
import { selectionKey } from '@aurum/shared';
import { useSyncExternalStore } from 'react';

/** One selection of the bet slip. The slip is shared by every sports page and kept in this browser. */
export interface SlipItem {
  fixtureId: number;
  market: SportMarket;
  pick: string;
  lineX10: number | null;
  oddsX100: number;
  home: string;
  away: string;
  league: string;
  live: boolean;
  /** Kick-off time (ISO) of the match: a pre-match selection closes 2 minutes before it. */
  kickoff?: string;
}

const KEY = 'hb-slip-v2';
const EMPTY: SlipItem[] = [];
let items: SlipItem[] = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === 'undefined') return;
  loaded = true;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    if (Array.isArray(raw)) items = raw.filter((x): x is SlipItem => typeof x === 'object' && x !== null && typeof (x as SlipItem).fixtureId === 'number' && typeof (x as SlipItem).oddsX100 === 'number');
  } catch {
    items = EMPTY;
  }
}

function set(next: SlipItem[]) {
  items = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode: the slip lives in this page only */
  }
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  load();
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    loaded = false;
    load();
    for (const l of listeners) l();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

const keyOf = (i: Pick<SlipItem, 'market' | 'pick' | 'lineX10'>) => selectionKey(i.market, i.pick, i.lineX10);

export const slip = {
  /** Adds a selection; the same selection again removes it; another selection of the same match replaces it. */
  toggle(item: SlipItem) {
    load();
    const same = items.find((p) => p.fixtureId === item.fixtureId);
    if (same && keyOf(same) === keyOf(item)) {
      set(items.filter((p) => p.fixtureId !== item.fixtureId));
      return;
    }
    if (same) set(items.map((p) => (p.fixtureId === item.fixtureId ? item : p)));
    else set([...items, item]);
    // a small notice says what was added (single or accumulator)
    window.dispatchEvent(new CustomEvent('hb:slip-added', { detail: { item, count: items.length } }));
  },
  remove(fixtureId: number) {
    load();
    set(items.filter((p) => p.fixtureId !== fixtureId));
  },
  clear() {
    set(EMPTY);
  },
  /** Puts back the selections of a ticket that was just placed ("keep selections"). */
  restore(list: readonly SlipItem[]) {
    load();
    set(list.map((p) => ({ ...p })));
  },
  /** New price of a selection (after "odds changed" or a fresh price list). */
  setOdds(fixtureId: number, oddsX100: number) {
    load();
    if (!items.some((p) => p.fixtureId === fixtureId && p.oddsX100 !== oddsX100)) return;
    set(items.map((p) => (p.fixtureId === fixtureId ? { ...p, oddsX100 } : p)));
  },
  /** Follows fresh prices of one match: the slip always shows the price the bet would be taken at. */
  follow(fixtureId: number, offers: readonly { market: SportMarket; pick: string; lineX10: number | null; oddsX100: number }[], live?: boolean) {
    load();
    const mine = items.find((p) => p.fixtureId === fixtureId);
    if (!mine) return;
    const o = offers.find((x) => keyOf(x) === keyOf(mine));
    const nextLive = live ?? mine.live;
    if (o && (o.oddsX100 !== mine.oddsX100 || nextLive !== mine.live)) set(items.map((p) => (p.fixtureId === fixtureId ? { ...p, oddsX100: o.oddsX100, live: nextLive } : p)));
  },
};

// --- phone / tablet: the bet slip opens as a sheet over the page, so the player never loses his place in the list ---
let sheetOpen = false;
const sheetListeners = new Set<() => void>();
function setSheet(next: boolean) {
  if (sheetOpen === next) return;
  sheetOpen = next;
  for (const l of sheetListeners) l();
}
export const slipSheet = {
  open: () => setSheet(true),
  close: () => setSheet(false),
};
/** Is the bet slip sheet open (phones and tablets)? */
export function useSlipSheet(): boolean {
  return useSyncExternalStore(
    (l) => {
      sheetListeners.add(l);
      return () => sheetListeners.delete(l);
    },
    () => sheetOpen,
    () => false,
  );
}

/** The selections of the bet slip (empty on the server and before the browser has read it). */
export function useSlip(): SlipItem[] {
  return useSyncExternalStore(subscribe, () => items, () => EMPTY);
}

/** Is this exact selection in the slip? */
export function isPicked(list: readonly SlipItem[], fixtureId: number, market: SportMarket, pick: string, lineX10: number | null): boolean {
  const p = list.find((x) => x.fixtureId === fixtureId);
  return !!p && keyOf(p) === selectionKey(market, pick, lineX10);
}
