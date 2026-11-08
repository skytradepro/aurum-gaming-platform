-- =============================================================================
-- Aurum - migration 0017: prepaid balance for admins
--
-- Only the Super Admin creates money. Every other admin works with a balance the Super Admin
-- gives him:
--   * the Super Admin adds balance to an admin ('recharge'), takes it back ('withdraw') or corrects
--     a mistake (with a reason), per currency;
--   * when an admin credits a player (deposit, correction +), the same amount is taken from the
--     admin's balance in the same transaction; when the balance is too low the posting is refused
--     (AU308) and the admin asks the Super Admin for a new recharge;
--   * when an admin debits a player (cash-out, correction -), the amount comes back to his balance;
--   * the balance only changes through staff_credit_post(): append-only entries, row lock,
--     idempotent, never below zero;
--   * a deferred check on ledger_entries refuses any player deposit / withdrawal / correction made
--     by an admin that did not go through his balance (AU909), so no code path can skip it.
-- The Super Admin is not limited. Shop cashiers keep the shop balance of migration 0016.
--
-- New custom SQLSTATEs: AU308 staff_credit_insufficient, AU909 staff_credit_direct_update / bypass
-- =============================================================================

create table staff_credit_balances (
  user_id       uuid   not null references users (id),
  currency      text   not null references currencies (code),
  balance_minor bigint not null default 0 check (balance_minor between 0 and 9000000000000000000),
  version       bigint not null default 0 check (version >= 0),
  updated_at    timestamptz not null default now(),
  primary key (user_id, currency)
);

create function staff_credit_balances_guard() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('app.staff_credit_post', true), '') <> 'on' then
    raise exception 'an admin balance can only change through staff_credit_post()' using errcode = 'AU909';
  end if;
  if tg_op = 'DELETE' then
    raise exception 'admin balances are never deleted' using errcode = 'AU909';
  end if;
  return new;
end $$;
create trigger staff_credit_balances_guard_biud before insert or update or delete on staff_credit_balances
  for each row execute function staff_credit_balances_guard();
create trigger staff_credit_balances_no_truncate before truncate on staff_credit_balances
  for each statement execute function forbid_change();

-- ---------------------------------------------------------------------------
-- Admin balance entries
-- ---------------------------------------------------------------------------
create table staff_credit_entry_types (
  code            text primary key,
  direction       smallint not null check (direction in (-1, 1)),
  requires_reason boolean  not null default false,
  head_office     boolean  not null,
  description     text     not null
);
insert into staff_credit_entry_types (code, direction, requires_reason, head_office, description) values
  ('recharge',           1, false, true,  'Balance given to the admin by the Super Admin'),
  ('withdraw',          -1, false, true,  'Balance taken back from the admin by the Super Admin'),
  ('player_deposit',    -1, false, false, 'Balance used by the admin to credit a player'),
  ('player_withdrawal',  1, false, false, 'Amount taken from a player by the admin; it returns to his balance'),
  ('correction_credit',  1, true,  true,  'Correction that increases the admin balance'),
  ('correction_debit',  -1, true,  true,  'Correction that decreases the admin balance');
create trigger staff_credit_entry_types_append_only before delete on staff_credit_entry_types
  for each row execute function forbid_change();

create table staff_credit_entries (
  id                   bigint generated always as identity primary key,
  staff_id             uuid     not null references users (id),
  currency             text     not null references currencies (code),
  entry_type           text     not null references staff_credit_entry_types (code),
  direction            smallint not null check (direction in (-1, 1)),
  amount_minor         bigint   not null check (amount_minor between 1 and 1000000000000000),
  balance_before_minor bigint   not null check (balance_before_minor >= 0),
  balance_after_minor  bigint   not null check (balance_after_minor >= 0),
  operator_id          uuid     not null references users (id),
  ledger_entry_id      bigint   unique references ledger_entries (id),
  reason               text     check (length(reason) <= 500),
  idempotency_scope    text     not null check (length(idempotency_scope) between 1 and 100),
  idempotency_key      text     not null check (length(idempotency_key) between 1 and 200),
  request_hash         bytea    not null check (length(request_hash) = 32),
  created_at           timestamptz not null default now(),
  constraint staff_credit_balance_math check (balance_after_minor = balance_before_minor + direction * amount_minor),
  constraint staff_credit_idempotency_unique unique (idempotency_scope, idempotency_key)
);
create index staff_credit_staff_idx on staff_credit_entries (staff_id, id desc);
create trigger staff_credit_entries_append_only before update or delete on staff_credit_entries
  for each row execute function forbid_change();
