import { BankDeposit, type BankDetails } from '@/components/BankDeposit';
import { CryptoDeposit } from '@/components/CryptoDeposit';
import { DepositTabs } from '@/components/DepositTabs';
import type { DepositView, NetworkView } from '@/components/CryptoDeposit';
import { Link } from '@/i18n/routing';
import { serverApiFetch } from '@/lib/api-server';
import type { PublicConfig } from '@/lib/types';
import { isLocale } from '@aurum/i18n';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function DepositsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations('crypto');
  let networks: NetworkView[] = [];
  let deposits: DepositView[] = [];
  let config: PublicConfig | null = null;
  try {
    config = await serverApiFetch<PublicConfig>('/public/config', { locale });
    networks = (await serverApiFetch<{ items: NetworkView[] }>('/crypto/networks', { locale })).items;
    deposits = (await serverApiFetch<{ items: DepositView[] }>('/crypto/deposits', { locale })).items;
  } catch {
    networks = [];
  }
  let bank: BankDetails | null = null;
  try {
    const b = await serverApiFetch<({ available: true } & BankDetails) | { available: false }>('/account/deposit/bank', { locale });
    bank = b.available ? { accountName: b.accountName, iban: b.iban, bankName: b.bankName, bankAddress: b.bankAddress, bic: b.bic, reference: b.reference } : null;
  } catch {
    bank = null;
  }
  return (
    <>
      <h2>{t('title')}</h2>
      <div className="card" style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <strong>{t('cashTitle')}</strong>
          <p className="muted" style={{ margin: '0.2rem 0 0' }}>{t('cashBody')}</p>
        </div>
        <Link href="/shops" className="btn btn-ghost btn-sm">
          {t('findShop')}
        </Link>
      </div>
      <DepositTabs
        crypto={networks.length > 0 ? <CryptoDeposit networks={networks} initial={deposits} currencies={config?.currencies ?? []} locale={locale} /> : null}
        bank={bank ? <BankDeposit bank={bank} /> : null}
      />
    </>
  );
}
