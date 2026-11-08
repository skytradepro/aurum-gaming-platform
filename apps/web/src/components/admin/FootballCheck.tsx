'use client';

import '@/styles/sportsbook.css';

import { ApiError, apiClient } from '@/lib/api';
import { marketLabel } from '@/lib/sports-labels';
import type { SbT } from '@/lib/sports-labels';
import type { SportMarket } from '@aurum/shared';
import { errorMessageKey } from '@aurum/i18n';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface BetName {
  name: string;
  count: number;
  values: string[];
  market: SportMarket | null;
}
interface CheckReply {
  configured: boolean;
  subscription?: { plan?: string; end?: string; active?: boolean } | null;
  requests?: { current?: number; limit_day?: number } | null;
  settings?: { oddsMaxPages: number; liveListSeconds: number; liveOddsSeconds: number; detailLiveSeconds: number };
  today?: { matches: number; withOdds: number } | null;
  live?: { at: string; matches: number | null; withOdds: number; withCards: number | null; names: BetName[] } | null;
  prematch?: { fixtureId: number; match: string; names: BetName[] } | null;
}

/** Super Admin: the football feed as the provider really sends it, and which bet names the site reads (on demand). */
export function FootballCheck() {
  const t = useTranslations('sbk') as unknown as SbT;
  const tRoot = useTranslations();
  const [data, setData] = useState<CheckReply | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      setData(await apiClient<CheckReply>('/admin/football/check'));
    } catch (err) {
      setError(tRoot((err instanceof ApiError ? errorMessageKey(err.code) : 'errors.generic') as never));
    } finally {
      setBusy(false);
    }
  }

  const table = (names: BetName[]) => (
    <div className="fbc-table" role="table">
      {names.map((n) => (
        <div key={n.name} className={n.market ? 'fbc-row is-used' : 'fbc-row'} role="row">
          <span className="fbc-name">{n.name}</span>
          <span className="fbc-market">{n.market ? `✓ ${marketLabel(t, n.market, '1', '2')}` : t('admFbNotUsed')}</span>
          <span className="fbc-values" dir="ltr">{n.values.join(' · ')}</span>
        </div>
      ))}
    </div>
  );

  return (
    <section className="card fbc">
      <div className="fbc-head">
        <h2>{t('admFbTitle')}</h2>
        <button type="button" className="btn btn-gold btn-sm" disabled={busy} onClick={() => void run()}>
          {busy ? '…' : t('admFbRun')}
        </button>
      </div>
      {error ? <div className="alert alert-error">{error}</div> : null}
      {data && !data.configured ? <p className="muted">{t('admFbNoKey')}</p> : null}
      {data?.configured ? (
        <>
          <div className="fbc-stats">
            <div>
              <small>{t('admFbPlan')}</small>
              <b>{data.subscription?.plan ?? '–'}</b>
            </div>
            <div>
              <small>{t('admFbRequests')}</small>
              <b dir="ltr">
                {data.requests?.current ?? '–'} / {data.requests?.limit_day ?? '–'}
              </b>
            </div>
            <div>
              <small>{t('admFbToday')}</small>
              <b dir="ltr">
                {data.today?.withOdds ?? '–'} / {data.today?.matches ?? '–'}
              </b>
            </div>
            <div>
              <small>{t('admFbLive')}</small>
              <b dir="ltr">
                {data.live?.withOdds ?? '–'} / {data.live?.matches ?? '–'}
              </b>
            </div>
            <div>
              <small>{t('admFbCards')}</small>
              <b dir="ltr">{data.live?.withCards ?? '–'}</b>
            </div>
          </div>
          <h3>{t('admFbLiveNames')}</h3>
          {data.live && data.live.names.length > 0 ? table(data.live.names) : <p className="muted">–</p>}
          <h3>
            {t('admFbPreNames')} {data.prematch ? <small className="muted">({data.prematch.match})</small> : null}
          </h3>
          {data.prematch && data.prematch.names.length > 0 ? table(data.prematch.names) : <p className="muted">–</p>}
        </>
      ) : null}
    </section>
  );
}