create trigger staff_credit_entries_no_truncate before truncate on staff_credit_entries
  for each statement execute function forbid_change();

-- ---------------------------------------------------------------------------
-- staff_credit_post(): the ONLY way to change an admin's balance
-- ---------------------------------------------------------------------------
create function staff_credit_post(
  p_staff_id          uuid,
  p_currency          text,
  p_entry_type        text,
  p_amount_minor      bigint,
  p_idempotency_scope text,
  p_idempotency_key   text,
  p_operator_id       uuid,
  p_reason            text   default null,
  p_ledger_entry_id   bigint default null
)
returns table (
  o_replayed             boolean,
  o_id                   bigint,
  o_staff_id             uuid,
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
  t          staff_credit_entry_types%rowtype;
  st         users%rowtype;
  op         users%rowtype;
  b          staff_credit_balances%rowtype;
  le         ledger_entries%rowtype;
  e          staff_credit_entries%rowtype;
  v_replayed boolean := false;
  v_hash     bytea;
  v_reason   text := nullif(btrim(coalesce(p_reason, '')), '');
  v_scope    text := btrim(coalesce(p_idempotency_scope, ''));
  v_key      text := btrim(coalesce(p_idempotency_key, ''));
  v_after    bigint;
begin
  if p_staff_id is null then
    raise exception 'an admin is required' using errcode = 'AU013';
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
    p_staff_id, coalesce(p_currency, ''), p_entry_type, p_amount_minor, coalesce(p_operator_id::text, ''),
    coalesce(v_reason, ''), coalesce(p_ledger_entry_id::text, '')), 'UTF8'));

  select * into st from users where id = p_staff_id;
  if not found or st.role <> 'admin' then
    raise exception 'only admin accounts have a prepaid balance' using errcode = 'AU013';
  end if;
  if not exists (select 1 from currencies where code = p_currency) then
    raise exception 'unknown currency %', p_currency using errcode = 'AU010';
  end if;

  -- one row per admin and currency, locked for the whole posting
  perform set_config('app.staff_credit_post', 'on', true);
  insert into staff_credit_balances (user_id, currency) values (p_staff_id, p_currency) on conflict do nothing;
  perform set_config('app.staff_credit_post', 'off', true);
  select * into b from staff_credit_balances where user_id = p_staff_id and currency = p_currency for update;

  select * into e from staff_credit_entries
   where idempotency_scope = v_scope and idempotency_key = v_key;
  if found then
    if e.request_hash <> v_hash then
      raise exception 'this idempotency key was already used with different parameters' using errcode = 'AU002';
    end if;
    v_replayed := true;
  else
    select * into t from staff_credit_entry_types where code = p_entry_type;
    if not found then
      raise exception 'unknown admin balance entry type %', p_entry_type using errcode = 'AU010';
    end if;

    select * into op from users where id = p_operator_id;
    if p_operator_id is null or not found or op.status <> 'active' then
      raise exception 'an active operator is required' using errcode = 'AU007';
    end if;

    if t.head_office then
      -- only the Super Admin gives, takes back or corrects an admin balance
      if op.role <> 'super_admin' then
        raise exception 'only the Super Admin can change an admin balance' using errcode = 'AU007';
      end if;
      if st.status = 'closed' and t.direction > 0 then
        raise exception 'this admin account is closed' using errcode = 'AU007';
      end if;
      if p_ledger_entry_id is not null then
        raise exception 'a head office entry does not reference a wallet entry' using errcode = 'AU012';
      end if;
    else
      -- the admin's own movement with a player: must match the wallet entry exactly
      if op.id <> st.id then
        raise exception 'an admin can only use his own balance' using errcode = 'AU007';
      end if;
      if p_ledger_entry_id is null then
        raise exception 'a player movement must reference the wallet entry' using errcode = 'AU012';
      end if;
      select * into le from ledger_entries where id = p_ledger_entry_id;
      if not found
         or le.operator_id is distinct from st.id
         or le.currency <> p_currency
         or le.amount_minor <> p_amount_minor
         or (t.code = 'player_deposit' and le.entry_type not in ('deposit', 'adjustment_credit'))
         or (t.code = 'player_withdrawal' and le.entry_type not in ('withdrawal', 'adjustment_debit')) then
        raise exception 'the wallet entry does not match this admin balance movement' using errcode = 'AU012';
      end if;
    end if;

    if t.requires_reason and (v_reason is null or length(v_reason) < 3) then
      raise exception 'entry type % requires a reason of at least 3 characters', t.code using errcode = 'AU006';
    end if;

    v_after := b.balance_minor + t.direction * p_amount_minor;
    if v_after < 0 then
      raise exception 'admin % does not have enough balance in %', st.username, p_currency using errcode = 'AU308';
    end if;
    if v_after > c_max_balance then
      raise exception 'the resulting admin balance exceeds the supported maximum' using errcode = 'AU009';
    end if;

    begin
      insert into staff_credit_entries (
        staff_id, currency, entry_type, direction, amount_minor, balance_before_minor, balance_after_minor,
        operator_id, ledger_entry_id, reason, idempotency_scope, idempotency_key, request_hash)
      values (
        st.id, p_currency, t.code, t.direction, p_amount_minor, b.balance_minor, v_after,
        p_operator_id, p_ledger_entry_id, v_reason, v_scope, v_key, v_hash)
      returning * into e;
    exception when unique_violation then
      select * into e from staff_credit_entries
       where idempotency_scope = v_scope and idempotency_key = v_key;
      if found and e.request_hash = v_hash then
        v_replayed := true;
      else
        raise;
      end if;
    end;

    if not v_replayed then
      perform set_config('app.staff_credit_post', 'on', true);
      update staff_credit_balances
         set balance_minor = v_after, version = version + 1, updated_at = now()
       where user_id = st.id and currency = p_currency;
      perform set_config('app.staff_credit_post', 'off', true);
    end if;
  end if;

  return query select
    v_replayed, e.id, e.staff_id, e.currency, e.entry_type, e.direction,
    e.amount_minor, e.balance_before_minor, e.balance_after_minor, e.created_at;
