-- =============================================================================
-- Aurum - database tests (pure SQL, run with psql against a database that has
-- all migrations applied).
--
--   psql -v ON_ERROR_STOP=1 -X -q -d <database> -f db/tests/schema.test.sql
--
-- Everything runs inside one transaction that is rolled back at the end, so the
-- database is left untouched. A failing check raises an exception and stops.
-- =============================================================================
\set ON_ERROR_STOP on
\set QUIET on
begin;

-- ---------------------------------------------------------------------------
-- helpers (live in the session-private pg_temp schema)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 1. Super Admin protection
-- ---------------------------------------------------------------------------
call pg_temp.expect_sqlstate(
  $q$insert into users (username, email, password_hash, first_name, last_name, role)
     values ('sneaky_super', 'sneaky@example.test', 'x', 'S', 'S', 'super_admin')$q$,
  'AU102', 'a super_admin cannot be created without the command-line bootstrap flag');

do $$
declare
  v_admin uuid := pg_temp.mk_admin('promote_me');
begin
  call pg_temp.expect_sqlstate(
    format($q$update users set role = 'super_admin', permissions = '{}' where id = %L$q$, v_admin),
    'AU102', 'an admin cannot be promoted to super_admin from the application');
end $$;

do $$
declare
  v_s1 uuid := pg_temp.mk_super('super_one');
  v_s2 uuid;
begin
  -- the first super admin is the last one: it cannot be demoted or disabled
  call pg_temp.expect_sqlstate(
    format($q$update users set status = 'suspended' where id = %L$q$, v_s1),
    'AU103', 'the last active super_admin cannot be suspended');
  call pg_temp.expect_sqlstate(
    format($q$update users set role = 'admin' where id = %L$q$, v_s1),
    'AU103', 'the last active super_admin cannot be demoted');
  -- with a second one, the first can be disabled
  v_s2 := pg_temp.mk_super('super_two');
  update users set status = 'suspended' where id = v_s1;
  assert (select status from users where id = v_s1) = 'suspended', 'super_one should be suspended';
  call pg_temp.expect_sqlstate(
    format($q$update users set status = 'suspended' where id = %L$q$, v_s2),
    'AU103', 'the remaining active super_admin is protected');
  raise notice 'ok - a super_admin can be disabled only while another active one remains';
end $$;

-- ---------------------------------------------------------------------------
-- 2. Users: age, required fields, no deletes
-- ---------------------------------------------------------------------------
call pg_temp.expect_sqlstate(
  $q$insert into users (username, email, phone, password_hash, first_name, last_name,
                        date_of_birth, country_code, account_currency, terms_accepted_at)
     values ('kid_user', 'kid@example.test', '+21611111111', 'x', 'K', 'K',
             (current_date - interval '17 years 364 days')::date, 'TN', 'TND', now())$q$,
  'AU101', 'registration is refused below 18 years');

do $$
begin
  insert into users (username, email, phone, password_hash, first_name, last_name,
                     date_of_birth, country_code, account_currency, terms_accepted_at)
  values ('just_adult', 'just_adult@example.test', '+21622222222', 'x', 'A', 'A',
          (current_date - interval '18 years')::date, 'TN', 'TND', now());
  raise notice 'ok - a player who turns 18 today can register';
end $$;

call pg_temp.expect_sqlstate(
  $q$insert into users (username, email, password_hash, first_name, last_name)
     values ('incomplete', 'incomplete@example.test', 'x', 'I', 'I')$q$,
  '23514', 'a player needs date of birth, country, phone, currency and accepted terms');

call pg_temp.expect_sqlstate(
  $q$insert into users (username, email, password_hash, first_name, last_name, role, account_currency)
     values ('staff_cur', 'staff_cur@example.test', 'x', 'S', 'S', 'admin', 'TND')$q$,
  '23514', 'staff accounts have no wallet currency');

call pg_temp.expect_sqlstate(
  $q$insert into users (username, email, phone, password_hash, first_name, last_name,
                        date_of_birth, country_code, account_currency, terms_accepted_at, permissions)
     values ('perm_user', 'perm_user@example.test', '+21633333333', 'x', 'P', 'P',
             date '1990-01-01', 'TN', 'TND', now(), array['users.manage'])$q$,
  '23514', 'players cannot hold staff permissions');

