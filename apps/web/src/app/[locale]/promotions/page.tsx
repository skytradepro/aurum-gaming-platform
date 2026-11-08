import '@/styles/promotions.css';
import { HeroBanner } from '@/components/HeroBanner';
import { PromoCard } from '@/components/PromoCard';
import { ReturnSpot } from '@/components/ReturnSpot';
import { PromoSpotlight } from '@/components/PromoSpotlight';
import type { SpotlightItem } from '@/components/PromoSpotlight';
import { Link } from '@/i18n/routing';
import { apiFetch } from '@/lib/api';
import { promoArt, promoPlayHref } from '@/lib/promo-art';
import type { PublicBanner, PublicConfig, PublicPromotion } from '@/lib/types';
import { isLocale } from '@aurum/i18n';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

const TYPES = ['all', 'casino', 'sports'] as const;

export default async function PromotionsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ type?: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const sp = await searchParams;
  const type = (TYPES as readonly string[]).includes(sp.type ?? '') ? (sp.type as (typeof TYPES)[number]) : 'all';
  const t = await getTranslations('promotions');
  const tc = await getTranslations('common');
  const th = await getTranslations('home');
  let items: PublicPromotion[] = [];
  let slides: PublicBanner[] = [];
  const [promos, banners, cfg] = await Promise.allSettled([
    apiFetch<{ items: PublicPromotion[] }>(`/public/promotions?locale=${locale}`, { locale }),
    // promotions slider (Admin > Banners > "Promotions page - slider")
    apiFetch<{ items: PublicBanner[] }>(`/public/banners?placement=promotions_hero&locale=${locale}`, { locale }),
    apiFetch<PublicConfig>('/public/config', { locale }),
  ]);
  const giftOn = cfg.status === 'fulfilled' && cfg.value.giftEnabled === true;
  if (promos.status === 'fulfilled') items = promos.value.items;
  if (banners.status === 'fulfilled') slides = banners.value.items;

  const kind = (p: PublicPromotion) => (promoPlayHref(p.slug) === '/sports' ? 'sports' : 'casino');
  const counts = { all: items.length, casino: items.filter((p) => kind(p) === 'casino').length, sports: items.filter((p) => kind(p) === 'sports').length };
  const shown = type === 'all' ? items : items.filter((p) => kind(p) === type);
  // without pictures in the admin slider, the slider is made of the promotions themselves
  const spotlight: SpotlightItem[] = items.map((p) => {
    const art = promoArt(p.slug);
    return { slug: p.slug, title: p.title, summary: p.summary, image: p.image?.url ?? art?.image ?? null, badge: art?.badge ?? null, playHref: promoPlayHref(p.slug) };
  });

  return (
    <>
      <ReturnSpot scope="promotions" pattern="/promotions/" />
      <h1 className="page-title">{t('title')}</h1>
      {slides.length > 0 ? (
        <HeroBanner banners={slides} variant="promo" />
      ) : (
        <PromoSpotlight items={spotlight} labels={{ kicker: t('kicker'), play: t('play'), readMore: tc('readMore'), prev: th('heroPrevious'), next: th('heroNext') }} />
      )}
      {giftOn ? (
        <Link href="/gift" className="promo-gift">
          <span className="promo-gift-box" aria-hidden="true">
            🎁
          </span>
          <span className="promo-gift-text">
            <b>{t('giftTitle')}</b>
            <small>{t('giftSub')}</small>
          </span>
          <em>{t('giftCta')} ›</em>
        </Link>
      ) : null}
      {items.length === 0 && slides.length === 0 ? <p className="empty-state">{t('none')}</p> : null}
      {counts.casino > 0 && counts.sports > 0 ? (
        <nav className="promo-filters" aria-label={t('title')}>
          {TYPES.map((k) => (
            <Link key={k} href={k === 'all' ? '/promotions' : { pathname: '/promotions', query: { type: k } }} className={type === k ? 'on' : ''} aria-current={type === k ? 'page' : undefined} scroll={false}>
              {t(`type_${k}`)} <sup>{counts[k]}</sup>
            </Link>
          ))}
        </nav>
      ) : null}
      <div className="promo-grid is-glow">
        {shown.map((p) => (
          <PromoCard key={p.slug} promo={p} />
        ))}
      </div>
    </>
  );
}
