-- =============================================================================
-- Aurum - migration 0012: online withdrawals (bank transfer or crypto) and the welcome gift
--
--   online_withdrawals  one row per withdrawal the player asks to receive by bank transfer
--                       (IBAN) or crypto (network + address). The amount is reserved at once
--                       (wallet debit "withdrawal_online"). Head office sends the money by hand,
--                       then marks the request paid with the bank / transaction reference.
--                       A cancelled (player) or rejected (staff, reason required) request gives
--                       the reserved amount back ("withdrawal_online_release").
--   welcome_gift        a small credit once per account when it is created (idempotent per user).
--
-- Guarantees enforced by the database itself:
--   * a request changes only through the online_withdrawal_* functions, never deleted;
--   * the player must have at least one real deposit (staff deposit or crypto deposit);
--   * at most 3 pending requests per player;
--   * only an active admin or super admin can mark a request paid or rejected.
-- =============================================================================
insert into ledger_entry_types
  (code, direction, wallet_kind, requires_reason, staff_only, blocked_when_suspended, description) values
  ('withdrawal_online',         -1, 'main', false, false, true,  'Funds reserved for a withdrawal sent by bank transfer or crypto'),
  ('withdrawal_online_release',  1, 'main', false, false, false, 'Reserved online withdrawal returned (cancelled or rejected)'),
  ('welcome_gift',               1, 'main', false, false, false, 'Welcome gift credited once when the account is created');

create table online_withdrawals (
  id               bigint generated always as identity primary key,
  user_id          uuid    not null references users (id),
  wallet_id        bigint  not null references wallets (id),
  currency         text    not null references currencies (code),
  amount_minor     bigint  not null check (amount_minor between 1 and 1000000000000000),
  method           text    not null check (method in ('bank', 'crypto')),
  details          jsonb   not null check (jsonb_typeof(details) = 'object' and length(details::text) <= 1000),
  status           text    not null default 'pending' check (status in ('pending', 'paid', 'cancelled', 'rejected')),
  hold_entry_id    bigint  not null unique references ledger_entries (id),
  release_entry_id bigint  unique references ledger_entries (id),
  paid_at          timestamptz,
  paid_by          uuid    references users (id),
  payout_reference text    check (length(payout_reference) between 3 and 200),
  closed_at        timestamptz,
  closed_by        uuid    references users (id),
  close_reason     text    check (length(close_reason) <= 500),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint online_withdrawal_paid_fields check (
    (status = 'paid') = (paid_at is not null and paid_by is not null and payout_reference is not null)),
  constraint online_withdrawal_closed_fields check (
    (status in ('cancelled', 'rejected')) = (closed_at is not null and release_entry_id is not null))
);
create index online_withdrawals_user_idx    on online_withdrawals (user_id, id desc);
create index online_withdrawals_status_idx  on online_withdrawals (status, id desc);
create trigger online_withdrawals_touch before update on online_withdrawals
  for each row execute function touch_updated_at();

create function online_withdrawals_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'online withdrawals are never deleted' using errcode = 'AU905';
  end if;
  if coalesce(current_setting('app.online_withdrawal_fn', true), '') <> 'on' then
    raise exception 'online withdrawals change only through the online_withdrawal_* functions' using errcode = 'AU905';
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'pending' then
      raise exception 'an online withdrawal starts pending' using errcode = 'AU905';
    end if;
    return new;
  end if;
  if old.status <> 'pending' then
    raise exception 'online withdrawal % is already %', old.id, old.status using errcode = 'AU312';
  end if;
  if new.user_id <> old.user_id or new.wallet_id <> old.wallet_id or new.currency <> old.currency
     or new.amount_minor <> old.amount_minor or new.method <> old.method or new.details <> old.details
     or new.hold_entry_id <> old.hold_entry_id or new.created_at <> old.created_at then
    raise exception 'the details of an online withdrawal are immutable' using errcode = 'AU905';
  end if;
  return new;
end $$;
create trigger online_withdrawals_guard_biud before insert or update or delete on online_withdrawals
  for each row execute function online_withdrawals_guard();

