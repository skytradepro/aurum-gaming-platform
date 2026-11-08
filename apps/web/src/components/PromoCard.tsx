import { Link } from '@/i18n/routing';
import { promoArt, promoPlayHref } from '@/lib/promo-art';
import type { PublicPromotion } from '@/lib/types';
import { getTranslations } from 'next-intl/server';

export async function PromoCard({ promo }: { promo: PublicPromotion }) {
  const t = await getTranslations('promotions');
  const tc = await getTranslations('common');
  const art = promo.image ? null : promoArt(promo.slug);
  // real dates of the promotion: "new" for a week after it starts, "ends in N days" in its last two weeks
  const now = Date.now();
  const startedDays = promo.startsAt ? (now - Date.parse(promo.startsAt)) / 86_400_000 : null;
  const daysLeft = promo.endsAt ? Math.ceil((Date.parse(promo.endsAt) - now) / 86_400_000) : null;
  return (
    <article className="promo-card">
      <span className="promo-kicker">
        {t('kicker')}
        {startedDays !== null && startedDays >= 0 && startedDays <= 7 ? <b className="promo-flag is-new">{t('new')}</b> : null}
        {daysLeft !== null && daysLeft >= 0 && daysLeft <= 14 ? <b className="promo-flag is-ends">{daysLeft <= 1 ? t('endsToday') : t('endsIn', { days: daysLeft })}</b> : null}
      </span>
      <h3 className="promo-head">{promo.title}</h3>
      <Link href={`/promotions/${promo.slug}`} className="promo-img" aria-label={promo.title}>
        {promo.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={promo.image.url} alt="" loading="lazy" width={promo.image.width} height={promo.image.height} />
        ) : art ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={art.image} alt="" loading="lazy" />
            <span className="promo-badge" aria-hidden="true">{art.badge}</span>
          </>
        ) : null}
      </Link>
      <div className="promo-body">
        <p>{promo.summary}</p>
        <div className="promo-actions">
          <Link href={`/promotions/${promo.slug}`} className="btn btn-dark btn-sm">
            {tc('readMore')}
          </Link>
          <Link href={promoPlayHref(promo.slug)} className="btn btn-gold btn-sm">
            {t('play')}
          </Link>
        </div>
      </div>
    </article>
  );
}
