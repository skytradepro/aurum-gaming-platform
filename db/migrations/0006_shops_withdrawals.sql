-- =============================================================================
-- Aurum - migration 0006: shops, shop workers, shop cash, withdrawals at shops
--
-- Business model: players deposit CASH at a shop (a cashier credits their wallet) and
-- collect withdrawals in CASH at a shop (the player requests the withdrawal online, the
-- amount is reserved at once, and a cashier pays it out against a one-time code after
-- checking the player's identity).
--
-- Guarantees enforced by the database itself:
--   * A shop's expected cash only changes through shop_cash_post() (append-only cash
--     ledger, row lock on the shop, idempotent, never below zero unless the shop allows it).
--   * A cash deposit moves the player's wallet AND the shop's cash in one transaction
--     (shop_player_deposit), in the shop's currency only - never converted.
--   * A withdrawal request reserves the money immediately (wallet debit), can be paid
--     exactly once, and is otherwise released back to the wallet (cancelled, rejected,
--     expired). Its status only moves pending -> paid | cancelled | rejected | expired.
--   * A cashier can only operate for the shop they belong to, and only cash deposits
--     and withdrawal payouts.
--
-- New custom SQLSTATEs:
--   AU013 player_not_found      AU301 shop_not_found        AU311 withdrawal_not_found
--   AU302 shop_not_active       AU312 withdrawal_not_pending
--   AU303 shop_currency_mismatch AU313 withdrawal_expired
--   AU304 shop_limit_exceeded   AU904 shop_cash_direct_update
--   AU305 shop_cash_insufficient AU905 withdrawal_direct_update
--   AU306 operator_not_in_shop
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Shops
-- ---------------------------------------------------------------------------
create table shops (
  id                  bigint generated always as identity primary key,
  code                text    not null unique check (code ~ '^[A-Z0-9][A-Z0-9-]{1,19}$'),
  name                text    not null check (length(btrim(name)) between 1 and 120),
  city                text    not null default '' check (length(city) <= 80),
  address             text    not null default '' check (length(address) <= 300),
  phone               text    check (phone ~ '^\+[1-9][0-9]{5,14}$'),
  opening_hours       text    not null default '' check (length(opening_hours) <= 200),
  currency            text    not null references currencies (code),
  status              text    not null default 'active' check (status in ('active', 'suspended', 'closed')),
  is_listed           boolean not null default true,
  max_deposit_minor   bigint  check (max_deposit_minor between 1 and 1000000000000000),
  max_payout_minor    bigint  check (max_payout_minor between 1 and 1000000000000000),
  allow_negative_cash boolean not null default false,
  cash_balance_minor  bigint  not null default 0 check (cash_balance_minor between -9000000000000000000 and 9000000000000000000),
  cash_version        bigint  not null default 0 check (cash_version >= 0),
  created_by          uuid    references users (id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint shops_cash_not_negative check (allow_negative_cash or cash_balance_minor >= 0)
);
create index shops_listed_idx on shops (status, is_listed, city, name);
create trigger shops_touch before update on shops
  for each row execute function touch_updated_at();

create function shops_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'shops are never deleted; close the shop instead' using errcode = 'AU105';
  end if;
  if tg_op = 'INSERT' then
    if new.cash_balance_minor <> 0 or new.cash_version <> 0 then
      raise exception 'a shop starts with no cash; use shop_cash_post()' using errcode = 'AU904';
    end if;
    return new;
  end if;
  if (new.cash_balance_minor <> old.cash_balance_minor or new.cash_version <> old.cash_version)
     and coalesce(current_setting('app.shop_cash_post', true), '') <> 'on' then
    raise exception 'shop cash can only change through shop_cash_post()' using errcode = 'AU904';
  end if;
  if new.currency <> old.currency and old.cash_version > 0 then
    raise exception 'the currency of a shop with cash movements cannot change' using errcode = 'AU104';
  end if;
  if old.status = 'closed' and new.status <> 'closed' then
    raise exception 'a closed shop cannot be reopened' using errcode = 'AU302';
  end if;
  return new;
end $$;
create trigger shops_guard_biud before insert or update or delete on shops
  for each row execute function shops_guard();
create trigger shops_no_truncate before truncate on shops
  for each statement execute function forbid_change();

-- ---------------------------------------------------------------------------
-- Shop workers: users with role 'cashier', attached to exactly one shop
--   shop_role 'manager' : sees every movement of the shop, records cash counts
--   shop_role 'cashier' : cash deposits and withdrawal payouts
-- ---------------------------------------------------------------------------
alter table users
  add column shop_id   bigint references shops (id),
  add column shop_role text check (shop_role in ('manager', 'cashier'));

alter table users
  add constraint users_cashier_shop check (
    (role = 'cashier' and shop_id is not null and shop_role is not null)
    or (role <> 'cashier' and shop_id is null and shop_role is null));
create index users_shop_idx on users (shop_id) where shop_id is not null;

-- ---------------------------------------------------------------------------
-- New wallet entry types for withdrawals collected at a shop
-- ---------------------------------------------------------------------------
insert into ledger_entry_types
  (code, direction, wallet_kind, requires_reason, staff_only, blocked_when_suspended, description) values
  ('withdrawal_request', -1, 'main', false, false, true,  'Funds reserved for a withdrawal to collect in cash at a shop'),
  ('withdrawal_release',  1, 'main', false, false, false, 'Reserved withdrawal funds returned (cancelled, rejected or expired)');

-- ---------------------------------------------------------------------------
-- ledger_post(): same function as in migration 0002, with one change: shop cashiers
-- are staff operators too, but only for cash deposits.
-- ---------------------------------------------------------------------------
create or replace function ledger_post(
  p_wallet_id         bigint,
  p_entry_type        text,
  p_amount_minor      bigint,
  p_idempotency_scope text,
  p_idempotency_key   text,
  p_operator_id       uuid    default null,
  p_reason            text    default null,
  p_reference         text    default null,
  p_original_amount   bigint  default null,
  p_original_currency text    default null,
  p_exchange_rate     numeric default null,
  p_metadata          jsonb   default '{}'::jsonb
)
returns table (
  o_replayed             boolean,
  o_id                   bigint,
  o_wallet_id            bigint,
  o_user_id              uuid,
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
  t          ledger_entry_types%rowtype;
  w          wallets%rowtype;
  u          users%rowtype;
  op         users%rowtype;
  e          ledger_entries%rowtype;
  v_replayed boolean := false;
  v_hash     bytea;
  v_reason   text := nullif(btrim(coalesce(p_reason, '')), '');
  v_ref      text := nullif(btrim(coalesce(p_reference, '')), '');
  v_scope    text := btrim(coalesce(p_idempotency_scope, ''));
  v_key      text := btrim(coalesce(p_idempotency_key, ''));
  v_after    bigint;
  v_from_dec smallint;
  v_to_dec   smallint;
  v_expected numeric;
begin
  if p_wallet_id is null then
    raise exception 'a wallet is required' using errcode = 'AU003';
  end if;
  if p_entry_type is null then
    raise exception 'an entry type is required' using errcode = 'AU010';
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
  if v_ref is not null and length(v_ref) > 200 then
    raise exception 'the reference is too long (200 characters at most)' using errcode = 'AU012';
  end if;
  if p_metadata is null or jsonb_typeof(p_metadata) <> 'object' then
    raise exception 'metadata must be a JSON object' using errcode = 'AU012';
  end if;
  if p_exchange_rate is not null and (p_exchange_rate <= 0 or scale(trim_scale(p_exchange_rate)) > 12) then
    raise exception 'the exchange rate must be positive with at most 12 decimals' using errcode = 'AU008';
  end if;

  v_hash := sha256(convert_to(concat_ws('|',
    p_wallet_id, p_entry_type, p_amount_minor,
    coalesce(p_operator_id::text, ''), coalesce(v_reason, ''), coalesce(v_ref, ''),
    coalesce(p_original_amount::text, ''), coalesce(p_original_currency, ''),
    coalesce(trim_scale(p_exchange_rate)::text, '')), 'UTF8'));

  select * into w from wallets where id = p_wallet_id for update;
  if not found then
    raise exception 'wallet % does not exist', p_wallet_id using errcode = 'AU003';
  end if;

  select * into e from ledger_entries
   where idempotency_scope = v_scope and idempotency_key = v_key;
  if found then
    if e.request_hash <> v_hash then
      raise exception 'this idempotency key was already used with different parameters'
        using errcode = 'AU002';
    end if;
    v_replayed := true;
  else
    select * into t from ledger_entry_types where code = p_entry_type;
    if not found then
      raise exception 'unknown entry type %', p_entry_type using errcode = 'AU010';
    end if;
    if t.wallet_kind <> w.kind then
      raise exception 'entry type % cannot be posted to a % wallet', t.code, w.kind using errcode = 'AU010';
    end if;

    select * into u from users where id = w.user_id;
    if u.status = 'closed' or (u.status = 'suspended' and t.blocked_when_suspended) then
      raise exception 'this account cannot receive % entries while it is %', t.code, u.status
        using errcode = 'AU004';
    end if;

    if t.staff_only then
      select * into op from users where id = p_operator_id;
      if p_operator_id is null or not found or op.status <> 'active'
         or op.role not in ('admin', 'super_admin', 'cashier') then
        raise exception 'entry type % requires an active staff operator', t.code using errcode = 'AU007';
      end if;
      if op.role = 'cashier' and t.code <> 'deposit' then
        raise exception 'a shop cashier can only record cash deposits' using errcode = 'AU007';
      end if;
    elsif p_operator_id is not null then
      raise exception 'entry type % is a system entry and cannot have an operator', t.code
        using errcode = 'AU007';
    end if;

    if t.requires_reason and (v_reason is null or length(v_reason) < 3) then
      raise exception 'entry type % requires a reason of at least 3 characters', t.code
        using errcode = 'AU006';
    end if;

    if p_original_amount is not null or p_original_currency is not null or p_exchange_rate is not null then
      if p_original_amount is null or p_original_currency is null or p_exchange_rate is null
         or p_original_amount < 1 or p_original_currency = w.currency then
        raise exception 'original amount, currency and rate must be given together (currency different from the wallet)'
          using errcode = 'AU008';
      end if;
      select c.decimals into v_from_dec from currencies c where c.code = p_original_currency;
      select c.decimals into v_to_dec   from currencies c where c.code = w.currency;
      if v_from_dec is null or v_to_dec is null then
        raise exception 'unknown currency in conversion' using errcode = 'AU008';
      end if;
      v_expected := round((p_original_amount::numeric * p_exchange_rate * (10::numeric ^ v_to_dec))
                          / (10::numeric ^ v_from_dec));
      if v_expected <> p_amount_minor::numeric then
        raise exception 'the amount (%) does not match original amount x rate (%)',
          p_amount_minor, v_expected using errcode = 'AU008';
      end if;
    end if;

    v_after := w.balance_minor + t.direction * p_amount_minor;
    if v_after < 0 then
      raise exception 'insufficient funds' using errcode = 'AU001';
    end if;
    if v_after > c_max_balance then
      raise exception 'the resulting balance exceeds the supported maximum' using errcode = 'AU009';
    end if;

    begin
      insert into ledger_entries (
        wallet_id, user_id, currency, entry_type, direction, amount_minor,
        balance_before_minor, balance_after_minor,
        original_amount_minor, original_currency, exchange_rate,
        reference, reason, operator_id,
        idempotency_scope, idempotency_key, request_hash, metadata)
      values (
        w.id, w.user_id, w.currency, t.code, t.direction, p_amount_minor,
        w.balance_minor, v_after,
        p_original_amount, p_original_currency, p_exchange_rate,
        v_ref, v_reason, p_operator_id,
        v_scope, v_key, v_hash, p_metadata)
      returning * into e;
    exception when unique_violation then
      select * into e from ledger_entries
       where idempotency_scope = v_scope and idempotency_key = v_key;
      if found and e.request_hash = v_hash then
        v_replayed := true;
      else
        raise exception 'this idempotency key was already used with different parameters'
          using errcode = 'AU002';
      end if;
    end;

    if not v_replayed then
      perform set_config('app.ledger_post', 'on', true);
      update wallets
         set balance_minor = v_after, version = version + 1, updated_at = now()
       where id = w.id;
      perform set_config('app.ledger_post', 'off', true);
    end if;
  end if;

  return query select
    v_replayed, e.id, e.wallet_id, e.user_id, e.currency, e.entry_type, e.direction,
    e.amount_minor, e.balance_before_minor, e.balance_after_minor, e.created_at;
end $$;

-- ---------------------------------------------------------------------------
-- Withdrawal requests (collected in cash at a shop)
-- ---------------------------------------------------------------------------
create table withdrawal_requests (
  id                   bigint generated always as identity primary key,
  code                 text    not null unique check (code ~ '^[A-HJ-NP-Z2-9]{10}$'),
  user_id              uuid    not null references users (id),
  wallet_id            bigint  not null references wallets (id),
  currency             text    not null references currencies (code),
  amount_minor         bigint  not null check (amount_minor between 1 and 1000000000000000),
  status               text    not null default 'pending'
                               check (status in ('pending', 'paid', 'cancelled', 'rejected', 'expired')),
  hold_entry_id        bigint  not null unique references ledger_entries (id),
  release_entry_id     bigint  unique references ledger_entries (id),
  preferred_shop_id    bigint  references shops (id),
  expires_at           timestamptz not null,
  paid_at              timestamptz,
  paid_by              uuid    references users (id),
  paid_shop_id         bigint  references shops (id),
  payout_cash_entry_id bigint  unique,
  id_check_note        text    check (length(id_check_note) <= 300),
  closed_at            timestamptz,
  closed_by            uuid    references users (id),
  close_reason         text    check (length(close_reason) <= 500),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint withdrawal_paid_fields check (
    (status = 'paid') = (paid_at is not null and paid_by is not null and paid_shop_id is not null and payout_cash_entry_id is not null)),
  constraint withdrawal_closed_fields check (
    (status in ('cancelled', 'rejected', 'expired')) = (closed_at is not null and release_entry_id is not null)),
  constraint withdrawal_expiry_after_creation check (expires_at > created_at)
);
create index withdrawal_requests_user_idx    on withdrawal_requests (user_id, id desc);
create index withdrawal_requests_pending_idx on withdrawal_requests (expires_at) where status = 'pending';
create index withdrawal_requests_status_idx  on withdrawal_requests (status, id desc);
create index withdrawal_requests_shop_idx    on withdrawal_requests (paid_shop_id, id desc) where paid_shop_id is not null;
create trigger withdrawal_requests_touch before update on withdrawal_requests
  for each row execute function touch_updated_at();

create function withdrawal_requests_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'withdrawal requests are never deleted' using errcode = 'AU905';
  end if;
  if coalesce(current_setting('app.withdrawal_fn', true), '') <> 'on' then
    raise exception 'withdrawal requests change only through the withdrawal_* functions' using errcode = 'AU905';
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'pending' then
      raise exception 'a withdrawal request starts pending' using errcode = 'AU905';
    end if;
    return new;
  end if;
  if old.status <> 'pending' then
    raise exception 'withdrawal request % is already %', old.code, old.status using errcode = 'AU312';
  end if;
  if new.code <> old.code or new.user_id <> old.user_id or new.wallet_id <> old.wallet_id
     or new.currency <> old.currency or new.amount_minor <> old.amount_minor
     or new.hold_entry_id <> old.hold_entry_id or new.created_at <> old.created_at
     or new.expires_at <> old.expires_at then
    raise exception 'the details of a withdrawal request are immutable' using errcode = 'AU905';
  end if;
  return new;
end $$;
create trigger withdrawal_requests_guard_biud before insert or update or delete on withdrawal_requests
  for each row execute function withdrawal_requests_guard();
create trigger withdrawal_requests_no_truncate before truncate on withdrawal_requests
  for each statement execute function forbid_change();

-- ---------------------------------------------------------------------------
-- Shop cash ledger (append-only)
-- ---------------------------------------------------------------------------
create table shop_cash_entry_types (
  code            text primary key,
  direction       smallint not null check (direction in (-1, 1)),
  requires_reason boolean  not null default false,
  cashier_allowed boolean  not null default false,
  description     text     not null
);
insert into shop_cash_entry_types (code, direction, requires_reason, cashier_allowed, description) values
  ('player_deposit',     1, false, true,  'Cash received from a player for a wallet deposit'),
  ('withdrawal_payout', -1, false, true,  'Cash paid to a player for a withdrawal request'),
  ('float_in',           1, false, false, 'Cash brought to the shop by the operator'),
  ('cash_collection',   -1, false, false, 'Cash collected from the shop by the operator'),
  ('adjustment_credit',  1, true,  false, 'Correction that increases the expected cash'),
  ('adjustment_debit',  -1, true,  false, 'Correction that decreases the expected cash');
create trigger shop_cash_entry_types_append_only before delete on shop_cash_entry_types
  for each row execute function forbid_change();

create table shop_cash_entries (
  id                   bigint generated always as identity primary key,
  shop_id              bigint   not null references shops (id),
  currency             text     not null references currencies (code),
  entry_type           text     not null references shop_cash_entry_types (code),
  direction            smallint not null check (direction in (-1, 1)),
  amount_minor         bigint   not null check (amount_minor between 1 and 1000000000000000),
  signed_amount_minor  bigint   generated always as (direction * amount_minor) stored,
  balance_before_minor bigint   not null,
  balance_after_minor  bigint   not null,
  operator_id          uuid     not null references users (id),
  ledger_entry_id      bigint   unique references ledger_entries (id),
  withdrawal_id        bigint   unique references withdrawal_requests (id),
  reference            text     check (length(reference) <= 200),
  reason               text     check (length(reason) <= 500),
  idempotency_scope    text     not null check (length(idempotency_scope) between 1 and 100),
  idempotency_key      text     not null check (length(idempotency_key) between 1 and 200),
  request_hash         bytea    not null check (length(request_hash) = 32),
  created_at           timestamptz not null default now(),
  constraint shop_cash_balance_math check (balance_after_minor = balance_before_minor + direction * amount_minor),
  constraint shop_cash_idempotency_unique unique (idempotency_scope, idempotency_key)
);
create index shop_cash_shop_idx     on shop_cash_entries (shop_id, id desc);
create index shop_cash_operator_idx on shop_cash_entries (operator_id, id desc);
create index shop_cash_created_idx  on shop_cash_entries (created_at desc, id desc);
create trigger shop_cash_entries_append_only before update or delete on shop_cash_entries
  for each row execute function forbid_change();
create trigger shop_cash_entries_no_truncate before truncate on shop_cash_entries
  for each statement execute function forbid_change();

alter table withdrawal_requests
  add constraint withdrawal_payout_entry_fk foreign key (payout_cash_entry_id) references shop_cash_entries (id);

-- ---------------------------------------------------------------------------
-- Cash counts (end of shift / end of day reconciliation; append-only)
-- ---------------------------------------------------------------------------
create table shop_cash_counts (
  id               bigint generated always as identity primary key,
  shop_id          bigint not null references shops (id),
  currency         text   not null references currencies (code),
  expected_minor   bigint not null,
  counted_minor    bigint not null check (counted_minor between 0 and 1000000000000000),
  difference_minor bigint generated always as (counted_minor - expected_minor) stored,
  counted_by       uuid   not null references users (id),
  note             text   check (length(note) <= 500),
  created_at       timestamptz not null default now()
);
create index shop_cash_counts_shop_idx on shop_cash_counts (shop_id, id desc);
create trigger shop_cash_counts_append_only before update or delete on shop_cash_counts
  for each row execute function forbid_change();
create trigger shop_cash_counts_no_truncate before truncate on shop_cash_counts
  for each statement execute function forbid_change();

-- ---------------------------------------------------------------------------
-- shop_cash_post(): the ONLY way to change a shop's expected cash
-- ---------------------------------------------------------------------------
create function shop_cash_post(
  p_shop_id           bigint,
  p_entry_type        text,
  p_amount_minor      bigint,
  p_idempotency_scope text,
  p_idempotency_key   text,
  p_operator_id       uuid,
  p_reason            text   default null,
  p_reference         text   default null,
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
  t          shop_cash_entry_types%rowtype;
  s          shops%rowtype;
  op         users%rowtype;
  e          shop_cash_entries%rowtype;
  v_replayed boolean := false;
  v_hash     bytea;
  v_reason   text := nullif(btrim(coalesce(p_reason, '')), '');
  v_ref      text := nullif(btrim(coalesce(p_reference, '')), '');
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
  if v_ref is not null and length(v_ref) > 200 then
    raise exception 'the reference is too long (200 characters at most)' using errcode = 'AU012';
  end if;

  v_hash := sha256(convert_to(concat_ws('|',
    p_shop_id, p_entry_type, p_amount_minor, coalesce(p_operator_id::text, ''),
    coalesce(v_reason, ''), coalesce(v_ref, ''),
    coalesce(p_ledger_entry_id::text, ''), coalesce(p_withdrawal_id::text, '')), 'UTF8'));

  select * into s from shops where id = p_shop_id for update;
  if not found then
    raise exception 'shop % does not exist', p_shop_id using errcode = 'AU301';
  end if;

  select * into e from shop_cash_entries
   where idempotency_scope = v_scope and idempotency_key = v_key;
  if found then
    if e.request_hash <> v_hash then
      raise exception 'this idempotency key was already used with different parameters' using errcode = 'AU002';
    end if;
    v_replayed := true;
  else
    select * into t from shop_cash_entry_types where code = p_entry_type;
    if not found then
      raise exception 'unknown shop cash entry type %', p_entry_type using errcode = 'AU010';
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
        raise exception 'a cashier cannot record % movements', t.code using errcode = 'AU007';
      end if;
    elsif op.role not in ('admin', 'super_admin') then
      raise exception 'only staff can move shop cash' using errcode = 'AU007';
    end if;

    if s.status = 'closed' or (s.status = 'suspended' and t.cashier_allowed) then
      raise exception 'shop % is %', s.code, s.status using errcode = 'AU302';
    end if;
    if t.requires_reason and (v_reason is null or length(v_reason) < 3) then
      raise exception 'entry type % requires a reason of at least 3 characters', t.code using errcode = 'AU006';
    end if;
    if t.code = 'player_deposit' and p_ledger_entry_id is null then
      raise exception 'a cash deposit must reference the wallet entry' using errcode = 'AU012';
    end if;
    if t.code = 'withdrawal_payout' and p_withdrawal_id is null then
      raise exception 'a payout must reference the withdrawal request' using errcode = 'AU012';
    end if;

    v_after := s.cash_balance_minor + t.direction * p_amount_minor;
    if v_after < 0 and not s.allow_negative_cash then
      raise exception 'shop % does not hold enough cash', s.code using errcode = 'AU305';
    end if;
    if abs(v_after) > c_max_balance then
      raise exception 'the resulting cash balance exceeds the supported maximum' using errcode = 'AU009';
    end if;

    begin
      insert into shop_cash_entries (
        shop_id, currency, entry_type, direction, amount_minor, balance_before_minor, balance_after_minor,
        operator_id, ledger_entry_id, withdrawal_id, reference, reason,
        idempotency_scope, idempotency_key, request_hash)
      values (
        s.id, s.currency, t.code, t.direction, p_amount_minor, s.cash_balance_minor, v_after,
        p_operator_id, p_ledger_entry_id, p_withdrawal_id, v_ref, v_reason,
        v_scope, v_key, v_hash)
      returning * into e;
    exception when unique_violation then
      select * into e from shop_cash_entries
       where idempotency_scope = v_scope and idempotency_key = v_key;
      if found and e.request_hash = v_hash then
        v_replayed := true;
      else
        raise;
      end if;
    end;

    if not v_replayed then
      perform set_config('app.shop_cash_post', 'on', true);
      update shops set cash_balance_minor = v_after, cash_version = cash_version + 1 where id = s.id;
      perform set_config('app.shop_cash_post', 'off', true);
    end if;
  end if;

  return query select
    v_replayed, e.id, e.shop_id, e.currency, e.entry_type, e.direction,
    e.amount_minor, e.balance_before_minor, e.balance_after_minor, e.created_at;
end $$;

-- ---------------------------------------------------------------------------
-- shop_player_deposit(): a cashier receives cash and credits the player's wallet.
-- Wallet entry and shop cash entry are written together or not at all.
-- ---------------------------------------------------------------------------
create function shop_player_deposit(
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

  return query select le.o_replayed and ce.o_replayed, le.o_id, ce.o_id, le.o_currency, le.o_amount_minor,
                      le.o_balance_after_minor, ce.o_balance_after_minor, le.o_created_at;
end $$;

-- ---------------------------------------------------------------------------
-- withdrawal_create(): reserves the amount and opens a request with its pickup code
-- ---------------------------------------------------------------------------
create function withdrawal_create(
  p_user_id           uuid,
  p_amount_minor      bigint,
  p_code              text,
  p_expires_at        timestamptz,
  p_preferred_shop_id bigint,
  p_idempotency_key   text
)
returns table (o_replayed boolean, o_id bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  w  wallets%rowtype;
  u  users%rowtype;
  s  shops%rowtype;
  le record;
  r  withdrawal_requests%rowtype;
begin
  select * into u from users where id = p_user_id;
  if not found or u.role <> 'user' then
    raise exception 'player not found' using errcode = 'AU013';
  end if;
  if u.status <> 'active' then
    raise exception 'this account cannot request withdrawals while it is %', u.status using errcode = 'AU004';
  end if;
  select * into w from wallets where user_id = p_user_id and kind = 'main';
  if not found then
    raise exception 'the player has no wallet' using errcode = 'AU003';
  end if;
  if p_preferred_shop_id is not null then
    select * into s from shops where id = p_preferred_shop_id;
    if not found then
      raise exception 'shop % does not exist', p_preferred_shop_id using errcode = 'AU301';
    end if;
    if s.status <> 'active' then
      raise exception 'shop % is %', s.code, s.status using errcode = 'AU302';
    end if;
    if s.currency <> w.currency then
      raise exception 'shop % pays out in %, not in %', s.code, s.currency, w.currency using errcode = 'AU303';
    end if;
    if s.max_payout_minor is not null and p_amount_minor > s.max_payout_minor then
      raise exception 'the amount exceeds the payout limit of shop %', s.code using errcode = 'AU304';
    end if;
  end if;
  if p_expires_at is null or p_expires_at <= now() then
    raise exception 'the expiry must be in the future' using errcode = 'AU012';
  end if;

  select * into le from ledger_post(
    w.id, 'withdrawal_request', p_amount_minor, 'withdrawal:' || p_user_id, p_idempotency_key,
    null, null, null, null, null, null, jsonb_build_object('channel', 'shop'));

  if le.o_replayed then
    select * into r from withdrawal_requests where hold_entry_id = le.o_id;
    if not found then
      raise exception 'this idempotency key was already used for another operation' using errcode = 'AU002';
    end if;
    return query select true, r.id;
    return;
  end if;

  perform set_config('app.withdrawal_fn', 'on', true);
  insert into withdrawal_requests (code, user_id, wallet_id, currency, amount_minor, hold_entry_id, preferred_shop_id, expires_at)
  values (p_code, p_user_id, w.id, w.currency, p_amount_minor, le.o_id, p_preferred_shop_id, p_expires_at)
  returning * into r;
  perform set_config('app.withdrawal_fn', 'off', true);
  return query select false, r.id;
end $$;

-- ---------------------------------------------------------------------------
-- withdrawal_close(): cancelled (by the player), rejected (by staff, reason required)
-- or expired (by the system). The reserved amount goes back to the wallet.
-- ---------------------------------------------------------------------------
create function withdrawal_close(
  p_withdrawal_id bigint,
  p_status        text,
  p_actor_id      uuid,
  p_reason        text default null
)
returns table (o_id bigint, o_status text, o_release_entry_id bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r        withdrawal_requests%rowtype;
  le       record;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if p_status not in ('cancelled', 'rejected', 'expired') then
    raise exception 'invalid closing status %', p_status using errcode = 'AU012';
  end if;
  if p_status = 'rejected' and (v_reason is null or length(v_reason) < 3) then
    raise exception 'a rejection needs a reason of at least 3 characters' using errcode = 'AU006';
  end if;
  select * into r from withdrawal_requests where id = p_withdrawal_id for update;
  if not found then
    raise exception 'withdrawal request % does not exist', p_withdrawal_id using errcode = 'AU311';
  end if;
  if r.status <> 'pending' then
    raise exception 'withdrawal request % is already %', r.code, r.status using errcode = 'AU312';
  end if;
  if p_status = 'expired' and r.expires_at > now() then
    raise exception 'withdrawal request % has not expired yet', r.code using errcode = 'AU012';
  end if;

  select * into le from ledger_post(
    r.wallet_id, 'withdrawal_release', r.amount_minor, 'withdrawal-release', r.id::text,
    null, null, null, null, null, null, jsonb_build_object('withdrawal_id', r.id, 'status', p_status));

  perform set_config('app.withdrawal_fn', 'on', true);
  update withdrawal_requests
     set status = p_status, release_entry_id = le.o_id, closed_at = now(), closed_by = p_actor_id, close_reason = v_reason
   where id = r.id;
  perform set_config('app.withdrawal_fn', 'off', true);
  return query select r.id, p_status, le.o_id;
end $$;

-- ---------------------------------------------------------------------------
-- withdrawal_pay(): a cashier pays the reserved amount in cash, exactly once
-- ---------------------------------------------------------------------------
create function withdrawal_pay(
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

  perform set_config('app.withdrawal_fn', 'on', true);
  update withdrawal_requests
     set status = 'paid', paid_at = now(), paid_by = p_operator_id, paid_shop_id = s.id,
         payout_cash_entry_id = ce.o_id, id_check_note = v_note
   where id = r.id;
  perform set_config('app.withdrawal_fn', 'off', true);
  return query select false, r.id, ce.o_id, ce.o_balance_after_minor;
end $$;

-- ---------------------------------------------------------------------------
-- withdrawal_expire_due(): releases every pending request whose time is up.
-- Safe to call often and from several processes (SKIP LOCKED).
-- ---------------------------------------------------------------------------
create function withdrawal_expire_due(p_limit integer default 500)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id    bigint;
  v_count integer := 0;
begin
  for v_id in
    select id from withdrawal_requests
     where status = 'pending' and expires_at <= now()
     order by expires_at
     limit greatest(1, least(coalesce(p_limit, 500), 5000))
     for update skip locked
  loop
    perform withdrawal_close(v_id, 'expired', null, null);
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- ---------------------------------------------------------------------------
-- shop_cash_verify(): recomputes every shop's cash chain (empty result = consistent)
-- ---------------------------------------------------------------------------
create function shop_cash_verify(p_shop_id bigint default null)
returns table (shop_id bigint, problem text, entry_id bigint, expected_minor bigint, actual_minor bigint)
language sql stable as $$
  with chain as (
    select e.shop_id as sid, e.id as eid, e.balance_before_minor as before_minor,
           lag(e.balance_after_minor, 1, 0::bigint) over (partition by e.shop_id order by e.id) as prev_after
      from shop_cash_entries e
     where p_shop_id is null or e.shop_id = p_shop_id
  )
  select c.sid, 'chain_break'::text, c.eid, c.prev_after, c.before_minor
    from chain c where c.before_minor <> c.prev_after
  union all
  select s.id, 'balance_mismatch'::text, null::bigint, coalesce(l.balance_after_minor, 0), s.cash_balance_minor
    from shops s
    left join lateral (
      select e.balance_after_minor from shop_cash_entries e where e.shop_id = s.id order by e.id desc limit 1
    ) l on true
   where (p_shop_id is null or s.id = p_shop_id)
     and s.cash_balance_minor <> coalesce(l.balance_after_minor, 0)
$$;

-- ---------------------------------------------------------------------------
-- currencies_guard(): same rules as in 0002, now also protecting currencies held in shop cash
-- ---------------------------------------------------------------------------
create or replace function currencies_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from wallets w where w.currency = old.code)
       or exists (select 1 from shops s where s.currency = old.code) then
      raise exception 'currency % is in use and cannot be deleted', old.code using errcode = 'AU201';
    end if;
    return old;
  end if;
  if new.code <> old.code then
    raise exception 'a currency code cannot be changed' using errcode = 'AU201';
  end if;
  if new.decimals <> old.decimals and (
       exists (select 1 from wallets w where w.currency = old.code)
       or exists (select 1 from shops s where s.currency = old.code)) then
    raise exception 'currency % is used by wallets or shops: its decimals cannot change', old.code
      using errcode = 'AU201';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Site settings used by withdrawals
-- ---------------------------------------------------------------------------
insert into site_settings (key, value) values
  ('withdrawals_open', 'true'::jsonb),
  ('withdrawal_expiry_hours', '168'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Least-privilege grants: same function as in 0004, extended to the new objects
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

  -- shops: details are edited by staff; cash moves only through the functions below
  execute format('grant insert, update on shops to %s', r);
  execute format('grant insert on shop_cash_counts to %s', r);

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

revoke all on function shop_cash_post(bigint, text, bigint, text, text, uuid, text, text, bigint, bigint) from public;
revoke all on function shop_player_deposit(bigint, uuid, bigint, uuid, text) from public;
revoke all on function withdrawal_create(uuid, bigint, text, timestamptz, bigint, text) from public;
revoke all on function withdrawal_close(bigint, text, uuid, text) from public;
revoke all on function withdrawal_pay(bigint, bigint, uuid, text) from public;
revoke all on function withdrawal_expire_due(integer) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'aurum_app') then
    perform aurum_apply_grants('aurum_app');
  end if;
end $$;
