# API LX — verified before vendor call (2026-11-08)

## Balance model (confirm with Matteo/Sofia)

- Money is **only** on Hannibal (`wallets` + immutable `ledger`).
- LX/Pragmatic run the game UI; they **call our** wallet API on each bet/win.
- `userID` = player **`account_no`** (numeric string, no PII).
- We do **not** use an LX-held player balance in production design.

## Our platform — tested / live (`hanibalgamer.fr`)

| Check | Result |
|--------|--------|
| `GET /api/v1/health` | 200 OK |
| `POST .../apilx/wallet/GetBalance` (no valid body) | 200, `Invalid Agent` (route exists) |
| Public catalog | ~**1408** active games |
| Sample `gates-of-olympus` | `externalId=2027`, aggregator |
| Callback base (correct) | `https://hanibalgamer.fr/api/v1/apilx/wallet` + `/GetBalance` etc. |
| Wrong DNS host `hannibalgamer.fr` | **does not resolve** — must not be used for callback |

## Our platform — code (local tests)

| Check | Result |
|--------|--------|
| HMAC sign (Postman sample) | pass |
| Gamelist parser | pass |
| Wallet Withdraw/Deposit/BetWin/Rollback | pass (integration tests) |
| Launch | `userAuth` → HTTPS game URL |

## Not on live server until you deploy (recent commits)

- Provider play page full-screen iframe CSS + speed (SSR launch, preconnect)
- Wallet: `gameID` fallback via latest `provider_sessions`
- Header balance refresh while in provider game
- Re-run after deploy: `docker compose exec -T api npm run apilx:sync-catalog -w @aurum/api`

## Catalog / images (our + theirs)

- Many games have HTTPS icons (`pp.gitslotgameicons.com`).
- Some tiles have **no image** — LX `gamelist` missing/bad icon URL; game may still launch.
- Ask LX for complete icon URLs; we can re-sync catalog.

## Ask LX to confirm (talking points)

1. Callback registered only on **`https://hanibalgamer.fr/api/v1/apilx/wallet`** (not `hannibalgamer.fr`).
2. **Seamless staging**: every spin sends **Withdraw/BetWin/Deposit** — not demo credits only inside iframe.
3. **TND**, amounts 2 decimals, `userID` = our account number.
4. **Desktop** web launch (not mobile layout only on PC).
5. **Full gamelist** + icon CDN for all active games.
6. Path from **staging agent** to **paid production** and SLA for `userAuth` latency.

## Optional domains

If players use **`hanibalgamer.tn`** (or others), add to `WEB_ORIGIN` in `deploy/.env` and Caddy host list, then redeploy.

## Probe script

```bash
node scripts/apilx-pre-lx-check.mjs https://hanibalgamer.fr
```
