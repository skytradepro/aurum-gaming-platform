-- =============================================================================
-- Aurum - withdrawals started at a shop (migration 0013).
--   psql -v ON_ERROR_STOP=1 -X -q -d <database> -f db/tests/withdrawal_approvals.test.sql
-- Runs in one transaction that is rolled back.
-- =============================================================================
\set ON_ERROR_STOP on
\set QUIET on
begin;
create procedure pg_temp.expect_sqlstate(p_sql text, p_expected text, p_label text)
language plpgsql as $$
declare
  v_state text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    if v_state <> p_expected then
      raise exception 'TEST FAILED [%]: expected SQLSTATE % but got % (%)', p_label, p_expected, v_state, sqlerrm;
    end if;
    raise notice 'ok - %', p_label;
    return;
  end;
  raise exception 'TEST FAILED [%]: expected SQLSTATE % but no error was raised', p_label, p_expected;
end $$;

create function pg_temp.mk_super(p_username text) returns uuid
language plpgsql as $$
declare v_id uuid;
begin
  perform set_config('app.bootstrap', 'on', true);
  insert into users (username, email, password_hash, first_name, last_name, role)
  values (p_username, p_username || '@example.test', 'x', 'Super', 'Admin', 'super_admin')
  returning id into v_id;
  perform set_config('app.bootstrap', 'off', true);
  return v_id;
end $$;

create function pg_temp.mk_admin(p_username text) returns uuid
language plpgsql as $$
declare v_id uuid;
begin
  insert into users (username, email, password_hash, first_name, last_name, role, permissions)
  values (p_username, p_username || '@example.test', 'x', 'Staff', 'Member', 'admin', array['balances.manage'])
  returning id into v_id;
  return v_id;
end $$;

create sequence pg_temp.phone_seq start 20000000;
create function pg_temp.mk_player(p_username text, p_currency text default 'TND') returns uuid
language plpgsql as $$
declare v_id uuid;
begin
  insert into users (username, email, phone, password_hash, first_name, last_name,
                     date_of_birth, country_code, account_currency, terms_accepted_at)
  values (p_username, p_username || '@example.test', '+216' || nextval('pg_temp.phone_seq'), 'x',
          'Test', 'Player', date '1990-01-01', 'TN', p_currency, now())
  returning id into v_id;
  return v_id;
end $$;

create function pg_temp.wallet_of(p_user uuid) returns bigint
language sql as $$ select id from wallets where user_id = p_user and kind = 'main' $$;


do $$
declare
  sa uuid := pg_temp.mk_super('ap_super');
  p  uuid := pg_temp.mk_player('ap_player');
  w  bigint := pg_temp.wallet_of(p);
  shop bigint;
  cashier uuid;
  ap bigint;
  wid bigint;
  bal bigint;
begin
  insert into shops (code, name, currency, created_by) values ('AP-1', 'Test shop', 'TND', sa) returning id into shop;
  insert into users (username, email, password_hash, first_name, last_name, role, shop_id, shop_role)
  values ('ap_cashier', 'ap_cashier@example.test', 'x', 'Cash', 'Ier', 'cashier', shop, 'cashier') returning id into cashier;
  perform shop_cash_post(shop, 'float_in', 100000, 'test', 'float1', sa, null, null, null, null);
  perform ledger_post(w, 'deposit', 50000, 'test', 'dep1', sa);

  insert into withdrawal_approvals (user_id, shop_id, requested_by, currency, amount_minor, code, expires_at)
  values (p, shop, cashier, 'TND', 20000, '123456', now() + interval '10 minutes') returning id into ap;
  call pg_temp.expect_sqlstate(format('update withdrawal_approvals set amount_minor = 1 where id = %s', ap), 'AU905', 'approval amount is immutable');
  call pg_temp.expect_sqlstate(format('delete from withdrawal_approvals where id = %s', ap), 'AU905', 'approvals are never deleted');
  update withdrawal_approvals set attempts = 1 where id = ap;

  select o_id into wid from withdrawal_create(p, 20000, 'K7Q2M9XPAB', now() + interval '1 hour', shop, 'approval:' || ap);
  perform withdrawal_pay(wid, shop, cashier, 'approved with the player code');
  update withdrawal_approvals set status = 'used', withdrawal_id = wid, closed_at = now() where id = ap;
  select balance_minor into bal from wallets where id = w;
  if bal <> 30000 then raise exception 'TEST FAILED: balance after counter withdrawal is %', bal; end if;
  select cash_balance_minor into bal from shops where id = shop;
  if bal <> 80000 then raise exception 'TEST FAILED: shop cash after payout is %', bal; end if;
  raise notice 'ok - counter withdrawal debits the wallet and pays from the shop cash';
  call pg_temp.expect_sqlstate(format('update withdrawal_approvals set status = %L where id = %s', 'pending', ap), 'AU312', 'a used approval cannot change');
end $$;

\echo 'APPROVAL TESTS PASSED'
rollback;
