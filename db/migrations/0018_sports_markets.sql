-- 0018: more football markets and live (in-play) betting.
--
-- A selection now names its market (match winner, double chance, goals over/under, both teams score, first half,
-- correct score, corners, cards, next goal), its pick and, for over/under markets, its line (x10: 2.5 = 25; only
-- half lines, so a selection can never be a push). Live selections keep the score and minute at the moment the bet
-- was accepted. Old selections keep working: they are all "match_winner" with home / draw / away.

alter table bet_selections drop constraint if exists bet_selections_market_check;
alter table bet_selections drop constraint if exists bet_selections_pick_check;

alter table bet_selections
  add column line_x10       integer,
  add column is_live        boolean not null default false,
  add column bet_home_goals integer,
  add column bet_away_goals integer,
  add column bet_minute     integer,
  -- total corners or cards used to settle an over/under selection (shown to the player)
  add column stat_total     integer;

alter table bet_selections
  add constraint bet_selections_market_check check (market in (
    'match_winner', 'double_chance', 'goals_ou', 'btts', 'ht_winner', 'correct_score', 'corners_ou', 'cards_ou', 'next_goal')),
  add constraint bet_selections_pick_check check (
    (market in ('match_winner', 'ht_winner') and pick in ('home', 'draw', 'away'))
    or (market = 'double_chance' and pick in ('1X', '12', 'X2'))
    or (market in ('goals_ou', 'corners_ou', 'cards_ou') and pick in ('over', 'under'))
    or (market = 'btts' and pick in ('yes', 'no'))
    or (market = 'correct_score' and pick ~ '^[0-9]-[0-9]$')
    or (market = 'next_goal' and pick in ('home', 'none', 'away'))),
  add constraint bet_selections_line_check check (
    (market in ('goals_ou', 'corners_ou', 'cards_ou') and line_x10 between 5 and 305 and line_x10 % 10 = 5)
    or (market not in ('goals_ou', 'corners_ou', 'cards_ou') and line_x10 is null)),
  add constraint bet_selections_live_check check (
    (is_live and bet_home_goals is not null and bet_away_goals is not null and bet_minute is not null)
    or (not is_live and market <> 'next_goal'));

-- A placed selection cannot be changed (now including its line and live data); a settled one is final.
create or replace function bet_selections_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'bet selections are never deleted' using errcode = 'AU906';
  end if;
  if new.bet_id <> old.bet_id or new.fixture_id <> old.fixture_id or new.market <> old.market
     or new.pick <> old.pick or new.odds_x100 <> old.odds_x100 or new.kickoff <> old.kickoff
     or new.line_x10 is distinct from old.line_x10 or new.is_live <> old.is_live
     or new.bet_home_goals is distinct from old.bet_home_goals or new.bet_away_goals is distinct from old.bet_away_goals
     or new.bet_minute is distinct from old.bet_minute then
    raise exception 'a placed selection cannot be changed' using errcode = 'AU906';
  end if;
  if old.result <> 'pending' then
    raise exception 'a settled selection cannot be changed' using errcode = 'AU906';
  end if;
  return new;
end $$;
