import { MailIcon, TelegramIcon, WhatsAppIcon } from '@/components/ContactIcons';
import { CONTACT } from '@/lib/contact';
import { isLocale } from '@aurum/i18n';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: 'contact' });
  return { title: t('title') };
}

export default async function ContactPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations('contact');

  const channels = [
    { key: 'whatsapp', cls: 'is-wa', icon: <WhatsAppIcon size={40} />, name: 'WhatsApp', value: CONTACT.whatsapp.display, href: CONTACT.whatsapp.href, cta: t('whatsappCta'), note: t('whatsappNote') },
    { key: 'telegram', cls: 'is-tg', icon: <TelegramIcon size={40} />, name: 'Telegram', value: CONTACT.telegram.display, href: CONTACT.telegram.href, cta: t('telegramCta'), note: t('telegramNote') },
    { key: 'email', cls: 'is-mail', icon: <MailIcon size={36} />, name: t('email'), value: CONTACT.email.display, href: CONTACT.email.href, cta: t('emailCta'), note: t('emailNote') },
  ];

  return (
    <section className="contact-page">
      <header className="contact-hero">
        <h1 className="page-title">{t('title')}</h1>
        <p>{t('subtitle')}</p>
      </header>
      <div className="contact-grid">
        {channels.map((c) => {
          const external = c.href.startsWith('https://');
          return (
            <a
              key={c.key}
              className={`contact-card ${c.cls}`}
              href={c.href}
              target={external ? '_blank' : undefined}
              rel={external ? 'noopener noreferrer' : undefined}
            >
              <span className="contact-icon">{c.icon}</span>
              <span className="contact-name">{c.name}</span>
              <span className="contact-value" dir="ltr">{c.value}</span>
              <span className="contact-note">{c.note}</span>
              <span className="btn btn-gold btn-sm contact-cta">{c.cta}</span>
            </a>
          );
        })}
      </div>
    </section>
  );
}