do $$
declare v_a uuid := pg_temp.mk_player('Dup_User');
begin
  call pg_temp.expect_sqlstate(
    $q$insert into users (username, email, phone, password_hash, first_name, last_name,
                          date_of_birth, country_code, account_currency, terms_accepted_at)
       values ('dup_user', 'other@example.test', '+21644444444', 'x', 'D', 'D',
               date '1990-01-01', 'TN', 'TND', now())$q$,
    '23505', 'usernames are unique regardless of case');
  call pg_temp.expect_sqlstate(
    $q$insert into users (username, email, phone, password_hash, first_name, last_name,
                          date_of_birth, country_code, account_currency, terms_accepted_at)
       values ('another_one', 'DUP_USER@example.test', '+21655555555', 'x', 'D', 'D',
               date '1990-01-01', 'TN', 'TND', now())$q$,
    '23505', 'emails are unique regardless of case');
  call pg_temp.expect_sqlstate(
    format($q$delete from users where id = %L$q$, v_a),
    'AU105', 'users can never be deleted');
  call pg_temp.expect_sqlstate(
    format($q$update users set account_currency = 'EUR' where id = %L$q$, v_a),
    'AU104', 'the account currency can never change');
end $$;

-- ---------------------------------------------------------------------------
-- 3. Wallets are created automatically and are protected
-- ---------------------------------------------------------------------------
do $$
declare
  v_tnd uuid := pg_temp.mk_player('wallet_tnd', 'TND');
  v_eur uuid := pg_temp.mk_player('wallet_eur', 'EUR');
  v_admin uuid := pg_temp.mk_admin('wallet_admin');
begin
  assert (select count(*) from wallets where user_id = v_tnd) = 1, 'a player has exactly one wallet';
  assert (select currency from wallets where user_id = v_tnd) = 'TND', 'wallet uses the account currency';
  assert (select currency from wallets where user_id = v_eur) = 'EUR', 'EUR wallet uses EUR';
  assert (select balance_minor from wallets where user_id = v_tnd) = 0, 'wallets start empty';
  assert (select count(*) from wallets where user_id = v_admin) = 0, 'staff have no wallet';
  raise notice 'ok - every player gets one wallet in the account currency; staff get none';

  call pg_temp.expect_sqlstate(
    format($q$insert into wallets (user_id, currency, kind) values (%L, 'USD', 'main')$q$, v_tnd),
    'AU104', 'a wallet must have the currency of its account');
  call pg_temp.expect_sqlstate(
    format($q$update wallets set balance_minor = 999999 where user_id = %L$q$, v_tnd),
    'AU902', 'a balance cannot be edited directly');
  call pg_temp.expect_sqlstate(
    format($q$delete from wallets where user_id = %L$q$, v_tnd),
    'AU903', 'wallets cannot be deleted');
  call pg_temp.expect_sqlstate(
    format($q$update wallets set currency = 'USD' where user_id = %L$q$, v_tnd),
    'AU902', 'a wallet currency cannot be changed');
  call pg_temp.expect_sqlstate('truncate wallets', '0A000', 'wallets cannot be truncated (they are referenced by the ledger)');
end $$;

-- ---------------------------------------------------------------------------
-- 4. ledger_post: normal flow, replays, conflicts
-- ---------------------------------------------------------------------------
do $$
declare
  v_op uuid := pg_temp.mk_admin('ledger_op');
  v_u  uuid := pg_temp.mk_player('ledger_user', 'TND');
  v_w  bigint := pg_temp.wallet_of(v_u);
  r    record;
  r2   record;
  n    bigint;
