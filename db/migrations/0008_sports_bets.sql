-- =============================================================================
-- Aurum - migration 0008: sports bets (single and accumulator) on real football matches
--
--   bets            one row per bet slip: stake, status, payout. Money moves only through the ledger
--                   (bet_stake when placed, bet_win / bet_refund when settled).
--   bet_selections  one row per match in the slip, with the odds fixed at the moment the bet was placed.
--
-- Guarantees enforced by the database itself:
--   * the stake, the odds, the player and the matches of a placed bet can never be changed;
--   * a bet is settled once: open -> won | lost | void, never back;
--   * a selection is settled once: pending -> won | lost | void;
--   * the same (player, idempotency key) never creates a second bet.
-- =============================================================================
create table bets (
  id                     bigint generated always as identity primary key,
  user_id                uuid    not null references users (id),
  wallet_id              bigint  not null references wallets (id),
  currency               text    not null references currencies (code),
  kind                   text    not null check (kind in ('single', 'accumulator')),
  stake_minor            bigint  not null check (stake_minor > 0),
  potential_payout_minor bigint  not null check (potential_payout_minor >= stake_minor),
  total_odds             numeric(20, 4) not null check (total_odds >= 1),
  status                 text    not null default 'open' check (status in ('open', 'won', 'lost', 'void')),
  payout_minor           bigint  not null default 0 check (payout_minor >= 0),
  idempotency_key        text    not null check (length(idempotency_key) between 8 and 100),
  created_at             timestamptz not null default now(),
  settled_at             timestamptz,
  constraint bets_one_key unique (user_id, idempotency_key)
);
create index bets_user_idx on bets (user_id, id desc);
create index bets_open_idx on bets (id) where status = 'open';

create table bet_selections (
  id         bigint generated always as identity primary key,
  bet_id     bigint  not null references bets (id),
  fixture_id bigint  not null,
  market     text    not null default 'match_winner' check (market in ('match_winner')),
  pick       text    not null check (pick in ('home', 'draw', 'away')),
  odds_x100  integer not null check (odds_x100 between 101 and 100000),
  league     text    not null default '',
  home_name  text    not null,
  away_name  text    not null,
  kickoff    timestamptz not null,
  result     text    not null default 'pending' check (result in ('pending', 'won', 'lost', 'void')),
  home_goals integer,
  away_goals integer,
  settled_at timestamptz,
  constraint bet_selections_one_match unique (bet_id, fixture_id)
);
create index bet_selections_pending_idx on bet_selections (fixture_id) where result = 'pending';

create function bets_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'bets are never deleted' using errcode = 'AU906';
  end if;
  if new.user_id <> old.user_id or new.wallet_id <> old.wallet_id or new.currency <> old.currency
     or new.kind <> old.kind or new.stake_minor <> old.stake_minor
     or new.potential_payout_minor <> old.potential_payout_minor or new.total_odds <> old.total_odds
     or new.idempotency_key <> old.idempotency_key or new.created_at <> old.created_at then
    raise exception 'a placed bet cannot be changed' using errcode = 'AU906';
  end if;
  if old.status <> 'open' then
    raise exception 'a settled bet cannot be changed' using errcode = 'AU906';
  end if;
  return new;
end $$;
create trigger bets_guard before update or delete on bets
  for each row execute function bets_guard();

create function bet_selections_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'bet selections are never deleted' using errcode = 'AU906';
  end if;
  if new.bet_id <> old.bet_id or new.fixture_id <> old.fixture_id or new.market <> old.market
     or new.pick <> old.pick or new.odds_x100 <> old.odds_x100 or new.kickoff <> old.kickoff then
    raise exception 'a placed selection cannot be changed' using errcode = 'AU906';
  end if;
  if old.result <> 'pending' then
    raise exception 'a settled selection cannot be changed' using errcode = 'AU906';
  end if;
  return new;
end $$;
create trigger bet_selections_guard before update or delete on bet_selections
  for each row execute function bet_selections_guard();

-- ---------------------------------------------------------------------------
-- Least-privilege grants: same function as in 0006, extended to the new tables
-- ---------------------------------------------------------------------------
create or replace function aurum_apply_grants(p_role text) returns void
language plpgsql as $$
declare
  r text := quote_ident(p_role);
begin
  if not exists (select 1 from pg_roles where rolname = p_role) then
    raise exception 'role % does not exist', p_role using errcode = 'AU012';
  end if;

  execute format('revoke all on all tables in schema public from %s', r);
  execute format('grant usage on schema public to %s', r);
  execute format('grant select on all tables in schema public to %s', r);

  execute format('grant insert, update on languages, currencies, countries to %s', r);
  execute format('grant insert, update on users to %s', r);
  execute format('grant insert, update, delete on sessions to %s', r);
  execute format('grant insert on exchange_rates, audit_logs to %s', r);

  execute format('grant insert, delete on media_assets to %s', r);
  execute format('grant insert, update, delete on banners, banner_translations to %s', r);
  execute format('grant insert, update, delete on promotions, promotion_translations to %s', r);
  execute format('grant insert, update, delete on pages, page_translations to %s', r);
  execute format('grant insert, update, delete on game_providers, games to %s', r);
  execute format('grant insert, update on site_settings to %s', r);

  execute format('grant insert, update on shops to %s', r);
  execute format('grant insert on shop_cash_counts to %s', r);

  -- sports bets: created and settled by the API, never deleted
  execute format('grant insert, update on bets, bet_selections to %s', r);

  execute format('revoke all on function ledger_post(bigint, text, bigint, text, text, uuid, text, text, bigint, text, numeric, jsonb) from public');
  execute format('grant execute on function ledger_post(bigint, text, bigint, text, text, uuid, text, text, bigint, text, numeric, jsonb) to %s', r);
  execute format('grant execute on function ledger_verify(bigint) to %s', r);
  execute format('grant execute on function shop_cash_post(bigint, text, bigint, text, text, uuid, text, text, bigint, bigint) to %s', r);
  execute format('grant execute on function shop_player_deposit(bigint, uuid, bigint, uuid, text) to %s', r);
  execute format('grant execute on function withdrawal_create(uuid, bigint, text, timestamptz, bigint, text) to %s', r);
  execute format('grant execute on function withdrawal_close(bigint, text, uuid, text) to %s', r);
  execute format('grant execute on function withdrawal_pay(bigint, bigint, uuid, text) to %s', r);
  execute format('grant execute on function withdrawal_expire_due(integer) to %s', r);
  execute format('grant execute on function shop_cash_verify(bigint) to %s', r);
end $$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'aurum_app') then
    perform aurum_apply_grants('aurum_app');
  end if;
end $$;
