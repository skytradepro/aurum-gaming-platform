import { VideosManager } from '@/components/admin/VideosManager';
import { serverApiFetch } from '@/lib/api-server';
import type { VideoSlots } from '@/lib/videos';
import { isLocale } from '@aurum/i18n';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function AdminVideosPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations('admin');
  const tv = await getTranslations('adminVideos');
  let slots: VideoSlots | null = null;
  try {
    slots = (await serverApiFetch<{ slots: VideoSlots }>('/admin/videos', { locale })).slots;
  } catch {
    slots = null;
  }
  return (
    <>
      <h2>{tv('title')}</h2>
      {slots ? <VideosManager initial={slots} /> : <div className="alert alert-error">{t('noAccess')}</div>}
    </>
  );
}
