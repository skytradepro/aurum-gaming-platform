-- =============================================================================
-- Aurum - migration 0007: who owns a player, and each admin's game rules
--
--   users.owner_id   the admin who created the player (null = a normal website sign-up)
--   users.game_rules an admin's own limits for the players he owns, as JSON:
--                    {"maxStake": 10, "maxWin": 1000, "disabled": ["slots"]}
--                    They can only be stricter than the site-wide rules.
-- Existing grants already cover insert/update on users, so no grant changes are needed.
-- =============================================================================
alter table users
  add column owner_id   uuid references users (id),
  add column game_rules jsonb not null default '{}'::jsonb;

create index users_owner_idx on users (owner_id) where owner_id is not null;
