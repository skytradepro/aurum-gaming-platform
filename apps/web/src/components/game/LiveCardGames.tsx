'use client';

import '@/styles/candy-burst.css';
import '@/styles/line-game.css';
import { LUCKY7_BETS, LUCKY7_PAYS, LUCKY7_RTP, TEEN_PATTI_RTP, TEEN_PATTI_WIN, cardRank, cardSuit, type Lucky7Bet, type TeenPattiBet } from '@aurum/shared';
import type { CurrencyDTO } from '@/lib/types';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { StakeBox } from './StakeBox';
import { CandySound } from './TumbleGame';
import { useRound, type RoundResponse } from './useRound';

const SUITS = ['♠', '♥', '♦', '♣'] as const;
const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;
const wait = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));
type Props = { currency: CurrencyDTO; locale: string; initialBalanceMinor: string };

/** A card from a 52-card deck (id 0..51) that flips open. */
function FlipCard({ id, open, label, small = false, win = false }: { id: number | null; open: boolean; label: string; small?: boolean; win?: boolean }) {
  const suit = id === null ? 0 : cardSuit(id);
  const red = suit === 1 || suit === 2;
  const rank = id === null ? '' : (RANKS[cardRank(id)] ?? '');
  const cls = ['cc-card', open && id !== null ? 'is-open' : '', small ? 'is-small' : '', win ? 'is-win' : ''].filter(Boolean).join(' ');
  return (
    <div className={cls} aria-label={open && id !== null ? `${label}: ${rank}${SUITS[suit]}` : label}>
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

function Rules({ title, items, close, onClose }: { title: string; items: string[]; close: string; onClose: () => void }) {
  return (
    <div className="cb-info" role="dialog" aria-modal="true" aria-label={title}>
      <div className="cb-info-card">
        <h3>{title}</h3>
        <ul className="cb-rules">
          {items.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
        <button type="button" className="btn btn-gold" onClick={onClose}>
          {close}
        </button>
      </div>
    </div>
  );
}

const pays = (h: number) => `${(h / 100).toFixed(2).replace(/\.?0+$/, '')}×`;

/** Lucky 7: one card, bet Low (A–6), Seven or High (8–K). */
export function Lucky7Game({ currency, locale, initialBalanceMinor }: Props) {
  const t = useTranslations('lucky7');
  const tl = useTranslations('lineSlot');
  const r = useRound({ endpoint: '/games/lucky7/play', currency, locale, initialBalanceMinor });
  const rRef = useRef(r);
  rRef.current = r;
  const sound = useRef(new CandySound());
  const [bet, setBet] = useState<Lucky7Bet>('high');
  const [card, setCard] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<Lucky7Bet | null>(null);
  const [won, setWon] = useState<boolean | null>(null);
  const [dealing, setDealing] = useState(false);
  const [history, setHistory] = useState<Lucky7Bet[]>([]);
  const [showInfo, setShowInfo] = useState(false);
  const [payout, setPayout] = useState('0');

  async function present(res: RoundResponse) {
    const d = res.detail as { card: number; result: Lucky7Bet; bet: Lucky7Bet };
    setCard(d.card);
    await wait(350);
    sound.current.land(3);
    setOpen(true);
    await wait(550);
    setResult(d.result);
    const w = d.result === d.bet;
    setWon(w);
    setPayout(res.payout.amountMinor);
    if (w) sound.current.win(d.result === 'seven' ? 4 : 2);
    else sound.current.lose();
    setHistory((h) => [d.result, ...h].slice(0, 16));
  }

  async function deal() {
    if (rRef.current.busy || dealing) return;
    setDealing(true);
    setResult(null);
    setWon(null);
    setOpen(false);
    sound.current.spin();
    await wait(300);
    await rRef.current.play({ bet }, present);
    setDealing(false);
  }

  return (
    <div className="cb-wrap lg-wrap cc-wrap l7-wrap">
      <section className="cb-stage cc-stage l7-stage" aria-label="HANNIBAL Lucky 7">
        <div className="cb-top">
          <div className="cb-mult">
            <small>{t('pays')}</small>
            <strong>{pays(LUCKY7_PAYS[bet])}</strong>
          </div>
          <div className="cb-tools">
            <button type="button" className="cb-tool" onClick={() => setShowInfo(true)} aria-label={t('info')} title={t('info')}>
              i
            </button>
          </div>
        </div>
        <div className="l7-table">
          <div className="l7-zones">
            {LUCKY7_BETS.map((b) => (
              <button key={b} type="button" disabled={r.busy || dealing} className={['l7-zone', `is-${b}`, bet === b ? 'is-on' : '', result === b ? 'is-hit' : ''].filter(Boolean).join(' ')} onClick={() => setBet(b)} aria-pressed={bet === b}>
                <strong>{t(b)}</strong>
                <small>{t(`${b}Hint`)}</small>
                <em>{pays(LUCKY7_PAYS[b])}</em>
              </button>
            ))}
          </div>
          <div className="l7-card">
            <FlipCard id={card} open={open} label={t('card')} win={won === true} />
          </div>
          <div className={won === null ? 'cc-result' : won ? 'cc-result is-win' : 'cc-result is-lose'} aria-live="polite">
            {result ? (won ? t('win') : t('lose', { result: t(result) })) : dealing ? t('dealing') : t('pick')}
          </div>
        </div>
        <div className="cb-bar">
          <div className="cb-win">
            <small>{tl('win')}</small>
            <strong>{won ? r.fmt(payout) : r.fmt(0n)}</strong>
          </div>
          <div className="cc-history" aria-label={t('history')}>
            {history.map((h, k) => (
              <i key={k} className={h === 'seven' ? 'is-win' : h === 'high' ? 'is-tie' : 'is-lose'}>
                {h === 'seven' ? '7' : h === 'high' ? 'H' : 'L'}
              </i>
            ))}
          </div>
        </div>
        {showInfo ? <Rules title={t('rulesTitle')} items={[t('rule1'), t('rule2'), t('rule3'), t('ruleRtp', { rtp: LUCKY7_RTP }), t('ruleServer')]} close={t('close')} onClose={() => setShowInfo(false)} /> : null}
      </section>
      <div className="cb-side">
        <StakeBox r={r} currency={currency} rtp={LUCKY7_RTP}>
          <div className="cb-controls">
            <button type="button" className="cb-spin" disabled={r.busy || dealing} onClick={() => void deal()}>
              <span className="cb-spin-icon" aria-hidden="true">
                7
              </span>
              <span>{t('deal')}</span>
            </button>
          </div>
        </StakeBox>
      </div>
    </div>
  );
}

type TpDetail = { bet: TeenPattiBet; a: number[]; b: number[]; handA: string; handB: string; winner: TeenPattiBet | 'tie' };

/** Teen Patti duel: Player A and Player B get three cards each; bet on the stronger hand. */
export function TeenPattiGame({ currency, locale, initialBalanceMinor }: Props) {
  const t = useTranslations('teenPatti');
  const tl = useTranslations('lineSlot');
  const r = useRound({ endpoint: '/games/teenpatti/play', currency, locale, initialBalanceMinor });
  const rRef = useRef(r);
  rRef.current = r;
  const sound = useRef(new CandySound());
  const [bet, setBet] = useState<TeenPattiBet>('a');
  const [deal, setDeal] = useState<TpDetail | null>(null);
  const [opened, setOpened] = useState(0);
  const [done, setDone] = useState(false);
  const [dealing, setDealing] = useState(false);
  const [history, setHistory] = useState<(TeenPattiBet | 'tie')[]>([]);
  const [showInfo, setShowInfo] = useState(false);
  const [payout, setPayout] = useState('0');

  async function present(res: RoundResponse) {
    const d = res.detail as TpDetail;
    setDeal(d);
    await wait(250);
    for (let k = 1; k <= 6; k += 1) {
      sound.current.land(k);
      setOpened(k);
      await wait(320);
    }
    await wait(200);
    setDone(true);
    setPayout(res.payout.amountMinor);
    if (d.winner === d.bet) sound.current.win(2);
    else if (d.winner === 'tie') sound.current.tick();
    else sound.current.lose();
    setHistory((h) => [d.winner, ...h].slice(0, 16));
  }

  async function play() {
    if (rRef.current.busy || dealing) return;
    setDealing(true);
    setDone(false);
    setOpened(0);
    sound.current.spin();
    await wait(300);
    await rRef.current.play({ bet }, present);
    setDealing(false);
  }

  const seat = (side: TeenPattiBet) => {
    const cards = deal ? deal[side] : [null, null, null];
    const hand = deal ? (side === 'a' ? deal.handA : deal.handB) : null;
    const wins = done && deal?.winner === side;
    return (
      <button type="button" disabled={r.busy || dealing} className={['tp-seat', bet === side ? 'is-on' : '', wins ? 'is-win' : ''].filter(Boolean).join(' ')} onClick={() => setBet(side)} aria-pressed={bet === side}>
        <span className="cc-label">{side === 'a' ? t('playerA') : t('playerB')}</span>
        <span className="tp-cards">
          {cards.map((c, k) => (
            <FlipCard key={k} id={c} small open={opened >= k * 2 + (side === 'a' ? 1 : 2)} label={side === 'a' ? t('playerA') : t('playerB')} win={wins} />
          ))}
        </span>
        <span className="tp-hand">{done && hand ? t(`hand.${hand}`) : ' '}</span>
        <em>{pays(TEEN_PATTI_WIN)}</em>
      </button>
    );
  };

  return (
    <div className="cb-wrap lg-wrap cc-wrap tp-wrap">
      <section className="cb-stage cc-stage tp-stage" aria-label="HANNIBAL Teen Patti">
        <div className="cb-top">
          <div className="cb-mult">
            <small>{t('pays')}</small>
            <strong>{pays(TEEN_PATTI_WIN)}</strong>
          </div>
          <div className="cb-tools">
            <button type="button" className="cb-tool" onClick={() => setShowInfo(true)} aria-label={t('info')} title={t('info')}>
              i
            </button>
          </div>
        </div>
        <div className="tp-table">
          {seat('a')}
          <div className={!done || !deal ? 'cc-result' : deal.winner === 'tie' ? 'cc-result is-tie' : deal.winner === bet ? 'cc-result is-win' : 'cc-result is-lose'} aria-live="polite">
            {done && deal ? (deal.winner === 'tie' ? t('tie') : deal.winner === 'a' ? t('aWins') : t('bWins')) : dealing ? t('dealing') : t('vs')}
          </div>
          {seat('b')}
        </div>
        <div className="cb-bar">
          <div className="cb-win">
            <small>{tl('win')}</small>
            <strong>{done && deal && deal.winner !== 'tie' && deal.winner === bet ? r.fmt(payout) : r.fmt(0n)}</strong>
          </div>
          <div className="cc-history" aria-label={t('history')}>
            {history.map((h, k) => (
              <i key={k} className={h === 'tie' ? 'is-tie' : h === 'a' ? 'is-win' : 'is-lose'}>
                {h === 'tie' ? '=' : h.toUpperCase()}
              </i>
            ))}
          </div>
        </div>
        {showInfo ? (
          <Rules title={t('rulesTitle')} items={[t('rule1'), t('rule2'), t('rule3'), t('rule4'), t('ruleRtp', { rtp: TEEN_PATTI_RTP }), t('ruleServer')]} close={t('close')} onClose={() => setShowInfo(false)} />
        ) : null}
      </section>
      <div className="cb-side">
        <StakeBox r={r} currency={currency} rtp={TEEN_PATTI_RTP}>
          <div className="cb-controls">
            <button type="button" className="cb-spin" disabled={r.busy || dealing} onClick={() => void play()}>
              <span className="cb-spin-icon" aria-hidden="true">
                ♦
              </span>
              <span>{t('deal')}</span>
            </button>
          </div>
        </StakeBox>
      </div>
    </div>
  );
}
