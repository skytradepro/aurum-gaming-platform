-- =============================================================================
-- Aurum - migration 0004: least-privilege access for the application role
--
-- The API should connect as a role that cannot rewrite history or move money
-- directly. That role (default name: aurum_app) is created by the operator, e.g.
--
--     create role aurum_app login password '<generated secret>';
--
-- and then receives its privileges with:   select aurum_apply_grants('aurum_app');
-- This migration installs the function and applies it when the role exists.
--
-- Result for the application role:
--   * ledger_entries, wallets, ledger_entry_types : SELECT only. Balances change
--     exclusively through ledger_post() (SECURITY DEFINER, owned by the migrator).
--   * audit_logs, exchange_rates : SELECT and INSERT only (append-only).
--   * users : no DELETE.
-- =============================================================================

create function aurum_apply_grants(p_role text) returns void
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

  -- reference data the Super Admin manages
  execute format('grant insert, update on languages, currencies, countries to %s', r);
  execute format('grant insert, update on users to %s', r);
  execute format('grant insert, update, delete on sessions to %s', r);
  execute format('grant insert on exchange_rates, audit_logs to %s', r);

  -- site content
  execute format('grant insert, delete on media_assets to %s', r);
  execute format('grant insert, update, delete on banners, banner_translations to %s', r);
  execute format('grant insert, update, delete on promotions, promotion_translations to %s', r);
  execute format('grant insert, update, delete on pages, page_translations to %s', r);
  execute format('grant insert, update, delete on game_providers, games to %s', r);
  execute format('grant insert, update on site_settings to %s', r);

  -- functions: closed by default, opened explicitly
  execute format('revoke all on function ledger_post(bigint, text, bigint, text, text, uuid, text, text, bigint, text, numeric, jsonb) from public');
  execute format('grant execute on function ledger_post(bigint, text, bigint, text, text, uuid, text, text, bigint, text, numeric, jsonb) to %s', r);
  execute format('grant execute on function ledger_verify(bigint) to %s', r);
end $$;

-- functions are executable by everyone by default: close ledger_post for PUBLIC right away
revoke all on function ledger_post(bigint, text, bigint, text, text, uuid, text, text, bigint, text, numeric, jsonb) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'aurum_app') then
    perform aurum_apply_grants('aurum_app');
  end if;
end $$;
