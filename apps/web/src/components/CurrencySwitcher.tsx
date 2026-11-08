'use client';

import { SITE_COOKIE_DISPLAY_CURRENCY } from '@/lib/config';
import type { CurrencyDTO } from '@/lib/types';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Dropdown } from './Dropdown';

/** Display currency only: it never converts or moves any money, it changes how demo amounts are shown. */
export function CurrencySwitcher({ currencies, locale, initial }: { currencies: CurrencyDTO[]; locale: string; initial: string }) {
  const t = useTranslations('common');
  const router = useRouter();
  const [code, setCode] = useState(initial);

  useEffect(() => setCode(initial), [initial]);

  function choose(next: string) {
    setCode(next);
    document.cookie = `${SITE_COOKIE_DISPLAY_CURRENCY}=${encodeURIComponent(next)}; path=/; max-age=31536000; samesite=lax`;
    window.dispatchEvent(new CustomEvent('aurum-currency', { detail: next }));
    router.refresh();
  }

  if (currencies.length === 0) return null;

  return (
    <Dropdown label={t('currency')} trigger={<span>{code}</span>}>
      {(close) =>
        currencies.map((c) => (
          <button
            key={c.code}
            type="button"
            role="menuitem"
            className="dropdown-item"
            aria-current={c.code === code}
            onClick={() => {
              close();
              choose(c.code);
            }}
          >
            <span>{c.names[locale as 'en'] ?? c.code}</span>
            <small>{c.code}</small>
          </button>
        ))
      }
    </Dropdown>
  );
}
