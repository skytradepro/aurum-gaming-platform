-- =============================================================================
-- Aurum - migration 0013: withdrawals started by a shop, approved by the player
--
--   withdrawal_approvals  a cashier asks to pay a player in cash (amount at the cashier's shop).
--                         The player sees a one-time 6-digit code in their account and gives it to
--                         the cashier only when they are really at the counter. With the right code
--                         the API creates and pays the withdrawal in one transaction through the
--                         existing withdrawal_create / withdrawal_pay functions (wallet and shop cash).
--
-- Guarantees:
--   * a code works once, for 10 minutes, and at most 5 wrong tries;
--   * nothing moves in the wallet until the code is confirmed;
--   * approvals are never deleted.
-- =============================================================================
create table withdrawal_approvals (
  id             bigint generated always as identity primary key,
  user_id        uuid    not null references users (id),
  shop_id        bigint  not null references shops (id),
  requested_by   uuid    not null references users (id),
  currency       text    not null references currencies (code),
  amount_minor   bigint  not null check (amount_minor between 1 and 1000000000000000),
  code           text    not null check (code ~ '^[0-9]{6}$'),
  attempts       integer not null default 0 check (attempts between 0 and 5),
  status         text    not null default 'pending' check (status in ('pending', 'used', 'refused', 'expired', 'locked')),
  expires_at     timestamptz not null,
  withdrawal_id  bigint  unique references withdrawal_requests (id),
  created_at     timestamptz not null default now(),
  closed_at      timestamptz,
  constraint withdrawal_approval_used check ((status = 'used') = (withdrawal_id is not null)),
  constraint withdrawal_approval_expiry check (expires_at > created_at)
);
create index withdrawal_approvals_user_idx on withdrawal_approvals (user_id, id desc);
create index withdrawal_approvals_pending_idx on withdrawal_approvals (user_id) where status = 'pending';

create function withdrawal_approvals_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'withdrawal approvals are never deleted' using errcode = 'AU905';
  end if;
  if tg_op = 'UPDATE' then
    if old.status <> 'pending' then
      raise exception 'withdrawal approval % is already %', old.id, old.status using errcode = 'AU312';
    end if;
    if new.user_id <> old.user_id or new.shop_id <> old.shop_id or new.requested_by <> old.requested_by
       or new.amount_minor <> old.amount_minor or new.currency <> old.currency or new.code <> old.code
       or new.expires_at <> old.expires_at or new.created_at <> old.created_at then
      raise exception 'the details of a withdrawal approval are immutable' using errcode = 'AU905';
    end if;
  end if;
  return new;
end $$;
create trigger withdrawal_approvals_guard_bud before update or delete on withdrawal_approvals
  for each row execute function withdrawal_approvals_guard();

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
end $$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'aurum_app') then
    perform aurum_apply_grants('aurum_app');
  end if;
end $$;
