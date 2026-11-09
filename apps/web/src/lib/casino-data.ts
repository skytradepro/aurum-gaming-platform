import { apiFetch } from './api';
import type { Locale } from '@aurum/i18n';
import type { GameItem } from './types';

export async function loadCasino(locale: Locale, category?: string, provider?: string) {
  const query = new URLSearchParams({ limit: provider ? '48' : '32' });
  if (category) query.set('category', category);
  if (provider) query.set('provider', provider);
  const [games, providers] = await Promise.all([
    apiFetch<{ items: GameItem[]; total: number }>(`/public/games?${query}`, { locale }).catch(() => ({ items: [] as GameItem[], total: 0 })),
    apiFetch<{ items: { slug: string; name: string }[] }>('/public/providers', { locale }).catch(() => ({ items: [] as { slug: string; name: string }[] })),
  ]);
  return { games, providers: providers.items };
}
