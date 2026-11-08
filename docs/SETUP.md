# Aurum Gaming Platform — local setup

Work only inside `aurum-gaming-platform`. Do not point `DATABASE_URL` at production data.

## Requirements

- Node.js ≥ 22.18
- PostgreSQL 16

## Steps

1. Copy `.env.example` to `.env` and set `DATABASE_URL`, `WEB_ORIGIN=http://localhost:3000`, `API_INTERNAL_URL=http://127.0.0.1:4000`.
2. Create the database role and database, then run migrations:
   ```bash
   npm run db:migrate
   ```
3. Create the Principal Super Admin (CLI only):
   ```bash
   npm run create-super-admin -w @aurum/api -- --username admin --email admin@example.com --first-name Admin --last-name User
   ```
4. Optional demo catalogue, banners, shop (requires `SHOW_DEMO_DATA=true`):
   ```bash
   npm run seed:demo
   ```
5. Start API and website:
   ```bash
   npm run api:dev
   npm run web:dev
   ```
6. Open `http://localhost:3000/en`.

## Tests

Set `TEST_DATABASE_URL` to a PostgreSQL superuser URL on a **development-only** server, then:

```bash
npm test
```

## If `next build` fails with “Failed to load native binding”

This is a broken or wrong-architecture `@next/swc-win32-x64-msvc` binary. On 64-bit Windows with 64-bit Node:

```bash
npm rebuild @next/swc-win32-x64-msvc
```

If it persists, delete `node_modules` and run `npm install` again. Use `npm run web:dev` for local development once SWC loads.

## Production notes

- Set `SHOW_DEMO_DATA=false` and `COOKIE_SECURE=true`.
- `WEB_ORIGIN` must be your HTTPS site origin.
- Real-money gambling requires licensing and approved game/sports providers.
