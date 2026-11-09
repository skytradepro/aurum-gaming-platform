'use client';

import { useTranslations } from 'next-intl';

/** Short how-to for API LX / Pragmatic games (real wallet, iframe). */
export function ProviderPlayGuide() {
  const t = useTranslations('casino.pragmaticGuide');
  return (
    <aside className="pragmatic-guide">
      <h3 className="pragmatic-guide-title">{t('title')}</h3>
      <ol className="pragmatic-guide-steps">
        <li>{t('step1')}</li>
        <li>{t('step2')}</li>
        <li>{t('step3')}</li>
      </ol>
    </aside>
  );
}
