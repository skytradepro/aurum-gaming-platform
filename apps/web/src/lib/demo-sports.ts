/**
 * Design-only sportsbook fixtures. They are fictional (invented teams and leagues, invented odds), they are
 * shown only when the API reports demo mode (SHOW_DEMO_DATA), and bets can never be placed on them.
 * Real events and odds must come from a licensed sports data provider.
 */
export type SportKey = 'football' | 'basketball' | 'tennis' | 'tableTennis' | 'volleyball' | 'iceHockey' | 'handball' | 'esports';

export const SPORTS: { key: SportKey; emoji: string; draw: boolean }[] = [
  { key: 'football', emoji: '⚽', draw: true },
  { key: 'basketball', emoji: '🏀', draw: false },
  { key: 'tennis', emoji: '🎾', draw: false },
  { key: 'tableTennis', emoji: '🏓', draw: false },
  { key: 'volleyball', emoji: '🏐', draw: false },
  { key: 'iceHockey', emoji: '🏒', draw: true },
  { key: 'handball', emoji: '🤾', draw: true },
  { key: 'esports', emoji: '🎮', draw: false },
];

export interface DemoEvent {
  id: string;
  sport: SportKey;
  league: string;
  country: string;
  home: string;
  away: string;
  /** 0 = today, 1 = tomorrow, 2 = in two days. */
  day: 0 | 1 | 2;
  time: string;
  live?: { minute: string; home: number; away: number };
  /** Decimal odds in thousandths: 1450 means 1.450. Integers only, never floats. */
  odds: { home: number; draw?: number; away: number };
  total?: { line: string; over: number; under: number };
}

let n = 0;
function ev(
  sport: SportKey,
  league: string,
  country: string,
  home: string,
  away: string,
  day: 0 | 1 | 2,
  time: string,
  odds: DemoEvent['odds'],
  total?: DemoEvent['total'],
  live?: DemoEvent['live'],
): DemoEvent {
  n += 1;
  return { id: `demo-${n}`, sport, league, country, home, away, day, time, odds, ...(total ? { total } : {}), ...(live ? { live } : {}) };
}

