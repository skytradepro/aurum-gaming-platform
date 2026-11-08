import { apiFetch } from './api';
import type { Locale } from '@aurum/i18n';

export interface VideoSource {
  src: string;
  poster: string | null;
  source: 'default' | 'uploaded';
}
export type VideoPair = { desktop: VideoSource | null; mobile: VideoSource | null };
export type VideoSlotName = 'home_casino' | 'home_football' | 'casino_hero' | 'live_casino_hero' | 'sports_hero' | 'sports_side';
export type VideoSlots = Record<VideoSlotName, VideoPair>;

const EMPTY: VideoPair = { desktop: null, mobile: null };

/** Background videos chosen in the admin panel (bundled clips when nothing was uploaded). */
export async function loadVideos(locale: Locale): Promise<VideoSlots> {
  try {
    return (await apiFetch<{ slots: VideoSlots }>('/public/videos', { locale })).slots;
  } catch {
    return { home_casino: EMPTY, home_football: EMPTY, casino_hero: EMPTY, live_casino_hero: EMPTY, sports_hero: EMPTY, sports_side: EMPTY };
  }
}
