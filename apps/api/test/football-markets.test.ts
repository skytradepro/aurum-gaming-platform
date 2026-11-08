import assert from 'node:assert/strict';
import { test } from 'node:test';
import { goalOrderFromEvents, isValidPick, settleSelection } from '@aurum/shared';
import type { MatchFacts } from '@aurum/shared';
import { betNames, factsOf, liveMarketOf, parseLiveOdds, parseMatchDetails, parsePrematchMarkets } from '../src/services/football-markets.ts';

const cfg = { footballOddsMarginPercent: 0, footballBookmakerId: 0 };

test('picks: only known picks and half lines are valid', () => {
  assert.equal(isValidPick('goals_ou', 'over', 25), true);
  assert.equal(isValidPick('goals_ou', 'over', 20), false);
  assert.equal(isValidPick('goals_ou', 'over', null), false);
  assert.equal(isValidPick('match_winner', 'home', null), true);
  assert.equal(isValidPick('match_winner', 'home', 25), false);
  assert.equal(isValidPick('correct_score', '2-1', null), true);
  assert.equal(isValidPick('correct_score', '10-1', null), false);
  assert.equal(isValidPick('double_chance', '1X', null), true);
  assert.equal(isValidPick('next_goal', 'none', null), true);
  assert.equal(isValidPick('btts', 'maybe', null), false);
});

test('pre-match feed: known markets are read, unknown ones are ignored, first-half totals stay first-half', () => {
  const body = {
    response: [{
      fixture: { id: 9 },
      bookmakers: [
        { id: 6, bets: [
          { id: 1, name: 'Match Winner', values: [{ value: 'Home', odd: '2.10' }, { value: 'Draw', odd: '3.30' }, { value: 'Away', odd: '3.60' }] },
          { id: 5, name: 'Goals Over/Under', values: [{ value: 'Over 2.5', odd: '1.90' }, { value: 'Under 2.5', odd: '1.95' }, { value: 'Over 2.25', odd: '1.80' }, { value: 'Over 1.5', odd: '1.30' }] },
          { id: 6, name: 'Goals Over/Under First Half', values: [{ value: 'Over 0.5', odd: '1.40' }] },
          { id: 8, name: 'Both Teams Score', values: [{ value: 'Yes', odd: '1.75' }, { value: 'No', odd: '2.05' }] },
          { id: 12, name: 'Double Chance', values: [{ value: 'Home/Draw', odd: '1.30' }, { value: 'Home/Away', odd: '1.35' }, { value: 'Draw/Away', odd: '1.70' }] },
          { id: 13, name: 'First Half Winner', values: [{ value: 'Home', odd: '2.80' }, { value: 'Draw', odd: '2.10' }, { value: 'Away', odd: '4.00' }] },
          { id: 10, name: 'Exact Score', values: [{ value: '1:0', odd: '7.50' }, { value: '2:1', odd: '9.00' }, { value: '10:0', odd: '500' }] },
          { id: 45, name: 'Corners Over Under', values: [{ value: 'Over 9.5', odd: '1.85' }, { value: 'Under 9.5', odd: '1.90' }] },
          { id: 80, name: 'Cards Over/Under', values: [{ value: 'Over 4.5', odd: '1.80' }, { value: 'Under 4.5', odd: '1.95' }] },
          { id: 99, name: 'Something Else', values: [{ value: 'Home', odd: '9.00' }] },
        ] },
        { id: 8, bets: [{ id: 1, name: 'Match Winner', values: [{ value: 'Home', odd: '2.20' }, { value: 'Draw', odd: '3.20' }, { value: 'Away', odd: '3.50' }] }] },
      ],
    }],
  };
  const offers = parsePrematchMarkets(body, 9, cfg);
  const get = (m: string, p: string, l: number | null = null) => offers.find((o) => o.market === m && o.pick === p && o.lineX10 === l)?.oddsX100;
  assert.equal(get('match_winner', 'home'), 210);
  assert.equal(get('goals_ou', 'over', 25), 190);
  assert.equal(get('goals_ou', 'over', 15), 130);
  assert.equal(offers.some((o) => o.market === 'goals_ou' && o.lineX10 === 5), false, 'first half total must not become a match total');
  assert.equal(get('ht_goals_ou', 'over', 5), 140);
  assert.equal(offers.filter((o) => o.market === 'goals_ou').length, 3, 'the 2.25 line is not offered');
  assert.equal(get('btts', 'yes'), 175);
  assert.equal(get('double_chance', 'X2'), 170);
  assert.equal(get('ht_winner', 'draw'), 210);
  assert.equal(get('correct_score', '2-1'), 900);
  assert.equal(offers.some((o) => o.market === 'correct_score' && o.pick === '10-0'), false);
  assert.equal(get('corners_ou', 'under', 95), 190);
  assert.equal(get('cards_ou', 'over', 45), 180);
  // preferred bookmaker for a market when it offers it
  const pref = parsePrematchMarkets(body, 9, { ...cfg, footballBookmakerId: 8 });
  assert.equal(pref.find((o) => o.market === 'match_winner' && o.pick === 'home')?.oddsX100, 220);
  assert.equal(pref.find((o) => o.market === 'btts' && o.pick === 'yes')?.oddsX100, 175);
});

