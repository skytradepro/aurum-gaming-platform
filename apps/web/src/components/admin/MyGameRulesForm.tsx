'use client';

import { errorMessageKey } from '@aurum/i18n';
import { GAME_IDS } from '@aurum/shared';
import { ApiError, apiClient } from '@/lib/api';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export interface MyRules {
  rules: { maxStake: number | null; maxWin: number | null; disabled: string[] };
  site: { maxStake: number; maxWin: number };
}

/** An admin's own game rules for the players he owns. They can only be stricter than the site-wide rules. */
export function MyGameRulesForm({ data }: { data: MyRules }) {
  const t = useTranslations('adminContent');
  const tg = useTranslations('games');
  const tw = useTranslations('wheel');
  const tRoot = useTranslations();
  const router = useRouter();
  const [maxStake, setMaxStake] = useState(data.rules.maxStake === null ? '' : String(data.rules.maxStake));
  const [maxWin, setMaxWin] = useState(data.rules.maxWin === null ? '' : String(data.rules.maxWin));
  const [disabled, setDisabled] = useState<string[]>(data.rules.disabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const toNum = (v: string): number | null | undefined => {
    const s = v.trim();
    if (s === '') return null;
    return /^\d+$/.test(s) ? Number(s) : undefined;
  };

  async function save() {
    setError(null);
    setNotice(null);
    const a = toNum(maxStake);
    const b = toNum(maxWin);
    if (a === undefined || b === undefined) {
      setError(tRoot('validation.invalidNumber' as never));
      return;
    }
    setBusy(true);
    try {
      await apiClient('/admin/my-game-rules', { method: 'PUT', json: { maxStake: a, maxWin: b, disabled } });
      setNotice(t('rulesSaved'));
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        const fields = err.fields ? ` (${Object.keys(err.fields).join(', ')})` : '';
        setError(`${tRoot(errorMessageKey(err.code) as never)}${fields}`);
      } else {
        setError(tRoot('errors.generic' as never));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ display: 'grid', gap: '1rem' }}>
      <h2>{t('myRulesTitle')}</h2>
      <p className="muted">{t('myRulesIntro', { stake: data.site.maxStake, win: data.site.maxWin })}</p>
      {error ? <div className="alert alert-error">{error}</div> : null}
      {notice ? <div className="alert alert-success">{notice}</div> : null}
      <div className="field">
        <label>{t('maxStake')}</label>
        <input inputMode="numeric" placeholder={String(data.site.maxStake)} value={maxStake} disabled={busy} onChange={(e) => setMaxStake(e.target.value)} />
      </div>
      <div className="field">
        <label>{t('maxWin')}</label>
        <input inputMode="numeric" placeholder={String(data.site.maxWin)} value={maxWin} disabled={busy} onChange={(e) => setMaxWin(e.target.value)} />
      </div>
      <h3>{t('gamesOnOff')}</h3>
      {GAME_IDS.map((game) => (
        <label key={game} style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={!disabled.includes(game)}
            disabled={busy}
            onChange={(e) => setDisabled((cur) => (e.target.checked ? cur.filter((x) => x !== game) : [...cur, game]))}
          />
          {game === 'wheel' ? tw('title') : tg(`${game}Title` as never)}
        </label>
      ))}
      <button type="button" className="btn btn-gold" disabled={busy} onClick={() => void save()}>
        {t('save')}
      </button>
    </div>
  );
}