begin
  select * into r from ledger_post(v_w, 'deposit', 10000, 'admin', 'k-dep-1', v_op, null, 'cash desk #1');
  assert r.o_replayed = false, 'first post is not a replay';
  assert r.o_balance_before_minor = 0 and r.o_balance_after_minor = 10000, 'deposit moves 0 -> 10000';
  assert r.o_direction = 1 and r.o_currency = 'TND', 'deposit is a credit in TND';
  assert (select balance_minor from wallets where id = v_w) = 10000, 'wallet balance is 10000';

  -- the same request again: replayed, nothing is posted twice
  select * into r2 from ledger_post(v_w, 'deposit', 10000, 'admin', 'k-dep-1', v_op, null, 'cash desk #1');
  assert r2.o_replayed = true and r2.o_id = r.o_id, 'the retry returns the original entry';
  assert (select balance_minor from wallets where id = v_w) = 10000, 'a replay does not move the balance';
  select count(*) into n from ledger_entries where wallet_id = v_w;
  assert n = 1, 'a replay does not create a second entry';
  raise notice 'ok - ledger_post posts once and replays identical retries';

  -- same key, different amount: refused
  call pg_temp.expect_sqlstate(
    format($q$select * from ledger_post(%s, 'deposit', 20000, 'admin', 'k-dep-1', %L, null, 'cash desk #1')$q$, v_w, v_op),
    'AU002', 'an idempotency key reused with other parameters is rejected');

  -- the same key in another scope is a different request
  select * into r2 from ledger_post(v_w, 'deposit', 500, 'other-scope', 'k-dep-1', v_op);
  assert r2.o_replayed = false and r2.o_balance_after_minor = 10500, 'scopes are independent';

  -- withdrawals
  select * into r from ledger_post(v_w, 'withdrawal', 2500, 'admin', 'k-wd-1', v_op);
  assert r.o_balance_before_minor = 10500 and r.o_balance_after_minor = 8000 and r.o_direction = -1, 'withdrawal 10500 -> 8000';

  -- insufficient funds changes nothing
  call pg_temp.expect_sqlstate(
    format($q$select * from ledger_post(%s, 'withdrawal', 8001, 'admin', 'k-wd-2', %L)$q$, v_w, v_op),
    'AU001', 'a withdrawal above the balance is refused');
  assert (select balance_minor from wallets where id = v_w) = 8000, 'a refused withdrawal leaves the balance untouched';
  select count(*) into n from ledger_entries where idempotency_key = 'k-wd-2';
  assert n = 0, 'a refused withdrawal leaves no entry';

  -- exactly the full balance is allowed (balance reaches 0, never below)
  select * into r from ledger_post(v_w, 'withdrawal', 8000, 'admin', 'k-wd-3', v_op);
  assert r.o_balance_after_minor = 0, 'the whole balance can be withdrawn';
  raise notice 'ok - withdrawals never take a balance below zero';
end $$;

-- ---------------------------------------------------------------------------
-- 5. ledger_post: business rules
-- ---------------------------------------------------------------------------
do $$
declare
  v_op  uuid := pg_temp.mk_admin('rules_op');
  v_u   uuid := pg_temp.mk_player('rules_user', 'TND');
  v_w   bigint := pg_temp.wallet_of(v_u);
  v_sus uuid := pg_temp.mk_player('rules_susp', 'TND');
  v_wsus bigint := pg_temp.wallet_of(v_sus);
  v_clo uuid := pg_temp.mk_player('rules_closed', 'TND');
  v_wclo bigint := pg_temp.wallet_of(v_clo);
  r record;
