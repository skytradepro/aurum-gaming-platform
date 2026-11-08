import { LOCALES } from '@aurum/i18n';
import { HEAD_OFFICE_STAFF_CREDIT_ENTRY_TYPES, PERMISSIONS, AppError, v } from '@aurum/shared';
import type { Schema } from '@aurum/shared';
import { CURRENCY_CODE } from './shared.ts';
import { readQuery } from '../http/query.ts';
import { access, created, noContent, ok } from '../http/types.ts';
import type { Ctx, Route } from '../http/types.ts';
import { auditActor } from '../services/accounts.ts';
import { audit } from '../services/audit.ts';
import { createCurrency, listCurrencies, updateCurrency } from '../services/currencies.ts';
import type { CurrencyInput } from '../services/currencies.ts';
import { resetTwoFactor } from '../services/two-factor.ts';
import { addRate, getSettings, isSettingKey, listCountries, listLanguages, listRates, setCountryEnabled, setSetting, updateLanguage } from '../services/settings.ts';
import { closeAdmin, listStaffCredit, myStaffCredit, postStaffCredit, staffCreditBalances } from '../services/staff-credit.ts';
import { createAdmin, getStaff, listStaff, resetPassword, updateAdmin } from '../services/users.ts';

const NAME = /^[\p{L}\p{M}][\p{L}\p{M}\s'’.-]*$/u;
const upper = (s: string) => s.toUpperCase();
const currencyCode = v.string({ min: 3, max: 10, transform: upper, pattern: CURRENCY_CODE });

function uuidParam(ctx: Ctx): string {
  const id = ctx.params.id ?? '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new AppError('user_not_found');
  return id.toLowerCase();
}

// --- staff -----------------------------------------------------------------
const permissionList = v.array(v.choice(PERMISSIONS), { max: PERMISSIONS.length });

const newAdminSchema = v.object({
  username: v.username(),
  email: v.email(),
  firstName: v.string({ max: 80, pattern: NAME }),
  lastName: v.string({ max: 80, pattern: NAME }),
  permissions: permissionList,
});

const adminPatchSchema = v.object({
  permissions: v.optional(permissionList),
  status: v.optional(v.choice(['active', 'suspended'] as const)),
  firstName: v.optional(v.string({ max: 80, pattern: NAME })),
  lastName: v.optional(v.string({ max: 80, pattern: NAME })),
  email: v.optional(v.email()),
});

const staffCreditSchema = v.object({
  entryType: v.choice(HEAD_OFFICE_STAFF_CREDIT_ENTRY_TYPES),
  currency: currencyCode,
  amount: v.string({ min: 1, max: 40 }),
  reason: v.optional(v.string({ min: 0, max: 500 })),
  idempotencyKey: v.string({ min: 8, max: 100, pattern: /^[A-Za-z0-9_.:-]+$/ }),
});

// --- currencies ------------------------------------------------------------
const displayRule = v.object({
  symbol: v.string({ min: 1, max: 12 }),
  placement: v.choice(['prefix', 'suffix'] as const),
  spacing: v.boolean(),
});

const currencyBody = {
  kind: v.choice(['fiat', 'crypto'] as const),
  decimals: v.integer({ min: 0, max: 8 }),
  displayDecimals: v.optional(v.integer({ min: 0, max: 8 })),
  names: v.recordOf(LOCALES, v.string({ min: 1, max: 80 })),
  display: v.object({
    default: displayRule,
    en: v.optional(displayRule),
    fr: v.optional(displayRule),
    ar: v.optional(displayRule),
  }),
  isEnabled: v.boolean(),
  sortOrder: v.withDefault(v.integer({ min: -10_000, max: 10_000 }), 0),
};

const newCurrencySchema = v.object({ code: currencyCode, ...currencyBody });
const currencySchema = v.object(currencyBody);

function currencyInput(body: { kind: 'fiat' | 'crypto'; decimals: number; displayDecimals?: number | undefined; names: CurrencyInput['names']; display: CurrencyInput['display']; isEnabled: boolean; sortOrder: number }): CurrencyInput {
  return {
    kind: body.kind,
    decimals: body.decimals,
    displayDecimals: body.displayDecimals ?? null,
    names: body.names,
    display: body.display,
    isEnabled: body.isEnabled,
    sortOrder: body.sortOrder,
  };
}

// --- exchange rates --------------------------------------------------------
const ratesQuery = v.object({
  base: v.optional(currencyCode),
  quote: v.optional(currencyCode),
  limit: v.optional(v.integer({ min: 1, max: 500, coerce: true })),
});

const newRateSchema = v.object({
  base: currencyCode,
  quote: currencyCode,
  rate: v.string({ max: 40 }),
  source: v.string({ min: 1, max: 100 }),
  note: v.optional(v.string({ min: 0, max: 500 })),
  effectiveAt: v.optional(v.isoInstant()),
});

// --- languages, countries, settings ----------------------------------------
const languagePatchSchema = v.object({
  isEnabled: v.optional(v.boolean()),
  isDefault: v.optional(v.boolean()),
  sortOrder: v.optional(v.integer({ min: -10_000, max: 10_000 })),
});

const countryPatchSchema = v.object({ isEnabled: v.boolean() });
/** The value's type depends on the setting (boolean switch or integer); setSetting() checks it. */
const settingSchema: Schema<{ value: boolean | number }> = {
  run(input, path, errors) {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      errors[path] = 'required';
      return undefined;
    }
    const value = (input as Record<string, unknown>).value;
    if (typeof value !== 'boolean' && typeof value !== 'number') {
      errors.value = 'invalidFormat';
      return undefined;
    }
    return { value: { value } };
  },
};

