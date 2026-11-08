-- =============================================================================
-- Aurum - migration 0002: wallets and the append-only ledger
--
-- Guarantees enforced by the database itself (not only by application code):
--   * Every balance change is a ledger entry created by ledger_post().
--   * Ledger entries can never be updated, deleted or truncated.
--   * A wallet balance can only change through ledger_post() (which locks the
--     wallet row, so concurrent postings are serialised).
--   * balance_after = balance_before +/- amount, and a balance never goes below 0.
--   * The same (scope, idempotency key) never posts twice: retries are replayed,
--     and a key re-used with different parameters is rejected.
--   * A wallet always has the currency of its account. Balances of different
--     currencies are never combined or converted automatically.
--   * Amounts are integer minor units: 1 .. 10^15 per posting, balance <= 9*10^18.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Wallets
-- ---------------------------------------------------------------------------
create table wallets (
  id            bigint generated always as identity primary key,
  user_id       uuid        not null references users (id),
  currency      text        not null references currencies (code),
  kind          text        not null default 'main' check (kind in ('main', 'bonus')),
  balance_minor bigint      not null default 0 check (balance_minor >= 0),
  version       bigint      not null default 0 check (version >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint wallets_one_per_kind unique (user_id, currency, kind)
);
create index wallets_currency_idx on wallets (currency);

create function wallets_guard() returns trigger
language plpgsql as $$
declare
  v_account_currency text;
begin
  if tg_op = 'DELETE' then
    raise exception 'wallets are never deleted' using errcode = 'AU903';
  end if;

  if tg_op = 'INSERT' then
    if new.balance_minor <> 0 or new.version <> 0 then
      raise exception 'a wallet must start empty; use ledger_post()' using errcode = 'AU902';
    end if;
    select u.account_currency into v_account_currency from users u where u.id = new.user_id;
    if v_account_currency is distinct from new.currency then
      raise exception 'a wallet must use the currency of its account' using errcode = 'AU104';
    end if;
    return new;
  end if;

  -- UPDATE
  if new.user_id <> old.user_id or new.currency <> old.currency or new.kind <> old.kind then
    raise exception 'the owner, currency and kind of a wallet are immutable' using errcode = 'AU902';
  end if;
  if (new.balance_minor <> old.balance_minor or new.version <> old.version)
     and coalesce(current_setting('app.ledger_post', true), '') <> 'on' then
    raise exception 'wallet balances can only change through ledger_post()' using errcode = 'AU902';
  end if;
  return new;
end $$;

create trigger wallets_guard_biud before insert or update or delete on wallets
  for each row execute function wallets_guard();
create trigger wallets_no_truncate before truncate on wallets
  for each statement execute function forbid_change();

-- every player gets exactly one main wallet, in the currency chosen at registration
create function users_create_wallet() returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.role = 'user' then
    insert into wallets (user_id, currency, kind) values (new.id, new.account_currency, 'main');
  end if;
  return null;
end $$;
create trigger users_create_wallet_ai after insert on users
  for each row execute function users_create_wallet();

-- decimals are the accounting precision: they cannot change once a wallet uses the currency
create function currencies_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from wallets w where w.currency = old.code) then
      raise exception 'currency % is in use and cannot be deleted', old.code using errcode = 'AU201';
    end if;
    return old;
  end if;
  if new.code <> old.code then
    raise exception 'a currency code cannot be changed' using errcode = 'AU201';
  end if;
  if new.decimals <> old.decimals and exists (select 1 from wallets w where w.currency = old.code) then
    raise exception 'currency % is used by wallets: its decimals cannot change', old.code
      using errcode = 'AU201';
  end if;
  return new;
end $$;
create trigger currencies_guard_bud before update or delete on currencies
  for each row execute function currencies_guard();

