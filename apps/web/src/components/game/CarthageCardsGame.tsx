'use client';

import '@/styles/candy-burst.css';
import '@/styles/line-game.css';
import { CARTHAGE_CARDS_RTP, cardsRank } from '@aurum/shared';
import type { CurrencyDTO } from '@/lib/types';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { StakeBox } from './StakeBox';
import { CandySound } from './TumbleGame';
import { useRound, type RoundResponse } from './useRound';

const SUITS = ['♠', '♥', '♦', '♣'] as const;
const RANKS: Record<number, string> = { 7: '7', 8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
const wait = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));
type Outcome = 'win' | 'tie' | 'lose';

function Card({ id, open, who }: { id: number | null; open: boolean; who: string }) {
  const suit = id === null ? 0 : Math.floor(id / 8);
  const red = suit === 1 || suit === 2;
  const rank = id === null ? '' : (RANKS[cardsRank(id)] ?? '');
  return (
    <div className={open && id !== null ? 'cc-card is-open' : 'cc-card'} aria-label={open && id !== null ? `${who}: ${rank}${SUITS[suit]}` : who}>
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

export function CarthageCardsGame({ currency, locale, initialBalanceMinor }: { currency: CurrencyDTO; locale: string; initialBalanceMinor: string }) {
  const t = useTranslations('carthageCards');
  const tl = useTranslations('lineSlot');
  const r = useRound({ endpoint: '/games/carthagecards/play', currency, locale, initialBalanceMinor });
  const rRef = useRef(r);
  rRef.current = r;
  const sound = useRef(new CandySound());
  const [player, setPlayer] = useState<number | null>(null);
  const [dealer, setDealer] = useState<number | null>(null);
  const [open, setOpen] = useState<{ p: boolean; d: boolean }>({ p: false, d: false });
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [dealing, setDealing] = useState(false);
  const [history, setHistory] = useState<Outcome[]>([]);
  const [showInfo, setShowInfo] = useState(false);
  const [payout, setPayout] = useState('0');

  async function present(res: RoundResponse) {
    const d = res.detail as { player: number; dealer: number; outcome: Outcome };
    setPlayer(d.player);
    setDealer(d.dealer);
    await wait(250);
    sound.current.land(1);
    setOpen({ p: true, d: false });
    await wait(650);
    sound.current.land(4);
    setOpen({ p: true, d: true });
    await wait(450);
    setOutcome(d.outcome);
    setPayout(res.payout.amountMinor);
    if (d.outcome === 'win') sound.current.win(2);
    else if (d.outcome === 'lose') sound.current.lose();
    else sound.current.tick();
    setHistory((h) => [d.outcome, ...h].slice(0, 14));
  }

  async function deal() {
    if (rRef.current.busy || dealing) return;
    setDealing(true);
    setOutcome(null);
    setOpen({ p: false, d: false });
    sound.current.spin();
    await wait(300);
    await rRef.current.play({}, present);
    setDealing(false);
  }

  return (
    <div className="cb-wrap lg-wrap cc-wrap">
      <section className="cb-stage cc-stage" aria-label="HANNIBAL Carthage Cards">
        <div className="cb-top">
          <div className="cb-mult">
            <small>{t('pays')}</small>
            <strong>1.9×</strong>
          </div>
          <div className="cb-tools">
            <button type="button" className="cb-tool" onClick={() => setShowInfo(true)} aria-label={t('info')} title={t('info')}>
              i
            </button>
          </div>
        </div>
        <div className="cc-table">
          <div className="cc-seat">
            <span className="cc-label">{t('dealer')}</span>
            <Card id={dealer} open={open.d} who={t('dealer')} />
          </div>
          <div className={outcome ? `cc-result is-${outcome}` : 'cc-result'} aria-live="polite">
            {outcome ? t(outcome) : dealing ? t('dealing') : t('vs')}
          </div>
          <div className="cc-seat">
            <span className="cc-label">{t('you')}</span>
            <Card id={player} open={open.p} who={t('you')} />
          </div>
        </div>
        <div className="cb-bar">
          <div className="cb-win">
            <small>{tl('win')}</small>
            <strong>{outcome ? r.fmt(payout) : r.fmt(0n)}</strong>
          </div>
          <div className="cc-history" aria-label={t('history')}>
            {history.map((h, k) => (
              <i key={k} className={`is-${h}`}>
                {h === 'win' ? 'W' : h === 'tie' ? '=' : 'L'}
              </i>
            ))}
          </div>
        </div>
        {showInfo ? (
          <div className="cb-info" role="dialog" aria-modal="true" aria-label={t('rulesTitle')}>
            <div className="cb-info-card">
              <h3>{t('rulesTitle')}</h3>
              <ul className="cb-rules">
                <li>{t('rule1')}</li>
                <li>{t('rule2')}</li>
                <li>{t('rule3')}</li>
                <li>{t('rule4')}</li>
                <li>{t('ruleRtp', { rtp: CARTHAGE_CARDS_RTP })}</li>
                <li>{t('ruleServer')}</li>
              </ul>
              <button type="button" className="btn btn-gold" onClick={() => setShowInfo(false)}>
                {t('close')}
              </button>
            </div>
          </div>
        ) : null}
      </section>
      <div className="cb-side">
        <StakeBox r={r} currency={currency} rtp={CARTHAGE_CARDS_RTP}>
          <div className="cb-controls">
            <button type="button" className="cb-spin" disabled={r.busy || dealing} onClick={() => void deal()}>
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
