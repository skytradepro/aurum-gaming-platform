import { AppInstallGuide } from '@/components/AppInstallGuide';
import { isLocale } from '@aurum/i18n';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: 'appInstall' });
  return { title: t('title'), description: t('subtitle') };
}

/** How to install the HANNIBAL app (the website on the home screen) on iPhone and Samsung / Android. */
export default async function AppPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return <AppInstallGuide />;
}
