// --- Football betting markets: what can be bet, how a pick is written, and how it is settled ---------------------
// Shared by the API (validation, settlement) and the website (labels, bet slip). Every rule here is pure: the same
// facts always give the same result, so a settlement can be checked again at any time.

export const SPORT_MARKETS = [
  'match_winner',
  'double_chance',
  'goals_ou',
  'btts',
  'ht_winner',
  'correct_score',
  'corners_ou',
  'cards_ou',
  'next_goal',
  'draw_no_bet',
  'sh_winner',
  'ht_goals_ou',
  'home_goals_ou',
  'away_goals_ou',
  'odd_even',
  'ht_ft',
] as const;
export type SportMarket = (typeof SPORT_MARKETS)[number];

/** Markets with a line (over / under a number). Only half lines are offered, so a selection can never be a push. */
export const LINE_MARKETS: readonly SportMarket[] = ['goals_ou', 'corners_ou', 'cards_ou', 'ht_goals_ou', 'home_goals_ou', 'away_goals_ou'];
/** Markets that are only offered while the match is being played. */
export const LIVE_ONLY_MARKETS: readonly SportMarket[] = ['next_goal'];

const PICKS: Record<SportMarket, readonly string[] | RegExp> = {
  match_winner: ['home', 'draw', 'away'],
  ht_winner: ['home', 'draw', 'away'],
  double_chance: ['1X', '12', 'X2'],
  goals_ou: ['over', 'under'],
  corners_ou: ['over', 'under'],
  cards_ou: ['over', 'under'],
  btts: ['yes', 'no'],
  correct_score: /^\d-\d$/,
  next_goal: ['home', 'none', 'away'],
  draw_no_bet: ['home', 'away'],
  sh_winner: ['home', 'draw', 'away'],
  ht_goals_ou: ['over', 'under'],
  home_goals_ou: ['over', 'under'],
  away_goals_ou: ['over', 'under'],
  odd_even: ['odd', 'even'],
  // half time result - full time result: 1 = home, X = draw, 2 = away
  ht_ft: /^[1X2]-[1X2]$/,
};

export function isSportMarket(x: unknown): x is SportMarket {
  return typeof x === 'string' && (SPORT_MARKETS as readonly string[]).includes(x);
}

/** A line is a whole number of halves between 0.5 and 30.5 that ends in .5 (written x10: 2.5 = 25). */
export function isHalfLine(lineX10: number): boolean {
  return Number.isInteger(lineX10) && lineX10 >= 5 && lineX10 <= 305 && lineX10 % 10 === 5;
}

/** Is this pick (and line) a valid selection of the market? */
export function isValidPick(market: SportMarket, pick: string, lineX10: number | null): boolean {
  const rule = PICKS[market];
  const okPick = rule instanceof RegExp ? rule.test(pick) : rule.includes(pick);
  if (!okPick) return false;
  if (LINE_MARKETS.includes(market)) return lineX10 !== null && isHalfLine(lineX10);
  return lineX10 === null;
}

/** One key per selection of a match: market, pick and line (used to find a price and to match a slip item). */
export function selectionKey(market: SportMarket, pick: string, lineX10: number | null): string {
  return lineX10 === null ? `${market}:${pick}` : `${market}:${pick}:${lineX10}`;
}

// --- settlement ----------------------------------------------------------------------------------------------

export interface MatchFacts {
  /** Provider status: FT, AET, PEN (finished), CANC, ABD, AWD, WO (void), PST (postponed) or a live / not started status. */
  status: string;
  /** Score after 90 minutes. */
  fulltime: { home: number; away: number } | null;
  /** Score at half time. */
  halftime: { home: number; away: number } | null;
  /** Total corners of the match, null when the provider has no statistics for it. */
  corners: number | null;
  /** Total cards of the match (each yellow and each red counts 1), null when unknown. */
  cards: number | null;
  /**
   * Goals in the first 90 minutes in the order they were scored ('home' / 'away' = the team the goal counts for),
   * null when the timeline is not known for sure.
   */
  goalOrder: ('home' | 'away')[] | null;
}

export type SelectionOutcome = 'won' | 'lost' | 'void' | 'wait';

const FINISHED = new Set(['FT', 'AET', 'PEN']);
const VOID_STATUSES = new Set(['CANC', 'ABD', 'AWD', 'WO']);

