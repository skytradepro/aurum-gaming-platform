import { redirect } from '@/i18n/routing';
import { getSessionUser, isCashier } from '@/lib/auth';
import { isLocale } from '@aurum/i18n';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function ShopLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const user = await getSessionUser();
  if (!user) return redirect({ href: '/login', locale });
  if (!isCashier(user)) return redirect({ href: '/account', locale });
  const t = await getTranslations('shop');
  return (
    <>
      <h1>{t('title')}</h1>
      {children}
    </>
  );
}
