import { Link } from '@/i18n/routing';
import { getTranslations } from 'next-intl/server';

export default async function NotFound() {
  const t = await getTranslations('errorPages');
  return (
    <section className="card" style={{ maxWidth: 560, margin: '3rem auto', textAlign: 'center', display: 'grid', gap: '0.8rem', padding: '2.2rem 1.5rem' }}>
      <div style={{ fontSize: '3rem', fontWeight: 900, color: '#e9c46a', lineHeight: 1 }}>404</div>
      <h1 style={{ margin: 0 }}>{t('notFoundTitle')}</h1>
      <p className="muted" style={{ margin: 0 }}>{t('notFoundBody')}</p>
      <div>
        <Link href="/" className="btn btn-gold">
          {t('backHome')}
        </Link>
      </div>
    </section>
  );
}
