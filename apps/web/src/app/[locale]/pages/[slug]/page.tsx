import { apiFetch } from '@/lib/api';
import { PAGE_SLUGS } from '@aurum/shared';
import { isLocale } from '@aurum/i18n';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function LegalPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  if (!(PAGE_SLUGS as readonly string[]).includes(slug)) notFound();
  setRequestLocale(locale);
  const tLegal = await getTranslations('legal');

  let page: { title: string; body: string };
  try {
    ({ page } = await apiFetch<{ page: { title: string; body: string } }>(`/public/pages/${slug}?locale=${locale}`, { locale }));
  } catch {
    notFound();
  }

  return (
    <article className="card" style={{ maxWidth: 860, margin: '0 auto' }}>
      <h1 style={{ marginTop: 0 }}>{page.title}</h1>
      {/* Plain text only: page bodies are stored as text and are never rendered as HTML. */}
      <p className="prose">{page.body?.trim() ? page.body : tLegal('pending')}</p>
    </article>
  );
}
