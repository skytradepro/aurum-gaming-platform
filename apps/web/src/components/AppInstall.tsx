'use client';

import { usePathname, useRouter } from '@/i18n/routing';
import { promptAppInstall, startAppInstall, useAppInstall } from '@/lib/app-install';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

/** Pages without the app button: inside a game, admin, shop, staff entrance, password change and the app page itself. */
const NO_BUTTON = /^\/(?:admin|shop|skyx|change-password|app)(?:\/|$)|^\/casino\/(?!$)/;
const SMALL_KEY = 'hb-app-bar-small';
const SPLASH_KEY = 'hb-splash-seen';

/**
 * Starts the web app (service worker + install prompt) and keeps an "install the app" button always
 * visible on the website until the app is installed: the gold bar, or (after ✕) a small gold round button.
 */
export function AppInstall() {
  const t = useTranslations('appInstall');
  const pathname = usePathname();
  const router = useRouter();
  const app = useAppInstall();
  const [small, setSmall] = useState(false);

  useEffect(() => {
    startAppInstall();
    try {
      setSmall(sessionStorage.getItem(SMALL_KEY) === '1');
      // the start screen of the installed app is shown once per opening
      sessionStorage.setItem(SPLASH_KEY, '1');
    } catch {
      // private mode: nothing to remember
    }
  }, []);

  const show = app.ready && !app.standalone && !app.installed && !NO_BUTTON.test(pathname);
  if (!show) return null;

  async function install() {
    if (app.canPrompt) {
      await promptAppInstall();
      return;
    }
    router.push('/app');
  }

  function shrink() {
    setSmall(true);
    try {
      sessionStorage.setItem(SMALL_KEY, '1');
    } catch {
      // private mode: only for this page
    }
  }

  if (small) {
    return (
      <button type="button" className="app-mini" onClick={() => void install()} aria-label={t('barTitle')}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/media/app/apple-touch-icon.png" alt="" width={30} height={30} />
        <span>{t('mini')}</span>
      </button>
    );
  }

  return (
    <div className="app-bar" role="region" aria-label={t('barTitle')}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/media/app/apple-touch-icon.png" alt="" width={46} height={46} />
      <div className="app-bar-text">
        <b>{t('barTitle')}</b>
        <small>{t('barSub')}</small>
      </div>
      <button type="button" className="app-bar-go" onClick={() => void install()}>
        {t('install')}
      </button>
      <button type="button" className="app-bar-x" aria-label={t('close')} onClick={shrink}>
        ✕
      </button>
    </div>
  );
}
