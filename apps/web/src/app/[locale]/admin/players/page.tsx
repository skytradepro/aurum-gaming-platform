import { Link } from '@/i18n/routing';
import { serverApiFetch } from '@/lib/api-server';
import { findCurrency, formatAmountMinor } from '@/lib/money-display';
import type { PublicConfig } from '@/lib/types';
import { isLocale } from '@aurum/i18n';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

type PlayerRow = { id: string; accountNo: string; username: string; email?: string; firstName?: string; lastName?: string; status: string; accountCurrency: string | null; balance: { amountMinor: string; currency: string } | null; owner?: string | null };

export default async function AdminPlayersPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ q?: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations('admin');
  const tc = await getTranslations('adminContent');
  const tp = await getTranslations('adminPlayers');
  const q = ((await searchParams).q ?? '').trim().slice(0, 60);
  let items: PlayerRow[] = [];
  try {
    const page = await serverApiFetch<{ items: PlayerRow[] }>(`/admin/players?limit=100${q ? `&q=${encodeURIComponent(q)}` : ''}`, { locale });
    items = page.items;
  } catch {
    items = [];
  }
  const config = await serverApiFetch<PublicConfig>('/public/config', { locale }).catch(() => null);
  const money = (m: { amountMinor: string; currency: string }) => {
    const cur = findCurrency(config?.currencies ?? [], m.currency);
    return cur ? formatAmountMinor(m.amountMinor, cur, locale, 'full') : `${m.amountMinor} ${m.currency}`;
  };
  return (
    <>
      <div className="pl-head">
        <h2>{t('players')}</h2>
        <Link href="/admin/players/new" className="btn btn-gold btn-sm">
          {tc('createPlayer')}
        </Link>
      </div>
      <form className="card pl-search" method="get">
        <input name="q" defaultValue={q} placeholder={tp('searchPlaceholder')} aria-label={tp('searchPlaceholder')} maxLength={60} autoFocus />
        <button type="submit" className="btn btn-gold">
          {tp('search')}
        </button>
        {q ? (
          <Link href="/admin/players" className="btn btn-ghost">
            {tp('clear')}
          </Link>
        ) : null}
      </form>
      <p className="muted">{q ? tp('results', { count: items.length, q }) : tp('latest', { count: items.length })}</p>
      <div className="aw-table-wrap">
        <table className="aw-table">
          <thead>
            <tr>
              <th>{tp('account')}</th>
              <th>{tp('player')}</th>
              <th>{tp('status')}</th>
              <th>{tp('balance')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted">
                  {tp('none')}
                </td>
              </tr>
            ) : (
              items.map((p) => (
                <tr key={p.id}>
                  <td dir="ltr">{p.accountNo}</td>
                  <td>
                    <strong>{p.username}</strong>
                    {p.firstName || p.lastName ? <span className="muted"> · {`${p.firstName ?? ''} ${p.lastName ?? ''}`.trim()}</span> : null}
                    {p.email ? <div className="muted pl-email">{p.email}</div> : null}
                    {p.owner ? (
                      <div className="muted pl-email">
                        {tp('owner')}: <span dir="ltr">{p.owner}</span>
                      </div>
                    ) : null}
                  </td>
                  <td>{p.status}</td>
                  <td>{p.balance ? money(p.balance) : p.accountCurrency ?? '—'}</td>
                  <td>
                    <Link href={`/admin/players/${p.id}`} className="btn btn-gold btn-sm">
                      {tp('open')}
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
