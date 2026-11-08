import { apiFetch } from '@/lib/api';
import { isLocale } from '@aurum/i18n';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function ShopsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations('shopsPublic');
  let items: { id: string; code: string; name: string; city: string; address: string; phone: string | null; openingHours: string; currency: string }[] = [];
  try {
    const res = await apiFetch<{ items: typeof items }>('/public/shops', { locale });
    items = res.items;
  } catch {
    items = [];
  }

  return (
    <>
      <h1>{t('title')}</h1>
      <p>{t('subtitle')}</p>
      {items.length === 0 ? <p>{t('empty')}</p> : null}
      <div style={{ display: 'grid', gap: '1rem' }}>
        {items.map((shop) => (
          <div key={shop.id} className="card">
            <strong>{shop.name}</strong> ({shop.code})
            <div>{shop.city}</div>
            <div>{shop.address}</div>
            {shop.phone ? (
              <div>
                {t('phone')}: {shop.phone}
              </div>
            ) : null}
            {shop.openingHours ? (
              <div>
                {t('hours')}: {shop.openingHours}
              </div>
            ) : null}
            <div>{t('currency', { currency: shop.currency })}</div>
          </div>
        ))}
      </div>
    </>
  );
}
