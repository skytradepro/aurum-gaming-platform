-- =============================================================================
-- Aurum - migration 0001: foundation
--
-- Languages, currencies, countries, users, sessions, exchange rates, audit log.
--
-- Rules that apply to the whole schema:
--   * Requires PostgreSQL 15 or newer. No extensions are needed
--     (gen_random_uuid() and sha256() are built in).
--   * Money is ALWAYS stored as integer minor units (bigint). Never floats.
--   * Custom error codes (SQLSTATE) used by the database:
--       AU001 insufficient_funds          AU101 under_age
--       AU002 idempotency_conflict        AU102 super_admin_guard
--       AU003 wallet_not_found            AU103 last_super_admin
--       AU004 account_not_postable        AU104 account_currency_immutable
--       AU005 invalid_amount              AU105 users_not_deletable
--       AU006 reason_required             AU201 currency_in_use
--       AU007 operator_invalid            AU901 append_only
--       AU008 conversion_mismatch         AU902 wallet_direct_update
--       AU009 balance_limit               AU903 wallet_not_deletable
--       AU010 invalid_entry_type
--       AU011 invalid_idempotency_key
--       AU012 invalid_argument
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------------
create function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create function forbid_change() returns trigger
language plpgsql as $$
begin
  raise exception 'table "%" is append-only: % is not allowed', tg_table_name, tg_op
    using errcode = 'AU901';
end $$;

-- ---------------------------------------------------------------------------
-- Languages (adding a language = one row here + one messages/<code>.json file)
-- ---------------------------------------------------------------------------
create table languages (
  code         text primary key check (code ~ '^[a-z]{2,3}$'),
  native_name  text not null,
  english_name text not null,
  direction    text not null check (direction in ('ltr', 'rtl')),
  is_enabled   boolean not null default true,
  is_default   boolean not null default false,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now()
);
create unique index languages_single_default on languages (is_default) where is_default;

insert into languages (code, native_name, english_name, direction, is_enabled, is_default, sort_order) values
  ('en', 'English',  'English', 'ltr', true, true,  1),
  ('fr', 'Français', 'French',  'ltr', true, false, 2),
  ('ar', 'العربية',  'Arabic',  'rtl', true, false, 3);

-- ---------------------------------------------------------------------------
-- Currencies (managed by the Super Admin)
--   decimals          : number of decimals used for ACCOUNTING (immutable once a
--                       wallet uses the currency - enforced in migration 0002)
--   display_decimals  : decimals shown to players (presentation only, <= decimals)
--   names             : {"en": "...", "fr": "...", "ar": "..."}
--   display           : {"default": {"symbol": "...", "placement": "before|after",
--                        "spacing": true|false}, "ar": {...}, ...}
-- ---------------------------------------------------------------------------
create table currencies (
  code             text primary key check (code ~ '^[A-Z][A-Z0-9]{2,9}$'),
  kind             text not null default 'fiat' check (kind in ('fiat', 'crypto')),
  decimals         smallint not null check (decimals between 0 and 8),
  display_decimals smallint check (display_decimals between 0 and 8),
  names            jsonb not null default '{}'::jsonb,
  display          jsonb not null,
  is_enabled       boolean not null default false,
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint currencies_display_decimals check (display_decimals is null or display_decimals <= decimals),
  constraint currencies_names_object check (jsonb_typeof(names) = 'object'),
  constraint currencies_display_rule check (
    jsonb_typeof(display) = 'object'
    and jsonb_typeof(display -> 'default') = 'object'
    and length(coalesce(display -> 'default' ->> 'symbol', '')) between 1 and 12
    and (display -> 'default' ->> 'placement') in ('before', 'after')
    and jsonb_typeof(display -> 'default' -> 'spacing') = 'boolean'
  )
);
create trigger currencies_touch before update on currencies
  for each row execute function touch_updated_at();

-- Starting set only. The Super Admin can add, rename, enable or disable currencies
-- from the dashboard. ISO 4217 minor units: TND = 3, EUR = 2, USD = 2.
insert into currencies (code, kind, decimals, display_decimals, names, display, is_enabled, sort_order) values
  ('TND', 'fiat', 3, 2,
    '{"en":"Tunisian dinar","fr":"Dinar tunisien","ar":"دينار تونسي"}',
    '{"default":{"symbol":"TND","placement":"after","spacing":true},"fr":{"symbol":"DT","placement":"after","spacing":true},"ar":{"symbol":"د.ت","placement":"after","spacing":true}}',
    true, 1),
  ('EUR', 'fiat', 2, null,
    '{"en":"Euro","fr":"Euro","ar":"يورو"}',
    '{"default":{"symbol":"€","placement":"before","spacing":false},"fr":{"symbol":"€","placement":"after","spacing":true}}',
    true, 2),
  ('USD', 'fiat', 2, null,
    '{"en":"US dollar","fr":"Dollar américain","ar":"دولار أمريكي"}',
    '{"default":{"symbol":"$","placement":"before","spacing":false},"fr":{"symbol":"$","placement":"after","spacing":true}}',
    true, 3);