-- ---------------------------------------------------------------------------
-- Ledger entry types (the only kinds of balance movement that exist)
-- ---------------------------------------------------------------------------
create table ledger_entry_types (
  code                  text primary key,
  direction             smallint not null check (direction in (-1, 1)),
  wallet_kind           text     not null default 'main' check (wallet_kind in ('main', 'bonus')),
  requires_reason       boolean  not null default false,
  staff_only            boolean  not null default false,
  blocked_when_suspended boolean not null default false,
  description           text     not null
);

insert into ledger_entry_types
  (code, direction, wallet_kind, requires_reason, staff_only, blocked_when_suspended, description) values
  ('deposit',           1, 'main',  false, true,  false, 'Funds received, recorded by a staff member'),
  ('withdrawal',       -1, 'main',  false, true,  false, 'Funds paid out, recorded by a staff member'),
  ('adjustment_credit', 1, 'main',  true,  true,  false, 'Manual correction that increases a balance'),
  ('adjustment_debit', -1, 'main',  true,  true,  false, 'Manual correction that decreases a balance'),
  ('bet_stake',        -1, 'main',  false, false, true,  'Stake placed on a bet or game round'),
  ('bet_win',           1, 'main',  false, false, false, 'Winnings paid for a bet or game round'),
  ('bet_refund',        1, 'main',  false, false, false, 'Stake returned for a void or cancelled bet'),
  ('bonus_credit',      1, 'bonus', true,  true,  false, 'Bonus granted'),
  ('bonus_debit',      -1, 'bonus', true,  true,  false, 'Bonus removed or expired');

create trigger ledger_entry_types_append_only before delete on ledger_entry_types
  for each row execute function forbid_change();

-- ---------------------------------------------------------------------------
-- Ledger entries (append-only)
-- ---------------------------------------------------------------------------
create table ledger_entries (
  id                    bigint generated always as identity primary key,
  wallet_id             bigint   not null references wallets (id),
  user_id               uuid     not null references users (id),
  currency              text     not null references currencies (code),
  entry_type            text     not null references ledger_entry_types (code),
  direction             smallint not null check (direction in (-1, 1)),
  amount_minor          bigint   not null check (amount_minor > 0 and amount_minor <= 1000000000000000),
  signed_amount_minor   bigint   generated always as (direction * amount_minor) stored,
  balance_before_minor  bigint   not null check (balance_before_minor >= 0),
  balance_after_minor   bigint   not null check (balance_after_minor >= 0),
  original_amount_minor bigint   check (original_amount_minor > 0),
  original_currency     text     references currencies (code),
  exchange_rate         numeric(30,12) check (exchange_rate > 0),
  reference             text     check (length(reference) <= 200),
  reason                text     check (length(reason) <= 500),
  operator_id           uuid     references users (id),
  idempotency_scope     text     not null check (length(idempotency_scope) between 1 and 100),
  idempotency_key       text     not null check (length(idempotency_key) between 1 and 200),
  request_hash          bytea    not null check (length(request_hash) = 32),
  metadata              jsonb    not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  constraint ledger_balance_math check (balance_after_minor = balance_before_minor + direction * amount_minor),
  constraint ledger_original_all_or_none check (
    (original_amount_minor is null) = (original_currency is null)
    and (original_currency is null) = (exchange_rate is null)),
  constraint ledger_original_differs check (original_currency is null or original_currency <> currency),
  constraint ledger_idempotency_unique unique (idempotency_scope, idempotency_key)
);
create index ledger_wallet_idx    on ledger_entries (wallet_id, id desc);
create index ledger_user_idx      on ledger_entries (user_id, id desc);
create index ledger_operator_idx  on ledger_entries (operator_id, id desc) where operator_id is not null;
create index ledger_created_idx   on ledger_entries (created_at desc, id desc);
create index ledger_type_idx      on ledger_entries (entry_type, id desc);
create index ledger_reference_idx on ledger_entries (reference) where reference is not null;

create trigger ledger_entries_append_only before update or delete on ledger_entries
  for each row execute function forbid_change();
create trigger ledger_entries_no_truncate before truncate on ledger_entries
  for each statement execute function forbid_change();

