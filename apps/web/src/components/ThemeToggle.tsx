'use client';

import { SITE_COOKIE_THEME } from '@/lib/config';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Icon } from './Icon';

export function ThemeToggle() {
  const t = useTranslations('common');
  const [dark, setDark] = useState(true);

  useEffect(() => {
    setDark(document.documentElement.dataset.theme !== 'light');
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? 'dark' : 'light';
    document.cookie = `${SITE_COOKIE_THEME}=${next ? 'dark' : 'light'}; path=/; max-age=31536000; samesite=lax`;
  }

  return (
    <button type="button" className="icon-btn" onClick={toggle} aria-label={dark ? t('lightMode') : t('darkMode')}>
      <Icon name={dark ? 'sun' : 'moon'} />
    </button>
  );
}