-- ---------------------------------------------------------------------------
-- Countries (names come from the Unicode CLDR data at runtime, in every language)
-- The operator must restrict is_enabled to the jurisdictions it is licensed for.
-- ---------------------------------------------------------------------------
create table countries (
  code         text primary key check (code ~ '^[A-Z]{2}$'),
  calling_code text not null check (calling_code ~ '^[1-9][0-9]{0,3}$'),
  is_enabled   boolean not null default true,
  sort_order   integer not null default 0
);

insert into countries (code, calling_code, sort_order) values
  ('TN', '216', 1), ('DZ', '213', 2), ('MA', '212', 3), ('LY', '218', 4), ('EG', '20', 5),
  ('MR', '222', 6), ('SA', '966', 7), ('AE', '971', 8), ('QA', '974', 9), ('KW', '965', 10),
  ('BH', '973', 11), ('OM', '968', 12), ('JO', '962', 13), ('LB', '961', 14), ('TR', '90', 15),
  ('FR', '33', 16), ('DE', '49', 17), ('IT', '39', 18), ('ES', '34', 19), ('PT', '351', 20),
  ('BE', '32', 21), ('NL', '31', 22), ('LU', '352', 23), ('CH', '41', 24), ('AT', '43', 25),
  ('GB', '44', 26), ('IE', '353', 27), ('SE', '46', 28), ('NO', '47', 29), ('DK', '45', 30),
  ('FI', '358', 31), ('PL', '48', 32), ('CZ', '420', 33), ('GR', '30', 34), ('RO', '40', 35),
  ('BG', '359', 36), ('HU', '36', 37), ('US', '1', 38), ('CA', '1', 39), ('MX', '52', 40),
  ('BR', '55', 41), ('AR', '54', 42), ('CL', '56', 43), ('CO', '57', 44), ('PE', '51', 45),
  ('IN', '91', 46), ('PK', '92', 47), ('CN', '86', 48), ('JP', '81', 49), ('KR', '82', 50),
  ('AU', '61', 51), ('NZ', '64', 52), ('ZA', '27', 53), ('NG', '234', 54), ('SN', '221', 55),
  ('CI', '225', 56), ('CM', '237', 57), ('GH', '233', 58), ('KE', '254', 59), ('ML', '223', 60);

-- ---------------------------------------------------------------------------
-- Users
--   role 'user'        : player (has a wallet, a country, a phone, an account currency)
--   role 'admin'       : staff with the permissions listed in users.permissions
--   role 'super_admin' : implicit access to everything; can only be created from
--                        the command line (see users_guard below)
-- ---------------------------------------------------------------------------
create type user_role   as enum ('user', 'admin', 'super_admin');
create type user_status as enum ('active', 'suspended', 'closed');

