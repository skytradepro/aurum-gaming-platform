'use client';

import { errorMessageKey } from '@aurum/i18n';
import { ApiError, apiClient } from '@/lib/api';
import { Link, useRouter } from '@/i18n/routing';
import { slip, slipSheet, useSlip, useSlipSheet } from '@/lib/sports-slip';
import type { SlipItem } from '@/lib/sports-slip';
import { marketLabel, odds, pickLabel } from '@/lib/sports-labels';
import type { SbT } from '@/lib/sports-labels';
import { StakeField, useMoneyFmt, useShownCurrency } from './game/DisplayContext';
import type { CurrencyDTO } from '@/lib/types';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

export interface BetRulesDTO {
  enabled: boolean;
  currency: string;
  min: string;
  max: string;
  maxWin: string;
  maxSelections: number;
  /** Live (in-play) bets: on/off, their highest stake and the seconds before they are accepted. */
  live?: { enabled: boolean; max: string; delaySeconds: number };
}

function toMinor(text: string, decimals: number): bigint | null {
  const m = /^(\d{1,12})(?:[.,](\d{0,18}))?$/.exec(text.trim());
  if (!m) return null;
  const frac = m[2] ?? '';
  if (frac.length > decimals) return null;
  return BigInt(m[1]!) * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, '0') || '0');
}

/** Same arithmetic as the server: stake x every price, rounded down. The server has the last word. */
export function payoutOf(stake: bigint, prices: number[]): bigint {
  let num = stake;
  let den = 1n;
  for (const o of prices) {
    num *= BigInt(o);
    den *= 100n;
  }
  return num / den;
}

/** A bet that was just accepted: shown as a ticket until the player starts a new one. */
interface Ticket {
  id: string;
  items: SlipItem[];
  stake: bigint;
  potential: bigint;
  total: number;
}

/**
 * Shell of the slip. On a phone or tablet it is a sheet that slides up over the page (opened from the bar at the
 * bottom), so the list of matches never moves; on a computer it stays on the side of the page.
 */
