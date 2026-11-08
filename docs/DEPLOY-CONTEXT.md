# Deployment context (conversation saved)

**Last updated:** 2026-10-29

## Status: waiting for domain

The owner will buy a domain later and will message when ready. **No deployment or DNS until they approve.**

## Servers (do not mix)

| Role | Contabo instance | IP |
|------|------------------|-----|
| **Hannibal / Aurum (NEW)** | vmi3700197 | **13.140.189.223** |
| **SkyX (OLD — off limits)** | vmi3148714 | **144.91.94.32** |

All future deploy, Docker, PostgreSQL on VPS, and DNS must target **13.140.189.223 only**.

## What is ready locally

- Website runs with `npm run api:dev` + `npm run web:dev` on `http://localhost:3000`.
- New VPS is running; domain not purchased yet.
- Planned order after domain: point DNS → HTTPS → deploy from `deploy/` → Google Search Console.

## When the owner returns

They should send:

1. Full domain name (e.g. `example.com`).
2. Confirmation: deploy only on **13.140.189.223**, never **144.91.94.32**.
3. Explicit go-ahead to execute (not just planning).

## Agent rule file

Persistent reminder for Cursor: `.cursor/rules/aurum-deploy-context.mdc`.