export const DEMO_EVENTS: DemoEvent[] = [
  ev('football', 'Carthagenet Premier League', 'Carthage', 'Carthage FC', 'Atlas United', 0, '17:00', { home: 1450, draw: 4200, away: 8000 }, { line: '2.5', over: 1700, under: 2050 }, { minute: "63'", home: 2, away: 0 }),
  ev('football', 'Carthagenet Premier League', 'Carthage', 'Sahara Stars', 'Olive City', 0, '19:30', { home: 1700, draw: 4330, away: 4330 }, { line: '2.5', over: 1900, under: 1850 }),
  ev('football', 'Carthagenet Premier League', 'Carthage', 'Medina Athletic', 'Coastal Rovers', 1, '15:00', { home: 2450, draw: 3300, away: 2700 }, { line: '2.5', over: 1950, under: 1800 }),
  ev('football', 'Carthagenet Premier League', 'Carthage', 'Dunes SC', 'Lighthouse FC', 2, '18:00', { home: 1350, draw: 5000, away: 7500 }, { line: '3.5', over: 2400, under: 1550 }),
  ev('football', 'Mediterranean Cup', 'Europe', 'Port Marine', 'Alpine Wanderers', 0, '21:45', { home: 1900, draw: 3600, away: 3900 }, { line: '2.5', over: 1750, under: 2000 }, { minute: "28'", home: 0, away: 1 }),
  ev('football', 'Mediterranean Cup', 'Europe', 'Iron Rangers', 'Silver Harbour', 1, '20:00', { home: 2100, draw: 3400, away: 3300 }, { line: '2.5', over: 1850, under: 1900 }),
  ev('football', 'Mediterranean Cup', 'Europe', 'Royal Falcons', 'Granite Town', 1, '22:00', { home: 1600, draw: 4000, away: 5250 }, { line: '2.5', over: 1650, under: 2150 }),
  ev('football', 'Desert Championship', 'Africa', 'Oasis Eagles', 'Nile Warriors', 0, '20:00', { home: 2200, draw: 3100, away: 3200 }, { line: '2.5', over: 2050, under: 1750 }),
  ev('football', 'Desert Championship', 'Africa', 'Kasbah FC', 'Golden Sands', 2, '17:30', { home: 2900, draw: 3200, away: 2350 }, { line: '2.5', over: 1950, under: 1800 }),
  ev('basketball', 'Carthagenet Basketball League', 'Carthage', 'Tunis Titans', 'Sfax Sharks', 0, '20:30', { home: 1550, away: 2400 }, { line: '168.5', over: 1870, under: 1870 }, { minute: 'Q3 04:12', home: 71, away: 66 }),
  ev('basketball', 'Carthagenet Basketball League', 'Carthage', 'Sousse Suns', 'Bizerte Bears', 1, '19:00', { home: 1950, away: 1850 }, { line: '172.5', over: 1850, under: 1900 }),
  ev('basketball', 'Pan-Africa Cup', 'Africa', 'Lagos Lions', 'Cairo Kings', 2, '18:00', { home: 2300, away: 1600 }, { line: '160.5', over: 1900, under: 1850 }),
  ev('tennis', 'Atlas Open', 'Carthage', 'M. Haddad', 'L. Ferrer', 0, '14:00', { home: 1400, away: 2850 }, { line: '21.5', over: 1850, under: 1900 }, { minute: 'Set 2', home: 1, away: 0 }),
  ev('tennis', 'Atlas Open', 'Carthage', 'S. Romero', 'K. Nasri', 0, '16:00', { home: 2200, away: 1650 }, { line: '22.5', over: 1900, under: 1850 }),
  ev('tennis', 'Coastal Masters', 'Europe', 'J. Weber', 'A. Costa', 1, '13:00', { home: 1800, away: 1950 }, { line: '22.5', over: 1870, under: 1870 }),
  ev('tableTennis', 'Carthagenet Table Tennis Series', 'Carthage', 'R. Ben Salah', 'T. Novak', 0, '18:20', { home: 1650, away: 2200 }, { line: '8.5', over: 1850, under: 1900 }, { minute: 'Game 3', home: 1, away: 1 }),
  ev('tableTennis', 'Carthagenet Table Tennis Series', 'Carthage', 'D. Park', 'Y. Trabelsi', 1, '12:00', { home: 1350, away: 3000 }),
  ev('volleyball', 'Mediterranean Volley Cup', 'Europe', 'Blue Waves', 'Red Falcons', 1, '19:00', { home: 1500, away: 2500 }, { line: '4.5', over: 1800, under: 1950 }),
  ev('volleyball', 'Mediterranean Volley Cup', 'Europe', 'Sun Spikers', 'Moon Setters', 2, '17:00', { home: 2050, away: 1750 }),
  ev('iceHockey', 'Northern Ice League', 'Europe', 'Polar Wolves', 'Frost Giants', 0, '22:30', { home: 1900, draw: 4100, away: 3300 }, { line: '5.5', over: 1850, under: 1900 }),
  ev('iceHockey', 'Northern Ice League', 'Europe', 'Aurora Bears', 'Glacier Kings', 2, '20:30', { home: 2400, draw: 4000, away: 2400 }),
  ev('handball', 'Atlas Handball League', 'Carthage', 'Monastir Hawks', 'Gabes Gulls', 1, '18:30', { home: 1700, draw: 6500, away: 3500 }, { line: '56.5', over: 1850, under: 1900 }),
  ev('handball', 'Atlas Handball League', 'Carthage', 'Kairouan Knights', 'Nabeul Navy', 2, '16:30', { home: 2200, draw: 7000, away: 2300 }),
  ev('esports', 'Carthagenet E-sports Arena', 'Online', 'Neon Foxes', 'Cyber Lynx', 0, '20:00', { home: 1750, away: 2050 }, { line: '2.5', over: 1950, under: 1800 }, { minute: 'Map 2', home: 1, away: 0 }),
  ev('esports', 'Carthagenet E-sports Arena', 'Online', 'Pixel Pirates', 'Binary Bulls', 1, '21:00', { home: 2300, away: 1600 }),
];

/** Format thousandths as a two-decimal odds label using integer math only. */
export function oddsLabel(milli: number): string {
  const hundredths = Math.round(milli / 10);
  return `${Math.floor(hundredths / 100)}.${String(hundredths % 100).padStart(2, '0')}`;
}
