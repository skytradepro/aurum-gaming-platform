'use client';

import { errorMessageKey } from '@aurum/i18n';
import { ApiError, apiClient } from '@/lib/api';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface Player {
  id: string;
  accountNo: string;
  username: string;
  firstName: string;
  lastName: string;
}

/** Decimal text -> minor units, or null when it is not a valid positive amount for this currency. */
function toMinor(text: string, decimals: number): bigint | null {
  const m = /^(\d{1,15})(?:[.,](\d+))?$/.exec(text.trim());
  if (!m) return null;
  const frac = m[2] ?? '';
  if (frac.length > decimals) return null;
  const v = BigInt(m[1] as string) * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, '0') || '0');
  return v > 0n ? v : null;
}
function fromMinor(v: bigint, decimals: number): string {
  const neg = v < 0n;
  const a = neg ? -v : v;
  const unit = 10n ** BigInt(decimals);
  const s = decimals > 0 ? `${a / unit}.${(a % unit).toString().padStart(decimals, '0')}` : `${a}`;
  return neg ? `-${s}` : s;
}
const newKey = () => `ui-${crypto.randomUUID()}`;

/**
 * The shop counter, like head office's cash desk for one player:
 *   - RECHARGE: the player gives cash, their account is credited from the shop's prepaid balance;
 *   - CASH OUT: the shop gives the player cash, their account is debited and the amount comes back to the
 *     shop balance. The player confirms with the 6-digit code shown in their own account.
 */
