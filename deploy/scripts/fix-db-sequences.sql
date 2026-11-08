-- Run after aurum-data.sql import. Fixes 409 "conflict" on login when sessions/audit identity sequences lag behind MAX(id).
DO $aurum$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND is_identity = 'YES'
  LOOP
    EXECUTE format(
      'SELECT setval(pg_get_serial_sequence(%L, %L), COALESCE((SELECT MAX(%I) FROM %I), 1), true)',
      r.table_name, r.column_name, r.column_name, r.table_name
    );
  END LOOP;
END $aurum$;
