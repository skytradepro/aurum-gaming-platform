-- =============================================================================
-- Aurum - migration 0010: USDT on BNB Smart Chain (BEP-20) as a crypto deposit network.
-- Contract checked on-chain: "Tether USD" (USDT), 18 decimals. Receiving address: the owner's
-- BNB Smart Chain address (same as BNB and SUSDT).
-- =============================================================================
insert into crypto_networks (code, coin, chain, token_contract, decimals, deposit_address, min_confirmations, max_credit_usd, sort_order) values
  ('usdt_bep20', 'USDT', 'bsc', '0x55d398326f99059fF775485246999027B3197955', 18, '0xCB1D04300Bc0fB740a4b4A9dbe5D25B69A37d95D', 15, 2000, 2)
on conflict (code) do nothing;
