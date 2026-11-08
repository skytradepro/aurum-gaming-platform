import { ProviderGameFrame } from '@/components/ProviderGameFrame';
import { apiFetch } from '@/lib/api';
import { serverApiFetch } from '@/lib/api-server';
import type { GameItem } from '@/lib/types';
import { isLocale } from '@aurum/i18n';
import { headers } from 'next/headers';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

function siteOrigin(h: Headers): string {
  const host = h.get('x-forwarded-host')?.split(',')[0]?.trim() || h.get('host') || 'localhost:3000';
  const proto = h.get('x-forwarded-proto')?.split(',')[0]?.trim() || (host.includes('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

export default async function ProviderGamePage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  if (!isLocale(locale) || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) notFound();
  setRequestLocale(locale);
  const h = await headers();
  const returnUrl = `${siteOrigin(h)}/${locale}/casino`;
  const launchBody = { language: locale, returnUrl };

  const [res, launch] = await Promise.all([
    apiFetch<{ game: GameItem }>(`/public/games/${slug}`, { locale }).catch(() => null),
    serverApiFetch<{ url: string }>(`/games/${slug}/launch`, { method: 'POST', locale, json: launchBody }).catch(() => null),
  ]);

  if (!res || res.game.art.source !== 'aggregator') notFound();
  return (
    <ProviderGameFrame
      slug={slug}
      name={res.game.name}
      provider={res.game.provider.name}
      initialLaunchUrl={launch?.url ?? null}
    />
  );
}