-- ---------------------------------------------------------------------------
-- ledger_post(): the ONLY way to change a balance
-- Returns the (possibly replayed) ledger entry. o_replayed = true means the same
-- idempotency key had already been processed with identical parameters.
-- ---------------------------------------------------------------------------
create function ledger_post(
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
  -- 1. argument validation (nothing is locked yet)
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

  -- 2. lock the wallet: from here on, postings to this wallet are serialised
  select * into w from wallets where id = p_wallet_id for update;
  if not found then
    raise exception 'wallet % does not exist', p_wallet_id using errcode = 'AU003';
  end if;

  -- 3. idempotency: replay or reject
  select * into e from ledger_entries
   where idempotency_scope = v_scope and idempotency_key = v_key;
  if found then
    if e.request_hash <> v_hash then
      raise exception 'this idempotency key was already used with different parameters'
        using errcode = 'AU002';
    end if;
    v_replayed := true;
  else
    -- 4. business rules
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
      if p_operator_id is null or not found or op.role not in ('admin', 'super_admin') or op.status <> 'active' then
        raise exception 'entry type % requires an active staff operator', t.code using errcode = 'AU007';
      end if;
    elsif p_operator_id is not null then
      raise exception 'entry type % is a system entry and cannot have an operator', t.code
        using errcode = 'AU007';
    end if;

    if t.requires_reason and (v_reason is null or length(v_reason) < 3) then
      raise exception 'entry type % requires a reason of at least 3 characters', t.code
        using errcode = 'AU006';
    end if;

    -- original amount / currency / rate must be all present or all absent, and consistent
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
      -- 1 original major unit = rate wallet major units; rounded half-up (numeric rounds half away from zero)
      v_expected := round((p_original_amount::numeric * p_exchange_rate * (10::numeric ^ v_to_dec))
                          / (10::numeric ^ v_from_dec));
      if v_expected <> p_amount_minor::numeric then
        raise exception 'the amount (%) does not match original amount x rate (%)',
          p_amount_minor, v_expected using errcode = 'AU008';
      end if;
    end if;

    -- 5. new balance
    v_after := w.balance_minor + t.direction * p_amount_minor;
    if v_after < 0 then
      raise exception 'insufficient funds' using errcode = 'AU001';
    end if;
    if v_after > c_max_balance then
      raise exception 'the resulting balance exceeds the supported maximum' using errcode = 'AU009';
    end if;

    -- 6. append the entry, then move the balance (the guard trigger allows it only here)
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
      -- the same key was posted concurrently (for another wallet): replay or reject
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
-- ledger_verify(): recomputes the chain of every wallet (or one wallet) and
-- returns the problems found. An empty result means the books are consistent.
--   chain_break     : an entry does not start from the previous entry's end balance
--   balance_mismatch: the wallet balance differs from its last entry
-- ---------------------------------------------------------------------------
create function ledger_verify(p_wallet_id bigint default null)
returns table (wallet_id bigint, problem text, entry_id bigint, expected_minor bigint, actual_minor bigint)
language sql stable as $$
  with chain as (
    select e.wallet_id as wid, e.id as eid, e.balance_before_minor as before_minor,
           lag(e.balance_after_minor, 1, 0::bigint) over (partition by e.wallet_id order by e.id) as prev_after
      from ledger_entries e
     where p_wallet_id is null or e.wallet_id = p_wallet_id
  )
  select c.wid, 'chain_break'::text, c.eid, c.prev_after, c.before_minor
    from chain c
   where c.before_minor <> c.prev_after
  union all
  select w.id, 'balance_mismatch'::text, null::bigint,
         coalesce(l.balance_after_minor, 0), w.balance_minor
    from wallets w
    left join lateral (
      select e.balance_after_minor from ledger_entries e
       where e.wallet_id = w.id order by e.id desc limit 1
    ) l on true
   where (p_wallet_id is null or w.id = p_wallet_id)
     and w.balance_minor <> coalesce(l.balance_after_minor, 0)
$$;
