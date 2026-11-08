import { serverApiFetch } from '@/lib/api-server';
import { formatDateTime, isLocale } from '@aurum/i18n';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function AdminAuditPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations('admin');
  let items: { id: string; at: string; action: string; targetType: string | null; targetId: string | null }[] = [];
  try {
    const page = await serverApiFetch<{ items: typeof items }>('/admin/audit?limit=100', { locale });
    items = page.items;
  } catch {
    items = [];
  }

  return (
    <>
      <h2>{t('audit')}</h2>
      {items.length === 0 ? <p>{t('noAccess')}</p> : null}
      <table className="card" style={{ width: '100%', fontSize: '0.85rem' }}>
        <thead>
          <tr>
            <th>When</th>
            <th>Action</th>
            <th>Target</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.id}>
              <td>{formatDateTime(row.at, locale, { withTime: true })}</td>
              <td>{row.action}</td>
              <td>
                {row.targetType ?? '—'}/{row.targetId ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
