/**
 * Constants shared by the API, the dashboards and the public site.
 * Anything that is a business rule (roles, permissions, entry types, limits) lives here
 * so the server and the UI cannot disagree.
 */

/** 'cashier' = a shop worker (see SHOP_ROLES). Cashiers are not dashboard staff. */
export const ROLES = ['user', 'admin', 'super_admin', 'cashier'] as const;
export type Role = (typeof ROLES)[number];

export const USER_STATUSES = ['active', 'suspended', 'closed'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

/**
 * Permissions an admin can be given. The Super Admin implicitly has all of them, plus the
 * Super-Admin-only areas (currencies, exchange rates, admin accounts, site settings, languages).
 */
export const PERMISSIONS = [
  'users.view',
  'users.manage',
  'balances.view',
  'balances.manage',
  'banners.manage',
  'promotions.manage',
  'pages.manage',
  'games.manage',
  'reports.view',
  'audit.view',
  'shops.view',
  'shops.manage',
  'shops.cash',
  'withdrawals.view',
  'withdrawals.manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export function isPermission(value: unknown): value is Permission {
  return typeof value === 'string' && (PERMISSIONS as readonly string[]).includes(value);
}

/** Ledger entry types and their direction (+1 credit, -1 debit). Mirrors table ledger_entry_types. */
export const ENTRY_TYPES = [
  'deposit',
  'withdrawal',
  'adjustment_credit',
  'adjustment_debit',
  'bet_stake',
  'bet_win',
  'bet_refund',
  'bonus_credit',
  'bonus_debit',
  'withdrawal_request',
  'withdrawal_release',
  'deposit_crypto',
  'withdrawal_online',
  'withdrawal_online_release',
  'welcome_gift',
  'daily_gift',
] as const;
export type EntryType = (typeof ENTRY_TYPES)[number];

export const ENTRY_DIRECTION: Readonly<Record<EntryType, 1 | -1>> = {
  deposit: 1,
  withdrawal: -1,
  adjustment_credit: 1,
  adjustment_debit: -1,
  bet_stake: -1,
  bet_win: 1,
  bet_refund: 1,
  bonus_credit: 1,
  bonus_debit: -1,
  withdrawal_request: -1,
  withdrawal_release: 1,
  deposit_crypto: 1,
  withdrawal_online: -1,
  withdrawal_online_release: 1,
  welcome_gift: 1,
  daily_gift: 1,
};

/** The only entry types a staff member can post from the dashboard. */
export const STAFF_ENTRY_TYPES = ['deposit', 'withdrawal', 'adjustment_credit', 'adjustment_debit'] as const;
export type StaffEntryType = (typeof STAFF_ENTRY_TYPES)[number];

// ---------------------------------------------------------------------------
// Shops, shop workers and withdrawals collected at a shop
// ---------------------------------------------------------------------------
/** 'manager' sees every movement of the shop and records cash counts; 'cashier' serves players. */
export const SHOP_ROLES = ['manager', 'cashier'] as const;
export type ShopRole = (typeof SHOP_ROLES)[number];

export const SHOP_STATUSES = ['active', 'suspended', 'closed'] as const;
export type ShopStatus = (typeof SHOP_STATUSES)[number];

/** Movements of a shop's expected cash. Mirrors table shop_cash_entry_types. */
export const SHOP_CASH_ENTRY_TYPES = ['player_deposit', 'withdrawal_payout', 'float_in', 'cash_collection', 'adjustment_credit', 'adjustment_debit'] as const;
export type ShopCashEntryType = (typeof SHOP_CASH_ENTRY_TYPES)[number];

/** The shop cash movements head-office staff record by hand (with the shops.cash permission). */
export const STAFF_SHOP_CASH_ENTRY_TYPES = ['float_in', 'cash_collection', 'adjustment_credit', 'adjustment_debit'] as const;
export type StaffShopCashEntryType = (typeof STAFF_SHOP_CASH_ENTRY_TYPES)[number];

/** Prepaid shop balance (migration 0016): head office recharges a shop, counter deposits use it, counter payouts give it back. */
export const SHOP_CREDIT_ENTRY_TYPES = ['recharge', 'withdraw', 'player_deposit', 'player_payout', 'correction_credit', 'correction_debit'] as const;
export type ShopCreditEntryType = (typeof SHOP_CREDIT_ENTRY_TYPES)[number];
/** The shop balance entries head office records by hand. */
export const STAFF_SHOP_CREDIT_ENTRY_TYPES = ['recharge', 'withdraw', 'correction_credit', 'correction_debit'] as const;
export type StaffShopCreditEntryType = (typeof STAFF_SHOP_CREDIT_ENTRY_TYPES)[number];

/** Prepaid admin balance (migration 0017): the Super Admin gives it, an admin's player deposits use it, his cash-outs give it back. */
export const STAFF_CREDIT_ENTRY_TYPES = ['recharge', 'withdraw', 'player_deposit', 'player_withdrawal', 'correction_credit', 'correction_debit'] as const;
export type StaffCreditEntryType = (typeof STAFF_CREDIT_ENTRY_TYPES)[number];
/** The admin balance entries the Super Admin records by hand. */
export const HEAD_OFFICE_STAFF_CREDIT_ENTRY_TYPES = ['recharge', 'withdraw', 'correction_credit', 'correction_debit'] as const;
export type HeadOfficeStaffCreditEntryType = (typeof HEAD_OFFICE_STAFF_CREDIT_ENTRY_TYPES)[number];

export const WITHDRAWAL_STATUSES = ['pending', 'paid', 'cancelled', 'rejected', 'expired'] as const;
export type WithdrawalStatus = (typeof WITHDRAWAL_STATUSES)[number];

/** Pickup codes: 10 characters without look-alikes (no I, O, 0, 1). Shown as XXXXX-XXXXX. */
export const WITHDRAWAL_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const WITHDRAWAL_CODE_LENGTH = 10;

/** "k7q2m 9xpab" or "K7Q2M-9XPAB" -> "K7Q2M9XPAB"; null when it cannot be a pickup code. */
export function normalizeWithdrawalCode(input: string): string | null {
  const s = input.normalize('NFKC').toUpperCase().replace(/[\s-]/g, '');
  return s.length === WITHDRAWAL_CODE_LENGTH && [...s].every((c) => WITHDRAWAL_CODE_ALPHABET.includes(c)) ? s : null;
}

/** "K7Q2M9XPAB" -> "K7Q2M-9XPAB" */
export function formatWithdrawalCode(code: string): string {
  return code.length === WITHDRAWAL_CODE_LENGTH ? `${code.slice(0, 5)}-${code.slice(5)}` : code;
}

export const SHOP_CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{1,19}$/;

export const BANNER_PLACEMENTS = ['home_hero', 'casino_hero', 'live_casino_hero', 'sports_hero', 'home_promo', 'promotions_hero'] as const;
export type BannerPlacement = (typeof BANNER_PLACEMENTS)[number];

export const GAME_CATEGORIES = ['slots', 'crash', 'live', 'table', 'other'] as const;
export type GameCategory = (typeof GAME_CATEGORIES)[number];

export const PAGE_SLUGS = [
  'about-us',
  'privacy-policy',
  'terms-and-conditions',
  'responsible-gaming',
  'sportsbook-rules',
] as const;
export type PageSlug = (typeof PAGE_SLUGS)[number];

/** Legal minimum age. The database enforces it too (trigger users_guard). */
export const MIN_AGE = 18;

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

export const USERNAME_PATTERN = /^[A-Za-z0-9._-]{3,24}$/;

/** Version label stored with the player's acceptance of the terms. Bump it when the terms change. */
export const TERMS_VERSION = '1';

/** Upload limits (images only: PNG, JPEG or WebP). */
export const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 6000;
export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

/** Pagination defaults used by list endpoints. */
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;
