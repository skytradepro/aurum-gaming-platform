# Deploying Aurum for team testing (single Linux server)

Status: files written, NOT yet run on a server. Expect small fixes on the first run.

## What you need
1. A Linux VPS (Ubuntu 24.04 suggested) with Docker + Docker Compose plugin installed.
2. A domain or subdomain whose DNS A record points to the server's IP (done by the owner; nothing here changes DNS).
3. Ports 80 and 443 open on the server firewall.

## Steps (on the server)
1. Copy the project to the server (git clone or upload). Do NOT copy your local `.env`.
   - **From Windows Desktop:** follow **`deploy/SYNC-FROM-WINDOWS.md`** (upload **before** `docker compose build`, or the site stays old).
2. `cd aurum-gaming-platform/deploy && cp .env.example .env` and fill every value.
3. Create the team password hash:
   `docker run --rm caddy:2 caddy hash-password --plaintext 'YOUR-TEAM-PASSWORD'`
   Put the output in `BASIC_AUTH_HASH` (inside single quotes if it contains `$`).
4. `docker compose up -d --build`
5. Create the first Super Admin (CLI only):
   `docker compose run --rm api npm run create-super-admin -w @aurum/api -- --username admin --email you@example.com --first-name Name --last-name Surname`
6. Open `https://SITE_ADDRESS`, enter the team password, then register/login as usual.

## Operate
- Logs: `docker compose logs -f api web caddy`
- Stop: `docker compose down` (data stays in volumes). Never use `down -v` unless you want to erase the database.
- Backup database: `docker compose exec db pg_dump -U postgres aurum > backup.sql`

## Safety
- The team password protects the whole site while testing. Remove the `basic_auth` block in `Caddyfile` only at public launch.
- `SHOW_DEMO_DATA` is false and cookies are Secure/HTTPS-only.
- `INHOUSE_GAMES=true` is for a closed internal test only; public real-money use needs a gambling licence and licensed providers.
