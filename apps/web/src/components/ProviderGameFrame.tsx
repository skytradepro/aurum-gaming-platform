'use client';

import '@/styles/games-fx.css';
import { errorMessageKey, type Locale } from '@aurum/i18n';
import { ApiError, apiClient } from '@/lib/api';
import { Link } from '@/i18n/routing';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

const PRECONNECT = ['https://apipl.lxgame.io', 'https://common-static.ppgames.net', 'https://pp.gitslotgameicons.com'] as const;

/** Opens a provider game: asks the API for a launch URL and shows the original game in an iframe. */
export function ProviderGameFrame({
  slug,
  name,
  provider,
  initialLaunchUrl = null,
}: {
  slug: string;
  name: string;
  provider: string;
  initialLaunchUrl?: string | null;
}) {
  const t = useTranslations('casino');
  const tRoot = useTranslations();
  const locale = useLocale() as Locale;
  const [url, setUrl] = useState<string | null>(initialLaunchUrl);
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signIn, setSignIn] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    for (const href of PRECONNECT) {
      if (document.querySelector(`link[rel="preconnect"][href="${href}"]`)) continue;
      const link = document.createElement('link');
      link.rel = 'preconnect';
      link.href = href;
      link.crossOrigin = 'anonymous';
      document.head.appendChild(link);
    }
  }, []);

  useEffect(() => {
    document.body.classList.add('is-provider-play');
    const mq = window.matchMedia('(min-width: 900px)');
    const apply = () => setIsDesktop(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => {
      document.body.classList.remove('is-provider-play');
      mq.removeEventListener('change', apply);
    };
  }, []);

  /** Mount iframe after layout paint (at most ~100ms wait). */
  useEffect(() => {
    if (!url) {
      setIframeUrl(null);
      return;
    }
    let cancelled = false;
    let done = false;
    const finish = () => {
      if (cancelled || done) return;
      done = true;
      setIframeUrl(url);
    };
    const el = box.current;
    if (el && el.clientWidth >= 320 && el.clientHeight >= 280) finish();
    else requestAnimationFrame(() => requestAnimationFrame(finish));
    const timer = window.setTimeout(finish, 100);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [url]);

  useEffect(() => {
    if (initialLaunchUrl) return;
    let alive = true;
    const returnUrl = `${window.location.origin}/${locale}/casino`;
    apiClient<{ url: string }>(`/games/${slug}/launch`, { method: 'POST', locale, json: { language: locale, returnUrl } })
      .then((r) => alive && setUrl(r.url))
      .catch((e: unknown) => {
        if (!alive) return;
        if (e instanceof ApiError && (e.status === 401 || e.code === 'forbidden')) setSignIn(true);
        else if (e instanceof ApiError && e.code === 'provider_unavailable') {
          setError(t('launchProviderFailed'));
        } else setError(e instanceof ApiError ? tRoot(errorMessageKey(e.code) as never) : tRoot('errors.generic' as never));
      });
    return () => {
      alive = false;
    };
  }, [slug, locale, tRoot, initialLaunchUrl]);

  return (
    <div className={isDesktop ? 'pgf pgf--desktop' : 'pgf'}>
      <div className="pgf-bar">
        <Link href="/casino" className="btn btn-ghost btn-sm">
          {t('backToLobby')}
        </Link>
        <div className="pgf-title">
          <strong>{name}</strong>
          <span>{provider}</span>
        </div>
        <button type="button" className="btn btn-gold btn-sm" disabled={!iframeUrl} onClick={() => void box.current?.requestFullscreen?.()}>
          {t('fullscreen')}
        </button>
      </div>
      <div className="pgf-stage" ref={box}>
        {iframeUrl ? (
          <iframe src={iframeUrl} title={name} allow="autoplay; fullscreen; encrypted-media" allowFullScreen referrerPolicy="origin" />
        ) : url ? (
          <div className="pgf-msg">
            <span className="pgf-spin" aria-hidden />
            <p>{t('playLoading')}</p>
          </div>
        ) : signIn ? (
          <div className="pgf-msg">
            <p>{t('playSignIn')}</p>
            <Link href="/login" className="btn btn-gold">
              {tRoot('nav.login' as never)}
            </Link>
          </div>
        ) : error ? (
          <div className="pgf-msg">
            <p>{error}</p>
          </div>
        ) : (
          <div className="pgf-msg">
            <span className="pgf-spin" aria-hidden />
            <p>{t('playLoading')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