end $$;

-- ---------------------------------------------------------------------------
-- Safety net: an admin's deposit / cash-out / correction on a player wallet is only accepted
-- (at commit) when it went through his balance. Shop counter movements are covered by 0016.
-- ---------------------------------------------------------------------------
create function ledger_staff_credit_check() returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from users where id = new.operator_id and role = 'admin') then
    return null;
  end if;
  if exists (select 1 from staff_credit_entries where ledger_entry_id = new.id)
     or exists (select 1 from shop_credit_entries where ledger_entry_id = new.id) then
    return null;
  end if;
  raise exception 'an admin can only credit or debit a player through his own balance' using errcode = 'AU909';
end $$;

create constraint trigger ledger_entries_staff_credit
  after insert on ledger_entries
  deferrable initially deferred
  for each row
  when (new.operator_id is not null and new.entry_type in ('deposit', 'withdrawal', 'adjustment_credit', 'adjustment_debit'))
  execute function ledger_staff_credit_check();

-- ---------------------------------------------------------------------------
-- Grants: same as migration 0016 plus staff_credit_post()
-- ---------------------------------------------------------------------------
revoke all on function staff_credit_post(uuid, text, text, bigint, text, text, uuid, text, bigint) from public;
revoke all on function ledger_staff_credit_check() from public;

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
end $$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'aurum_app') then
    perform aurum_apply_grants('aurum_app');
  end if;
end $$;
