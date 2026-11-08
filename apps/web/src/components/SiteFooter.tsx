import { MailIcon, TelegramIcon, WhatsAppIcon } from '@/components/ContactIcons';
import { Icon } from '@/components/Icon';
import { CurrencyConverter, MarketTicker } from '@/components/MarketWidgets';
import { Link } from '@/i18n/routing';
import { CONTACT } from '@/lib/contact';
import type { Locale } from '@aurum/i18n';
import { getTranslations } from 'next-intl/server';

const LEGAL = [
  { slug: 'about-us', key: 'aboutUs' as const },
  { slug: 'privacy-policy', key: 'privacyPolicy' as const },
  { slug: 'terms-and-conditions', key: 'termsConditions' as const },
  { slug: 'responsible-gaming', key: 'responsibleGaming' as const },
  { slug: 'sportsbook-rules', key: 'sportsbookRules' as const },
];

export async function SiteFooter({ locale }: { locale: Locale }) {
  const t = await getTranslations('footer');
  const tn = await getTranslations('nav');
  const tm = await getTranslations('meta');
  const ta = await getTranslations('appInstall');
  const ts = await getTranslations('skyx');
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <MarketTicker locale={locale} />
      <div className="site-footer-inner">
        <div className="footer-col">
          <span className="site-logo" style={{ marginBottom: '0.8rem' }}>
            <img className="site-logo-mark site-logo-img" src="/media/hannibal-logo-192.png" alt="" width={44} height={44} />
            <span className="site-logo-text">{tm('logoText')}</span>
          </span>
          <p className="footer-age">{t('ageNotice')}</p>
          <div className="footer-social" aria-label={t('contact')}>
            <a className="is-wa" href={CONTACT.whatsapp.href} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp">
              <WhatsAppIcon size={22} />
            </a>
            <a className="is-tg" href={CONTACT.telegram.href} target="_blank" rel="noopener noreferrer" aria-label="Telegram">
              <TelegramIcon size={22} />
            </a>
            <a className="is-mail" href={CONTACT.email.href} aria-label="Email">
              <MailIcon size={20} />
            </a>
            <Link href="/skyx" className="footer-skyx" prefetch={false} rel="nofollow">
              <Icon name="shop" />
              {ts('footerLink')}
            </Link>
          </div>
        </div>

        <div className="footer-col">
          <h4>{t('gamesTitle')}</h4>
          <ul>
            <li>
              <Link href="/sports">{tn('sportsBetting')}</Link>
            </li>
            <li>
              <Link href="/live-betting">{tn('liveBetting')}</Link>
            </li>
            <li>
              <Link href="/casino">{tn('casino')}</Link>
            </li>
            <li>
              <Link href="/live-casino">{tn('liveCasino')}</Link>
            </li>
            <li>
              <Link href="/promotions">{t('promotions')}</Link>
            </li>
            <li>
              <Link href="/contact">{t('contact')}</Link>
            </li>
            <li>
              <Link href="/app" className="footer-app-link">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/media/app/icon-192.png" alt="" width={20} height={20} />
                {ta('footerLink')}
              </Link>
            </li>
          </ul>
        </div>

        <div className="footer-col">
          <h4>{t('legalTitle')}</h4>
          <ul>
            {LEGAL.map((item) => (
              <li key={item.slug}>
                <Link href={`/pages/${item.slug}`}>{t(item.key)}</Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="footer-col">
          <h4>{t('converter')}</h4>
          <CurrencyConverter locale={locale} />
        </div>

        <div className="footer-col">
          <h4>{t('paymentMethods')}</h4>
          <div className="footer-cash">
            <Icon name="cash" />
            <div>
              <strong>{t('cashTitle')}</strong>
              <p>{t('cashBody')}</p>
              <Link href="/shops" className="btn btn-ghost btn-sm">
                <Icon name="shop" />
                {t('findShop')}
              </Link>
            </div>
          </div>
        </div>

        <div className="footer-trust">
          <p>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="5" y="11" width="14" height="9" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
            {t('trustSeed')}
          </p>
          <p>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3 4 6v6c0 4.5 3.4 8.2 8 9 4.6-.8 8-4.5 8-9V6Z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
            {t('trustRng')}
          </p>
        </div>

        <div className="footer-bottom">
          <span className="age-badge" aria-label="18+">
            18+
          </span>
          <Link href="/pages/responsible-gaming" className="btn btn-ghost btn-sm">
            {t('playResponsibly')}
          </Link>
          <p className="site-footer-copy">{t('copyright', { year, name: 'Hannibal' })}</p>
        </div>
      </div>
    </footer>
  );
}
