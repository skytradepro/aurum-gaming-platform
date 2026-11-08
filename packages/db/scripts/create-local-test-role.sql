-- Run as a local PostgreSQL admin (e.g. postgres) on your DEV machine only.
-- Connect to database "postgres". Does NOT touch the "aurum" database or app data.
-- After creating the role, set TEST_DATABASE_URL in .env (not DATABASE_URL):
--   postgres://aurum_test@localhost:5432/postgres
-- Set the password via pgAdmin or:  psql ...  then  \password aurum_test

CREATE ROLE aurum_test
  LOGIN
  NOSUPERUSER
  CREATEDB
  NOCREATEROLE
  NOINHERIT
  CONNECTION LIMIT 10;

-- Verify:
-- SELECT rolname, rolcreatedb, rolsuper FROM pg_roles WHERE rolname = 'aurum_test';
