-- Simple sign-up: a player account needs only a username, an e-mail, a password and a currency.
-- Date of birth, phone and first/last name become optional (still stored and checked when given;
-- the 18+ trigger still checks a date of birth when one is set).
alter table users drop constraint users_player_fields;
alter table users add constraint users_player_fields check (
  role <> 'user' or (
    country_code is not null and account_currency is not null and terms_accepted_at is not null));

-- Names may be empty for players who used the short form; never longer than 80 characters.
alter table users drop constraint users_first_name_check;
alter table users add constraint users_first_name_check check (length(btrim(first_name)) <= 80);
alter table users drop constraint users_last_name_check;
alter table users add constraint users_last_name_check check (length(btrim(last_name)) <= 80);