/** Result of one selection from the match facts. `goalsAtBet` is the score when a live "next goal" bet was taken. */
export function settleSelection(
  sel: { market: SportMarket; pick: string; lineX10: number | null; goalsAtBet?: { home: number; away: number } | null },
  f: MatchFacts,
): SelectionOutcome {
  if (VOID_STATUSES.has(f.status)) return 'void';
  if (!FINISHED.has(f.status)) return 'wait';
  const extraTime = f.status === 'AET' || f.status === 'PEN';
  const line = sel.lineX10 === null ? 0 : sel.lineX10 / 10;
  const ou = (total: number | null): SelectionOutcome => (total === null ? 'void' : (sel.pick === 'over' ? total > line : total < line) ? 'won' : 'lost');
  const winner = (s: { home: number; away: number }) => (s.home > s.away ? 'home' : s.home < s.away ? 'away' : 'draw');
  const ft = f.fulltime;
  switch (sel.market) {
    case 'match_winner':
      return ft ? (winner(ft) === sel.pick ? 'won' : 'lost') : 'void';
    case 'ht_winner':
      return f.halftime ? (winner(f.halftime) === sel.pick ? 'won' : 'lost') : 'void';
    case 'double_chance': {
      if (!ft) return 'void';
      const w = winner(ft);
      const ok = sel.pick === '1X' ? w !== 'away' : sel.pick === '12' ? w !== 'draw' : w !== 'home';
      return ok ? 'won' : 'lost';
    }
    case 'goals_ou':
      return ft ? ou(ft.home + ft.away) : 'void';
    case 'btts': {
      if (!ft) return 'void';
      const both = ft.home > 0 && ft.away > 0;
      return (sel.pick === 'yes') === both ? 'won' : 'lost';
    }
    case 'correct_score':
      return ft ? (`${ft.home}-${ft.away}` === sel.pick ? 'won' : 'lost') : 'void';
    // Corner and card statistics cover extra time too, so a match that went to extra time is void for them.
    case 'corners_ou':
      return extraTime ? 'void' : ou(f.corners);
    case 'cards_ou':
      return extraTime ? 'void' : ou(f.cards);
    case 'draw_no_bet':
      if (!ft) return 'void';
      return winner(ft) === 'draw' ? 'void' : winner(ft) === sel.pick ? 'won' : 'lost';
    case 'sh_winner': {
      if (!ft || !f.halftime) return 'void';
      const second = { home: ft.home - f.halftime.home, away: ft.away - f.halftime.away };
      if (second.home < 0 || second.away < 0) return 'void';
      return winner(second) === sel.pick ? 'won' : 'lost';
    }
    case 'ht_goals_ou':
      return f.halftime ? ou(f.halftime.home + f.halftime.away) : 'void';
    case 'home_goals_ou':
      return ft ? ou(ft.home) : 'void';
    case 'away_goals_ou':
      return ft ? ou(ft.away) : 'void';
    case 'odd_even':
      return ft ? (((ft.home + ft.away) % 2 === 1 ? 'odd' : 'even') === sel.pick ? 'won' : 'lost') : 'void';
    case 'ht_ft': {
      if (!ft || !f.halftime) return 'void';
      const sign = (s: { home: number; away: number }) => (s.home > s.away ? '1' : s.home < s.away ? '2' : 'X');
      return `${sign(f.halftime)}-${sign(ft)}` === sel.pick ? 'won' : 'lost';
    }
    case 'next_goal': {
      const at = sel.goalsAtBet;
      if (!ft || !at) return 'void';
      const before = at.home + at.away;
      const total = ft.home + ft.away;
      if (total < before) return 'void';
      if (total === before) return sel.pick === 'none' ? 'won' : 'lost';
      const order = f.goalOrder;
      if (!order || order.length !== total) return 'void';
      // the timeline must agree with the score at the moment of the bet
      const firstPart = order.slice(0, before);
      if (firstPart.filter((g) => g === 'home').length !== at.home || firstPart.filter((g) => g === 'away').length !== at.away) return 'void';
      return order[before] === sel.pick ? 'won' : 'lost';
    }
  }
}

/**
 * Goal order from the provider's timeline. Goals after 90 minutes (extra time, penalty shoot-out) and missed penalties
 * are left out. Own goals: the provider may give the team of the player or the team that gets the goal, so both readings
 * are tried and the one that gives the official 90-minute score is used; when it is not clear, the order is unknown (null).
 */
export function goalOrderFromEvents(
  events: readonly { minute: number; team: 'home' | 'away' | null; type: string; detail: string }[],
  fulltime: { home: number; away: number } | null,
): ('home' | 'away')[] | null {
  if (!fulltime) return null;
  const goals = events.filter((e) => e.type.toLowerCase() === 'goal' && e.minute <= 90 && !/missed/i.test(e.detail));
  if (goals.some((g) => g.team === null)) return null;
  const flip = (t: 'home' | 'away') => (t === 'home' ? 'away' : 'home');
  const asGiven = goals.map((g) => g.team as 'home' | 'away');
  const ownFlipped = goals.map((g) => (/own goal/i.test(g.detail) ? flip(g.team as 'home' | 'away') : (g.team as 'home' | 'away')));
  const fits = (o: ('home' | 'away')[]) => o.length === fulltime.home + fulltime.away && o.filter((x) => x === 'home').length === fulltime.home;
  const a = fits(asGiven);
  const b = fits(ownFlipped);
  if (a && b) return asGiven.join() === ownFlipped.join() ? asGiven : null;
  if (a) return asGiven;
  if (b) return ownFlipped;
  return null;
}
