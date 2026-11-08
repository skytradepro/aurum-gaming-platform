# Hannibal — security overview

## Already in the code
| Area | Protection |
|---|---|
| Passwords | scrypt (memory-hard), automatic rehash, strength rules |
| Sign-in | 5 wrong passwords → account locked 15 min; per-account and per-IP rate limits; same error for unknown user and wrong password |
| Two-factor (2FA) | Optional for every account (players, cashiers, admins): authenticator app codes (RFC 6238). Code step limited to 5 tries per ticket, 10 per 15 min per account, codes cannot be reused. Turning it off needs password + code. Super Admin can reset a lost phone: `POST /v1/admin/users/:id/2fa-reset` (audited). |
| Sessions | Random 256-bit token, only its SHA-256 stored; HttpOnly + SameSite cookie; staff sessions 12 h max, 2 h idle (SESSION_STAFF_IDLE_MINUTES) |
| CSRF | Origin allow-list, Sec-Fetch-Site check, `x-aurum-client` header required with a session |
| API headers | nosniff, frame DENY, CSP `default-src 'none'`, CORP |
| Web headers | X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, COOP, CSP frame-ancestors; HSTS in production; admin / skyx / shop pages `no-store` + `noindex` |
| Admin access | Role + permission checks on every admin API; secret admin link switch (Admin → Settings); footer "SkyX" entrance accepts staff only |
| Money | All balance changes go through the ledger (double entry, idempotency keys); staff balance changes need `balances.manage` and are audited |
| Audit | Every login, failed login, lock, 2FA change, settings change and money action is written to the audit log |

## Must do before going live (deployment)
1. HTTPS only (certificate), `WEB_ORIGIN` = the real https domain, `COOKIE_SECURE=true`.
2. PostgreSQL never exposed to the internet (localhost / private network only); strong DB passwords; daily encrypted backups kept off the server.
3. Firewall: open only 80/443 (and SSH with keys only, no password login).
4. Put the site behind Cloudflare (DDoS protection, WAF, rate limits).
5. Rotate every secret that was ever shown or shared (API keys, DB passwords, `ADMIN_SECRET_PATH`).
6. Every staff account turns on 2FA (the admin panel shows a red warning until it is on).
7. Keep `SHOW_DEMO_DATA` off. Keep Node, Next.js and packages updated.
