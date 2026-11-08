-- =============================================================================
-- Aurum - migration 0016: prepaid shop balance
--
-- A shop can only credit players with balance that head office loaded on it first:
--   * head office recharges the shop (and can correct a mistake) with shop_credit_post();
--   * every cash deposit at the shop (shop_player_deposit) takes the same amount from the shop
--     balance, in the same transaction; when the balance is too low the deposit is refused (AU307)
--     and the shop asks head office for a recharge;
--   * every cash payout at the shop (withdrawal_pay) gives the same amount back to the shop balance;
--   * head office can also take balance back from a shop ('withdraw').
--   * the shop balance only changes through shop_credit_post(): append-only entries, row lock on
--     the shop, idempotent, never below zero.
-- The shop cash ledger (cash in the drawer) is unchanged; with a prepaid balance a shop pays players
-- from its own cash, so the drawer may go below zero (allow_negative_cash is turned on).
--
-- New custom SQLSTATEs: AU307 shop_credit_insufficient, AU908 shop_credit_direct_update
-- =============================================================================

alter table shops
  add column credit_balance_minor bigint not null default 0
    check (credit_balance_minor between 0 and 9000000000000000000),
  add column credit_version       bigint not null default 0 check (credit_version >= 0);

-- a shop pays players from its own cash: the prepaid balance is the control, not the drawer
alter table shops alter column allow_negative_cash set default true;
update shops set allow_negative_cash = true where not allow_negative_cash;

create or replace function shops_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'shops are never deleted; close the shop instead' using errcode = 'AU105';
  end if;
  if tg_op = 'INSERT' then
    if new.cash_balance_minor <> 0 or new.cash_version <> 0 then
      raise exception 'a shop starts with no cash; use shop_cash_post()' using errcode = 'AU904';
    end if;
    if new.credit_balance_minor <> 0 or new.credit_version <> 0 then
      raise exception 'a shop starts with no balance; use shop_credit_post()' using errcode = 'AU908';
    end if;
    return new;
  end if;
  if (new.cash_balance_minor <> old.cash_balance_minor or new.cash_version <> old.cash_version)
     and coalesce(current_setting('app.shop_cash_post', true), '') <> 'on' then
    raise exception 'shop cash can only change through shop_cash_post()' using errcode = 'AU904';
  end if;
  if (new.credit_balance_minor <> old.credit_balance_minor or new.credit_version <> old.credit_version)
     and coalesce(current_setting('app.shop_credit_post', true), '') <> 'on' then
    raise exception 'the shop balance can only change through shop_credit_post()' using errcode = 'AU908';
  end if;
  if new.currency <> old.currency and (old.cash_version > 0 or old.credit_version > 0) then
    raise exception 'the currency of a shop with cash movements cannot change' using errcode = 'AU104';
  end if;
  if old.status = 'closed' and new.status <> 'closed' then
    raise exception 'a closed shop cannot be reopened' using errcode = 'AU302';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Shop balance entries
-- ---------------------------------------------------------------------------
create table shop_credit_entry_types (
  code            text primary key,
  direction       smallint not null check (direction in (-1, 1)),
  requires_reason boolean  not null default false,
  cashier_allowed boolean  not null default false,
  description     text     not null
);
insert into shop_credit_entry_types (code, direction, requires_reason, cashier_allowed, description) values
  ('recharge',          1, false, false, 'Balance loaded on the shop by head office'),
  ('withdraw',         -1, false, false, 'Balance taken back from the shop by head office'),
  ('player_deposit',   -1, false, true,  'Balance used to credit a player at the counter'),
  ('player_payout',     1, false, true,  'Cash paid to a player at the counter; the amount returns to the shop balance'),
  ('correction_credit', 1, true,  false, 'Correction that increases the shop balance'),
  ('correction_debit', -1, true,  false, 'Correction that decreases the shop balance');
create trigger shop_credit_entry_types_append_only before delete on shop_credit_entry_types
  for each row execute function forbid_change();

