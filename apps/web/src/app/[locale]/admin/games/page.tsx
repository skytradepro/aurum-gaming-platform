import { FootballCheck } from '@/components/admin/FootballCheck';
import { GameRulesForm } from '@/components/admin/GameRulesForm';
import { MyGameRulesForm } from '@/components/admin/MyGameRulesForm';
import type { MyRules } from '@/components/admin/MyGameRulesForm';
import type { GameRules } from '@/components/admin/GameRulesForm';
import { serverApiFetch } from '@/lib/api-server';
import { getSessionUser } from '@/lib/auth';
import { isLocale } from '@aurum/i18n';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function AdminGamesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations('admin');
  const user = await getSessionUser();
  if (user?.role === 'admin') {
    try {
      return <MyGameRulesForm data={await serverApiFetch<MyRules>('/admin/my-game-rules', { locale })} />;
    } catch {
      return <p>{t('noAccess')}</p>;
    }
  }
  if (!user || user.role !== 'super_admin') return <p>{t('noAccess')}</p>;
  try {
    const { settings } = await serverApiFetch<{ settings: GameRules }>('/admin/settings', { locale });
    return (
      <>
        <GameRulesForm rules={settings} />
        <FootballCheck />
      </>
    );
  } catch {
    return <p>{t('noAccess')}</p>;
  }
}
