#!/bin/bash
# Run on the VPS before docker compose build. Exits 1 if source files are missing.
set -euo pipefail
ROOT="${1:-/opt/aurum-gaming-platform}"
GAMES=(cherryparty luckybell powerhot goldencoins extracrown)
missing=0
for g in "${GAMES[@]}"; do
  path="$ROOT/apps/web/src/app/[locale]/casino/$g/page.tsx"
  if [[ -f "$path" ]]; then
    echo "OK  $g"
  else
    echo "MISSING  $path"
    missing=1
  fi
done
if [[ "$missing" -ne 0 ]]; then
  echo ""
  echo "Upload apps/ and packages/ from your PC (WinSCP) before building. See deploy/SYNC-FROM-WINDOWS.md"
  exit 1
fi
echo "All five slot pages present — safe to: cd deploy && docker compose up -d --build"
