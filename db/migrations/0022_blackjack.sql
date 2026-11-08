-- 0022: blackjack. A hand lasts several requests (deal, then hit / stand / double / split), so its cards and the
-- player's moves are kept here until it is settled. The cards come from a 6-deck shoe shuffled with the game secret and
-- the deal's request key: fixed when the hand is dealt, never steerable from the browser. Money moves only through the
-- ledger: bet_stake at the deal and for every double or split, one bet_win when the hand is settled.
create table blackjack_hands (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references users (id),
  wallet_id    bigint      not null references wallets (id),
  currency     text        not null references currencies (code),
  deal_key     text        not null check (length(deal_key) between 8 and 100),
  stake_minor  bigint      not null check (stake_minor > 0),
  state        jsonb       not null,
  status       text        not null default 'open' check (status in ('open', 'done')),
  payout_minor bigint      check (payout_minor is null or payout_minor >= 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint blackjack_hands_one_key unique (user_id, deal_key)
);
-- one hand on the table at a time per player
create unique index blackjack_hands_one_open on blackjack_hands (user_id) where status = 'open';
create index blackjack_hands_user_idx on blackjack_hands (user_id, created_at desc);

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

  -- crypto deposits: created and credited by the API, never deleted
  execute format('grant insert, update on crypto_deposits to %s', r);
  execute format('grant update on crypto_networks to %s', r);

  -- provider games (aggregator): sessions and wallet callbacks, never deleted
  execute format('grant insert, update on provider_sessions, provider_transactions to %s', r);

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

  -- withdrawals started at a shop, approved by the player's one-time code
  execute format('grant insert, update on withdrawal_approvals to %s', r);

  -- online withdrawals (bank / crypto): only through their functions
  execute format('grant execute on function online_withdrawal_create(uuid, bigint, text, jsonb, text) to %s', r);
  execute format('grant execute on function online_withdrawal_close(bigint, text, uuid, text) to %s', r);
  execute format('grant execute on function online_withdrawal_pay(bigint, uuid, text) to %s', r);

  -- prepaid shop balance: only through shop_credit_post() (and shop_player_deposit)
  execute format('grant execute on function shop_credit_post(bigint, text, bigint, text, text, uuid, text, bigint, bigint) to %s', r);

  -- prepaid admin balance: only through staff_credit_post()
  execute format('grant execute on function staff_credit_post(uuid, text, text, bigint, text, text, uuid, text, bigint) to %s', r);

  -- blackjack hands: dealt, played and settled by the API, never deleted
  execute format('grant insert, update on blackjack_hands to %s', r);
end $$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'aurum_app') then
    perform aurum_apply_grants('aurum_app');
  end if;
end $$;