test('live feed: lines, suspended prices, closed matches and the next goal number', () => {
  const body = {
    response: [{
      fixture: { id: 3, status: { long: 'Second Half', elapsed: 63 } },
      teams: { home: { id: 1, goals: 1 }, away: { id: 2, goals: 1 } },
      status: { stopped: false, blocked: false, finished: false },
      update: '2026-11-01T20:00:00+00:00',
      odds: [
        { id: 59, name: 'Fulltime Result', values: [{ value: 'Home', odd: '2.50', handicap: null, suspended: false }, { value: 'Draw', odd: '2.20', handicap: null, suspended: true }, { value: 'Away', odd: '4.00', handicap: null, suspended: false }] },
        { id: 36, name: 'Over/Under Line', values: [{ value: 'Over', odd: '1.70', handicap: '2.5', suspended: false }, { value: 'Under', odd: '2.10', handicap: '2.5', suspended: false }, { value: 'Over', odd: '1.10', handicap: '1.5', suspended: false }, { value: 'Over', odd: '2.0', handicap: '2.75', suspended: false }] },
        { id: 77, name: 'Next Goal', values: [{ value: '1', odd: '2.00', handicap: '3' }, { value: 'No goal', odd: '3.20', handicap: '3' }, { value: '2', odd: '3.00', handicap: '3' }] },
        { id: 78, name: 'Next Goal', values: [{ value: '1', odd: '9.00', handicap: '5' }] },
      ],
    }, {
      fixture: { id: 4, status: { elapsed: 30 } }, teams: { home: { goals: 0 }, away: { goals: 0 } }, status: { stopped: false, blocked: true, finished: false }, odds: [],
    }],
  };
  const [a, b] = parseLiveOdds(body, cfg);
  assert.ok(a && b);
  assert.deepEqual(a.goals, { home: 1, away: 1 });
  assert.equal(a.closed, false);
  assert.equal(b.closed, true);
  const find = (m: string, p: string, l: number | null = null) => a.offers.find((o) => o.market === m && o.pick === p && o.lineX10 === l);
  assert.equal(find('match_winner', 'draw')?.suspended, true);
  assert.equal(find('goals_ou', 'over', 25)?.oddsX100, 170);
  assert.equal(find('goals_ou', 'over', 15), undefined, 'a line already passed is not offered');
  assert.equal(a.offers.some((o) => o.lineX10 === 28 || o.lineX10 === 27), false);
  assert.equal(find('next_goal', 'home')?.oddsX100, 200, 'next goal for goal number 3 at 1-1');
  assert.equal(a.offers.filter((o) => o.market === 'next_goal').length, 3, 'the market about goal number 5 is ignored');
});

