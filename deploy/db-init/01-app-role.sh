#!/bin/sh
# Runs once, when the database volume is first created. Creates the least-privilege role used by the API.
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
create role aurum_app login password '${AURUM_APP_PASSWORD}';
SQL
