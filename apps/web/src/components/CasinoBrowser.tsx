'use client';

import { apiClient } from '@/lib/api';
import type { GameItem } from '@/lib/types';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GameCard } from './GameCard';
import { Icon } from './Icon';

type Tab = 'lobby' | 'featured' | 'new' | 'slots' | 'crash' | 'live' | 'table' | 'other';
type Sort = 'popular' | 'az' | 'za' | 'newest';
interface Provider {
  slug: string;
  name: string;
}
interface Page {
  items: GameItem[];
  total: number;
}

const PAGE_SIZE = 32;
const TABS: Tab[] = ['lobby', 'featured', 'new', 'slots', 'crash', 'live', 'table', 'other'];
const CATEGORY_TABS: Tab[] = ['slots', 'crash', 'live', 'table', 'other'];

function buildQuery(tab: Tab, provider: string, q: string, offset: number): string {
  const params = new URLSearchParams();
  params.set('limit', tab === 'new' ? '200' : String(PAGE_SIZE));
  if (offset > 0 && tab !== 'new') params.set('offset', String(offset));
  if (CATEGORY_TABS.includes(tab)) params.set('category', tab);
  if (tab === 'featured') params.set('featured', 'true');
  if (provider) params.set('provider', provider);
  if (q.trim()) params.set('q', q.trim());
  return params.toString();
}

export function CasinoBrowser({
  initialTab = 'lobby',
  initialProvider = '',
  initial,
  providers,
}: {
  initialTab?: Tab;
  initialProvider?: string;
  initial: Page;
  providers: Provider[];
}) {
  const t = useTranslations('casino');
  const tc = useTranslations('common');
  const [tab, setTab] = useState<Tab>(initialTab);
  const [provider, setProvider] = useState(initialProvider);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('popular');
  const [items, setItems] = useState<GameItem[]>(initial.items);
  const [total, setTotal] = useState(initial.total);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const first = useRef(true);
  const requestId = useRef(0);

  useEffect(() => {
    if (provider === initialProvider) return;
    setProvider(initialProvider);
    first.current = true;
  }, [initialProvider, provider]);

  const load = useCallback(
    async (nextTab: Tab, nextProvider: string, nextQ: string, offset: number) => {
      const id = ++requestId.current;
      setLoading(true);
      setFailed(false);
      try {
        const page = await apiClient<Page>(`/public/games?${buildQuery(nextTab, nextProvider, nextQ, offset)}`);
        if (id !== requestId.current) return;
        const rows = nextTab === 'new' ? page.items.filter((g) => g.isNew) : page.items;
        setItems((prev) => (offset > 0 ? [...prev, ...rows] : rows));
        setTotal(nextTab === 'new' ? rows.length : page.total);
      } catch {
        if (id === requestId.current) setFailed(true);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [],
  );

  // If SSR missed the API, load once on mount (common when web starts before api:dev).
  useEffect(() => {
    if (initial.total > 0 && initial.items.length > 0) return;
    void load(initialTab, initialProvider, '', 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount catalogue recovery only
  }, []);

  // Reload when the tab or provider changes, and (debounced) when the search text changes.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      if (tab === initialTab && provider === initialProvider && !q && initial.total > 0) return;
    }
    const timer = window.setTimeout(() => void load(tab, provider, q, 0), q ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [tab, provider, q, load, initialTab, initial.total]);

  useEffect(() => {
    const retry = () => {
      if (document.visibilityState !== 'visible' || loading) return;
      if (total > 0 || failed) return;
      void load(tab, provider, q, 0);
    };
    document.addEventListener('visibilitychange', retry);
    return () => document.removeEventListener('visibilitychange', retry);
  }, [failed, load, loading, provider, q, tab, total]);

  const shown = useMemo(() => {
    const list = [...items];
    if (sort === 'az') list.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === 'za') list.sort((a, b) => b.name.localeCompare(a.name));
    if (sort === 'newest') list.sort((a, b) => Number(b.isNew) - Number(a.isNew));
    return list;
  }, [items, sort]);

  const label = (key: Tab): string => (key === 'lobby' ? t('allGames') : key === 'other' ? t('otherGames') : key === 'live' ? t('liveCasino') : t(key));
  const canLoadMore = tab !== 'new' && items.length < total;

  return (
    <div>
      <div className="casino-tabs" role="tablist" aria-label={t('lobby')}>
        {TABS.map((key) => (
          <button key={key} type="button" role="tab" className="casino-tab" aria-selected={tab === key} onClick={() => setTab(key)}>
            {label(key)}
          </button>
        ))}
      </div>

      <div className="casino-toolbar">
        <div className="search-box">
          <Icon name="search" />
          <input
            type="search"
            className="input"
            value={q}
            placeholder={t('searchPlaceholder')}
            aria-label={t('searchPlaceholder')}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select className="input" value={provider} aria-label={t('provider')} onChange={(e) => setProvider(e.target.value)}>
          <option value="">{t('allProviders')}</option>
          {providers.map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.name}
            </option>
          ))}
        </select>
        <select className="input" value={sort} aria-label={t('sortBy')} onChange={(e) => setSort(e.target.value as Sort)}>
          <option value="popular">{t('sortBy')}</option>
          <option value="az">{t('sort.az')}</option>
          <option value="za">{t('sort.za')}</option>
          <option value="newest">{t('sort.newest')}</option>
        </select>
      </div>

      {loading && items.length === 0 ? (
        <div className="grid-games" aria-busy="true">
          {Array.from({ length: 16 }, (_, i) => (
            <div key={i} className="skeleton" style={{ aspectRatio: '1 / 1.3' }} />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <div className="empty-state">
          <p>{failed ? t('catalogLoadFailed') : !q.trim() && !provider ? t('catalogEmpty') : t('noGames')}</p>
          {failed ? (
            <button type="button" className="btn btn-dark" onClick={() => void load(tab, provider, q, 0)}>
              {tc('retry')}
            </button>
          ) : null}
        </div>
      ) : (
        <div className="grid-games" aria-busy={loading}>
          {shown.map((g, i) => (
            <GameCard key={g.id} game={g} index={i % PAGE_SIZE} />
          ))}
        </div>
      )}

      {shown.length > 0 ? (
        <div className="casino-foot">
          <span>{tc('showing', { shown: items.length, total })}</span>
          <div className="progress" aria-hidden="true">
            <span style={{ width: `${total > 0 ? Math.min(100, (items.length / total) * 100) : 0}%` }} />
          </div>
          {canLoadMore ? (
            <button type="button" className="btn btn-dark" disabled={loading} onClick={() => void load(tab, provider, q, items.length)}>
              {tc('loadMore')}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
