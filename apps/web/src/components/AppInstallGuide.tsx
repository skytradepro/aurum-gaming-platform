'use client';

import { promptAppInstall, startAppInstall, useAppInstall } from '@/lib/app-install';
import type { AppPlatform } from '@/lib/app-install';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12" />
      <path d="m7.5 7.5 4.5-4.5 4.5 4.5" />
      <path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
    </svg>
  );
}

function AddIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="5" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="19" r="2" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
      <path d="M10.5 18.5h3" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

/** The install page: one button where the browser allows it, otherwise the steps for iPhone or Samsung / Android. */
export function AppInstallGuide() {
  const t = useTranslations('appInstall');
  const app = useAppInstall();
  const [tab, setTab] = useState<AppPlatform>('android');
  const [chosen, setChosen] = useState(false);

  useEffect(() => {
    startAppInstall();
  }, []);
  useEffect(() => {
    if (app.ready && !chosen) setTab(app.platform === 'ios' ? 'ios' : 'android');
  }, [app.ready, app.platform, chosen]);

  const pick = (p: AppPlatform) => {
    setTab(p);
    setChosen(true);
  };

  const iosSteps = [
    { icon: <PhoneIcon />, text: t('iosStep1') },
    { icon: <ShareIcon />, text: t('iosStep2') },
    { icon: <AddIcon />, text: t('iosStep3') },
    { icon: <CheckIcon />, text: t('iosStep4') },
  ];
  const androidSteps = [
    { icon: <PhoneIcon />, text: t('androidStep1') },
    { icon: <MenuIcon />, text: t('androidStep2') },
    { icon: <AddIcon />, text: t('androidStep3') },
    { icon: <CheckIcon />, text: t('androidStep4') },
  ];
  const steps = tab === 'ios' ? iosSteps : androidSteps;
  const done = app.standalone || app.installed;

  return (
    <div className="app-guide">
      <section className="card app-guide-head">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/media/app/apple-touch-icon.png" alt="" width={84} height={84} />
        <div>
          <h1>{t('title')}</h1>
          <p className="muted">{t('subtitle')}</p>
        </div>
      </section>

      {done ? (
        <div className="alert alert-success app-guide-done">
          <b>{t('installed')}</b>
          <span>{t('installedHint')}</span>
        </div>
      ) : null}

      {!done && app.canPrompt ? (
        <button type="button" className="btn btn-gold btn-lg app-guide-install" onClick={() => void promptAppInstall()}>
          {t('installNow')}
        </button>
      ) : null}

      {!done ? (
        <section className="card app-guide-steps">
          <div className="app-guide-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'ios'} className={tab === 'ios' ? 'on' : undefined} onClick={() => pick('ios')}>
              {t('tabIphone')}
            </button>
            <button type="button" role="tab" aria-selected={tab !== 'ios'} className={tab !== 'ios' ? 'on' : undefined} onClick={() => pick('android')}>
              {t('tabAndroid')}
            </button>
          </div>
          {app.ready && app.platform === 'desktop' ? <p className="muted app-guide-desktop">{t('desktop')}</p> : null}
          <ol>
            {steps.map((s, i) => (
              <li key={i}>
                <span className="app-guide-num">{i + 1}</span>
                <span className="app-guide-icon">{s.icon}</span>
                <span>{s.text}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <section className="card app-guide-notes">
        <p>{t('sameAsSite')}</p>
        <p className="muted">{t('signInOnce')}</p>
      </section>
    </div>
  );
}
