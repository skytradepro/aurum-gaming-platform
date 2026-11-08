import '@/styles/games-fx.css';
import { Link } from '@/i18n/routing';
import { apiFetch } from '@/lib/api';
import { serverApiFetch } from '@/lib/api-server';
import { getSessionUser } from '@/lib/auth';
import { getDisplayCurrency } from '@/lib/display-currency';
import type { PublicRate } from '@/lib/rates';
import { DisplayProvider } from './DisplayContext';
import { GameInfoProvider, GameWinners } from './GameInfo';
import { findCurrency } from '@/lib/money-display';
import type { CurrencyDTO, PublicConfig } from '@/lib/types';
import type { GameId } from '@aurum/shared';
import { getTranslations } from 'next-intl/server';

/** Shared page frame of the in-house games: checks the game is on and a player with a wallet is signed in. */
export async function GameGate({
  locale,
  game,
  titleKey,
  subtitleKey,
  render,
}: {
  game: GameId;
  locale: string;
  titleKey: string;
  subtitleKey: string;
  render: (ctx: { currency: CurrencyDTO; balanceMinor: string }) => React.ReactNode;
}) {
  const t = await getTranslations('games');
  const tw = await getTranslations('wheel');
  let config: PublicConfig | null = null;
  try {
    config = await apiFetch<PublicConfig>('/public/config', { locale: locale as never });
  } catch {
    config = null;
  }
  const title = t(titleKey as never);
  if (!config?.inhouseGames) {
    return (
      <>
        <h1 className="page-title">{title}</h1>
        <p>{tw('notAvailable')}</p>
      </>
    );
  }
  const user = await getSessionUser();
  if (!user || user.role !== 'user' || !user.wallet) {
    return (
      <>
        <h1 className="page-title">{title}</h1>
        <p>{tw('loginRequired')}</p>
        <Link href="/login" className="btn btn-gold">
          {tw('loginCta')}
        </Link>
      </>
    );
  }
  const currency = findCurrency(config.currencies, user.wallet.currency);
  if (!currency) return <p>{tw('notAvailable')}</p>;
  let rates: PublicRate[] = [];
  try {
    rates = (await apiFetch<{ items: PublicRate[] }>('/public/rates', { locale: locale as never })).items;
  } catch {
    rates = [];
  }
  const display = (await getDisplayCurrency(config.currencies)) ?? null;
  let limits: { min: string; max: string } | null = null;
  try {
    const rules = await serverApiFetch<{ games: Record<string, { enabled: boolean; min: string; max: string }> }>(`/games/rules?currency=${currency.code}`, { locale: locale as never });
    const mine = rules.games[game];
    if (mine && !mine.enabled) {
      return (
        <>
          <h1 className="page-title">{title}</h1>
          <p>{tw('notAvailable')}</p>
        </>
      );
    }
    limits = mine ? { min: mine.min, max: mine.max } : null;
  } catch {
    limits = null;
  }
  return (
    <DisplayProvider display={display} rates={rates} limits={limits}>
      <GameInfoProvider value={{ game, title, rules: t(subtitleKey as never) }}>
        {/* game-page: lets phones and folding phones show the game and its buttons on one screen (candy-burst.css) */}
        <div className="game-page">
          <h1 className="page-title">{title}</h1>
          <p className="muted">{t(subtitleKey as never)}</p>
          {render({ currency, balanceMinor: user.wallet.balance.amountMinor })}
          <GameWinners currency={currency} />
        </div>
      </GameInfoProvider>
    </DisplayProvider>
  );
}