begin
  perform ledger_post(v_w, 'deposit', 100000, 'admin', 'rules-1', v_op);

  call pg_temp.expect_sqlstate(
    format($q$select * from ledger_post(%s, 'adjustment_credit', 100, 'admin', 'rules-2', %L)$q$, v_w, v_op),
    'AU006', 'an adjustment needs a reason');
  call pg_temp.expect_sqlstate(
    format($q$select * from ledger_post(%s, 'adjustment_credit', 100, 'admin', 'rules-3', %L, 'ab')$q$, v_w, v_op),
    'AU006', 'a reason must have at least 3 characters');
  select * into r from ledger_post(v_w, 'adjustment_credit', 100, 'admin', 'rules-4', v_op, 'Correction of ticket 77');
  assert r.o_balance_after_minor = 100100, 'a documented adjustment is posted';

  call pg_temp.expect_sqlstate(
    format($q$select * from ledger_post(%s, 'deposit', 100, 'admin', 'rules-5', null)$q$, v_w),
    'AU007', 'a deposit needs a staff operator');
  call pg_temp.expect_sqlstate(
    format($q$select * from ledger_post(%s, 'deposit', 100, 'admin', 'rules-6', %L)$q$, v_w, v_u),
    'AU007', 'a player cannot be the operator');
  call pg_temp.expect_sqlstate(
    format($q$select * from ledger_post(%s, 'bet_stake', 100, 'game', 'rules-7', %L)$q$, v_w, v_op),
    'AU007', 'system entries cannot carry an operator');
  call pg_temp.expect_sqlstate(
    format($q$select * from ledger_post(%s, 'bonus_credit', 100, 'admin', 'rules-8', %L, 'welcome')$q$, v_w, v_op),
    'AU010', 'bonus entries need a bonus wallet');
  call pg_temp.expect_sqlstate(
    format($q$select * from ledger_post(%s, 'no_such_type', 100, 'admin', 'rules-9', %L)$q$, v_w, v_op),
    'AU010', 'unknown entry types are refused');
  call pg_temp.expect_sqlstate(
    format($q$select * from ledger_post(%s, 'deposit', 0, 'admin', 'rules-10', %L)$q$, v_w, v_op),
    'AU005', 'a zero amount is refused');
  call pg_temp.expect_sqlstate(
    format($q$select * from ledger_post(%s, 'deposit', -5, 'admin', 'rules-11', %L)$q$, v_w, v_op),
    'AU005', 'a negative amount is refused');
  call pg_temp.expect_sqlstate(
    format($q$select * from ledger_post(%s, 'deposit', 1000000000000001, 'admin', 'rules-12', %L)$q$, v_w, v_op),
    'AU005', 'an amount above 10^15 minor units is refused');
  call pg_temp.expect_sqlstate(
    format($q$select * from ledger_post(%s, 'deposit', 100, 'admin', '   ', %L)$q$, v_w, v_op),
    'AU011', 'a blank idempotency key is refused');
  call pg_temp.expect_sqlstate(
    format($q$select * from ledger_post(999999999, 'deposit', 100, 'admin', 'rules-13', %L)$q$, v_op),
    'AU003', 'an unknown wallet is refused');
  select * into r from ledger_post(v_w, 'deposit', 1000000000000000, 'admin', 'rules-14', v_op);
  assert r.o_amount_minor = 1000000000000000, 'the maximum single amount is accepted';
  raise notice 'ok - ledger_post enforces reasons, operators, entry types and amount limits';

  -- account status
  update users set status = 'suspended' where id = v_sus;
  update users set status = 'closed' where id = v_clo;
  call pg_temp.expect_sqlstate(
    format($q$select * from ledger_post(%s, 'bet_stake', 1, 'game', 'sus-1')$q$, v_wsus),
    'AU004', 'a suspended account cannot place bets');
  select * into r from ledger_post(v_wsus, 'deposit', 5000, 'admin', 'sus-2', v_op);
  assert r.o_balance_after_minor = 5000, 'staff can still credit a suspended account';
  select * into r from ledger_post(v_wsus, 'bet_win', 1000, 'game', 'sus-3');
  assert r.o_balance_after_minor = 6000, 'winnings of earlier bets can still be paid to a suspended account';
  call pg_temp.expect_sqlstate(
    format($q$select * from ledger_post(%s, 'deposit', 5000, 'admin', 'clo-1', %L)$q$, v_wclo, v_op),
    'AU004', 'nothing can be posted to a closed account');
  raise notice 'ok - suspended and closed accounts follow the posting rules';
end $$;

-- ---------------------------------------------------------------------------
-- 6. Conversions keep the original amount, currency and rate (and must be exact)
-- ---------------------------------------------------------------------------
do $$
declare
  v_op uuid := pg_temp.mk_admin('conv_op');
  v_u  uuid := pg_temp.mk_player('conv_user', 'TND');
  v_w  bigint := pg_temp.wallet_of(v_u);
  r    record;
  e    ledger_entries%rowtype;