create table shop_credit_entries (
  id                   bigint generated always as identity primary key,
  shop_id              bigint   not null references shops (id),
  currency             text     not null references currencies (code),
  entry_type           text     not null references shop_credit_entry_types (code),
  direction            smallint not null check (direction in (-1, 1)),
  amount_minor         bigint   not null check (amount_minor between 1 and 1000000000000000),
  balance_before_minor bigint   not null check (balance_before_minor >= 0),
  balance_after_minor  bigint   not null check (balance_after_minor >= 0),
  operator_id          uuid     not null references users (id),
  ledger_entry_id      bigint   unique references ledger_entries (id),
  withdrawal_id        bigint   unique references withdrawal_requests (id),
  reason               text     check (length(reason) <= 500),
  idempotency_scope    text     not null check (length(idempotency_scope) between 1 and 100),
  idempotency_key      text     not null check (length(idempotency_key) between 1 and 200),
  request_hash         bytea    not null check (length(request_hash) = 32),
  created_at           timestamptz not null default now(),
  constraint shop_credit_balance_math check (balance_after_minor = balance_before_minor + direction * amount_minor),
  constraint shop_credit_idempotency_unique unique (idempotency_scope, idempotency_key)
);
create index shop_credit_shop_idx on shop_credit_entries (shop_id, id desc);
create trigger shop_credit_entries_append_only before update or delete on shop_credit_entries
  for each row execute function forbid_change();
create trigger shop_credit_entries_no_truncate before truncate on shop_credit_entries
  for each statement execute function forbid_change();