const fixture = (over: Record<string, unknown> = {}) => ({
  fixture: { id: 11, date: '2026-11-01T18:00:00+00:00', status: { short: 'FT', elapsed: 90 }, referee: 'R', venue: { name: 'V', city: 'C' } },
  league: { name: 'L', country: 'X', logo: '' },
  teams: { home: { id: 100, name: 'Home FC', logo: '' }, away: { id: 200, name: 'Away FC', logo: '' } },
  goals: { home: 2, away: 1 },
  score: { halftime: { home: 0, away: 1 }, fulltime: { home: 2, away: 1 } },
  events: [
    { time: { elapsed: 30, extra: null }, team: { id: 200 }, player: { name: 'A1' }, assist: {}, type: 'Goal', detail: 'Normal Goal' },
    { time: { elapsed: 50, extra: null }, team: { id: 100 }, player: { name: 'H1' }, assist: {}, type: 'Card', detail: 'Yellow Card' },
    { time: { elapsed: 55, extra: null }, team: { id: 100 }, player: { name: 'H2' }, assist: {}, type: 'Goal', detail: 'Missed Penalty' },
    { time: { elapsed: 61, extra: null }, team: { id: 100 }, player: { name: 'H2' }, assist: {}, type: 'Goal', detail: 'Penalty' },
    { time: { elapsed: 90, extra: 3 }, team: { id: 100 }, player: { name: 'H3' }, assist: {}, type: 'Goal', detail: 'Normal Goal' },
  ],
  statistics: [
    { team: { id: 100 }, statistics: [{ type: 'Shots on Goal', value: 5 }, { type: 'Corner Kicks', value: 6 }, { type: 'Yellow Cards', value: 2 }, { type: 'Red Cards', value: null }, { type: 'Ball Possession', value: '55%' }] },
    { team: { id: 200 }, statistics: [{ type: 'Shots on Goal', value: 3 }, { type: 'Corner Kicks', value: 4 }, { type: 'Yellow Cards', value: 3 }, { type: 'Red Cards', value: 1 }, { type: 'Ball Possession', value: '45%' }] },
  ],
  ...over,
});

test('match centre: timeline sides, statistics and settlement facts', () => {
  const [d] = parseMatchDetails({ response: [fixture()] });
  assert.ok(d);
  assert.equal(d.events[0]?.team, 'away');
  assert.equal(d.events[4]?.extra, 3);
  assert.equal(d.stats?.find((s) => s.type === 'Ball Possession')?.home, '55%');
  const f = factsOf(d);
  assert.equal(f.corners, 10);
  assert.equal(f.cards, 6, '5 yellow + 1 red');
  assert.deepEqual(f.goalOrder, ['away', 'home', 'home'], 'missed penalty left out, stoppage time kept');
  assert.deepEqual(f.halftime, { home: 0, away: 1 });
  // no statistics block: corners and cards unknown
  const [n] = parseMatchDetails({ response: [fixture({ statistics: [] })] });
  assert.equal(factsOf(n!).corners, null);
});

test('own goals: the reading that gives the official score is used; unclear timelines are null', () => {
  const ev = (minute: number, team: 'home' | 'away', detail = 'Normal Goal') => ({ minute, team, type: 'Goal', detail });
  // provider gives the team of the player for the own goal (home player scores for away)
  assert.deepEqual(goalOrderFromEvents([ev(10, 'home', 'Own Goal'), ev(20, 'home')], { home: 1, away: 1 }), ['away', 'home'], 'only the flipped reading gives 1-1');
  assert.equal(goalOrderFromEvents([ev(10, 'home', 'Own Goal'), ev(20, 'away', 'Own Goal')], { home: 1, away: 1 }), null, 'both readings give 1-1 but different orders');
  assert.deepEqual(goalOrderFromEvents([ev(10, 'home', 'Own Goal'), ev(20, 'away')], { home: 0, away: 2 }), ['away', 'away']);
  assert.deepEqual(goalOrderFromEvents([ev(10, 'away', 'Own Goal'), ev(20, 'away')], { home: 0, away: 2 }), ['away', 'away']);
  assert.deepEqual(goalOrderFromEvents([ev(10, 'home'), ev(95, 'away')], { home: 1, away: 0 }), ['home'], 'extra time goal left out');
  assert.equal(goalOrderFromEvents([ev(10, 'home')], { home: 2, away: 0 }), null, 'missing goal in the timeline');
});

const facts = (over: Partial<MatchFacts> = {}): MatchFacts => ({ status: 'FT', fulltime: { home: 2, away: 1 }, halftime: { home: 0, away: 1 }, corners: 10, cards: 6, goalOrder: ['away', 'home', 'home'], ...over });

