import { LOCALES } from '@aurum/i18n';
import { v } from '@aurum/shared';
import { access, noContent, ok } from '../http/types.ts';
import type { Route } from '../http/types.ts';
import { buildMe, changePassword, login, loginWithCode, logout, registerPlayer, updatePreferences } from '../services/accounts.ts';
import { beginTwoFactorSetup, confirmTwoFactor, disableTwoFactor, twoFactorStatus } from '../services/two-factor.ts';

const PERSON_NAME = /^[\p{L}\p{M}][\p{L}\p{M}\s'’.-]*$/u;
const upper = (s: string) => s.toUpperCase();
const CURRENCY_CODE = /^[A-Z][A-Z0-9]{2,9}$/;

export const registerSchema = v.object({
  username: v.username(),
  email: v.email(),
  callingCode: v.optional(v.string({ min: 0, max: 8 })),
  mobile: v.optional(v.string({ min: 0, max: 30 })),
  password: v.password(),
  firstName: v.optional(v.string({ max: 80, pattern: PERSON_NAME })),
  lastName: v.optional(v.string({ max: 80, pattern: PERSON_NAME })),
  dateOfBirth: v.optional(v.isoDate()),
  country: v.string({ min: 2, max: 2, transform: upper, pattern: /^[A-Z]{2}$/ }),
  currency: v.string({ min: 3, max: 10, transform: upper, pattern: CURRENCY_CODE }),
  acceptTerms: v.boolean(),
  marketingOptIn: v.withDefault(v.boolean(), false),
  preferredLocale: v.optional(v.choice(LOCALES)),
  captchaToken: v.optional(v.string({ min: 0, max: 4096 })),
});

const loginSchema = v.object({
  identifier: v.string({ max: 254 }),
  password: v.string({ max: 128, trim: false }),
});

const codeSchema = v.object({ code: v.string({ min: 6, max: 12 }) });
const loginCodeSchema = v.object({ ticket: v.string({ min: 20, max: 100 }), code: v.string({ min: 6, max: 12 }) });
const disableTwoFactorSchema = v.object({ password: v.string({ max: 128, trim: false }), code: v.string({ min: 6, max: 12 }) });

const changePasswordSchema = v.object({
  currentPassword: v.string({ max: 128, trim: false }),
  newPassword: v.password(),
});

const preferencesSchema = v.object({
  preferredLocale: v.optional(v.choice(LOCALES)),
  displayCurrency: v.optional(v.nullable(v.string({ min: 3, max: 10, transform: upper, pattern: CURRENCY_CODE }))),
  marketingOptIn: v.optional(v.boolean()),
});

export const authRoutes: Route[] = [
  {
    method: 'POST',
    path: '/v1/auth/register',
    access: access.public,
    limit: { name: 'register', max: 10, windowMs: 60 * 60_000 },
    async handler(ctx) {
      const result = await registerPlayer(ctx, await ctx.json(registerSchema));
      return ok({ user: result.me }, { status: 201, cookies: [result.cookie] });
    },
  },
  {
    method: 'POST',
    path: '/v1/auth/login',
    access: access.public,
    limit: { name: 'login', max: 30, windowMs: 15 * 60_000 },
    async handler(ctx) {
      const result = await login(ctx, await ctx.json(loginSchema));
      if ('twoFactorTicket' in result) return ok({ twoFactorRequired: true, ticket: result.twoFactorTicket });
      return ok({ user: result.me }, { cookies: [result.cookie] });
    },
  },
  {
    method: 'POST',
    path: '/v1/auth/login/2fa',
    access: access.public,
    limit: { name: 'login-2fa', max: 30, windowMs: 15 * 60_000 },
    async handler(ctx) {
      const result = await loginWithCode(ctx, await ctx.json(loginCodeSchema));
      return ok({ user: result.me }, { cookies: [result.cookie] });
    },
  },
  {
    method: 'GET',
    path: '/v1/account/2fa',
    access: access.user,
    async handler(ctx) {
      return ok(await twoFactorStatus(ctx));
    },
  },
  {
    method: 'POST',
    path: '/v1/account/2fa/setup',
    access: access.user,
    limit: { name: '2fa-setup', max: 20, windowMs: 60 * 60_000 },
    async handler(ctx) {
      return ok(await beginTwoFactorSetup(ctx));
    },
  },
  {
    method: 'POST',
    path: '/v1/account/2fa/enable',
    access: access.user,
    limit: { name: '2fa-enable', max: 20, windowMs: 15 * 60_000 },
    async handler(ctx) {
      await confirmTwoFactor(ctx, (await ctx.json(codeSchema)).code);
      return ok(await twoFactorStatus(ctx));
    },
  },
  {
    method: 'POST',
    path: '/v1/account/2fa/disable',
    access: access.user,
    limit: { name: '2fa-disable', max: 10, windowMs: 15 * 60_000 },
    async handler(ctx) {
      const body = await ctx.json(disableTwoFactorSchema);
      await disableTwoFactor(ctx, body.password, body.code);
      return ok(await twoFactorStatus(ctx));
    },
  },
  {
    method: 'POST',
    path: '/v1/auth/logout',
    access: access.user,
    async handler(ctx) {
      return noContent([await logout(ctx)]);
    },
  },
  {
    method: 'GET',
    path: '/v1/auth/me',
    access: access.user,
    async handler(ctx) {
      return ok({ user: await buildMe(ctx.db, ctx.principal()) });
    },
  },
  {
    method: 'POST',
    path: '/v1/auth/change-password',
    access: access.user,
    limit: { name: 'change-password', max: 20, windowMs: 15 * 60_000 },
    async handler(ctx) {
      await changePassword(ctx, await ctx.json(changePasswordSchema));
      return noContent();
    },
  },
  {
    method: 'PATCH',
    path: '/v1/account/preferences',
    access: access.user,
    async handler(ctx) {
      await updatePreferences(ctx, await ctx.json(preferencesSchema));
      // read the profile again so the reply reflects what was stored
      const { rows } = await ctx.db.query<{ preferred_locale: string | null; display_currency: string | null }>(
        'select preferred_locale, display_currency from users where id = $1::uuid',
        [ctx.principal().id],
      );
      const row = rows[0];
      const user = { ...ctx.principal(), preferredLocale: row?.preferred_locale ?? null, displayCurrency: row?.display_currency ?? null };
      return ok({ user: await buildMe(ctx.db, user) });
    },
  },
];
