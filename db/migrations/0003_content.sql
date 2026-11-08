-- =============================================================================
-- Aurum - migration 0003: site content managed from the dashboards
--
-- Media assets, banners, promotions, legal pages, the game catalogue and site
-- settings. Everything a visitor reads is stored per language (languages table),
-- so the Super Admin / Admin can change banners and promotions without code.
-- Text is stored as plain text only (never HTML) so it cannot inject markup.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Media assets (files live on disk under UPLOAD_DIR; only metadata is stored here)
-- ---------------------------------------------------------------------------
create table media_assets (
  id            uuid primary key default gen_random_uuid(),
  storage_key   text    not null unique check (storage_key ~ '^[a-f0-9]{32}\.(png|jpg|webp)$'),
  original_name text    check (length(original_name) <= 200),
  mime_type     text    not null check (mime_type in ('image/png', 'image/jpeg', 'image/webp')),
  byte_size     integer not null check (byte_size between 1 and 10485760),
  width         integer not null check (width between 1 and 10000),
  height        integer not null check (height between 1 and 10000),
  sha256        bytea   not null check (length(sha256) = 32),
  uploaded_by   uuid references users (id),
  created_at    timestamptz not null default now()
);
create index media_assets_sha_idx on media_assets (sha256);

-- ---------------------------------------------------------------------------
-- Banners (hero sliders). One row per banner + one translation row per language.
-- ---------------------------------------------------------------------------
create table banners (
  id         bigint generated always as identity primary key,
  placement  text    not null check (placement in ('home_hero', 'casino_hero', 'live_casino_hero', 'sports_hero')),
  name       text    not null check (length(btrim(name)) between 1 and 120),
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  starts_at  timestamptz,
  ends_at    timestamptz,
  created_by uuid references users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint banners_period check (starts_at is null or ends_at is null or ends_at > starts_at)
);
create index banners_placement_idx on banners (placement, sort_order, id);
create trigger banners_touch before update on banners
  for each row execute function touch_updated_at();

create table banner_translations (
  banner_id        bigint not null references banners (id) on delete cascade,
  locale           text   not null references languages (code),
  title            text   not null default '' check (length(title) <= 120),
  subtitle         text   not null default '' check (length(subtitle) <= 240),
  cta_label        text   not null default '' check (length(cta_label) <= 40),
  link_url         text   not null default '' check (
    length(link_url) <= 500
    and (link_url = '' or link_url ~ '^/([^/\\].*)?$' or link_url ~ '^https://[^[:space:]]+$')),
  alt_text         text   not null default '' check (length(alt_text) <= 200),
  image_desktop_id uuid references media_assets (id),
  image_mobile_id  uuid references media_assets (id),
  primary key (banner_id, locale)
);

-- ---------------------------------------------------------------------------
-- Promotions
-- ---------------------------------------------------------------------------
create table promotions (
  id         bigint generated always as identity primary key,
  slug       text    not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80),
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  starts_at  timestamptz,
  ends_at    timestamptz,
  created_by uuid references users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint promotions_period check (starts_at is null or ends_at is null or ends_at > starts_at)
);
create index promotions_order_idx on promotions (sort_order, id);
create trigger promotions_touch before update on promotions
  for each row execute function touch_updated_at();

create table promotion_translations (
  promotion_id bigint not null references promotions (id) on delete cascade,
  locale       text   not null references languages (code),
  title        text   not null check (length(btrim(title)) between 1 and 160),
  summary      text   not null default '' check (length(summary) <= 400),
  body         text   not null default '' check (length(body) <= 20000),
  terms        text   not null default '' check (length(terms) <= 20000),
  image_id     uuid references media_assets (id),
  primary key (promotion_id, locale)
);

-- ---------------------------------------------------------------------------
-- Legal / information pages. The operator must supply the official text and have
-- it reviewed by a lawyer; a page without published text shows a clear notice.
-- ---------------------------------------------------------------------------
create table pages (
  slug       text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80),
  created_at timestamptz not null default now()
);
insert into pages (slug) values
  ('about-us'), ('privacy-policy'), ('terms-and-conditions'), ('responsible-gaming'), ('sportsbook-rules');

create table page_translations (
  page_slug    text    not null references pages (slug) on delete cascade,
  locale       text    not null references languages (code),
  title        text    not null check (length(btrim(title)) between 1 and 160),
  body         text    not null default '' check (length(body) <= 100000),
  is_published boolean not null default false,
  updated_by   uuid references users (id),
  updated_at   timestamptz not null default now(),
  primary key (page_slug, locale)
);
create trigger page_translations_touch before update on page_translations
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- Game catalogue. Games are launched through a licensed provider integration
-- (not part of this migration). is_demo marks placeholder rows created by the
-- demo seed; they must never exist in production.
-- ---------------------------------------------------------------------------
create table game_providers (
  id         bigint generated always as identity primary key,
  slug       text    not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80),
  name       text    not null check (length(btrim(name)) between 1 and 80),
  is_active  boolean not null default true,
  sort_order integer not null default 0,
  is_demo    boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger game_providers_touch before update on game_providers
  for each row execute function touch_updated_at();

create table games (
  id           bigint generated always as identity primary key,
  slug         text    not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 100),
  provider_id  bigint  not null references game_providers (id),
  name         text    not null check (length(btrim(name)) between 1 and 120),
  category     text    not null check (category in ('slots', 'crash', 'live', 'table', 'other')),
  is_featured  boolean not null default false,
  is_new       boolean not null default false,
  is_active    boolean not null default true,
  sort_order   integer not null default 0,
  thumbnail_id uuid references media_assets (id),
  art          jsonb   not null default '{}'::jsonb check (jsonb_typeof(art) = 'object'),
  external_id  text check (length(external_id) <= 200),
  is_demo      boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index games_category_idx on games (category, sort_order, id) where is_active;
create index games_provider_idx on games (provider_id, sort_order, id) where is_active;
create index games_name_idx     on games (lower(name) text_pattern_ops);
create trigger games_touch before update on games
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- Site settings (small key/value store managed by the Super Admin)
-- ---------------------------------------------------------------------------
create table site_settings (
  key        text  primary key check (key ~ '^[a-z][a-z0-9_.]{0,63}$'),
  value      jsonb not null,
  updated_by uuid references users (id),
  updated_at timestamptz not null default now()
);
insert into site_settings (key, value) values ('registration_open', 'true'::jsonb);
create trigger site_settings_touch before update on site_settings
  for each row execute function touch_updated_at();
