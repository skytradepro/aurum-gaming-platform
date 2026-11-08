# Sync code from Windows PC → hanibalgamer.fr (VPS)

**Server (Hannibal only):** `13.140.189.223` — path `/opt/aurum-gaming-platform`  
**Never use:** `144.91.94.32` (SkyX).

## Why `docker compose up -d --build` alone is not enough

Docker rebuilds from files **already on the server**. If you only run compose on SSH, every step shows `CACHED` (~3–7 seconds) and the **website stays on the old version** (e.g. `/fr/casino/cherryparty` → 404).

**Correct order:** upload/sync project from PC **first**, then build on the server.

---

## Small upload (bad internet) — recommended

From PowerShell:

```powershell
cd C:\Users\PC\Desktop\aurum-gaming-platform\deploy
Set-ExecutionPolicy -Scope Process Bypass -Force
.\push-minimal.ps1
```

About **3–5 MB** (code + 5 games only). Server keeps old images. Upload must reach **100%**.

---

## Step 1 — Upload from PC (WinSCP or FileZilla)

| Field | Value |
|--------|--------|
| Host | `13.140.189.223` |
| User | `root` (or your Contabo user) |
| Local folder | `C:\Users\PC\Desktop\aurum-gaming-platform` |
| Remote folder | `/opt/aurum-gaming-platform` |

**Upload / overwrite:**

- `apps/`
- `packages/`
- `deploy/` (do **not** overwrite remote `deploy/.env` if it already works — keep server secrets)
- Root files used by Docker build: `package.json`, `package-lock.json`, `deploy/Dockerfile`, etc.

**Do not upload:**

- `node_modules/` (anywhere)
- `.env` from your PC (use server `deploy/.env` only)
- `storage/` cache from PC unless you intend to

---

## Step 2 — Verify new files on the server (SSH)

```bash
bash /opt/aurum-gaming-platform/deploy/verify-new-games.sh
```

You must see five lines starting with `OK`. If you see `MISSING`, **do not build** — upload from PC first (Step 1).

Quick one-file check:

```bash
test -f /opt/aurum-gaming-platform/apps/web/src/app/\[locale\]/casino/cherryparty/page.tsx && echo OK || echo MISSING
```

---

## Step 3 — Build and restart (SSH)

```bash
cd /opt/aurum-gaming-platform/deploy
docker compose up -d --build
```

**Healthy build:** takes **several minutes**, not ~3 seconds. You should see steps **without** `CACHED` on `COPY` / `npm run web:build`.

If everything is still `CACHED` but you know files changed:

```bash
cd /opt/aurum-gaming-platform/deploy
docker compose build --no-cache web api migrate
docker compose up -d
```

---

## Step 4 — Double-check the live site

Open in browser (hard refresh: Ctrl+F5):

- https://hanibalgamer.fr/fr/casino/cherryparty
- https://hanibalgamer.fr/fr/casino/luckybell
- https://hanibalgamer.fr/fr/casino/powerhot
- https://hanibalgamer.fr/fr/casino/goldencoins
- https://hanibalgamer.fr/fr/casino/extracrown

Casino lobby should list the five new Hannibal slots at the top of Originals.

**From the server (optional):**

```bash
curl -sI https://hanibalgamer.fr/fr/casino/cherryparty | head -1
```

Expect `HTTP/2 200` (not `404`).

---

## Step 5 — If something fails

```bash
cd /opt/aurum-gaming-platform/deploy
docker compose logs -f web --tail 80
docker compose logs -f api --tail 80
```

---

## One deploy = all in-house games

All Hannibal originals (including future slots) ship in **one** codebase. After Step 1–3, **every** game that works on `localhost:3000` should appear on the domain — no separate deploy per game.

**Local check before upload:** `INHOUSE_GAMES=true` in PC `.env`, run `npm run api:dev` + `npm run web:dev`, open `/fr/casino/cherryparty`.
