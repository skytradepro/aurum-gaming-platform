'use client';

import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';

type Method = 'crypto' | 'bank';

/** Deposit methods as tabs: crypto and bank transfer (only the methods that are available are shown). */
export function DepositTabs({ crypto, bank }: { crypto: ReactNode | null; bank: ReactNode | null }) {
  const t = useTranslations('deposit');
  const methods = (['crypto', 'bank'] as const).filter((m) => (m === 'crypto' ? crypto : bank) !== null);
  const [method, setMethod] = useState<Method>(methods[0] ?? 'crypto');
  if (methods.length === 0) return <p className="muted">{t('noneAvailable')}</p>;
  return (
    <div className="deposit-tabs">
      {methods.length > 1 ? (
        <div className="deposit-tab-bar" role="tablist">
          {methods.map((m) => (
            <button key={m} type="button" role="tab" aria-selected={method === m} className={method === m ? 'deposit-tab on' : 'deposit-tab'} onClick={() => setMethod(m)}>
              <span aria-hidden="true">{m === 'crypto' ? '₿' : '🏦'}</span>
              {m === 'crypto' ? t('tabCrypto') : t('tabBank')}
            </button>
          ))}
        </div>
      ) : null}
      <div role="tabpanel">{method === 'crypto' ? crypto : bank}</div>
    </div>
  );
}
