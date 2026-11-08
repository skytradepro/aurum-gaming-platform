'use client';

import '@/styles/candy-burst.css';
import '@/styles/line-game.css';
import '@/styles/blackjack.css';
import { errorMessageKey } from '@aurum/i18n';
import { BJ_RTP, cardRank, cardSuit, type BjAction } from '@aurum/shared';
import { ApiError, apiClient } from '@/lib/api';
import { parseDecimalToMinor } from '@/lib/rates';
import type { CurrencyDTO } from '@/lib/types';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { StakeBox } from './StakeBox';
import { CandySound } from './TumbleGame';
import { useRound, type HistoryRow, type RoundResponse } from './useRound';

const SUITS = ['♠', '♥', '♦', '♣'] as const;
const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;
const wait = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));
const DEAL_GAP = 280;

type Outcome = 'blackjack' | 'win' | 'push' | 'lose' | 'bust';
interface HandView {
  cards: number[];
  total: number;
  soft: boolean;
  units: number;
  done: boolean;
  outcome: Outcome | null;
  payoutMinor: string | null;
}
interface Hand {
  handId: string;
  step: number;
  phase: 'player' | 'done';
  stake: { amountMinor: string; currency: string };
  staked: { amountMinor: string; currency: string };
  dealer: { cards: (number | null)[]; total: number };
  hands: HandView[];
  active: number;
  actions: BjAction[];
  payout: { amountMinor: string; currency: string } | null;
  balance: { amountMinor: string; currency: string };
}
type Props = { currency: CurrencyDTO; locale: string; initialBalanceMinor: string };