begin
  -- 100.00 EUR at 3.35 = 335.000 TND (EUR has 2 decimals, TND has 3)
  select * into r from ledger_post(v_w, 'deposit', 335000, 'admin', 'conv-1', v_op, null, 'bank transfer',
                                   10000, 'EUR', 3.35);
  select * into e from ledger_entries where id = r.o_id;
  assert e.original_amount_minor = 10000 and e.original_currency = 'EUR' and e.exchange_rate = 3.35,
    'the original amount, currency and rate are kept with the entry';
  assert e.currency = 'TND' and e.amount_minor = 335000, 'the wallet entry stays in the account currency';

  call pg_temp.expect_sqlstate(
    format($q$select * from ledger_post(%s, 'deposit', 335001, 'admin', 'conv-2', %L, null, null, 10000, 'EUR', 3.35)$q$, v_w, v_op),
    'AU008', 'the converted amount must equal original x rate');
  call pg_temp.expect_sqlstate(
    format($q$select * from ledger_post(%s, 'deposit', 335000, 'admin', 'conv-3', %L, null, null, 10000, 'TND', 3.35)$q$, v_w, v_op),
    'AU008', 'the original currency must differ from the wallet currency');
  call pg_temp.expect_sqlstate(
    format($q$select * from ledger_post(%s, 'deposit', 335000, 'admin', 'conv-4', %L, null, null, 10000, 'EUR', null)$q$, v_w, v_op),
    'AU008', 'original amount, currency and rate come together');
  call pg_temp.expect_sqlstate(
    format($q$select * from ledger_post(%s, 'deposit', 335000, 'admin', 'conv-5', %L, null, null, 10000, 'EUR', 3.3500000000001)$q$, v_w, v_op),
    'AU008', 'a rate with more than 12 decimals is refused');

  -- rounding is half-up: 0.01 EUR (1 minor) at 3.3335 = 0.033335 TND = 33.335 minor -> 33
  select * into r from ledger_post(v_w, 'deposit', 33, 'admin', 'conv-6', v_op, null, null, 1, 'EUR', 3.3335);
  assert r.o_amount_minor = 33, 'rounding below .5 rounds down';
  -- exact half rounds up: 1 EUR cent at 0.05 = 0.5 TND millime -> 1
  select * into r from ledger_post(v_w, 'deposit', 1, 'admin', 'conv-7', v_op, null, null, 1, 'EUR', 0.05);
  assert r.o_amount_minor = 1, 'an exact half rounds up (half-up)';
  -- just above / just below a half: 3 cents at 0.0501 = 1.503 -> 2 ; at 0.0499 = 1.497 -> 1
  select * into r from ledger_post(v_w, 'deposit', 2, 'admin', 'conv-8', v_op, null, null, 3, 'EUR', 0.0501);
  assert r.o_amount_minor = 2, 'just above a half rounds up';
  select * into r from ledger_post(v_w, 'deposit', 1, 'admin', 'conv-9', v_op, null, null, 3, 'EUR', 0.0499);
  assert r.o_amount_minor = 1, 'just below a half rounds down';
  raise notice 'ok - conversions are exact, half-up rounded and stored with their rate';
end $$;

-- ---------------------------------------------------------------------------
-- 7. The ledger and other history tables are append-only
-- ---------------------------------------------------------------------------
do $$
declare
  v_op uuid := pg_temp.mk_admin('hist_op');
  v_u  uuid := pg_temp.mk_player('hist_user', 'TND');
  v_w  bigint := pg_temp.wallet_of(v_u);
  v_id bigint;