-- ---------------------------------------------------------------------------
-- shop_credit_post(): the ONLY way to change a shop's balance
-- ---------------------------------------------------------------------------
create function shop_credit_post(
  p_shop_id           bigint,
  p_entry_type        text,
  p_amount_minor      bigint,
  p_idempotency_scope text,
  p_idempotency_key   text,
  p_operator_id       uuid,
  p_reason            text   default null,
  p_ledger_entry_id   bigint default null,
  p_withdrawal_id     bigint default null
)
returns table (
  o_replayed             boolean,
  o_id                   bigint,
  o_shop_id              bigint,
  o_currency             text,
  o_entry_type           text,
  o_direction            smallint,
  o_amount_minor         bigint,
  o_balance_before_minor bigint,
  o_balance_after_minor  bigint,
  o_created_at           timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c_max_amount  constant bigint := 1000000000000000;
  c_max_balance constant bigint := 9000000000000000000;
  t          shop_credit_entry_types%rowtype;
  s          shops%rowtype;
  op         users%rowtype;
  e          shop_credit_entries%rowtype;
  v_replayed boolean := false;
  v_hash     bytea;
  v_reason   text := nullif(btrim(coalesce(p_reason, '')), '');
  v_scope    text := btrim(coalesce(p_idempotency_scope, ''));
  v_key      text := btrim(coalesce(p_idempotency_key, ''));
  v_after    bigint;
begin
  if p_shop_id is null then
    raise exception 'a shop is required' using errcode = 'AU301';
  end if;
  if p_amount_minor is null or p_amount_minor < 1 or p_amount_minor > c_max_amount then
    raise exception 'the amount must be between 1 and % minor units', c_max_amount using errcode = 'AU005';
  end if;
  if v_scope = '' or length(v_scope) > 100 or v_key = '' or length(v_key) > 200 then
    raise exception 'an idempotency scope and key are required' using errcode = 'AU011';
  end if;
  if v_reason is not null and length(v_reason) > 500 then
    raise exception 'the reason is too long (500 characters at most)' using errcode = 'AU012';
  end if;

  v_hash := sha256(convert_to(concat_ws('|',
    p_shop_id, p_entry_type, p_amount_minor, coalesce(p_operator_id::text, ''),
    coalesce(v_reason, ''), coalesce(p_ledger_entry_id::text, ''), coalesce(p_withdrawal_id::text, '')), 'UTF8'));

  select * into s from shops where id = p_shop_id for update;
  if not found then
    raise exception 'shop % does not exist', p_shop_id using errcode = 'AU301';
  end if;

  select * into e from shop_credit_entries
   where idempotency_scope = v_scope and idempotency_key = v_key;
  if found then
    if e.request_hash <> v_hash then
      raise exception 'this idempotency key was already used with different parameters' using errcode = 'AU002';
    end if;
    v_replayed := true;
  else
    select * into t from shop_credit_entry_types where code = p_entry_type;
    if not found then
      raise exception 'unknown shop balance entry type %', p_entry_type using errcode = 'AU010';
    end if;

    select * into op from users where id = p_operator_id;
    if p_operator_id is null or not found or op.status <> 'active' then
      raise exception 'an active operator is required' using errcode = 'AU007';
    end if;
    if op.role = 'cashier' then
      if op.shop_id is distinct from s.id then
        raise exception 'this cashier does not work at shop %', s.code using errcode = 'AU306';
      end if;
      if not t.cashier_allowed then
        raise exception 'a cashier cannot record % entries', t.code using errcode = 'AU007';
      end if;
    elsif op.role not in ('admin', 'super_admin') then
      raise exception 'only staff can change a shop balance' using errcode = 'AU007';
    end if;

    if s.status = 'closed' or (s.status = 'suspended' and t.cashier_allowed) then
      raise exception 'shop % is %', s.code, s.status using errcode = 'AU302';
    end if;
    if t.requires_reason and (v_reason is null or length(v_reason) < 3) then
      raise exception 'entry type % requires a reason of at least 3 characters', t.code using errcode = 'AU006';
    end if;
    if t.code = 'player_deposit' and p_ledger_entry_id is null then
      raise exception 'a deposit must reference the wallet entry' using errcode = 'AU012';
    end if;
    if t.code = 'player_payout' and p_withdrawal_id is null then
      raise exception 'a payout must reference the withdrawal request' using errcode = 'AU012';
    end if;

    v_after := s.credit_balance_minor + t.direction * p_amount_minor;
    if v_after < 0 then
      raise exception 'shop % does not have enough balance', s.code using errcode = 'AU307';
    end if;
    if v_after > c_max_balance then
      raise exception 'the resulting shop balance exceeds the supported maximum' using errcode = 'AU009';
    end if;

    begin
      insert into shop_credit_entries (
        shop_id, currency, entry_type, direction, amount_minor, balance_before_minor, balance_after_minor,
        operator_id, ledger_entry_id, withdrawal_id, reason, idempotency_scope, idempotency_key, request_hash)
      values (
        s.id, s.currency, t.code, t.direction, p_amount_minor, s.credit_balance_minor, v_after,
        p_operator_id, p_ledger_entry_id, p_withdrawal_id, v_reason, v_scope, v_key, v_hash)
      returning * into e;
    exception when unique_violation then
      select * into e from shop_credit_entries
       where idempotency_scope = v_scope and idempotency_key = v_key;
      if found and e.request_hash = v_hash then
        v_replayed := true;
      else
        raise;
      end if;
    end;

    if not v_replayed then
      perform set_config('app.shop_credit_post', 'on', true);
      update shops set credit_balance_minor = v_after, credit_version = credit_version + 1 where id = s.id;
      perform set_config('app.shop_credit_post', 'off', true);
    end if;
  end if;

  return query select
    v_replayed, e.id, e.shop_id, e.currency, e.entry_type, e.direction,
    e.amount_minor, e.balance_before_minor, e.balance_after_minor, e.created_at;
end $$;

-- ---------------------------------------------------------------------------
-- shop_player_deposit(): same as migration 0006, plus the prepaid shop balance
-- ---------------------------------------------------------------------------
create or replace function shop_player_deposit(
  p_shop_id         bigint,
  p_user_id         uuid,
  p_amount_minor    bigint,
  p_operator_id     uuid,
  p_idempotency_key text
)
returns table (
  o_replayed                  boolean,
  o_ledger_entry_id           bigint,
  o_cash_entry_id             bigint,
  o_currency                  text,
  o_amount_minor              bigint,
  o_wallet_balance_after_minor bigint,
  o_cash_balance_after_minor  bigint,
  o_created_at                timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  s     shops%rowtype;
  u     users%rowtype;
  w     wallets%rowtype;
  op    users%rowtype;
  le    record;
  ce    record;
  cr    record;
  v_scope text;
begin
  select * into s from shops where id = p_shop_id;
  if not found then
    raise exception 'shop % does not exist', p_shop_id using errcode = 'AU301';
  end if;
  if s.status <> 'active' then
    raise exception 'shop % is %', s.code, s.status using errcode = 'AU302';
  end if;
  select * into op from users where id = p_operator_id;
  if not found or op.status <> 'active' or op.role <> 'cashier' or op.shop_id is distinct from s.id then
    raise exception 'only an active cashier of shop % can record this deposit', s.code using errcode = 'AU306';
  end if;
  select * into u from users where id = p_user_id;
  if not found or u.role <> 'user' then
    raise exception 'player not found' using errcode = 'AU013';
  end if;
  select * into w from wallets where user_id = p_user_id and kind = 'main';
  if not found then
    raise exception 'the player has no wallet' using errcode = 'AU003';
  end if;
  if w.currency <> s.currency then
    raise exception 'the player wallet is in % but shop % handles %', w.currency, s.code, s.currency
      using errcode = 'AU303';
  end if;
  if s.max_deposit_minor is not null and p_amount_minor > s.max_deposit_minor then
    raise exception 'the amount exceeds the deposit limit of shop %', s.code using errcode = 'AU304';
  end if;

  v_scope := 'shop-deposit:' || s.id;
  -- lock order everywhere: wallet first (inside ledger_post), then shop (inside shop_cash_post)
  select * into le from ledger_post(
    w.id, 'deposit', p_amount_minor, v_scope, p_idempotency_key, p_operator_id, null, s.code,
    null, null, null, jsonb_build_object('channel', 'shop', 'shop_id', s.id, 'shop_code', s.code));
  select * into ce from shop_cash_post(
    s.id, 'player_deposit', p_amount_minor, v_scope, p_idempotency_key, p_operator_id, null, s.code, le.o_id, null);
  -- the prepaid shop balance pays for the deposit (refused when it is too low). A deposit replayed from
  -- before migration 0016 has no balance entry and is not charged again.
  if not le.o_replayed
     or exists (select 1 from shop_credit_entries where idempotency_scope = v_scope and idempotency_key = p_idempotency_key) then
    select * into cr from shop_credit_post(
      s.id, 'player_deposit', p_amount_minor, v_scope, p_idempotency_key, p_operator_id, null, le.o_id, null);
  end if;

  return query select le.o_replayed and ce.o_replayed, le.o_id, ce.o_id, le.o_currency, le.o_amount_minor,
                      le.o_balance_after_minor, ce.o_balance_after_minor, le.o_created_at;
end $$;

-- ---------------------------------------------------------------------------
-- withdrawal_pay(): same as migration 0006, plus the prepaid shop balance
-- ---------------------------------------------------------------------------
create or replace function withdrawal_pay(
  p_withdrawal_id bigint,
  p_shop_id       bigint,
  p_operator_id   uuid,
  p_note          text default null
)
returns table (o_replayed boolean, o_id bigint, o_cash_entry_id bigint, o_cash_balance_after_minor bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r  withdrawal_requests%rowtype;
  s  shops%rowtype;
  op users%rowtype;
  ce record;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  select * into r from withdrawal_requests where id = p_withdrawal_id for update;
  if not found then
    raise exception 'withdrawal request % does not exist', p_withdrawal_id using errcode = 'AU311';
  end if;
  if r.status = 'paid' and r.paid_by = p_operator_id and r.paid_shop_id = p_shop_id then
    -- the same cashier pressed "pay" twice: nothing more happens
    return query select true, r.id, r.payout_cash_entry_id,
      (select c.balance_after_minor from shop_cash_entries c where c.id = r.payout_cash_entry_id);
    return;
  end if;
  if r.status <> 'pending' then
    raise exception 'withdrawal request % is already %', r.code, r.status using errcode = 'AU312';
  end if;
  if r.expires_at <= now() then
    raise exception 'withdrawal request % has expired', r.code using errcode = 'AU313';
  end if;

  select * into s from shops where id = p_shop_id;
  if not found then
    raise exception 'shop % does not exist', p_shop_id using errcode = 'AU301';
  end if;
  if s.status <> 'active' then
    raise exception 'shop % is %', s.code, s.status using errcode = 'AU302';
  end if;
  select * into op from users where id = p_operator_id;
  if not found or op.status <> 'active' or op.role <> 'cashier' or op.shop_id is distinct from s.id then
    raise exception 'only an active cashier of shop % can pay this withdrawal', s.code using errcode = 'AU306';
  end if;
  if s.currency <> r.currency then
    raise exception 'shop % pays out in %, the request is in %', s.code, s.currency, r.currency using errcode = 'AU303';
  end if;
  if s.max_payout_minor is not null and r.amount_minor > s.max_payout_minor then
    raise exception 'the amount exceeds the payout limit of shop %', s.code using errcode = 'AU304';
  end if;
  if v_note is not null and length(v_note) > 300 then
    raise exception 'the note is too long (300 characters at most)' using errcode = 'AU012';
  end if;

  select * into ce from shop_cash_post(
    s.id, 'withdrawal_payout', r.amount_minor, 'withdrawal-payout', r.id::text, p_operator_id,
    null, r.code, null, r.id);
  -- the amount paid in cash goes back to the shop's prepaid balance (migration 0016)
  perform shop_credit_post(
    s.id, 'player_payout', r.amount_minor, 'withdrawal-payout', r.id::text, p_operator_id, null, null, r.id);

  perform set_config('app.withdrawal_fn', 'on', true);
  update withdrawal_requests
     set status = 'paid', paid_at = now(), paid_by = p_operator_id, paid_shop_id = s.id,
         payout_cash_entry_id = ce.o_id, id_check_note = v_note
   where id = r.id;
  perform set_config('app.withdrawal_fn', 'off', true);
  return query select false, r.id, ce.o_id, ce.o_balance_after_minor;
end $$;

-- ---------------------------------------------------------------------------
-- Grants: same as migration 0013 plus shop_credit_post()
-- ---------------------------------------------------------------------------
revoke all on function shop_credit_post(bigint, text, bigint, text, text, uuid, text, bigint, bigint) from public;

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
end $$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'aurum_app') then
    perform aurum_apply_grants('aurum_app');
  end if;
end $$;