/** One playing card. It lands on the table after `delay` ms and flips open (a null card stays face down). */
function Card({ id, delay, label }: { id: number | null; delay: number; label: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (id === null) {
      setOpen(false);
      return undefined;
    }
    const timer = setTimeout(() => setOpen(true), Math.max(0, delay) + 220);
    return () => clearTimeout(timer);
  }, [id, delay]);
  const suit = id === null ? 0 : cardSuit(id);
  const red = suit === 1 || suit === 2;
  const rank = id === null ? '' : (RANKS[cardRank(id)] ?? '');
  return (
    <div className={`cc-card is-small bj-card${open ? ' is-open' : ''}`} style={{ animationDelay: `${Math.max(0, delay)}ms` }} aria-label={open && id !== null ? `${label}: ${rank}${SUITS[suit]}` : label}>
      <div className="cc-card-inner">
        <div className="cc-back" aria-hidden="true">
          <span>H</span>
        </div>
        <div className={red ? 'cc-face is-red' : 'cc-face'}>
          <span className="cc-corner">
            {rank}
            <i>{SUITS[suit]}</i>
          </span>
          <span className="cc-pip">{SUITS[suit]}</span>
          <span className="cc-corner is-bottom">
            {rank}
            <i>{SUITS[suit]}</i>
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * HANNIBAL Blackjack: a classic table played move by move. The server deals every card and keeps the hand, so a
 * reload brings the same hand back.
 */
export function BlackjackGame({ currency, locale, initialBalanceMinor }: Props) {
  const t = useTranslations('blackjack');
  const tl = useTranslations('lineSlot');
  const tRoot = useTranslations();
  const router = useRouter();
  const base = useRound({ endpoint: '/games/blackjack/deal', currency, locale, initialBalanceMinor });
  const sound = useRef(new CandySound());
  const [hand, setHand] = useState<Hand | null>(null);
  const [balance, setBalance] = useState(initialBalanceMinor);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RoundResponse | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [strip, setStrip] = useState<Outcome[]>([]);
  const [settled, setSettled] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [resumed, setResumed] = useState(false);
  /** Delay of each card on the table, by "dealer:i" or "h{hand}:i"; cards already shown have 0. */
  const delays = useRef<Map<string, number>>(new Map());
  const seen = useRef<Set<string>>(new Set());

  // a hand left on the table (reload, lost connection) comes back as it was
  useEffect(() => {
    let stop = false;
    void apiClient<{ hand: Hand | null }>('/games/blackjack/current')
      .then((res) => {
        if (stop || !res.hand) return;
        for (const k of keysOf(res.hand)) seen.current.add(k);
        setHand(res.hand);
        setBalance(res.hand.balance.amountMinor);
        setResumed(true);
      })
      .catch(() => undefined);
    return () => {
      stop = true;
    };
  }, []);

  function keysOf(h: Hand): string[] {
    const keys: string[] = [];
    h.dealer.cards.forEach((c, i) => keys.push(`d:${i}:${c === null ? 'x' : 'o'}`));
    h.hands.forEach((x, k) => x.cards.forEach((_, i) => keys.push(`h${k}:${i}`)));
    return keys;
  }

  /** Gives every new card its turn: player and dealer cards in dealing order, the dealer's draws last. Returns the show length. */
  function schedule(next: Hand, fresh: boolean): number {
    delays.current = new Map();
    let n = 0;
    const add = (key: string) => {
      if (seen.current.has(key)) return;
      seen.current.add(key);
      delays.current.set(key, n * DEAL_GAP);
      n += 1;
    };
    if (fresh) {
      // player, dealer, player, dealer
      add('h0:0');
      add(`d:0:o`);
      add('h0:1');
      add(`d:1:${next.dealer.cards[1] === null ? 'x' : 'o'}`);
    }
    next.hands.forEach((x, k) => x.cards.forEach((_, i) => add(`h${k}:${i}`)));
    next.dealer.cards.forEach((c, i) => {
      const key = `d:${i}:${c === null ? 'x' : 'o'}`;
      if (!seen.current.has(key) && i >= 1) n += 1; // the dealer's turn is slower
      add(key);
    });
    return n * DEAL_GAP + 650;
  }

  function fail(err: unknown) {
    if (err instanceof ApiError) {
      const fields = err.fields ? ` (${Object.keys(err.fields).join(', ')})` : '';
      setError(`${tRoot(errorMessageKey(err.code) as never)}${fields}`);
    } else {
      setError(tRoot('errors.generic' as never));
    }
  }

  async function show(next: Hand, fresh: boolean) {
    const ms = schedule(next, fresh);
    setHand(next);
    if (next.phase === 'player') setBalance(next.balance.amountMinor);
    for (let i = 0; i < Math.min(8, Math.round(ms / DEAL_GAP)); i += 1) {
      window.setTimeout(() => sound.current.land(i + 1), i * DEAL_GAP + 200);
    }
    await wait(ms);
    if (next.phase === 'done') {
      setSettled(true);
      setBalance(next.balance.amountMinor);
      const staked = BigInt(next.staked.amountMinor);
      const paid = BigInt(next.payout?.amountMinor ?? '0');
      const mult = staked > 0n ? Number((paid * 100n) / staked) / 100 : 0;
      setResult({ roundId: next.handId, game: 'blackjack', win: paid > staked, multiplier: `${mult}×`, detail: {}, stake: next.staked, payout: { amountMinor: paid.toString(), currency: next.staked.currency }, balance: next.balance });
      setHistory((h) => [{ id: next.handId, multiplier: `${mult}×`, stake: next.staked.amountMinor, payout: paid.toString() }, ...h].slice(0, 10));
      setStrip((s) => [...next.hands.map((x) => x.outcome ?? 'lose'), ...s].slice(0, 16));
      if (next.hands.some((x) => x.outcome === 'blackjack')) sound.current.win(4);
      else if (paid > staked) sound.current.win(2);
      else if (paid === staked && paid > 0n) sound.current.tick();
      else sound.current.lose();
      router.refresh();
    }
  }

  async function deal() {
    if (busy) return;
    setError(null);
    setResult(null);
    setResumed(false);
    const minor = parseDecimalToMinor(base.stake.trim(), currency.decimals);
    if (minor === null || minor <= 0n) return setError(tRoot('wheel.stakeInvalid' as never));
    if (minor < base.min) return setError(tRoot('wheel.stakeTooLow' as never, { min: base.fmt(base.min) } as never));
    if (minor > base.max) return setError(tRoot('wheel.stakeTooHigh' as never, { max: base.fmt(base.max) } as never));
    if (minor > BigInt(balance)) return setError(tRoot('wheel.notEnoughBalance' as never, { balance: base.fmt(balance) } as never));
    setBusy(true);
    setSettled(false);
    setHand(null);
    seen.current = new Set();
    sound.current.spin();
    try {
      const next = await apiClient<Hand>('/games/blackjack/deal', { method: 'POST', json: { stake: base.stake.trim(), idempotencyKey: `bj-${crypto.randomUUID()}` } });
      await show(next, true);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function act(action: BjAction) {
    if (busy || !hand || hand.phase !== 'player') return;
    if ((action === 'double' || action === 'split') && BigInt(hand.stake.amountMinor) > BigInt(balance)) {
      setError(tRoot('wheel.notEnoughBalance' as never, { balance: base.fmt(balance) } as never));
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const next = await apiClient<Hand>('/games/blackjack/action', { method: 'POST', json: { handId: hand.handId, step: hand.step, action } });
      await show(next, false);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  const delayOf = (key: string) => delays.current.get(key) ?? 0;
  const playing = hand?.phase === 'player';
  const finished = hand?.phase === 'done' && settled;
  const staked = hand ? BigInt(hand.staked.amountMinor) : 0n;
  const paid = hand?.payout ? BigInt(hand.payout.amountMinor) : 0n;
  const message = !hand
    ? busy
      ? t('dealing')
      : t('placeBet')
    : playing
      ? resumed
        ? t('resumed')
        : busy
          ? t('dealing')
          : hand.hands.length > 1
            ? t('playHand', { n: hand.active + 1 })
            : t('yourMove')
      : !finished
        ? t('dealerTurn')
        : hand.hands.some((x) => x.outcome === 'blackjack')
          ? t('outcome_blackjack')
          : paid > staked
            ? t('youWin', { amount: base.fmt(paid) })
            : paid === staked && paid > 0n
              ? t('outcome_push')
              : hand.hands.every((x) => x.outcome === 'bust')
                ? t('outcome_bust')
                : t('outcome_lose');
  const tone = !finished ? '' : paid > staked ? ' is-win' : paid === staked && paid > 0n ? ' is-tie' : ' is-lose';
  const box = { ...base, balance, busy, error, result, history };
  const dealerBust = finished && hand && hand.dealer.total > 21;

  const actButton = (a: BjAction, icon: string) => (
    <button key={a} type="button" className={`bj-act is-${a}`} disabled={busy || !hand?.actions.includes(a)} onClick={() => void act(a)}>
      <span aria-hidden="true">{icon}</span>
      <small>{t(a)}</small>
    </button>
  );

  return (
    <div className="cb-wrap lg-wrap cc-wrap bj-wrap">
      <section className="cb-stage cc-stage bj-stage" aria-label={t('title')}>
        <div className="cb-top">
          <div className="cb-mult">
            <small>{t('pays')}</small>
            <strong>3:2</strong>
          </div>
          <div className="cb-tools">
            <button type="button" className="cb-tool" onClick={() => setShowInfo(true)} aria-label={t('info')} title={t('info')}>
              i
            </button>
          </div>
        </div>
        <div className="bj-table">
          <div className="bj-shoe" aria-hidden="true" />
          <div className="bj-seat is-dealer">
            <span className="cc-label">
              {t('dealer')}
              {hand ? <b className={dealerBust ? 'bj-total is-bust' : 'bj-total'}>{hand.dealer.total}</b> : null}
            </span>
            <div className="bj-cards">
              {hand ? hand.dealer.cards.map((c, i) => <Card key={`d${i}`} id={c} delay={delayOf(`d:${i}:${c === null ? 'x' : 'o'}`)} label={t('dealer')} />) : <span className="bj-spot" />}
            </div>
            {dealerBust ? <span className="bj-tag is-bust">{t('dealerBust')}</span> : null}
          </div>
          <div className="bj-felt" aria-hidden="true">
            <strong>{t('feltPays')}</strong>
            <small>{t('feltRule')}</small>
          </div>
          <div className={hand && hand.hands.length > 1 ? 'bj-hands is-split' : 'bj-hands'}>
            {(hand ? hand.hands : [null]).map((x, k) => (
              <div key={k} className={['bj-seat', 'is-player', playing && hand?.active === k && hand.hands.length > 1 ? 'is-active' : '', finished && x?.outcome ? `is-${x.outcome}` : ''].filter(Boolean).join(' ')}>
                <div className="bj-cards">{x ? x.cards.map((c, i) => <Card key={`h${k}${i}`} id={c} delay={delayOf(`h${k}:${i}`)} label={t('you')} />) : <span className="bj-spot" />}</div>
                <span className="cc-label">
                  {hand && hand.hands.length > 1 ? t('hand', { n: k + 1 }) : t('you')}
                  {x ? <b className={x.total > 21 ? 'bj-total is-bust' : 'bj-total'}>{x.soft && x.total < 21 ? `${x.total - 10}/${x.total}` : x.total}</b> : null}
                </span>
                {x ? (
                  <span className="bj-chip" title={t('bet')}>
                    {base.fmt(BigInt(hand?.stake.amountMinor ?? '0') * BigInt(x.units))}
                  </span>
                ) : null}
                {finished && x?.outcome ? <span className={`bj-tag is-${x.outcome}`}>{t(`outcome_${x.outcome}`)}</span> : null}
              </div>
            ))}
          </div>
          <div className={`cc-result bj-msg${tone}`} aria-live="polite">
            {message}
          </div>
          <div className="bj-actions">
            {playing ? (
              <>
                {actButton('hit', '+')}
                {actButton('stand', '■')}
                {actButton('double', '2×')}
                {hand?.actions.includes('split') ? actButton('split', '⇆') : null}
              </>
            ) : (
              <button type="button" className="bj-act is-deal" disabled={busy} onClick={() => void deal()}>
                <span aria-hidden="true">♠</span>
                <small>{hand ? t('again') : t('deal')}</small>
              </button>
            )}
          </div>
        </div>
        <div className="cb-bar">
          <div className="cb-win">
            <small>{tl('win')}</small>
            <strong>{finished ? base.fmt(paid) : base.fmt(0n)}</strong>
          </div>
          <div className="cc-history" aria-label={t('history')}>
            {strip.map((o, k) => (
              <i key={k} className={o === 'blackjack' || o === 'win' ? 'is-win' : o === 'push' ? 'is-tie' : 'is-lose'}>
                {o === 'blackjack' ? 'BJ' : o === 'win' ? 'W' : o === 'push' ? 'P' : 'L'}
              </i>
            ))}
          </div>
        </div>
        {showInfo ? (
          <div className="cb-info" role="dialog" aria-modal="true" aria-label={t('rulesTitle')}>
            <div className="cb-info-card">
              <h3>{t('rulesTitle')}</h3>
              <ul className="cb-rules">
                {[t('rule1'), t('rule2'), t('rule3'), t('rule4'), t('rule5'), t('ruleRtp', { rtp: BJ_RTP }), t('ruleServer')].map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
              <button type="button" className="btn btn-gold" onClick={() => setShowInfo(false)}>
                {t('close')}
              </button>
            </div>
          </div>
        ) : null}
      </section>
      <div className="cb-side">
        <StakeBox r={box} currency={currency} rtp={BJ_RTP}>
          <div className="cb-controls">
            <button type="button" className="cb-spin" disabled={busy || playing} onClick={() => void deal()}>
              <span className="cb-spin-icon" aria-hidden="true">
                ♠
              </span>
              <span>{t('deal')}</span>
            </button>
          </div>
        </StakeBox>
      </div>
    </div>
  );
}
