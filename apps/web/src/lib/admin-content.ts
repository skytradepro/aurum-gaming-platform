import type { MediaDTO } from './types';

export interface AdminBannerTranslation {
  title: string;
  subtitle: string;
  ctaLabel: string;
  linkUrl: string;
  altText: string;
  imageDesktop: MediaDTO | null;
  imageMobile: MediaDTO | null;
}

export interface AdminBanner {
  id: string;
  placement: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  translations: Record<string, AdminBannerTranslation>;
}

export interface AdminPromotionTranslation {
  title: string;
  summary: string;
  body: string;
  terms: string;
  image: MediaDTO | null;
}

export interface AdminPromotion {
  id: string;
  slug: string;
  sortOrder: number;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  translations: Record<string, AdminPromotionTranslation>;
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** ISO instant -> value for <input type="datetime-local"> in the browser's time zone. */
export function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** <input type="datetime-local"> value -> ISO instant (undefined when empty or invalid). */
export function toIso(value: string): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}
