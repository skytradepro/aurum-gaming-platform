# Aurum - handover / current state (2026-10-23)

## Done and verified by the owner
- Local run: API (4000), web (3000). Casino games with central rules (site + per-admin), display-currency stake input.
- Admin: Game rules page (super: site rules; admin: own stricter rules), create player, staff creation, change-password page.
- Public test link via Cloudflare quick tunnel works (register + login verified). Needs the tunnel URL in WEB_ORIGIN (.env, comma separated) and an API restart each time the URL changes.

## Deployment (written, NOT yet run anywhere)
- deploy/ folder: docker-compose.yml, Dockerfile, Caddyfile (HTTPS + team basic-auth), .env.example, db-init, DEPLOY.md.
- Unverified: `npm ci --force` on Linux (Windows-only SWC dep in root package.json) and `next build` inside Docker.

## Server (IMPORTANT)
- Contabo account admin@skytradepro.com ALSO holds the existing SkyX server (vmi3146714, 144.91.94.32). NEVER touch, SSH into, reset or deploy to it.
- A NEW Cloud VPS 4 (Ubuntu 24.04, EU, 1-month term, EUR 6.60 paid 2026-10-23) was ordered for Aurum only. On 23:38 it had NOT yet appeared in the VPS list. Next: wait/refresh, or check the email / open a Contabo ticket.
- The server root password shown once in a screenshot must be regenerated for the new server; use SSH keys later. Enable MFA on the Contabo account.

## Next steps
1. New VPS appears -> note its IP (must differ from 144.91.94.32) -> ssh -> install Docker -> follow deploy/DEPLOY.md.
2. Domain/subdomain DNS only with the owner's explicit approval.
3. Pending app work: test coin flip + insufficient funds; admin player list filtered to own players; currency conversion on account/bonus pages; translate admin pages; licensing before any public use (INHOUSE_GAMES=false in production).

## Update 2026-10-24
- Added in-house games: Crash (auto cash-out, RTP 94.00%), American Roulette (RTP 94.74%), Plinko (RTP 93.98%). Total originals: wheel, slots, dice, coin, crash, roulette, plinko. All registered in GAME_IDS / GAME_MAX_MULTIPLIER / site switches (game_*_enabled) / central rules. RTP verified by exhaustive calculation; API + packages typecheck clean from a Linux shell; web game components typechecked; NOT yet played in a browser.
- Sports, Live Betting, Live Casino, Virtuals still show "not available yet": they need licensed providers (owner must choose providers and share official docs/credentials through a safe channel).

## 2026-10-24 - sports betting + games batch 2 (written, NOT yet run)
- Migration 0008 (bets, bet_selections, grants) - must run `npm run db:migrate` before use.
- Sports betting: Match Winner 1X2 pre-match only, single + accumulator. Odds/results from API-Football (FOOTBALL_API_KEY). Price is always the server's; stake via ledger `bet_stake`; settlement every 5 min (`settleDueBets`), win `bet_win`, void `bet_refund`. Limits: site settings sports_* + admin owner maxStake/maxWin. Pages: /sports, /account/bets, /admin/bets. Env: FOOTBALL_ODDS_MARGIN_PERCENT, FOOTBALL_BOOKMAKER_ID.
- Not built: in-play betting, other markets, Live Casino, Virtuals (need licensed providers).
- New in-house games: Keno (RTP 92.5-94.0% by picks), Mines (94.00%), Dragon Tiger (dragon/tiger 93.69%, tie 93.85%), Baccarat (standard rules: player 98.77%, banker 98.94%, tie 85.88%). RTP verified exhaustively.
- Typecheck clean (API + new web files, Linux path-mapped); unit tests for bet math/settlement pass (7). Nothing played in a browser yet.
- Batch 3 games (written, typechecked, not played in browser): Sic Bo (RTP 81-97% by bet, standard paytable), Pair Plus Poker (97.68%, real 52-card deck), Lucky Scratch (94.00%), Gold Rush 5x3 video slot with 10 lines + wild (94.48%, hit rate 46.9%, capped at 250x). Shared FX in apps/web/src/styles/games-fx.css + components/game/Fx.tsx (dealing cards, dice, reels, scratch reveal, win confetti on every game via StakeBox). Total in-house games: 15.
- Batch 4 originals: Power Strike (hammer/tower, RTP 94.00%, max 50x) and Raptor Run (jump 1-15 obstacles, 80% each, RTP 94.00% exactly, max ~27x). Total in-house games: 17. Third-party titles (Pragmatic, Hacksaw, Amatic, Evoplay...) can only come through a provider/aggregator contract into the existing provider catalogue (game_providers/games tables, /casino lobby).
- Batch 5 (themed originals): scatter-pays 6x5 engine (exact RTP 94.07%, max ~188.6x) with 4 skins: candy (Sugar Pop), thunder (Thunder Gods), ocean (Deep Sea Gold), aztec (Aztec Gems); Gold Rush engine (94.48%) skins: hotfruits (Hot Fruits), ancientbook (Book of Sands). Each skin is its own game id with its own switch/limits. Total in-house games: 23.
- 2026-10-24: public brand renamed Aurum -> Carthagenet (UI text, titles, logo, translations, ledger reason of the wheel). Internal names (@aurum packages, cookies, DB, folder) unchanged.

## 2026-10-28 — money flows (deposits, withdrawals, welcome gift)
- Migrations 0012 (online_withdrawals, entry types withdrawal_online / withdrawal_online_release / welcome_gift) and 0013 (withdrawal_approvals) are applied locally. Run them with the postgres owner account (aurum_app cannot create tables). SQL tests: db/tests/online_withdrawals.test.sql, db/tests/withdrawal_approvals.test.sql.
- Deposits: crypto (existing) + bank transfer details from BANK_TRANSFER_* env (EUR only, player reference HNB-<USERNAME>, credited by staff from the admin player page). Header "Deposit" button for players.
- Withdrawals: player can ask for bank (IBAN checked) or crypto (address checked per chain) payout; head office marks it sent with a reference or rejects (refund) at /admin/withdrawals. Super Admin switch withdrawals_open on the same page. Shop cash withdrawals: player request + pickup code (existing), or started at the counter with the player's one-time 6-digit code (shown in the player's account, e-mailed when Brevo is set).
- Any withdrawal needs at least one real deposit (deposit / deposit_crypto), so the welcome gift (setting welcome_gift_cents, default 50) cannot be cashed out alone.
- Admin player page: cash desk (Deposit / Cash out with balance-after preview; corrections hidden). Players list: search by account number, username, email or phone.
- E-mail: BREVO_API_KEY, MAIL_FROM_EMAIL, MAIL_FROM_NAME (Brevo transactional API). Brevo lists gambling as a regulated industry: contact their support before sending.