create table users (
  id                  uuid primary key default gen_random_uuid(),
  account_no          bigint generated always as identity (start with 100001) unique,
  username            text not null check (username ~ '^[A-Za-z0-9._-]{3,24}$'),
  email               text not null check (
    length(email) <= 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  phone               text check (phone ~ '^\+[1-9][0-9]{5,14}$'),
  password_hash       text not null,
  first_name          text not null check (length(btrim(first_name)) between 1 and 80),
  last_name           text not null check (length(btrim(last_name)) between 1 and 80),
  date_of_birth       date,
  country_code        text references countries (code),
  account_currency    text references currencies (code),
  preferred_locale    text references languages (code),
  display_currency    text references currencies (code),
  role                user_role   not null default 'user',
  permissions         text[]      not null default '{}',
  status              user_status not null default 'active',
  marketing_opt_in    boolean     not null default false,
  terms_accepted_at   timestamptz,
  terms_version       text,
  must_change_password boolean    not null default false,
  failed_login_count  integer     not null default 0 check (failed_login_count >= 0),
  locked_until        timestamptz,
  last_login_at       timestamptz,
  password_changed_at timestamptz not null default now(),
  created_by          uuid references users (id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint users_player_fields check (
    role <> 'user' or (
      date_of_birth is not null and country_code is not null and phone is not null
      and account_currency is not null and terms_accepted_at is not null)),
  constraint users_staff_without_currency check (role = 'user' or account_currency is null),
  constraint users_permissions_for_admin_only check (role = 'admin' or permissions = '{}')
);
create unique index users_username_ci on users (lower(username));
create unique index users_email_ci    on users (lower(email));
create unique index users_phone_uq    on users (phone) where phone is not null;
create index users_username_prefix    on users (lower(username) text_pattern_ops);
create index users_email_prefix       on users (lower(email) text_pattern_ops);
create index users_staff_idx          on users (role) where role <> 'user';
create index users_created_idx        on users (created_at desc, id);

create function users_guard() returns trigger
language plpgsql as $$
declare
  v_bootstrap boolean := coalesce(current_setting('app.bootstrap', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    if new.role = 'super_admin' and not v_bootstrap then
      raise exception 'super_admin accounts can only be created from the command line'
        using errcode = 'AU102';
    end if;
    if new.date_of_birth is not null and new.role = 'user'
       and new.date_of_birth > (current_date - interval '18 years')::date then
      raise exception 'players must be at least 18 years old' using errcode = 'AU101';
    end if;
    return new;
  end if;

  -- UPDATE
  if new.role = 'super_admin' and old.role <> 'super_admin' and not v_bootstrap then
    raise exception 'a user cannot be promoted to super_admin from the application'
      using errcode = 'AU102';
  end if;

  if old.role = 'super_admin' and (new.role <> 'super_admin' or new.status <> 'active') then
    -- serialise concurrent demotions so two super admins cannot remove each other
    perform pg_advisory_xact_lock(hashtext('aurum.super_admin_guard'));
    if not exists (
      select 1 from users u
      where u.role = 'super_admin' and u.status = 'active' and u.id <> old.id
    ) then
      raise exception 'the last active super_admin cannot be demoted or disabled'
        using errcode = 'AU103';
    end if;
  end if;

  if old.account_currency is not null and new.account_currency is distinct from old.account_currency then
    raise exception 'the account currency cannot be changed' using errcode = 'AU104';
  end if;

  if new.date_of_birth is distinct from old.date_of_birth and new.date_of_birth is not null
     and new.role = 'user' and new.date_of_birth > (current_date - interval '18 years')::date then
    raise exception 'players must be at least 18 years old' using errcode = 'AU101';
  end if;
  return new;
end $$;

create trigger users_guard_biu before insert or update on users
  for each row execute function users_guard();
create trigger users_touch before update on users
  for each row execute function touch_updated_at();

create function users_no_delete() returns trigger
language plpgsql as $$
begin
  raise exception 'users are never deleted; close the account instead' using errcode = 'AU105';
end $$;
create trigger users_no_delete_bd before delete on users
  for each row execute function users_no_delete();

-- ---------------------------------------------------------------------------
-- Sessions (the browser holds a random token; only its SHA-256 hash is stored)
-- ---------------------------------------------------------------------------
create table sessions (
  id           bigint generated always as identity primary key,
  token_hash   bytea       not null unique check (length(token_hash) = 32),
  user_id      uuid        not null references users (id),
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at   timestamptz not null,
  revoked_at   timestamptz,
  ip           inet,
  user_agent   text check (length(user_agent) <= 400)
);
create index sessions_user_idx    on sessions (user_id);
create index sessions_expires_idx on sessions (expires_at);

-- ---------------------------------------------------------------------------
-- Exchange rates: append-only, entered manually by the Super Admin.
-- Meaning: 1 unit of base_currency = rate units of quote_currency.
-- Used only for indicative display and for operator-entered conversions
-- (the rate is always stored with the ledger entry that used it).
-- ---------------------------------------------------------------------------
create table exchange_rates (
  id             bigint generated always as identity primary key,
  base_currency  text          not null references currencies (code),
  quote_currency text          not null references currencies (code),
  rate           numeric(30,12) not null check (rate > 0),
  source         text          not null check (length(btrim(source)) between 1 and 100),
  note           text check (length(note) <= 500),
  effective_at   timestamptz   not null default now(),
  created_by     uuid references users (id),
  created_at     timestamptz   not null default now(),
  constraint exchange_rates_distinct check (base_currency <> quote_currency)
);
create index exchange_rates_pair_idx on exchange_rates (base_currency, quote_currency, effective_at desc, id desc);
create trigger exchange_rates_append_only before update or delete on exchange_rates
  for each row execute function forbid_change();
create trigger exchange_rates_no_truncate before truncate on exchange_rates
  for each statement execute function forbid_change();

-- ---------------------------------------------------------------------------
-- Audit log (append-only): who did what, to what, from where
-- ---------------------------------------------------------------------------
create table audit_logs (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  actor_id    uuid references users (id),
  actor_role  user_role,
  action      text  not null check (length(action) between 1 and 100),
  target_type text,
  target_id   text,
  details     jsonb not null default '{}'::jsonb,
  ip          inet,
  user_agent  text check (length(user_agent) <= 400),
  request_id  text
);
create index audit_logs_at_idx     on audit_logs (at desc, id desc);
create index audit_logs_actor_idx  on audit_logs (actor_id, id desc);
create index audit_logs_target_idx on audit_logs (target_type, target_id, id desc);
create index audit_logs_action_idx on audit_logs (action, id desc);
create trigger audit_logs_append_only before update or delete on audit_logs
  for each row execute function forbid_change();
create trigger audit_logs_no_truncate before truncate on audit_logs
  for each statement execute function forbid_change();
