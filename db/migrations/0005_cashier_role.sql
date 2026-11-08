-- =============================================================================
-- Aurum - migration 0005: the "cashier" role (shop workers)
--
-- Kept in its own migration on purpose: PostgreSQL does not allow a new enum value
-- to be used in the same transaction that adds it. Migration 0006 uses it.
-- =============================================================================

alter type user_role add value if not exists 'cashier';