export const adminSystemRoutes: Route[] = [
  // staff accounts: Super Admin only
  {
    method: 'GET',
    path: '/v1/admin/staff',
    access: access.super,
    async handler(ctx) {
      const items = await listStaff(ctx.db);
      const credit = await staffCreditBalances(ctx.db, items.map((s) => s.id));
      return ok({ items: items.map((s) => ({ ...s, credit: credit.get(s.id) ?? [] })) });
    },
  },
  {
    method: 'POST',
    path: '/v1/admin/staff',
    access: access.super,
    limit: { name: 'admin-staff-create', max: 30, windowMs: 60 * 60_000 },
    async handler(ctx) {
      const result = await createAdmin(ctx, await ctx.json(newAdminSchema));
      return created(result);
    },
  },
  {
    method: 'GET',
    path: '/v1/admin/staff/:id',
    access: access.super,
    async handler(ctx) {
      const id = uuidParam(ctx);
      const staff = await getStaff(ctx.db, id);
      if (!staff) throw new AppError('user_not_found');
      return ok({ staff: { ...staff, credit: (await staffCreditBalances(ctx.db, [id])).get(id) ?? [] } });
    },
  },
  {
    method: 'PATCH',
    path: '/v1/admin/staff/:id',
    access: access.super,
    async handler(ctx) {
      return ok({ staff: await updateAdmin(ctx, uuidParam(ctx), await ctx.json(adminPatchSchema)) });
    },
  },
  {
    method: 'POST',
    path: '/v1/admin/staff/:id/reset-password',
    access: access.super,
    limit: { name: 'admin-reset-password', max: 30, windowMs: 60 * 60_000 },
    async handler(ctx) {
      // Only 'admin' accounts: a Super Admin changes their own password from the account page.
      const temporaryPassword = await resetPassword(ctx, uuidParam(ctx), ['admin']);
      return ok({ temporaryPassword }, { headers: { 'cache-control': 'no-store' } });
    },
  },

  // prepaid admin balance (migration 0017): the Super Admin gives, takes back, corrects; an admin sees his own
  {
    method: 'GET',
    path: '/v1/admin/staff/:id/credit',
    access: access.super,
    async handler(ctx) {
      const id = uuidParam(ctx);
      return ok({ balances: (await staffCreditBalances(ctx.db, [id])).get(id) ?? [], items: await listStaffCredit(ctx.db, id) });
    },
  },
  {
    method: 'POST',
    path: '/v1/admin/staff/:id/credit',
    access: access.super,
    async handler(ctx) {
      const result = await postStaffCredit(ctx, uuidParam(ctx), await ctx.json(staffCreditSchema));
      return result.replayed ? ok(result) : created(result);
    },
  },
  {
    method: 'POST',
    path: '/v1/admin/staff/:id/close',
    access: access.super,
    async handler(ctx) {
      return ok(await closeAdmin(ctx, uuidParam(ctx)));
    },
  },
  {
    method: 'GET',
    path: '/v1/admin/me/credit',
    access: access.anyStaff,
    async handler(ctx) {
      return ok(await myStaffCredit(ctx), { headers: { 'cache-control': 'no-store' } });
    },
  },

  // currencies and rates: everyone on staff can read, only the Super Admin changes
  {
    method: 'GET',
    path: '/v1/admin/currencies',
    access: access.anyStaff,
    async handler(ctx) {
      return ok({ items: await listCurrencies(ctx.db) });
    },
  },
  {
    method: 'POST',
    path: '/v1/admin/currencies',
    access: access.super,
    async handler(ctx) {
      const body = await ctx.json(newCurrencySchema);
      const input = currencyInput(body);
      const saved = await ctx.db.transaction(async (tx) => {
        const currency = await createCurrency(tx, body.code, input);
        await audit(tx, auditActor(ctx), { action: 'currency.created', targetType: 'currency', targetId: body.code, details: { decimals: input.decimals, isEnabled: input.isEnabled } });
        return currency;
      });
      return created({ currency: saved });
    },
  },
  {
    method: 'PUT',
    path: '/v1/admin/currencies/:code',
    access: access.super,
    async handler(ctx) {
      const code = (ctx.params.code ?? '').toUpperCase();
      if (!CURRENCY_CODE.test(code)) throw new AppError('not_found');
      const input = currencyInput(await ctx.json(currencySchema));
      const saved = await ctx.db.transaction(async (tx) => {
        const currency = await updateCurrency(tx, code, input);
        await audit(tx, auditActor(ctx), { action: 'currency.updated', targetType: 'currency', targetId: code, details: { decimals: input.decimals, isEnabled: input.isEnabled } });
        return currency;
      });
      return ok({ currency: saved });
    },
  },
  {
    method: 'GET',
    path: '/v1/admin/exchange-rates',
    access: access.anyStaff,
    async handler(ctx) {
      const q = readQuery(ctx, ratesQuery);
      return ok({ items: await listRates(ctx.db, { ...(q.base ? { base: q.base } : {}), ...(q.quote ? { quote: q.quote } : {}), ...(q.limit ? { limit: q.limit } : {}) }) });
    },
  },
  {
    method: 'POST',
    path: '/v1/admin/exchange-rates',
    access: access.super,
    async handler(ctx) {
      return created({ rate: await addRate(ctx, await ctx.json(newRateSchema)) });
    },
  },

  // languages, countries, switches: Super Admin only
  {
    method: 'GET',
    path: '/v1/admin/languages',
    access: access.super,
    async handler(ctx) {
      return ok({ items: await listLanguages(ctx.db) });
    },
  },
  {
    method: 'PATCH',
    path: '/v1/admin/languages/:code',
    access: access.super,
    async handler(ctx) {
      const code = ctx.params.code ?? '';
      if (!/^[a-z]{2,3}$/.test(code)) throw new AppError('not_found');
      return ok({ language: await updateLanguage(ctx, code, await ctx.json(languagePatchSchema)) });
    },
  },
  {
    method: 'GET',
    path: '/v1/admin/countries',
    access: access.super,
    async handler(ctx) {
      return ok({ items: await listCountries(ctx.db) });
    },
  },
  {
    method: 'PATCH',
    path: '/v1/admin/countries/:code',
    access: access.super,
    async handler(ctx) {
      const code = (ctx.params.code ?? '').toUpperCase();
      if (!/^[A-Z]{2}$/.test(code)) throw new AppError('not_found');
      const body = await ctx.json(countryPatchSchema);
      return ok({ country: await setCountryEnabled(ctx, code, body.isEnabled) });
    },
  },
  {
    // Super Admin: remove two-factor sign-in from an account (lost phone). Audited.
    method: 'POST',
    path: '/v1/admin/users/:id/2fa-reset',
    access: access.super,
    async handler(ctx) {
      const id = ctx.params.id ?? '';
      if (!/^[0-9a-f-]{36}$/i.test(id)) throw new AppError('not_found');
      await resetTwoFactor(ctx, id);
      return noContent();
    },
  },
  {
    method: 'GET',
    path: '/v1/admin/settings',
    access: access.super,
    async handler(ctx) {
      return ok({ settings: await getSettings(ctx.db) });
    },
  },
  {
    method: 'PUT',
    path: '/v1/admin/settings/:key',
    access: access.super,
    async handler(ctx) {
      const key = ctx.params.key ?? '';
      if (!isSettingKey(key)) throw new AppError('not_found');
      const body = await ctx.json(settingSchema);
      await setSetting(ctx, key, body.value);
      return ok({ settings: await getSettings(ctx.db) });
    },
  },
];

