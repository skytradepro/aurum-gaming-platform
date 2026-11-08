import { Icon } from '@/components/Icon';
import type { IconName } from '@/components/Icon';
import { Link } from '@/i18n/routing';
import { getTranslations } from 'next-intl/server';

const ICONS: Record<'sports' | 'live' | 'liveCasino' | 'virtuals' | 'channels', IconName> = {
  sports: 'sports',
  live: 'live',
  liveCasino: 'live',
  virtuals: 'virtuals',
  channels: 'live',
};

/** Honest placeholder for sections that need a licensed third-party provider that is not connected yet. */
export async function ComingSoonPage({ section }: { section: 'sports' | 'live' | 'liveCasino' | 'virtuals' | 'channels' }) {
  const t = await getTranslations('comingSoon');
  const tc = await getTranslations('common');
  return (
    <section className="soon">
      <div className="soon-icon">
        <Icon name={ICONS[section]} />
      </div>
      <h1>{t('title')}</h1>
      <p>{t('body')}</p>
      <div className="needs">
        <strong>{t('needs')}:</strong> {t(section)}
      </div>
      <div>
        <Link href="/" className="btn btn-gold">
          {tc('backHome')}
        </Link>
      </div>
    </section>
  );
}
