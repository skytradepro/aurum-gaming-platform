'use client';

import { useMemo, useState } from 'react';

export type LedgerFilter = 'all' | 'sports' | 'casino' | 'deposit';

const DEPOSIT_TYPES = new Set(['deposit', 'deposit_crypto', 'welcome_gift', 'bonus_credit', 'adjustment_credit']);
const BET_TYPES = new Set(['bet_stake', 'bet_win', 'bet_refund']);

export type PlayerLedgerRow = {
  id: string;
  createdAtLabel: string;
  typeLabel: string;
  amountLabel: string;
  balanceBeforeLabel: string;
  balanceAfterLabel: string;
  detail: string;
  operator: string;
  entryType: string;
  reference: string | null;
};

function rowMatches(row: PlayerLedgerRow, filter: LedgerFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'deposit') return DEPOSIT_TYPES.has(row.entryType);
  if (filter === 'sports') return BET_TYPES.has(row.entryType) && (row.reference?.startsWith('bet:') ?? false);
  if (filter === 'casino') return BET_TYPES.has(row.entryType) && !(row.reference?.startsWith('bet:') ?? false);
  return true;
}

export type AdminPlayerLedgerLabels = Record<LedgerFilter, string> & {
  colDate: string;
  colType: string;
  colAmount: string;
  colBefore: string;
  colAfter: string;
  colDetail: string;
  colOperator: string;
};

export function AdminPlayerLedger({
  rows,
  labels,
  empty,
}: {
  rows: PlayerLedgerRow[];
  labels: AdminPlayerLedgerLabels;
  empty: string;
}) {
  const [filter, setFilter] = useState<LedgerFilter>('all');
  const filtered = useMemo(() => rows.filter((r) => rowMatches(r, filter)), [rows, filter]);
  const tabs: LedgerFilter[] = ['all', 'sports', 'casino', 'deposit'];

  return (
    <div className="admin-player-ledger">
      <div className="admin-ledger-tabs" role="tablist" aria-label={labels.all}>
        {tabs.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={filter === key}
            className={filter === key ? 'is-active' : undefined}
            onClick={() => setFilter(key)}
          >
            {labels[key]}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <p className="muted">{empty}</p>
      ) : (
        <div className="table-scroll">
          <table className="admin-dash-table admin-player-ledger-table">
            <thead>
              <tr>
                <th>{labels.colDate}</th>
                <th>{labels.colType}</th>
                <th>{labels.colAmount}</th>
                <th>{labels.colBefore}</th>
                <th>{labels.colAfter}</th>
                <th>{labels.colDetail}</th>
                <th>{labels.colOperator}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id}>
                  <td>{e.createdAtLabel}</td>
                  <td>{e.typeLabel}</td>
                  <td dir="ltr">{e.amountLabel}</td>
                  <td dir="ltr">{e.balanceBeforeLabel}</td>
                  <td dir="ltr">{e.balanceAfterLabel}</td>
                  <td>{e.detail}</td>
                  <td>{e.operator}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
