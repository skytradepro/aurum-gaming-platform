-- =============================================================================
-- Aurum - online withdrawals (migration 0012) and the welcome gift.
--   psql -v ON_ERROR_STOP=1 -X -q -d <database> -f db/tests/online_withdrawals.test.sql
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
  sa uuid := pg_temp.mk_super('ow_super');
  ad uuid := pg_temp.mk_admin('ow_admin');
  p  uuid := pg_temp.mk_player('ow_player');
  p2 uuid := pg_temp.mk_player('ow_other');
  w  bigint := pg_temp.wallet_of(p);
  r  record;
  id1 bigint; id2 bigint; id3 bigint;
  bal bigint;
begin
  -- welcome gift: once per account, no staff needed
  perform ledger_post(w, 'welcome_gift', 500, 'welcome:' || p, 'welcome');
  perform ledger_post(w, 'welcome_gift', 500, 'welcome:' || p, 'welcome');
  select balance_minor into bal from wallets where id = w;
  if bal <> 500 then raise exception 'TEST FAILED: welcome gift credited % instead of 500 once', bal; end if;
  raise notice 'ok - welcome gift is credited once';

  -- no deposit yet: a withdrawal is refused even with the gift on the balance
  call pg_temp.expect_sqlstate(format('select * from online_withdrawal_create(%L, 100, %L, %L, %L)', p, 'bank', '{"iban":"DE16202208000047995385"}', 'k0'), 'AU320', 'a withdrawal needs a real deposit');

  perform ledger_post(w, 'deposit', 10000, 'test', 'dep1', sa);
  select * into r from online_withdrawal_create(p, 3000, 'bank', '{"iban":"DE16202208000047995385","name":"Test Player"}', 'k1');
  id1 := r.o_id;
  select balance_minor into bal from wallets where id = w;
  if bal <> 7500 then raise exception 'TEST FAILED: balance after reserve is %', bal; end if;
  select * into r from online_withdrawal_create(p, 3000, 'bank', '{"iban":"DE16202208000047995385","name":"Test Player"}', 'k1');
  if not r.o_replayed or r.o_id <> id1 then raise exception 'TEST FAILED: replay'; end if;
  select balance_minor into bal from wallets where id = w;
  if bal <> 7500 then raise exception 'TEST FAILED: replay moved money (%)', bal; end if;
  raise notice 'ok - the amount is reserved once (idempotent)';

  call pg_temp.expect_sqlstate(format('select * from online_withdrawal_create(%L, 999999, %L, %L, %L)', p, 'crypto', '{"network":"usdt_trc20"}', 'kbig'), 'AU001', 'cannot withdraw more than the balance');
  call pg_temp.expect_sqlstate(format('select * from online_withdrawal_create(%L, 100, %L, %L, %L)', p, 'cash', '{}', 'kbad'), 'AU012', 'unknown method refused');

  select o_id into id2 from online_withdrawal_create(p, 1000, 'crypto', '{"network":"usdt_trc20","address":"TEdcfwXLfKR8mDCa5jVJf6RuiXvZXbTr6q"}', 'k2');
  select o_id into id3 from online_withdrawal_create(p, 1000, 'crypto', '{"network":"usdt_trc20","address":"TEdcfwXLfKR8mDCa5jVJf6RuiXvZXbTr6q"}', 'k3');
  call pg_temp.expect_sqlstate(format('select * from online_withdrawal_create(%L, 100, %L, %L, %L)', p, 'bank', '{}', 'k4'), 'AU321', 'at most 3 pending withdrawals');
  select balance_minor into bal from wallets where id = w;
  if bal <> 5500 then raise exception 'TEST FAILED: the refused 4th request moved money (%)', bal; end if;

  call pg_temp.expect_sqlstate(format('select * from online_withdrawal_close(%s, %L, %L)', id2, 'cancelled', p2), 'AU007', 'another player cannot cancel');
  call pg_temp.expect_sqlstate(format('select * from online_withdrawal_close(%s, %L, %L)', id2, 'rejected', p), 'AU007', 'a player cannot reject');
  call pg_temp.expect_sqlstate(format('select * from online_withdrawal_close(%s, %L, %L, %L)', id2, 'rejected', ad, ''), 'AU006', 'a rejection needs a reason');
  perform online_withdrawal_close(id2, 'cancelled', p);
  perform online_withdrawal_close(id3, 'rejected', ad, 'Wrong address');
  select balance_minor into bal from wallets where id = w;
  if bal <> 7500 then raise exception 'TEST FAILED: cancel/reject did not return the money (%)', bal; end if;
  raise notice 'ok - cancelled and rejected requests return the money';
  call pg_temp.expect_sqlstate(format('select * from online_withdrawal_close(%s, %L, %L)', id2, 'cancelled', p), 'AU312', 'a closed request cannot close twice');

  call pg_temp.expect_sqlstate(format('select * from online_withdrawal_pay(%s, %L, %L)', id1, p, 'TX-123'), 'AU007', 'a player cannot mark paid');
  call pg_temp.expect_sqlstate(format('select * from online_withdrawal_pay(%s, %L, %L)', id1, ad, ''), 'AU006', 'paid needs a reference');
  select * into r from online_withdrawal_pay(id1, ad, 'SEPA-REF-001');
  if r.o_replayed then raise exception 'TEST FAILED: first pay replayed'; end if;
  select * into r from online_withdrawal_pay(id1, ad, 'SEPA-REF-001');
  if not r.o_replayed then raise exception 'TEST FAILED: second pay not a replay'; end if;
  select balance_minor into bal from wallets where id = w;
  if bal <> 7500 then raise exception 'TEST FAILED: paying moved money (%)', bal; end if;
  raise notice 'ok - head office marks paid once, no extra wallet movement';
  call pg_temp.expect_sqlstate(format('select * from online_withdrawal_close(%s, %L, %L, %L)', id1, 'rejected', sa, 'too late'), 'AU312', 'a paid request cannot be rejected');
  call pg_temp.expect_sqlstate(format('update online_withdrawals set amount_minor = 1 where id = %s', id1), 'AU905', 'no direct update');
  call pg_temp.expect_sqlstate(format('delete from online_withdrawals where id = %s', id1), 'AU905', 'never deleted');
  call pg_temp.expect_sqlstate(format('select * from online_withdrawal_create(%L, 100, %L, %L, %L)', ad, 'bank', '{}', 'kadm'), 'AU013', 'staff cannot request a withdrawal');
end $$;

\echo 'ONLINE WITHDRAWAL TESTS PASSED'
rollback;
