'use client';

import { usePathname } from '@/i18n/routing';
import { useLocale } from 'next-intl';
import { useEffect } from 'react';

/**
 * Staff sessions end after 2 hours without activity (SESSION_STAFF_IDLE_MINUTES). When that happens, admin pages must not
 * keep showing old screens with empty lists: this sends the browser to the SkyX sign-in instead.
 * Checked on every admin navigation and when the tab gets focus again (no background polling, so an
 * open tab does not keep an idle session alive).
 */
export function AdminSessionGuard() {
  const locale = useLocale();
  const pathname = usePathname();

  useEffect(() => {
    let stopped = false;
    async function check() {
      try {
        const res = await fetch('/api/v1/auth/me', { credentials: 'include', cache: 'no-store' });
        if (!stopped && res.status === 401) window.location.assign(`/${locale}/skyx`);
      } catch {
        /* network hiccup: try again on the next check */
      }
    }
    void check();
    const onFocus = () => void check();
    window.addEventListener('focus', onFocus);
    return () => {
      stopped = true;
      window.removeEventListener('focus', onFocus);
    };
  }, [locale, pathname]);

  return null;
}
