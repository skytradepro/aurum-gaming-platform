import type { SportMarket } from '@aurum/shared';

/** A translation function of the "sportsbook" texts (server or browser). */
export type SbT = (key: string, values?: Record<string, string | number>) => string;

const line = (lineX10: number | null) => (lineX10 === null ? '' : (lineX10 / 10).toFixed(1));

/** "Total goals", "Arsenal – total goals" … */
export function marketLabel(t: SbT, market: SportMarket, home = '', away = ''): string {
  return t(`m_${market}`, { home, away });
}

const sideName = (x: string, home: string, away: string, draw: string) => (x === '1' ? home : x === '2' ? away : draw);

/** What the player picked, in words: the team name, "Draw", "Over 2.5", "2-1" … */
export function pickLabel(t: SbT, s: { market: SportMarket; pick: string; lineX10: number | null }, home: string, away: string): string {
  switch (s.market) {
    case 'match_winner':
    case 'ht_winner':
    case 'sh_winner':
    case 'draw_no_bet':
      return s.pick === 'home' ? home : s.pick === 'away' ? away : t('draw');
    case 'odd_even':
      return t(s.pick === 'odd' ? 'odd' : 'even');
    case 'ht_ft': {
      const [ht = 'X', ft = 'X'] = s.pick.split('-');
      return `${sideName(ht, home, away, t('draw'))} / ${sideName(ft, home, away, t('draw'))}`;
    }
    case 'double_chance':
      return t(`dc_${s.pick}`, { home, away });
    case 'goals_ou':
    case 'corners_ou':
    case 'cards_ou':
    case 'ht_goals_ou':
    case 'home_goals_ou':
    case 'away_goals_ou':
      return t(s.pick === 'over' ? 'over' : 'under', { line: line(s.lineX10) });
    case 'btts':
      return t(s.pick === 'yes' ? 'yes' : 'no');
    case 'correct_score':
      return s.pick.replace('-', ' : ');
    case 'next_goal':
      return s.pick === 'home' ? home : s.pick === 'away' ? away : t('noGoal');
  }
}

/** Short pick for an odds button: 1 / X / 2, Over / Under, Yes / No … */
export function shortPick(t: SbT, s: { market: SportMarket; pick: string; lineX10: number | null }): string {
  switch (s.market) {
    case 'match_winner':
    case 'ht_winner':
    case 'sh_winner':
    case 'draw_no_bet':
    case 'next_goal':
      return s.pick === 'home' ? '1' : s.pick === 'away' ? '2' : s.market === 'next_goal' ? t('noGoal') : 'X';
    case 'double_chance':
      return s.pick;
    case 'odd_even':
      return t(s.pick === 'odd' ? 'odd' : 'even');
    case 'ht_ft':
      return s.pick.replace('-', '/');
    case 'goals_ou':
    case 'corners_ou':
    case 'cards_ou':
    case 'ht_goals_ou':
    case 'home_goals_ou':
    case 'away_goals_ou':
      return t(s.pick === 'over' ? 'over' : 'under', { line: line(s.lineX10) });
    case 'btts':
      return t(s.pick === 'yes' ? 'yes' : 'no');
    case 'correct_score':
      return s.pick.replace('-', ':');
  }
}

export const odds = (x100: number) => (x100 / 100).toFixed(2);