function SlipShell({ title, count, closeLabel, children }: { title: string; count: number; closeLabel: string; children: ReactNode }) {
  const open = useSlipSheet();
  useEffect(() => {
    if (!open) return undefined;
    const html = document.documentElement;
    html.classList.add('hb-sheet-open');
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') slipSheet.close();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      html.classList.remove('hb-sheet-open');
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);
  // leaving the page closes the sheet
  useEffect(() => () => slipSheet.close(), []);
  return (
    <>
      {open ? <div className="sbk-sheet-bg" onClick={() => slipSheet.close()} aria-hidden="true" /> : null}
      <aside className={`card sbk-slip${open ? ' is-open' : ''}`} id="bet-slip" aria-label={title}>
        <h3 className="sbk-slip-title">
          {title} {count > 0 ? <span className="sbk-count">{count}</span> : null}
          <button type="button" className="sbk-sheet-x" onClick={() => slipSheet.close()} aria-label={closeLabel}>
            ✕
          </button>
        </h3>
        {children}
      </aside>
    </>
  );
}

/** The bet slip: every selection with its market and price, the stake, the possible win and the "place bet" button. */
export function BetSlip({ currency, rules, balanceMinor, locale }: { currency: CurrencyDTO | null; rules: BetRulesDTO | null; balanceMinor: string | null; locale: string }) {
  const t = useTranslations('bets');
  const ts = useTranslations('sbk') as unknown as SbT;
  const tRoot = useTranslations();
  const router = useRouter();
  const items = useSlip();
  const [stake, setStake] = useState('1');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  /** Matches the server said are no longer open for betting. */
  const [closedIds, setClosedIds] = useState<number[]>([]);
  // re-check kick-off times now and then, so a pre-match selection shows as closed without a reload
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(timer);
  }, []);
  const fmt = useMoneyFmt(currency, locale);
  const shown = useShownCurrency(currency);

  // a new selection after a ticket: the ticket makes room for the new slip
  useEffect(() => {
    if (items.length > 0) setTicket(null);
  }, [items.length]);

  const isClosed = (i: SlipItem) => closedIds.includes(i.fixtureId) || (!i.live && !!i.kickoff && Date.parse(i.kickoff) - Date.now() < 2 * 60_000);
  const closedItems = items.filter(isClosed);

  const shell = (children: ReactNode) => (
    <SlipShell title={t('slip')} count={items.length} closeLabel={t('closeSlip')}>
      {children}
    </SlipShell>
  );

  if (!currency || !rules) {
    return shell(
      <>
        {items.map((i) => (
          <div key={i.fixtureId} className="sbk-slip-item">
            <div className="sbk-slip-match">
              {i.home} – {i.away}
            </div>
            <div className="sbk-slip-pick">
              <span>
                <small className="muted">{marketLabel(ts, i.market, i.home, i.away)}</small>
                <b>{pickLabel(ts, i, i.home, i.away)}</b>
              </span>
              <strong className="sbk-odd-chip">{odds(i.oddsX100)}</strong>
            </div>
          </div>
        ))}
        <p>{t('loginToBet')}</p>
        <Link href="/login" className="btn btn-gold">
          {t('login')}
        </Link>
      </>,
    );
  }
  if (!rules.enabled) return shell(<p>{t('closed')}</p>);

  const hasLive = items.some((i) => i.live);
  const liveOff = hasLive && rules.live && !rules.live.enabled;
  const maxStake = hasLive && rules.live ? (BigInt(rules.live.max) < BigInt(rules.max) ? rules.live.max : rules.max) : rules.max;
  const stakeMinor = toMinor(stake, currency.decimals);
  const prices = items.map((i) => i.oddsX100);
  const potential = stakeMinor !== null && items.length > 0 ? payoutOf(stakeMinor, prices) : 0n;
  const total = prices.reduce((acc, o) => (acc * o) / 100, 100) / 100;
  const stakeOk = stakeMinor !== null && stakeMinor >= BigInt(rules.min) && stakeMinor <= BigInt(maxStake);
  const winOk = potential <= BigInt(rules.maxWin);

  async function place() {
    if (busy || stakeMinor === null || items.length === 0) return;
    setBusy(true);
    setError(null);
    setTicket(null);
    const sent = items.map((i) => ({ ...i }));
    try {
      const res = await apiClient<{ bet: { id: string } }>('/bets/place', {
        method: 'POST',
        json: {
          stake: stake.trim(),
          idempotencyKey: `b-${crypto.randomUUID()}`,
          selections: items.map((i) => ({ fixtureId: i.fixtureId, market: i.market, pick: i.pick, ...(i.lineX10 === null ? {} : { lineX10: i.lineX10 }), oddsX100: i.oddsX100 })),
        },
      });
      // the matches stay on screen as the ticket of the accepted bet
      setTicket({ id: res.bet.id, items: sent, stake: stakeMinor, potential, total });
      slip.clear();
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'bet_unavailable' && err.fields?.fixtureId) {
        // the slip marks the closed match itself
        const id = Number(err.fields.fixtureId);
        setClosedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
      } else if (err instanceof ApiError) {
        if (err.code === 'odds_changed' && err.fields?.fixtureId && err.fields.oddsX100) slip.setOdds(Number(err.fields.fixtureId), Number(err.fields.oddsX100));
        setError(tRoot(errorMessageKey(err.code) as never));
      } else {
        setError(tRoot('errors.generic' as never));
      }
    } finally {
      setBusy(false);
    }
  }

  return shell(
    <>
      {balanceMinor !== null ? (
        <p className="muted sbk-slip-balance">
          {t('balance')}: <strong>{fmt(balanceMinor)}</strong>
        </p>
      ) : null}
      {ticket ? (
        <div className="sbk-ticket" role="status">
          <div className="sbk-ticket-head">
            <span className="sbk-ticket-ok" aria-hidden="true">
              ✓
            </span>
            <span>
              <b>{t('accepted')}</b>
              <small className="muted">#{ticket.id.slice(0, 8).toUpperCase()}</small>
            </span>
          </div>
          {ticket.items.map((i) => (
            <div key={i.fixtureId} className="sbk-ticket-row">
              <span>
                <b>
                  {i.home} – {i.away}
                </b>
                <small className="muted">
                  {marketLabel(ts, i.market, i.home, i.away)} · {pickLabel(ts, i, i.home, i.away)}
                </small>
              </span>
              <strong>{odds(i.oddsX100)}</strong>
            </div>
          ))}
          <p className="sbk-slip-row">
            <span>{ticket.items.length > 1 ? t('totalOdds') : t('odds')}</span>
            <strong>{ticket.total.toFixed(2)}</strong>
          </p>
          <p className="sbk-slip-row">
            <span>{t('stake')}</span>
            <strong>{fmt(ticket.stake)}</strong>
          </p>
          <p className="sbk-slip-row">
            <span>{t('potentialWin')}</span>
            <strong className="sbk-win">{fmt(ticket.potential)}</strong>
          </p>
          <div className="sbk-ticket-actions">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                const back = ticket.items;
                setTicket(null);
                slip.restore(back);
              }}
            >
              {t('keepPicks')}
            </button>
            <Link href="/account/bets" className="btn btn-ghost btn-sm">
              {t('myBets')}
            </Link>
          </div>
          <button type="button" className="btn btn-gold btn-sm sbk-ticket-new" onClick={() => setTicket(null)}>
            {t('newTicket')}
          </button>
        </div>
      ) : null}
      {items.length === 0 && !ticket ? <p className="muted">{t('empty')}</p> : null}
      {items.map((i) => (
        <div key={i.fixtureId} className={isClosed(i) ? 'sbk-slip-item is-closed' : 'sbk-slip-item'}>
          <div className="sbk-slip-top">
            <small className="muted">
              {i.live ? <span className="sbk-live-tag">LIVE</span> : null} {i.league}
            </small>
            <button type="button" className="sbk-x" onClick={() => slip.remove(i.fixtureId)} aria-label={t('remove')} disabled={busy}>
              ✕
            </button>
          </div>
          <div className="sbk-slip-match">
            {i.home} – {i.away}
          </div>
          <div className="sbk-slip-pick">
            <span>
              <small className="muted">{marketLabel(ts, i.market, i.home, i.away)}</small>
              <b>{pickLabel(ts, i, i.home, i.away)}</b>
            </span>
            <strong className="sbk-odd-chip">{odds(i.oddsX100)}</strong>
          </div>
          {isClosed(i) ? <div className="sbk-slip-closed">🔒 {t('itemClosed')}</div> : null}
        </div>
      ))}
      {items.length > 0 ? (
        <>
          <div className="field">
            <StakeField stake={stake} setStake={setStake} currency={currency} disabled={busy} label={t('stake')} />
            <small className="muted">{t('limits', { min: fmt(rules.min), max: fmt(maxStake) })}</small>
          </div>
          <p className="sbk-slip-row">
            <span>{items.length > 1 ? t('totalOdds') : t('odds')}</span>
            <strong>{total.toFixed(2)}</strong>
          </p>
          <p className="sbk-slip-row">
            <span>{t('potentialWin')}</span>
            <strong className="sbk-win">{stakeMinor === null ? '–' : fmt(potential)}</strong>
          </p>
          {hasLive && rules.live ? <p className="sbk-live-note">{ts('liveNote', { seconds: rules.live.delaySeconds })}</p> : null}
          {liveOff ? <div className="alert alert-error">{ts('liveOff')}</div> : null}
          {stakeMinor !== null && !winOk ? <div className="alert alert-error">{t('maxWin', { max: fmt(rules.maxWin) })}</div> : null}
          {error ? <div className="alert alert-error">{error}</div> : null}
          {closedItems.length > 0 ? (
            <div className="alert alert-error sbk-closed-box">
              <span>{t('closedHint')}</span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  for (const i of closedItems) slip.remove(i.fixtureId);
                  setClosedIds([]);
                  setError(null);
                }}
              >
                {t('removeClosed')}
              </button>
            </div>
          ) : null}
          <button type="button" className="btn btn-gold sbk-place" disabled={busy || !stakeOk || !winOk || liveOff || closedItems.length > 0 || items.length > rules.maxSelections} onClick={() => void place()}>
            {busy ? (hasLive ? ts('checkingLive') : t('placing')) : t('place')}
          </button>
          {shown ? <small className="muted sbk-note">{tRoot('wheel.convertedNote' as never, { shown, wallet: currency.code } as never)}</small> : null}
          {items.length > rules.maxSelections ? <small className="muted">{t('tooMany', { max: rules.maxSelections })}</small> : null}
          <button type="button" className="btn btn-ghost btn-sm sbk-clear" onClick={() => slip.clear()} disabled={busy}>
            {t('clear')}
          </button>
        </>
      ) : error ? (
        <div className="alert alert-error">{error}</div>
      ) : null}
    </>,
  );
}