test('settlement of every market', () => {
  const s = (market: Parameters<typeof settleSelection>[0]['market'], pick: string, lineX10: number | null = null, f = facts(), goalsAtBet: { home: number; away: number } | null = null) => settleSelection({ market, pick, lineX10, goalsAtBet }, f);
  assert.equal(s('match_winner', 'home'), 'won');
  assert.equal(s('match_winner', 'draw'), 'lost');
  assert.equal(s('ht_winner', 'away'), 'won');
  assert.equal(s('double_chance', '1X'), 'won');
  assert.equal(s('double_chance', 'X2'), 'lost');
  assert.equal(s('goals_ou', 'over', 25), 'won');
  assert.equal(s('goals_ou', 'under', 25), 'lost');
  assert.equal(s('goals_ou', 'under', 35), 'won');
  assert.equal(s('btts', 'yes'), 'won');
  assert.equal(s('btts', 'no'), 'lost');
  assert.equal(s('correct_score', '2-1'), 'won');
  assert.equal(s('correct_score', '1-1'), 'lost');
  assert.equal(s('corners_ou', 'over', 95), 'won');
  assert.equal(s('corners_ou', 'under', 95), 'lost');
  assert.equal(s('cards_ou', 'over', 55), 'won');
  assert.equal(s('cards_ou', 'over', 45, facts({ cards: null })), 'void', 'no statistics: void');
  assert.equal(s('corners_ou', 'over', 95, facts({ status: 'AET' })), 'void', 'extra time: void');
  assert.equal(s('goals_ou', 'over', 25, facts({ status: 'AET', fulltime: { home: 1, away: 1 } })), 'lost', '90 minute score');
  assert.equal(s('next_goal', 'home', null, facts(), { home: 0, away: 1 }), 'won', 'at 0-1 the next goal was home');
  assert.equal(s('next_goal', 'away', null, facts(), { home: 0, away: 1 }), 'lost');
  assert.equal(s('next_goal', 'none', null, facts(), { home: 2, away: 1 }), 'won', 'no goal after 2-1');
  assert.equal(s('next_goal', 'home', null, facts({ goalOrder: null }), { home: 0, away: 1 }), 'void', 'unknown timeline');
  assert.equal(s('next_goal', 'home', null, facts(), { home: 1, away: 0 }), 'void', 'timeline does not agree with the score at the bet');
  assert.equal(s('match_winner', 'home', null, facts({ status: '2H' })), 'wait');
  assert.equal(s('match_winner', 'home', null, facts({ status: 'CANC' })), 'void');
});

test('more pre-match markets: draw no bet, second half, team goals, odd/even, half time - full time', () => {
  const body = {
    response: [{
      fixture: { id: 5 },
      bookmakers: [{ id: 6, bets: [
        { id: 2, name: 'Home/Away', values: [{ value: 'Home', odd: '1.60' }, { value: 'Away', odd: '2.40' }] },
        { id: 3, name: 'Second Half Winner', values: [{ value: 'Home', odd: '2.50' }, { value: 'Draw', odd: '2.30' }, { value: 'Away', odd: '3.90' }] },
        { id: 16, name: 'Total - Home', values: [{ value: 'Over 1.5', odd: '2.10' }, { value: 'Under 1.5', odd: '1.70' }, { value: 'Over 1', odd: '1.50' }] },
        { id: 17, name: 'Total - Away', values: [{ value: 'Over 0.5', odd: '1.45' }] },
        { id: 21, name: 'Odd/Even', values: [{ value: 'Odd', odd: '1.95' }, { value: 'Even', odd: '1.85' }] },
        { id: 7, name: 'HT/FT Double', values: [{ value: 'Home/Home', odd: '3.10' }, { value: 'Draw/Away', odd: '9.00' }, { value: 'Home/Maybe', odd: '9.00' }] },
      ] }],
    }],
  };
  const offers = parsePrematchMarkets(body, 5, cfg);
  const get = (m: string, p: string, l: number | null = null) => offers.find((o) => o.market === m && o.pick === p && o.lineX10 === l)?.oddsX100;
  assert.equal(get('draw_no_bet', 'away'), 240);
  assert.equal(get('sh_winner', 'draw'), 230);
  assert.equal(get('home_goals_ou', 'over', 15), 210);
  assert.equal(offers.filter((o) => o.market === 'home_goals_ou').length, 2, 'whole lines are not offered');
  assert.equal(get('away_goals_ou', 'over', 5), 145);
  assert.equal(get('odd_even', 'odd'), 195);
  assert.equal(get('ht_ft', '1-1'), 310);
  assert.equal(get('ht_ft', 'X-2'), 900);
  assert.equal(offers.filter((o) => o.market === 'ht_ft').length, 2);
  const names = betNames(body, 'prematch');
  assert.equal(names.find((n) => n.name === 'HT/FT Double')?.market, 'ht_ft');
});