export function ShopCounter({ balanceMinor, currency, decimals }: { balanceMinor: string; currency: string; decimals: number }) {
  const t = useTranslations('shop');
  const tRoot = useTranslations();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [playerMinor, setPlayerMinor] = useState<bigint | null>(null);
  const [mode, setMode] = useState<'deposit' | 'cashout'>('deposit');
  const [amount, setAmount] = useState('');
  const [key, setKey] = useState(newKey);
  const [approval, setApproval] = useState<{ id: string; amountMinor: bigint } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const shopMinor = BigInt(balanceMinor);
  const minor = toMinor(amount, decimals);
  const shopAfter = minor === null ? null : mode === 'deposit' ? shopMinor - minor : shopMinor + minor;
  const playerAfter = minor === null || playerMinor === null ? null : mode === 'deposit' ? playerMinor + minor : playerMinor - minor;
  const shopTooLow = mode === 'deposit' && shopAfter !== null && shopAfter < 0n;
  const playerTooLow = mode === 'cashout' && playerAfter !== null && playerAfter < 0n;
  const fail = (err: unknown) => setError(err instanceof ApiError ? tRoot(errorMessageKey(err.code) as never) : tRoot('errors.generic' as never));
  const name = (p: Player) => `${p.firstName} ${p.lastName}`.trim();

  async function loadBalance(p: Player) {
    try {
      const res = await apiClient<{ player: { balance: { amountMinor: string } } }>('/shop/counter/player', { method: 'POST', json: { account: p.accountNo } });
      setPlayerMinor(BigInt(res.player.balance.amountMinor));
    } catch {
      setPlayerMinor(null);
    }
  }

  function choose(p: Player) {
    setPlayer(p);
    setApproval(null);
    setCode('');
    setPlayerMinor(null);
    void loadBalance(p);
  }

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMsg(null);
    try {
      const res = await apiClient<{ items: Player[] }>(`/shop/players?q=${encodeURIComponent(query.trim())}`);
      setPlayers(res.items);
      if (res.items.length === 1 && res.items[0]) choose(res.items[0]);
    } catch (err) {
      fail(err);
    }
  }

  function pick(m: 'deposit' | 'cashout') {
    setMode(m);
    setApproval(null);
    setCode('');
    setError(null);
    setMsg(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!player || minor === null || shopTooLow || playerTooLow) return;
    setError(null);
    setMsg(null);
    if (mode === 'deposit') {
      if (!window.confirm(t('confirmRecharge', { amount: fromMinor(minor, decimals), currency, username: player.username, after: fromMinor(shopAfter ?? 0n, decimals) }))) return;
      setBusy(true);
      try {
        await apiClient('/shop/deposits', { method: 'POST', json: { playerId: player.id, amount: fromMinor(minor, decimals), idempotencyKey: key } });
        setMsg(t('rechargeDone', { amount: fromMinor(minor, decimals), currency, username: player.username }));
        setAmount('');
        setKey(newKey());
        void loadBalance(player);
        router.refresh();
      } catch (err) {
        fail(err);
      } finally {
        setBusy(false);
      }
      return;
    }
    // cash out, step 1: a 6-digit code goes to the player's own account
    setBusy(true);
    try {
      const res = await apiClient<{ approval: { id: string } }>('/shop/counter/approvals', { method: 'POST', json: { account: player.accountNo, amount: fromMinor(minor, decimals) } });
      setApproval({ id: res.approval.id, amountMinor: minor });
      setCode('');
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  // cash out, step 2: the player gives the code, the amount is taken from their account
  async function confirmCode(e: React.FormEvent) {
    e.preventDefault();
    if (!player || !approval) return;
    setError(null);
    setBusy(true);
    try {
      await apiClient(`/shop/counter/approvals/${approval.id}/confirm`, { method: 'POST', json: { code: code.trim() } });
      setMsg(t('cashOutDone', { amount: fromMinor(approval.amountMinor, decimals), currency, username: player.username }));
      setApproval(null);
      setCode('');
      setAmount('');
      void loadBalance(player);
      router.refresh();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shop-counter">
      {error ? <div className="alert alert-error">{error}</div> : null}
      {msg ? <div className="alert alert-success">{msg}</div> : null}

      <form className="card shop-find" onSubmit={(e) => void search(e)}>
        <h2>{t('findPlayer')}</h2>
        <label htmlFor="shop-find">{t('findHint')}</label>
        <div className="field shop-find-row">
          <input id="shop-find" value={query} required minLength={3} dir="ltr" onChange={(e) => setQuery(e.target.value)} />
          <button type="submit" className="btn btn-ghost">
            {t('search')}
          </button>
        </div>
        {players && players.length === 0 ? <p className="muted">{t('noPlayer')}</p> : null}
        {players && players.length > 1 ? (
          <div className="shop-players">
            {players.map((p) => (
              <button key={p.id} type="button" className={player?.id === p.id ? 'btn btn-gold btn-sm' : 'btn btn-ghost btn-sm'} onClick={() => choose(p)}>
                {p.accountNo} · {p.username}
                {name(p) ? ` (${name(p)})` : ''}
              </button>
            ))}
          </div>
        ) : null}
      </form>

      {player ? (
        <div className="card cd-card">
          <div className="cd-head">
            <h3>
              {t('player')}: <span dir="ltr">{player.username}</span>
            </h3>
            <div className="cd-balance">
              {t('playerBalance')}: <b dir="ltr">{playerMinor === null ? '…' : `${fromMinor(playerMinor, decimals)} ${currency}`}</b>
            </div>
          </div>
          <small className="muted" dir="ltr">
            #{player.accountNo}
            {name(player) ? ` · ${name(player)}` : ''}
          </small>

          <div className="cd-modes" role="tablist">
            <button type="button" role="tab" aria-selected={mode === 'deposit'} className={mode === 'deposit' ? 'cd-mode is-in on' : 'cd-mode is-in'} onClick={() => pick('deposit')}>
              <b>＋</b>
              <span>{t('modeDeposit')}</span>
              <small>{t('modeDepositHint')}</small>
            </button>
            <button type="button" role="tab" aria-selected={mode === 'cashout'} className={mode === 'cashout' ? 'cd-mode is-out on' : 'cd-mode is-out'} onClick={() => pick('cashout')}>
              <b>－</b>
              <span>{t('modeCashOut')}</span>
              <small>{t('modeCashOutHint')}</small>
            </button>
          </div>

          {approval ? (
            <form className="shop-code" onSubmit={(e) => void confirmCode(e)}>
              <p className="cd-preview">{t('codeSent', { amount: fromMinor(approval.amountMinor, decimals), currency, username: player.username })}</p>
              <div className="field">
                <label htmlFor="shop-code">{t('code')}</label>
                <input id="shop-code" value={code} required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" dir="ltr" onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
              </div>
              <div className="shop-actions">
                <button type="submit" className="btn cd-go cd-go-out" disabled={busy || code.length !== 6}>
                  {t('doConfirm')}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setApproval(null)}>
                  {t('cancel')}
                </button>
              </div>
            </form>
          ) : (
            <form className="shop-pay" onSubmit={(e) => void submit(e)}>
              <div className="field cd-amount">
                <label htmlFor="shop-amount">
                  {t('amount')} ({currency})
                </label>
                <input id="shop-amount" inputMode="decimal" value={amount} required placeholder="0.00" dir="ltr" onChange={(e) => setAmount(e.target.value)} />
              </div>
              {minor !== null ? (
                <div className={shopTooLow || playerTooLow ? 'cd-preview is-bad' : 'cd-preview'}>
                  {shopTooLow ? (
                    t('notEnough')
                  ) : playerTooLow ? (
                    t('notEnoughPlayer')
                  ) : (
                    <>
                      {playerAfter !== null ? (
                        <div>
                          {t('playerAfter')}: <b dir="ltr">{fromMinor(playerAfter, decimals)} {currency}</b>
                        </div>
                      ) : null}
                      <div>
                        {t('balanceAfter')}: <b dir="ltr">{fromMinor(shopAfter ?? 0n, decimals)} {currency}</b>
                      </div>
                    </>
                  )}
                </div>
              ) : null}
              <button type="submit" className={mode === 'deposit' ? 'btn btn-gold cd-go' : 'btn cd-go cd-go-out'} disabled={busy || minor === null || shopTooLow || playerTooLow}>
                {mode === 'deposit' ? t('doRecharge') : t('doCashOut')}
              </button>
            </form>
          )}
        </div>
      ) : null}
    </div>
  );
}