begin
  select o_id into v_id from ledger_post(v_w, 'deposit', 1000, 'admin', 'hist-1', v_op);
  call pg_temp.expect_sqlstate(format('update ledger_entries set amount_minor = 1 where id = %s', v_id), 'AU901', 'ledger entries cannot be updated');
  call pg_temp.expect_sqlstate(format('delete from ledger_entries where id = %s', v_id), 'AU901', 'ledger entries cannot be deleted');
  -- since migration 0006 the shop cash ledger and withdrawal requests reference the ledger, so
  -- PostgreSQL refuses the truncate even before the append-only trigger runs
  call pg_temp.expect_sqlstate('truncate ledger_entries', '0A000', 'the ledger cannot be truncated');

  insert into audit_logs (actor_id, actor_role, action) values (v_op, 'admin', 'test.action');
  call pg_temp.expect_sqlstate($q$update audit_logs set action = 'x'$q$, 'AU901', 'audit logs cannot be updated');
  call pg_temp.expect_sqlstate('delete from audit_logs', 'AU901', 'audit logs cannot be deleted');
  call pg_temp.expect_sqlstate('truncate audit_logs', 'AU901', 'audit logs cannot be truncated');

  insert into exchange_rates (base_currency, quote_currency, rate, source, created_by)
  values ('EUR', 'TND', 3.35, 'manual', v_op);
  call pg_temp.expect_sqlstate($q$update exchange_rates set rate = 1$q$, 'AU901', 'exchange rates cannot be edited (insert a new one)');
  call pg_temp.expect_sqlstate('delete from exchange_rates', 'AU901', 'exchange rates cannot be deleted');
  call pg_temp.expect_sqlstate(
    $q$insert into exchange_rates (base_currency, quote_currency, rate, source) values ('EUR', 'EUR', 1, 'manual')$q$,
    '23514', 'a currency cannot be quoted against itself');
  call pg_temp.expect_sqlstate(
    $q$insert into exchange_rates (base_currency, quote_currency, rate, source) values ('EUR', 'TND', 0, 'manual')$q$,
    '23514', 'an exchange rate must be positive');
  raise notice 'ok - history tables are append-only';
end $$;

-- ---------------------------------------------------------------------------
-- 8. Currencies: accounting decimals are frozen once wallets exist
-- ---------------------------------------------------------------------------
do $$
declare
  v_u uuid := pg_temp.mk_player('cur_user', 'TND');
begin
  call pg_temp.expect_sqlstate(
    $q$update currencies set decimals = 2 where code = 'TND'$q$,
    'AU201', 'decimals cannot change while wallets use the currency');
  call pg_temp.expect_sqlstate(
    $q$update currencies set code = 'TNX' where code = 'TND'$q$,
    'AU201', 'a currency code cannot change');
  -- presentation settings stay editable
  update currencies set display_decimals = 3 where code = 'TND';
  update currencies set display_decimals = 2 where code = 'TND';
  call pg_temp.expect_sqlstate(
    $q$update currencies set display_decimals = 5 where code = 'EUR'$q$,
    '23514', 'display decimals cannot exceed accounting decimals');
  -- a currency nobody uses can still be re-configured
  insert into currencies (code, decimals, display, is_enabled)
  values ('DZD', 2, '{"default":{"symbol":"DA","placement":"after","spacing":true}}', false);
  update currencies set decimals = 3 where code = 'DZD';
  call pg_temp.expect_sqlstate(
    $q$insert into currencies (code, decimals, display) values ('XXX', 2, '{"default":{"symbol":"","placement":"after","spacing":true}}')$q$,
    '23514', 'a currency needs a display symbol');
  call pg_temp.expect_sqlstate(
    $q$insert into currencies (code, decimals, display) values ('AAA', 9, '{"default":{"symbol":"A","placement":"after","spacing":true}}')$q$,
    '23514', 'decimals are limited to 0..8');
  raise notice 'ok - currency configuration rules';
end $$;

-- ---------------------------------------------------------------------------
-- 9. ledger_verify detects tampering and the balance ceiling
-- ---------------------------------------------------------------------------
do $$
declare
  v_op uuid := pg_temp.mk_admin('verify_op');
  v_u  uuid := pg_temp.mk_player('verify_user', 'TND');
  v_w  bigint := pg_temp.wallet_of(v_u);
  n    integer;
