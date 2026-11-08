'use client';

import { TelegramIcon, WhatsAppIcon } from '@/components/ContactIcons';
import { CONTACT } from '@/lib/contact';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export interface BankDetails {
  accountName: string;
  iban: string;
  bankName: string;
  bankAddress: string;
  bic: string;
  reference: string;
}

/** IBAN in groups of four, as printed by banks. */
const groupIban = (iban: string) => iban.replace(/(.{4})/g, '$1 ').trim();

function CopyRow({ label, value, shown, strong = false }: { label: string; value: string; shown?: string; strong?: boolean }) {
  const t = useTranslations('deposit');
  const [done, setDone] = useState(false);
  return (
    <div className={strong ? 'bank-row is-ref' : 'bank-row'}>
      <span className="bank-label">{label}</span>
      <span className="bank-value" dir="ltr">
        {shown ?? value}
      </span>
      <button
        type="button"
        className="btn btn-ghost btn-sm bank-copy"
        aria-label={`${t('copy')}: ${label}`}
        onClick={() => {
          void navigator.clipboard?.writeText(value).then(() => {
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          });
        }}
      >
        {done ? t('copied') : t('copy')}
      </button>
    </div>
  );
}

/** Bank transfer deposit: the account details and the player's own payment reference. */
export function BankDeposit({ bank }: { bank: BankDetails }) {
  const t = useTranslations('deposit');
  return (
    <div className="card bank-card">
      <h3 className="bank-title">{t('bankTitle')}</h3>
      <p className="bank-eur" role="note">
        <b>€ EUR</b>
        {t('eurOnly')}
      </p>
      <ol className="bank-steps">
        <li>{t('bankStep1')}</li>
        <li>{t('bankStep2')}</li>
        <li>{t('bankStep3')}</li>
        <li>{t('bankStep4')}</li>
      </ol>
      <div className="bank-rows">
        <div className="bank-row">
          <span className="bank-label">{t('currency')}</span>
          <span className="bank-value" dir="ltr">
            EUR (€)
          </span>
        </div>
        <CopyRow label={t('accountName')} value={bank.accountName} />
        <CopyRow label={t('iban')} value={bank.iban} shown={groupIban(bank.iban)} />
        <CopyRow label={t('bic')} value={bank.bic} />
        <CopyRow label={t('bankName')} value={bank.bankName} />
        <CopyRow label={t('bankAddress')} value={bank.bankAddress} />
        <CopyRow label={t('reference')} value={bank.reference} strong />
      </div>
      <p className="bank-note">{t('referenceNote')}</p>
      <div className="bank-support">
        <p>{t('afterPayment')}</p>
        <div className="bank-support-links">
          <a className="bank-wa" href={`${CONTACT.whatsapp.href}?text=${encodeURIComponent(t('supportMessage', { reference: bank.reference }))}`} target="_blank" rel="noopener noreferrer">
            <WhatsAppIcon size={22} />
            WhatsApp
          </a>
          <a className="bank-tg" href={CONTACT.telegram.href} target="_blank" rel="noopener noreferrer">
            <TelegramIcon size={22} />
            Telegram
          </a>
        </div>
      </div>
    </div>
  );
}
