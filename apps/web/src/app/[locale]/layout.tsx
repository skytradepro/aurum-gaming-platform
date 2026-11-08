import { LOCALES, getDirection, isLocale } from '@aurum/i18n';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { LaunchDialog } from '@/components/LaunchDialog';
import { MustChangePasswordGuard } from '@/components/MustChangePasswordGuard';
import { SiteFooter } from '@/components/SiteFooter';
import type { PublicRate } from '@/lib/rates';
import { SiteHeader } from '@/components/SiteHeader';
import { ApprovalAlert } from '@/components/ApprovalAlert';
import { AppInstall } from '@/components/AppInstall';
import { AiAssistant, AiHologram, SiteAmbient, SiteToasts } from '@/components/DeferredSiteWidgets';
import { getSessionUser } from '@/lib/auth';
import { apiFetch } from '@/lib/api';
import { serverApiFetch } from '@/lib/api-server';
import { findCurrency, formatAmountMinor } from '@/lib/money-display';
import { getDisplayCurrency, getTheme } from '@/lib/display-currency';
import type { PublicConfig } from '@/lib/types';
import '@/styles/globals.css';
import '@/styles/premium.css';
import { Cairo, Cinzel, Manrope, Playfair_Display } from 'next/font/google';

const fontDisplay = Cinzel({ subsets: ['latin', 'latin-ext'], weight: ['600', '700', '800', '900'], variable: '--ff-display', display: 'swap' });
const fontBody = Manrope({ subsets: ['latin', 'latin-ext', 'cyrillic'], weight: ['400', '500', '600', '700', '800'], variable: '--ff-body', display: 'swap' });
const fontCyrillic = Playfair_Display({ subsets: ['cyrillic', 'latin'], weight: ['600', '700', '800', '900'], variable: '--ff-display-cyr', display: 'swap' });
const fontArabic = Cairo({ subsets: ['arabic', 'latin', 'latin-ext'], weight: ['400', '600', '700', '800', '900'], variable: '--ff-arabic', display: 'swap' });

export const metadata = {
  icons: {
    icon: [
      { url: '/media/hannibal-logo-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/media/hannibal-logo-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: { url: '/media/app/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
  },
  // the HANNIBAL app: the website on the phone's home screen (manifest in app/manifest.ts)
  appleWebApp: { capable: true, title: 'HANNIBAL', statusBarStyle: 'black' as const },
};

export const viewport = { themeColor: '#0b0806' };

/** Start screen of the installed app: shown once per opening (see .app-splash in globals.css). */
const SPLASH_ONCE = "try{if(sessionStorage.getItem('hb-splash-seen'))document.documentElement.classList.add('no-splash')}catch(e){}";

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const messages = await getMessages();
  const t = await getTranslations('common');
  const dir = getDirection(locale);
  const user = await getSessionUser();
  const theme = await getTheme();

  let config: PublicConfig | null = null;
  try {
    config = await apiFetch<PublicConfig>('/public/config', { locale });
  } catch {
    config = null;
  }
  let rates: PublicRate[] = [];
  try {
    rates = (await apiFetch<{ items: PublicRate[] }>('/public/rates', { locale })).items;
  } catch {
    rates = [];
  }
  const display = await getDisplayCurrency(config?.currencies ?? []);

  // a shop admin always sees, in the header, the balance the Super Admin gave him
  let staffCredit: { text: string; empty: boolean } | null = null;
  if (user?.role === 'admin') {
    try {
      const mine = await serverApiFetch<{ limited: boolean; balances: { amountMinor: string; currency: string }[] }>('/admin/me/credit', { locale });
      const currencies = config?.currencies ?? [];
      const show = (m: { amountMinor: string; currency: string }) => {
        const cur = findCurrency(currencies, m.currency);
        return cur ? formatAmountMinor(m.amountMinor, cur, locale, 'full') : `${m.amountMinor} ${m.currency}`;
      };
      const nonZero = mine.balances.filter((b) => b.amountMinor !== '0');
      const first = currencies[0];
      staffCredit = {
        empty: nonZero.length === 0,
        text: nonZero.length > 0 ? nonZero.map(show).join(' · ') : first ? show({ amountMinor: '0', currency: first.code }) : '0',
      };
    } catch {
      staffCredit = null;
    }
  }
  const fontClass =
    locale === 'ar'
      ? `${fontBody.variable} ${fontArabic.variable}`
      : locale === 'ru'
        ? `${fontBody.variable} ${fontCyrillic.variable}`
        : `${fontDisplay.variable} ${fontBody.variable}`;

  return (
    <html lang={locale} dir={dir} data-theme={theme} className={fontClass} suppressHydrationWarning>
      <body className="site-body">
        <script dangerouslySetInnerHTML={{ __html: SPLASH_ONCE }} />
        <div className="app-splash" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/media/hannibal-logo-512.png" alt="" width={150} height={150} />
          <b>HANNIBAL</b>
          <small>CASINO · SPORTS BETTING</small>
          <span className="app-splash-bar" />
        </div>
        <NextIntlClientProvider messages={messages}>
          <a href="#main" className="skip-link">
            {t('skipToContent')}
          </a>
          <SiteAmbient />
          <MustChangePasswordGuard user={user} />
          <SiteHeader locale={locale} user={user} config={config} displayCurrency={display?.code ?? ''} rates={rates} staffCredit={staffCredit} />
          <main id="main" className="site-main">
            {children}
          </main>
          <SiteFooter locale={locale} />
          {user?.role === 'user' ? <ApprovalAlert currencies={config?.currencies ?? []} locale={locale} /> : null}
          <LaunchDialog />
          <AiAssistant />
          <AiHologram />
          <SiteToasts />
          <AppInstall />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
