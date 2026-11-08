'use client';

import { usePathname, useRouter } from '@/i18n/routing';
import type { Locale } from '@aurum/i18n';
import { useTranslations } from 'next-intl';
import { Dropdown } from './Dropdown';
import { Icon } from './Icon';

export function LocaleSwitcher({
  current,
  languages,
}: {
  current: Locale;
  languages: { code: string; nativeName: string }[];
}) {
  const t = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();

  if (languages.length === 0) return null;

  return (
    <Dropdown
      label={t('language')}
      trigger={
        <>
          <Icon name="globe" />
          <span>{current.toUpperCase()}</span>
        </>
      }
    >
      {(close) =>
        languages.map((l) => (
          <button
            key={l.code}
            type="button"
            role="menuitem"
            className="dropdown-item"
            aria-current={l.code === current}
            onClick={() => {
              close();
              router.replace(pathname, { locale: l.code as Locale });
            }}
          >
            <span>{l.nativeName}</span>
            <small>{l.code.toUpperCase()}</small>
          </button>
        ))
      }
    </Dropdown>
  );
}