test('live names: "which team will score the Nth goal" is the next goal only when N is the next goal', () => {
  assert.deepEqual(liveMarketOf('Which team will score the 2nd goal?'), { market: 'next_goal', goalNo: 2 });
  assert.equal(liveMarketOf('Asian Handicap'), null);
  const body = { response: [{
    fixture: { id: 7, status: { elapsed: 50 } }, teams: { home: { goals: 1 }, away: { goals: 0 } }, status: { stopped: false, blocked: false, finished: false },
    odds: [
      { id: 66, name: 'Which team will score the 2nd goal?', values: [{ value: '1', odd: '1.90' }, { value: 'No goal', odd: '4.00' }, { value: '2', odd: '2.80' }] },
      { id: 65, name: 'Which team will score the 1st goal?', values: [{ value: '1', odd: '1.10' }] },
    ],
  }] };
  const live = parseLiveOdds(body, cfg)[0];
  assert.ok(live);
  assert.equal(live.offers.filter((o) => o.market === 'next_goal').length, 3);
  assert.equal(live.offers.find((o) => o.pick === 'home')?.oddsX100, 190, 'the 1st goal market (already scored) is not read');
  const names = betNames(body, 'live');
  assert.equal(names.length, 2);
  assert.equal(names[0]?.market, 'next_goal');
});

test('settlement of the new markets', () => {
  const f = (ft: [number, number], ht: [number, number], status = 'FT'): MatchFacts => ({ status, fulltime: { home: ft[0], away: ft[1] }, halftime: { home: ht[0], away: ht[1] }, corners: null, cards: null, goalOrder: null });
  const s = (market: Parameters<typeof settleSelection>[0]['market'], pick: string, facts: MatchFacts, lineX10: number | null = null) => settleSelection({ market, pick, lineX10 }, facts);
  assert.equal(s('draw_no_bet', 'home', f([2, 1], [0, 0])), 'won');
  assert.equal(s('draw_no_bet', 'home', f([1, 1], [0, 0])), 'void');
  assert.equal(s('draw_no_bet', 'away', f([2, 1], [0, 0])), 'lost');
  assert.equal(s('sh_winner', 'away', f([1, 2], [1, 0])), 'won');
  assert.equal(s('sh_winner', 'draw', f([2, 1], [1, 0])), 'won');
  assert.equal(s('sh_winner', 'home', f([2, 1], [1, 0])), 'lost');
  assert.equal(s('ht_goals_ou', 'over', f([3, 0], [1, 0]), 5), 'won');
  assert.equal(s('ht_goals_ou', 'over', f([3, 0], [0, 0]), 5), 'lost');
  assert.equal(s('home_goals_ou', 'over', f([2, 0], [0, 0]), 15), 'won');
  assert.equal(s('away_goals_ou', 'under', f([2, 1], [0, 0]), 15), 'won');
  assert.equal(s('odd_even', 'odd', f([2, 1], [0, 0])), 'won');
  assert.equal(s('odd_even', 'even', f([0, 0], [0, 0])), 'won');
  assert.equal(s('ht_ft', 'X-1', f([2, 1], [1, 1])), 'won');
  assert.equal(s('ht_ft', '1-1', f([2, 1], [1, 1])), 'lost');
  assert.equal(s('ht_ft', '1-1', f([2, 1], [1, 1], 'CANC')), 'void');
  assert.equal(isValidPick('ht_ft', '1-X', null), true);
  assert.equal(isValidPick('ht_ft', '1-3', null), false);
  assert.equal(isValidPick('home_goals_ou', 'over', 15), true);
  assert.equal(isValidPick('odd_even', 'odd', 15), false);
});