-- ---------------------------------------------------------------------------
-- online_withdrawal_create(): the player asks for a payout; the amount is reserved at once
-- ---------------------------------------------------------------------------
create function online_withdrawal_create(
  p_user_id         uuid,
  p_amount_minor    bigint,
  p_method          text,
  p_details         jsonb,
  p_idempotency_key text
)
returns table (o_replayed boolean, o_id bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  w  wallets%rowtype;
  u  users%rowtype;
  le record;
  r  online_withdrawals%rowtype;
begin
  select * into u from users where id = p_user_id;
  if not found or u.role <> 'user' then
    raise exception 'player not found' using errcode = 'AU013';
  end if;
  if u.status <> 'active' then
    raise exception 'this account cannot request withdrawals while it is %', u.status using errcode = 'AU004';
  end if;
  if p_method not in ('bank', 'crypto') then
    raise exception 'invalid withdrawal method %', p_method using errcode = 'AU012';
  end if;
  if p_details is null or jsonb_typeof(p_details) <> 'object' or length(p_details::text) > 1000 then
    raise exception 'invalid payout details' using errcode = 'AU012';
  end if;
  select * into w from wallets where user_id = p_user_id and kind = 'main' for update;
  if not found then
    raise exception 'the player has no wallet' using errcode = 'AU003';
  end if;
  if not exists (select 1 from ledger_entries e where e.wallet_id = w.id and e.entry_type in ('deposit', 'deposit_crypto')) then
    raise exception 'a withdrawal needs at least one deposit' using errcode = 'AU320';
  end if;

  select * into le from ledger_post(
    w.id, 'withdrawal_online', p_amount_minor, 'online-withdrawal:' || p_user_id, p_idempotency_key,
    null, null, null, null, null, null, jsonb_build_object('channel', p_method));

  if le.o_replayed then
    select * into r from online_withdrawals where hold_entry_id = le.o_id;
    if not found then
      raise exception 'this idempotency key was already used for another operation' using errcode = 'AU002';
    end if;
    return query select true, r.id;
    return;
  end if;

  if (select count(*) from online_withdrawals where user_id = p_user_id and status = 'pending') >= 3 then
    raise exception 'too many pending withdrawals' using errcode = 'AU321';
  end if;

  perform set_config('app.online_withdrawal_fn', 'on', true);
  insert into online_withdrawals (user_id, wallet_id, currency, amount_minor, method, details, hold_entry_id)
  values (p_user_id, w.id, w.currency, p_amount_minor, p_method, p_details, le.o_id)
  returning * into r;
  perform set_config('app.online_withdrawal_fn', 'off', true);
  return query select false, r.id;
end $$;

-- ---------------------------------------------------------------------------
-- online_withdrawal_close(): cancelled by the player or rejected by staff (reason required).
-- The reserved amount goes back to the wallet.
-- ---------------------------------------------------------------------------
create function online_withdrawal_close(
  p_id       bigint,
  p_status   text,
  p_actor_id uuid,
  p_reason   text default null
)
returns table (o_id bigint, o_status text, o_release_entry_id bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r        online_withdrawals%rowtype;
  a        users%rowtype;
  le       record;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if p_status not in ('cancelled', 'rejected') then
    raise exception 'invalid closing status %', p_status using errcode = 'AU012';
  end if;
  select * into r from online_withdrawals where id = p_id for update;
  if not found then
    raise exception 'online withdrawal % does not exist', p_id using errcode = 'AU311';
  end if;
  if r.status <> 'pending' then
    raise exception 'online withdrawal % is already %', r.id, r.status using errcode = 'AU312';
  end if;
  select * into a from users where id = p_actor_id;
  if not found then
    raise exception 'actor not found' using errcode = 'AU007';
  end if;
  if p_status = 'cancelled' and a.id <> r.user_id then
    raise exception 'only the player can cancel this withdrawal' using errcode = 'AU007';
  end if;
  if p_status = 'rejected' then
    if a.status <> 'active' or a.role not in ('admin', 'super_admin') then
      raise exception 'only head office can reject a withdrawal' using errcode = 'AU007';
    end if;
    if v_reason is null or length(v_reason) < 3 then
      raise exception 'a rejection needs a reason of at least 3 characters' using errcode = 'AU006';
    end if;
  end if;

  select * into le from ledger_post(
    r.wallet_id, 'withdrawal_online_release', r.amount_minor, 'online-withdrawal-release', r.id::text,
    null, null, null, null, null, null, jsonb_build_object('online_withdrawal_id', r.id, 'status', p_status));

  perform set_config('app.online_withdrawal_fn', 'on', true);
  update online_withdrawals
     set status = p_status, release_entry_id = le.o_id, closed_at = now(), closed_by = p_actor_id, close_reason = v_reason
   where id = r.id;
  perform set_config('app.online_withdrawal_fn', 'off', true);
  return query select r.id, p_status, le.o_id;
end $$;

-- ---------------------------------------------------------------------------
-- online_withdrawal_pay(): head office has sent the money; record the bank / transaction reference.
-- No wallet movement here: the amount already left the wallet when it was reserved.
-- ---------------------------------------------------------------------------
create function online_withdrawal_pay(
  p_id        bigint,
  p_staff_id  uuid,
  p_reference text
)
returns table (o_replayed boolean, o_id bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r     online_withdrawals%rowtype;
  a     users%rowtype;
  v_ref text := nullif(btrim(coalesce(p_reference, '')), '');
begin
  if v_ref is null or length(v_ref) < 3 or length(v_ref) > 200 then
    raise exception 'a payment reference of 3 to 200 characters is required' using errcode = 'AU006';
  end if;
  select * into a from users where id = p_staff_id;
  if not found or a.status <> 'active' or a.role not in ('admin', 'super_admin') then
    raise exception 'only head office can mark a withdrawal paid' using errcode = 'AU007';
  end if;
  select * into r from online_withdrawals where id = p_id for update;
  if not found then
    raise exception 'online withdrawal % does not exist', p_id using errcode = 'AU311';
  end if;
  if r.status = 'paid' and r.paid_by = p_staff_id and r.payout_reference = v_ref then
    return query select true, r.id;
    return;
  end if;
  if r.status <> 'pending' then
    raise exception 'online withdrawal % is already %', r.id, r.status using errcode = 'AU312';
  end if;

  perform set_config('app.online_withdrawal_fn', 'on', true);
  update online_withdrawals set status = 'paid', paid_at = now(), paid_by = p_staff_id, payout_reference = v_ref where id = r.id;
  perform set_config('app.online_withdrawal_fn', 'off', true);
  return query select false, r.id;
end $$;

revoke all on function online_withdrawal_create(uuid, bigint, text, jsonb, text) from public;
revoke all on function online_withdrawal_close(bigint, text, uuid, text) from public;
revoke all on function online_withdrawal_pay(bigint, uuid, text) from public;

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
