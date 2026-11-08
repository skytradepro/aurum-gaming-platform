import { Icon } from '@/components/Icon';
import { Link } from '@/i18n/routing';
import { apiFetch } from '@/lib/api';
import { promoArt, promoPlayHref } from '@/lib/promo-art';
import type { PublicPromotion } from '@/lib/types';
import { isLocale } from '@aurum/i18n';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function PromotionDetailPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations('promotions');

  let item: PublicPromotion;
  try {
    ({ item } = await apiFetch<{ item: PublicPromotion }>(`/public/promotions/${slug}?locale=${locale}`, { locale }));
  } catch {
    notFound();
  }

  return (
    <article className="promo-detail">
      <Link href="/promotions" className="section-link" style={{ display: 'inline-flex', gap: '0.3rem', alignItems: 'center', marginBottom: '1rem' }}>
        <Icon name="chevronLeft" className="flip-rtl" />
        {t('title')}
      </Link>
      <div className="promo-card" style={{ overflow: 'hidden' }}>
        {item.image ? (
          <div className="promo-img" style={{ maxHeight: 360 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.image.url} alt="" width={item.image.width} height={item.image.height} />
          </div>
        ) : promoArt(item.slug) ? (
          <div className="promo-img" style={{ maxHeight: 360 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={promoArt(item.slug)?.image} alt="" />
            <span className="promo-badge" aria-hidden="true">{promoArt(item.slug)?.badge}</span>
          </div>
        ) : null}
        <div className="promo-body" style={{ padding: '1.4rem' }}>
          <h1 style={{ margin: 0 }}>{item.title}</h1>
          {item.summary ? <p style={{ fontSize: '1.02rem' }}>{item.summary}</p> : null}
          {/* Plain text only: the content is stored as text and is never rendered as HTML. */}
          {item.body ? <p className="prose" style={{ color: 'var(--text)' }}>{item.body}</p> : null}
          {item.terms ? (
            <>
              <h2 style={{ fontSize: '1rem', marginBottom: 0 }}>{t('termsApply')}</h2>
              <p className="prose">{item.terms}</p>
            </>
          ) : null}
          <div className="promo-actions" style={{ maxWidth: 360 }}>
            <Link href={promoPlayHref(item.slug)} className="btn btn-gold">
              {t('play')}
            </Link>
            <Link href="/promotions" className="btn btn-dark">
              {t('title')}
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}
