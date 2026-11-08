-- 0019: more football markets: draw no bet, second half result, first half goals, home / away team goals,
-- odd / even goals and half time - full time. Only the allowed markets, picks and lines change; placed selections
-- keep their checks (a line is always a half line, so a selection can never be a push).

alter table bet_selections drop constraint if exists bet_selections_market_check;
alter table bet_selections drop constraint if exists bet_selections_pick_check;
alter table bet_selections drop constraint if exists bet_selections_line_check;

alter table bet_selections
  add constraint bet_selections_market_check check (market in (
    'match_winner', 'double_chance', 'goals_ou', 'btts', 'ht_winner', 'correct_score', 'corners_ou', 'cards_ou', 'next_goal',
    'draw_no_bet', 'sh_winner', 'ht_goals_ou', 'home_goals_ou', 'away_goals_ou', 'odd_even', 'ht_ft')),
  add constraint bet_selections_pick_check check (
    (market in ('match_winner', 'ht_winner', 'sh_winner') and pick in ('home', 'draw', 'away'))
    or (market = 'double_chance' and pick in ('1X', '12', 'X2'))
    or (market in ('goals_ou', 'corners_ou', 'cards_ou', 'ht_goals_ou', 'home_goals_ou', 'away_goals_ou') and pick in ('over', 'under'))
    or (market = 'btts' and pick in ('yes', 'no'))
    or (market = 'correct_score' and pick ~ '^[0-9]-[0-9]$')
    or (market = 'next_goal' and pick in ('home', 'none', 'away'))
    or (market = 'draw_no_bet' and pick in ('home', 'away'))
    or (market = 'odd_even' and pick in ('odd', 'even'))
    or (market = 'ht_ft' and pick ~ '^[1X2]-[1X2]$')),
  add constraint bet_selections_line_check check (
    (market in ('goals_ou', 'corners_ou', 'cards_ou', 'ht_goals_ou', 'home_goals_ou', 'away_goals_ou') and line_x10 between 5 and 305 and line_x10 % 10 = 5)
    or (market not in ('goals_ou', 'corners_ou', 'cards_ou', 'ht_goals_ou', 'home_goals_ou', 'away_goals_ou') and line_x10 is null));
