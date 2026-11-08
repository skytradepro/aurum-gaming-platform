-- =============================================================================
-- Aurum - migration 0011: provider games through a game aggregator (seamless wallet).
-- The 24 games run on the provider's servers (original graphics, sounds and maths); the platform
-- keeps the money: the aggregator calls our wallet endpoints for every bet, win and rollback.
-- external_id and the thumbnail are filled by the aggregator catalogue sync.
-- =============================================================================
insert into game_providers (slug, name, is_active, sort_order) values
  ('pragmatic-play', 'Pragmatic Play', true, 10),
  ('amatic', 'Amatic', true, 20),
  ('evoplay', 'Evoplay', true, 30),
  ('unassigned', 'Unassigned', false, 999)
on conflict (slug) do nothing;

insert into games (slug, name, provider_id, category, is_active, sort_order, art)
select v.slug, v.name, p.id, v.category, v.active, 1000 + v.ord, jsonb_build_object('source', 'aggregator')
  from (values
  ('dino', 'Dino', 'unassigned', 'crash', false, 10),
  ('speed-crash', 'Speed Crash', 'unassigned', 'crash', false, 20),
  ('high-striker', 'High Striker', 'evoplay', 'crash', true, 30),
  ('hot-7', 'Hot 7', 'amatic', 'slots', true, 40),
  ('wild-7', 'Wild 7', 'amatic', 'slots', true, 50),
  ('book-of-fortune', 'Book of Fortune', 'amatic', 'slots', true, 60),
  ('wild-wild-riches', 'Wild Wild Riches', 'pragmatic-play', 'slots', true, 70),
  ('chilli-heat', 'Chilli Heat', 'pragmatic-play', 'slots', true, 80),
  ('gates-of-olympus-1000', 'Gates of Olympus 1000', 'pragmatic-play', 'slots', true, 90),
  ('sugar-rush-1000', 'Sugar Rush 1000', 'pragmatic-play', 'slots', true, 100),
  ('pompeii-megareels-megaways', 'Pompeii Megareels Megaways', 'pragmatic-play', 'slots', true, 110),
  ('big-bass-mission-fishin', 'Big Bass Mission Fishin', 'pragmatic-play', 'slots', true, 120),
  ('rat-royale', 'Rat Royale', 'pragmatic-play', 'slots', true, 130),
  ('sweet-bonanza', 'Sweet Bonanza', 'pragmatic-play', 'slots', true, 140),
  ('killer-night', 'Killer Night', 'pragmatic-play', 'slots', true, 150),
  ('wonders-of-aztec', 'Wonders of Aztec', 'pragmatic-play', 'slots', true, 160),
  ('big-bass-halloween-splash-1000', 'Big Bass Halloween Splash 1000', 'pragmatic-play', 'slots', true, 170),
  ('cheetah-wild', 'Cheetah Wild', 'pragmatic-play', 'slots', true, 180),
  ('pelican-payday', 'Pelican Payday', 'pragmatic-play', 'slots', true, 190),
  ('deep-sea-frenzy', 'Deep Sea Frenzy!', 'pragmatic-play', 'slots', true, 200),
  ('forever-split-megaways', 'Forever Split Megaways', 'pragmatic-play', 'slots', true, 210),
  ('gates-of-olympus', 'Gates of Olympus', 'pragmatic-play', 'slots', true, 220),
  ('big-bass-vegas', 'Big Bass Vegas', 'pragmatic-play', 'slots', true, 230),
  ('freya', 'Freya', 'pragmatic-play', 'slots', true, 240)
  ) as v(slug, name, provider, category, active, ord)
  join game_providers p on p.slug = v.provider
on conflict (slug) do nothing;

-- One launch of a game by a player. The aggregator gets the token, never the player's session cookie.
create table provider_sessions (
  id          bigint generated always as identity primary key,
  token_hash  text        not null unique check (length(token_hash) = 64),
  user_id     uuid        not null references users (id),
  wallet_id   bigint      not null references wallets (id),
  game_id     bigint      not null references games (id),
  aggregator  text        not null,
  currency    text        not null references currencies (code),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);
create index provider_sessions_user_idx on provider_sessions (user_id, created_at desc);

-- Every wallet call of the aggregator, once (its transaction id is unique per aggregator).
create table provider_transactions (
  id              bigint generated always as identity primary key,
  aggregator      text        not null,
  tx_id           text        not null check (length(tx_id) between 1 and 200),
  kind            text        not null check (kind in ('debit', 'credit', 'rollback')),
  session_id      bigint      not null references provider_sessions (id),
  round_id        text        check (length(round_id) <= 200),
  ref_tx_id       text        check (length(ref_tx_id) <= 200),
  amount_minor    bigint      not null check (amount_minor >= 0),
  ledger_entry_id text,
  rolled_back     boolean     not null default false,
  created_at      timestamptz not null default now(),
  unique (aggregator, tx_id)
);
create index provider_transactions_round_idx on provider_transactions (aggregator, round_id);

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
end $$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'aurum_app') then
    perform aurum_apply_grants('aurum_app');
  end if;
end $$;
