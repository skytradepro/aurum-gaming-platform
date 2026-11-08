# Provider games through a game aggregator

The 24 provider games (Pragmatic Play, Amatic, Evoplay) are in the catalogue (migration 0011).
They run on the provider's servers with their original graphics, sounds, features and maths, and
open in an iframe at `/casino/play/<slug>`. The money stays in the platform ledger (seamless wallet).

## 1. Settings (apps/api `.env`)

| Variable | Value |
|---|---|
| `AGGREGATOR_NAME` | short name, e.g. `softswiss` |
| `AGGREGATOR_API_URL` | aggregator API base URL |
| `AGGREGATOR_OPERATOR_ID` | operator / casino id given by the aggregator |
| `AGGREGATOR_SECRET` | shared secret for HMAC-SHA256 signatures |
| `AGGREGATOR_SIGNATURE_HEADER` | header name of the signature (default `x-signature`) |
| `AGGREGATOR_SESSION_MINUTES` | game session lifetime (default 240) |

Empty = not configured: the games are listed but cannot be launched.

## 2. Wallet endpoints to give the aggregator

All `POST`, JSON body, signature = hex HMAC-SHA256 of the exact body with `AGGREGATOR_SECRET`.

| Endpoint | Body |
|---|---|
| `/v1/aggregator/wallet/balance` | `token` |
| `/v1/aggregator/wallet/debit` | `token`, `transactionId`, `roundId`, `amount` |
| `/v1/aggregator/wallet/credit` | `token`, `transactionId`, `roundId`, `amount` |
| `/v1/aggregator/wallet/rollback` | `token`, `transactionId`, `refTransactionId` |

Reply: `{"status":"ok","balance":"12.500","currency":"TND"}` or `{"status":"error","code":"insufficient_funds"}`.
Amounts are decimal strings in the wallet currency. Each `transactionId` is booked once (retries are safe).
Debit = `bet_stake`, credit = `bet_win`, rollback of a debit = `bet_refund`.

## 3. Launch and catalogue

- Player: `POST /v1/games/<slug>/launch` → the API creates a session token and calls
  `AGGREGATOR_API_URL/games/launch`, then returns the game URL to the iframe.
- Super Admin: `POST /v1/admin/aggregator/sync` → reads `AGGREGATOR_API_URL/games`, fills each game's
  `external_id` and image, and returns the names it could not match.

## 4. Matching a specific aggregator

Field names and paths differ between aggregators. Everything specific is in `ADAPTER` at the top of
`apps/api/src/services/aggregator.ts`: change paths, field names and reply readers there to match the
aggregator's documentation. Nothing else needs to change.

## 5. Order of work

1. Contract with an aggregator that carries Pragmatic Play, Amatic and Evoplay.
2. Sandbox credentials → `.env`, adjust `ADAPTER` to their docs.
3. Apply migrations, restart the API, run the catalogue sync.
4. Test bets, wins and rollbacks in the sandbox, then switch to production credentials.