begin
  perform ledger_post(v_w, 'deposit', 5000, 'admin', 'ver-1', v_op);
  perform ledger_post(v_w, 'withdrawal', 1200, 'admin', 'ver-2', v_op);
  select count(*) into n from ledger_verify();
  assert n = 0, 'healthy books verify cleanly';
  select count(*) into n from ledger_verify(v_w);
  assert n = 0, 'a healthy wallet verifies cleanly';

  -- simulate tampering by a privileged user (the guard flag is what ledger_post sets)
  perform set_config('app.ledger_post', 'on', true);
  update wallets set balance_minor = balance_minor + 7 where id = v_w;
  perform set_config('app.ledger_post', 'off', true);
  select count(*) into n from ledger_verify(v_w);
  assert n = 1, 'a forged balance is detected';
  assert (select problem from ledger_verify(v_w)) = 'balance_mismatch', 'it is reported as a balance mismatch';
  assert (select expected_minor from ledger_verify(v_w)) = 3800 and (select actual_minor from ledger_verify(v_w)) = 3807,
    'the report shows the expected and the actual balance';
  raise notice 'ok - ledger_verify detects a forged balance';

  -- balance ceiling: 9 * 10^18
  perform set_config('app.ledger_post', 'on', true);
  update wallets set balance_minor = 8999999999999999999 where id = v_w;
  perform set_config('app.ledger_post', 'off', true);
  call pg_temp.expect_sqlstate(
    format($q$select * from ledger_post(%s, 'deposit', 10, 'admin', 'ver-3', %L)$q$, v_w, v_op),
    'AU009', 'a balance above the supported maximum is refused');
end $$;

-- ---------------------------------------------------------------------------
-- 10. Least privilege: the application role cannot rewrite money or history
-- ---------------------------------------------------------------------------
do $$
declare
  v_op uuid := pg_temp.mk_admin('priv_op');
  v_u  uuid := pg_temp.mk_player('priv_user', 'TND');
  v_w  bigint := pg_temp.wallet_of(v_u);
  r    record;
begin
  create role aurum_app_test login;
  perform aurum_apply_grants('aurum_app_test');
  set local role aurum_app_test;

  -- allowed
  perform count(*) from ledger_entries;
  select * into r from ledger_post(v_w, 'deposit', 777, 'admin', 'priv-1', v_op);
  assert r.o_balance_after_minor = 777, 'the application role can post through ledger_post()';
  insert into audit_logs (action) values ('priv.test');

  -- refused
  call pg_temp.expect_sqlstate('update wallets set balance_minor = 1', '42501', 'the application role cannot update wallets');
  call pg_temp.expect_sqlstate('insert into wallets (user_id, currency) select id, ''TND'' from users limit 1', '42501', 'the application role cannot insert wallets directly');
  call pg_temp.expect_sqlstate('delete from ledger_entries', '42501', 'the application role cannot delete ledger entries');
  call pg_temp.expect_sqlstate('update ledger_entries set amount_minor = 1', '42501', 'the application role cannot update ledger entries');
  call pg_temp.expect_sqlstate('delete from audit_logs', '42501', 'the application role cannot delete audit logs');
  call pg_temp.expect_sqlstate('update audit_logs set action = ''x''', '42501', 'the application role cannot update audit logs');
  call pg_temp.expect_sqlstate('delete from users', '42501', 'the application role cannot delete users');
  call pg_temp.expect_sqlstate('update ledger_entry_types set direction = 1', '42501', 'the application role cannot edit entry types');

  reset role;
  raise notice 'ok - the application role has least privilege';
end $$;

-- a new player created through the application role still gets a wallet
-- (the trigger function is SECURITY DEFINER)
do $$
declare
  v_id uuid;
begin
  set local role aurum_app_test;
  insert into users (username, email, phone, password_hash, first_name, last_name,
                     date_of_birth, country_code, account_currency, terms_accepted_at)
  values ('role_made', 'role_made@example.test', '+21688888888', 'x', 'R', 'M',
          date '1990-01-01', 'TN', 'EUR', now())
  returning id into v_id;
  assert (select count(*) from wallets where user_id = v_id and currency = 'EUR') = 1,
    'a wallet is created even when the application role registers the player';
  reset role;
  raise notice 'ok - registration through the application role creates the wallet';
end $$;

rollback;
\echo ALL SQL TESTS PASSED
