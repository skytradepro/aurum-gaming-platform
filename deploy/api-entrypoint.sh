#!/bin/sh
# Seed football disk cache when the volume/bind mount is empty (after first deploy or rebuild).
set -e
CACHE="${AURUM_STORAGE_CACHE:-/app/storage/cache}"
SEED="/app/deploy/seed"
mkdir -p "$CACHE"
for f in football-fixtures.json football-data.json football-stars.json; do
  if [ ! -s "$CACHE/$f" ] && [ -f "$SEED/$f" ]; then
    cp "$SEED/$f" "$CACHE/$f"
  fi
done
exec "$@"
