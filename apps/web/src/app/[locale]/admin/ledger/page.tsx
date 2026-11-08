import { serverApiFetch } from '@/lib/api-server';
import { isLocale } from '@aurum/i18n';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function AdminLedgerPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations('admin');
  let items: { id: string; username: string; entryType: string; amount: { amountMinor: string; currency: string }; createdAt: string }[] = [];
  try {
    const page = await serverApiFetch<{ items: typeof items }>('/admin/ledger?limit=50', { locale });
    items = page.items;
  } catch {
    items = [];
  }
  return (
    <>
      <h2>{t('ledger')}</h2>
      <table className="card" style={{ width: '100%' }}>
        <thead>
          <tr>
            <th>Date</th>
            <th>User</th>
            <th>Type</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((e) => (
            <tr key={e.id}>
              <td>{e.createdAt}</td>
              <td>{e.username}</td>
              <td>{e.entryType}</td>
              <td>
                {e.amount.amountMinor} {e.amount.currency}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
