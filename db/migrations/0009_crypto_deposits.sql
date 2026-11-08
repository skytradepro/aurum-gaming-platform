-- =============================================================================
-- Aurum - migration 0009: crypto deposits verified on-chain
--
--   crypto_networks   the coins and networks a player can deposit with, and the operator's
--                     public receiving address for each (no private keys are ever stored).
--   crypto_deposits   one row per deposit request. The player gets an exact amount (with a small
--                     unique tag) to send; the API checks the transaction on the blockchain
--                     (right coin, right address, exact amount, confirmed, sent after the request)
--                     and credits the wallet through the ledger entry type "deposit_crypto".
--
-- Guarantees enforced by the database itself:
--   * a blockchain transaction can be credited only once (unique network + tx hash);
--   * two open requests on the same network never share the same exact amount;
--   * a credited request can never change again.
-- =============================================================================
insert into ledger_entry_types
  (code, direction, wallet_kind, requires_reason, staff_only, blocked_when_suspended, description) values
  ('deposit_crypto', 1, 'main', false, false, false, 'Crypto deposit verified on the blockchain and credited automatically');

create table crypto_networks (
  code              text primary key check (code ~ '^[a-z0-9_]{2,30}$'),
  coin              text    not null check (coin ~ '^[A-Z0-9]{2,10}$'),
  chain             text    not null check (chain in ('bitcoin', 'ethereum', 'bsc', 'tron')),
  token_contract    text,
  decimals          integer not null check (decimals between 0 and 30),
  deposit_address   text    not null check (length(deposit_address) between 20 and 100),
  min_confirmations integer not null default 1 check (min_confirmations between 1 and 200),
  max_credit_usd    numeric(20, 2) not null default 1000 check (max_credit_usd > 0),
  is_enabled        boolean not null default true,
  sort_order        integer not null default 0,
  updated_at        timestamptz not null default now()
);

-- The owner's receiving addresses (public addresses only), checked: BTC bech32 checksum,
-- Tron base58check, EVM EIP-55 checksum.
insert into crypto_networks (code, coin, chain, token_contract, decimals, deposit_address, min_confirmations, max_credit_usd, sort_order) values
  ('usdt_trc20',  'USDT',  'tron',     'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',         6,  'TEdcfwXLfKR8mDCa5jVJf6RuiXvZXbTr6q',          20, 2000, 1),
  ('btc',         'BTC',   'bitcoin',  null,                                         8,  'bc1qyq0lmuv0yej4pmrqw8ke4d9pvzu2zxp9wnv28s',   2,  2000, 2),
  ('eth',         'ETH',   'ethereum', null,                                         18, '0xCB1D04300Bc0fB740a4b4A9dbe5D25B69A37d95D',  12, 2000, 3),
  ('bnb_bep20',   'BNB',   'bsc',      null,                                         18, '0xCB1D04300Bc0fB740a4b4A9dbe5D25B69A37d95D',  15, 2000, 4),
  ('susdt_bep20', 'SUSDT', 'bsc',      '0x1f891d25a386e6f67ead37d9bfaf5c444213a134', 18, '0xCB1D04300Bc0fB740a4b4A9dbe5D25B69A37d95D',  15, 100,  5);

create table crypto_deposits (
  id              bigint generated always as identity primary key,
  user_id         uuid    not null references users (id),
  network         text    not null references crypto_networks (code),
  deposit_address text    not null,
  amount_units    numeric(78, 0) not null check (amount_units > 0),
  status          text    not null default 'open' check (status in ('open', 'credited', 'expired')),
  expires_at      timestamptz not null,
  tx_hash         text check (tx_hash ~ '^[0-9A-Za-z]{40,90}$'),
  usd_value       numeric(30, 8),
  currency        text references currencies (code),
  credited_minor  bigint check (credited_minor > 0),
  created_at      timestamptz not null default now(),
  credited_at     timestamptz,
  constraint crypto_deposit_credit_complete check (
    status <> 'credited' or (tx_hash is not null and usd_value is not null and currency is not null and credited_minor is not null and credited_at is not null))
);
create unique index crypto_deposits_tx_once on crypto_deposits (network, lower(tx_hash)) where tx_hash is not null;
create unique index crypto_deposits_open_amount on crypto_deposits (network, amount_units) where status = 'open';
create index crypto_deposits_user_idx on crypto_deposits (user_id, id desc);

create or replace function crypto_deposits_guard() returns trigger
language plpgsql as $$
begin
  if old.status = 'credited' then
    raise exception 'a credited crypto deposit cannot change' using errcode = 'AU907';
  end if;
  if new.user_id <> old.user_id or new.network <> old.network or new.amount_units <> old.amount_units or new.deposit_address <> old.deposit_address then
    raise exception 'the request of a crypto deposit cannot change' using errcode = 'AU907';
  end if;
  return new;
end $$;
create trigger crypto_deposits_guard before update on crypto_deposits for each row execute function crypto_deposits_guard();

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
