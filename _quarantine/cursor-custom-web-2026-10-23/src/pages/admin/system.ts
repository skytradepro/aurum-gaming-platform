/** Super Admin only: staff accounts and permissions, currencies, exchange rates, languages, countries, site switches. */
import { ApiError } from '../../api.ts';
import { countryName, date, href, redirect } from '../../context.ts';
import type { PageCtx, PageResult } from '../../context.ts';
import { html } from '../../html.ts';
import type { SafeHtml } from '../../html.ts';
import { LOCALES, LOCALE_META } from '../../i18n.ts';
import { alert, badge, button, card, checkbox, csrfField, emptyForm, field, formError, formFromError, formValues, linkButton, pageHeader, select, statusBadge, table } from '../../layout/components.ts';
import type { FormState } from '../../layout/components.ts';
import type { CountryDTO, Currency, LanguageDTO, RateDTO, Settings, StaffDTO } from '../../types.ts';
import { adminPage, guardSuper, isResult, oneTimeSecret, permissionLabel, UUID_RE } from './common.ts';

export const PERMISSIONS = [
  'users.view', 'users.manage', 'balances.view', 'balances.manage', 'withdrawals.view', 'withdrawals.manage',
  'shops.view', 'shops.manage', 'shops.cash', 'banners.manage', 'promotions.manage', 'pages.manage', 'games.manage', 'reports.view', 'audit.view',
] as const;

function permissionBoxes(ctx: PageCtx, selected: readonly string[]): SafeHtml {
  return html`<fieldset class="perm-grid"><legend>${ctx.t('admin.staff.permissions')}</legend>${PERMISSIONS.map((p) => checkbox({ name: 'permissions', value: p, label: html`<b>${permissionLabel(ctx, p)}</b> <code class="small">${p}</code>`, checked: selected.includes(p) }))}</fieldset>`;
}

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------
async function staffView(ctx: PageCtx, state: FormState = emptyForm(), created?: { username: string; password: string }, status = 200): Promise<PageResult> {
  const { items } = await ctx.api.get<{ items: StaffDTO[] }>('/v1/admin/staff');
  const body = html`${pageHeader(ctx.t('admin.nav.staff'), { subtitle: ctx.t('admin.staff.subtitle') })}
${created ? html`${alert('success', ctx.t('admin.staff.created', { username: created.username }))}${oneTimeSecret(ctx, ctx.t('admin.common.temporaryPassword'), created.password, ctx.t('admin.common.temporaryPasswordNote'))}` : ''}
${card(
  table<StaffDTO>(
    [
      { label: ctx.t('auth.register.username'), cell: (s) => (s.role === 'admin' ? html`<a href="${href(ctx, `/admin/staff/${s.id}`)}">${s.username}</a>` : html`<b>${s.username}</b>`) },
      { label: ctx.t('admin.players.name'), cell: (s) => `${s.firstName} ${s.lastName}` },
      { label: ctx.t('admin.staff.role'), cell: (s) => (s.role === 'super_admin' ? badge('Super Admin', 'gold') : badge('Admin', 'blue')) },
      { label: ctx.t('admin.staff.permissions'), cell: (s) => (s.role === 'super_admin' ? ctx.t('admin.staff.everything') : s.permissions.map((p) => permissionLabel(ctx, p)).join(', ') || '—') },
      { label: ctx.t('common.status'), cell: (s) => statusBadge(ctx, s.status) },
      { label: ctx.t('admin.players.lastLogin'), cell: (s) => date(ctx, s.lastLoginAt) },
    ],
    items,
    ctx.t('common.noResults'),
  ),
)}
${card(html`<form method="post" action="${href(ctx, '/admin/staff')}" class="form">${csrfField(ctx)}${formError(state)}
<div class="form-grid">
${field({ label: ctx.t('auth.register.username'), name: 'username', value: state.values.username, error: state.errors.username, required: true, dir: 'ltr' })}
${field({ label: ctx.t('auth.register.email'), name: 'email', type: 'email', value: state.values.email, error: state.errors.email, required: true, dir: 'ltr' })}
${field({ label: ctx.t('auth.register.firstName'), name: 'firstName', value: state.values.firstName, error: state.errors.firstName, required: true })}
${field({ label: ctx.t('auth.register.lastName'), name: 'lastName', value: state.values.lastName, error: state.errors.lastName, required: true })}
</div>
${permissionBoxes(ctx, (state.values.permissions ?? '').split(',').filter(Boolean))}
${button(ctx.t('admin.staff.create'), { iconName: 'plus' })}</form>`, { title: ctx.t('admin.staff.new') })}
<p class="small muted">${ctx.t('admin.staff.superNote')}</p>`;
  return adminPage(ctx, ctx.t('admin.nav.staff'), body, status);
}

export async function staffPage(ctx: PageCtx): Promise<PageResult> {
  const me = guardSuper(ctx);
  if (isResult(me)) return me;
  return staffView(ctx);
}

export async function createStaff(ctx: PageCtx): Promise<PageResult> {
  const me = guardSuper(ctx);
  if (isResult(me)) return me;
  const values = formValues(ctx, 'username', 'email', 'firstName', 'lastName');
  const permissions = ctx.form.getAll('permissions').filter((p) => (PERMISSIONS as readonly string[]).includes(p));
  try {
    const result = await ctx.api.post<{ staff: StaffDTO; temporaryPassword: string }>('/v1/admin/staff', { ...values, permissions });
    return staffView(ctx, emptyForm(), { username: result.staff.username, password: result.temporaryPassword });
  } catch (error) {
    return staffView(ctx, formFromError(ctx, error, { ...values, permissions: permissions.join(',') }), undefined, 422);
  }
}

async function staffDetail(ctx: PageCtx, id: string, state?: FormState, secret?: string, status = 200): Promise<PageResult> {
  const { items } = await ctx.api.get<{ items: StaffDTO[] }>('/v1/admin/staff');
  const s = items.find((x) => x.id === id && x.role === 'admin');
  if (!s) throw new ApiError(404, { code: 'user_not_found' });
  const st = state ?? emptyForm({ firstName: s.firstName, lastName: s.lastName, email: s.email, status: s.status, permissions: s.permissions.join(',') });
  const body = html`${pageHeader(`${s.firstName} ${s.lastName}`, { subtitle: `@${s.username}`, back: { href: href(ctx, '/admin/staff'), label: ctx.t('admin.nav.staff') } })}
${secret ? oneTimeSecret(ctx, ctx.t('admin.common.temporaryPassword'), secret, ctx.t('admin.common.temporaryPasswordNote')) : ''}
${card(html`<form method="post" action="${href(ctx, `/admin/staff/${id}`)}" class="form">${csrfField(ctx)}${formError(st)}
<div class="form-grid">
${field({ label: ctx.t('auth.register.firstName'), name: 'firstName', value: st.values.firstName, error: st.errors.firstName })}
${field({ label: ctx.t('auth.register.lastName'), name: 'lastName', value: st.values.lastName, error: st.errors.lastName })}
${field({ label: ctx.t('auth.register.email'), name: 'email', type: 'email', value: st.values.email, error: st.errors.email, dir: 'ltr' })}
${select({ label: ctx.t('common.status'), name: 'status', value: st.values.status, options: ['active', 'suspended'].map((x) => ({ value: x, label: ctx.t(`status.${x}`) })) })}
</div>
${permissionBoxes(ctx, (st.values.permissions ?? '').split(',').filter(Boolean))}
<p class="small muted">${ctx.t('admin.staff.signOutNote')}</p>
${button(ctx.t('common.save'))}</form>
<hr><form method="post" action="${href(ctx, `/admin/staff/${id}/reset-password`)}">${csrfField(ctx)}${button(ctx.t('admin.common.resetPassword'), { kind: 'ghost', iconName: 'key', confirm: ctx.t('admin.common.resetConfirm') })}</form>`)}`;
  return adminPage(ctx, s.username, body, status);
}

export async function staffMemberPage(ctx: PageCtx, params: Record<string, string>): Promise<PageResult> {
  const me = guardSuper(ctx);
  if (isResult(me)) return me;
  if (!UUID_RE.test(params.id ?? '')) throw new ApiError(404, { code: 'user_not_found' });
  return staffDetail(ctx, params.id as string);
}

export async function updateStaff(ctx: PageCtx, params: Record<string, string>): Promise<PageResult> {
  const me = guardSuper(ctx);
  if (isResult(me)) return me;
  const id = params.id ?? '';
  if (!UUID_RE.test(id)) throw new ApiError(404, { code: 'user_not_found' });
  const values = formValues(ctx, 'firstName', 'lastName', 'email', 'status');
  const permissions = ctx.form.getAll('permissions').filter((p) => (PERMISSIONS as readonly string[]).includes(p));
  try {
    await ctx.api.patch(`/v1/admin/staff/${id}`, { ...values, permissions });
    return redirect(href(ctx, `/admin/staff/${id}`), { kind: 'success', key: 'common.saved' });
  } catch (error) {
    return staffDetail(ctx, id, formFromError(ctx, error, { ...values, permissions: permissions.join(',') }), undefined, 422);
  }
}

export async function resetStaffPassword(ctx: PageCtx, params: Record<string, string>): Promise<PageResult> {
  const me = guardSuper(ctx);
  if (isResult(me)) return me;
  const id = params.id ?? '';
  if (!UUID_RE.test(id)) throw new ApiError(404, { code: 'user_not_found' });
  const result = await ctx.api.post<{ temporaryPassword: string }>(`/v1/admin/staff/${id}/reset-password`);
  return staffDetail(ctx, id, undefined, result.temporaryPassword);
}

// ---------------------------------------------------------------------------
// Currencies
// ---------------------------------------------------------------------------
export async function currenciesPage(ctx: PageCtx): Promise<PageResult> {
  const me = guardSuper(ctx);
  if (isResult(me)) return me;
  const { items } = await ctx.api.get<{ items: Currency[] }>('/v1/admin/currencies');
  const sample = (c: Currency) => {
    const r = c.display[ctx.locale] ?? c.display.default;
    const n = c.decimals ? `1234.${'5'.repeat(c.decimals)}` : '1234';
    return r.placement === 'prefix' ? `${r.symbol}${r.spacing ? ' ' : ''}${n}` : `${n}${r.spacing ? ' ' : ''}${r.symbol}`;
  };
  const body = html`${pageHeader(ctx.t('admin.nav.currencies'), { subtitle: ctx.t('admin.currencies.subtitle'), actions: linkButton(ctx.t('admin.currencies.new'), href(ctx, '/admin/currencies/new'), { iconName: 'plus' }) })}
${alert('info', ctx.t('admin.currencies.rules'))}
${card(
  table<Currency>(
    [
      { label: ctx.t('admin.currencies.code'), cell: (c) => html`<a href="${href(ctx, `/admin/currencies/${c.code}`)}"><b>${c.code}</b></a>` },
      { label: ctx.t('admin.content.name'), cell: (c) => c.names[ctx.locale] ?? c.names.en ?? '' },
      { label: ctx.t('admin.currencies.decimals'), cell: (c) => `${c.decimals}${c.displayDecimals !== null ? ` (${ctx.t('admin.currencies.shown')} ${c.displayDecimals})` : ''}` },
      { label: ctx.t('admin.currencies.example'), cell: (c) => html`<bdi dir="ltr">${sample(c)}</bdi>` },
      { label: ctx.t('common.status'), cell: (c) => (c.isEnabled ? badge(ctx.t('common.enabled'), 'green') : badge(ctx.t('common.disabled'), 'grey')) },
    ],
    items,
    ctx.t('common.noResults'),
  ),
)}`;
  return adminPage(ctx, ctx.t('admin.nav.currencies'), body);
}

function ruleFields(ctx: PageCtx, prefix: string, v: Record<string, string>, optional: boolean): SafeHtml {
  return html`<div class="form-grid">
${field({ label: ctx.t('admin.currencies.symbol'), name: `${prefix}.symbol`, value: v[`${prefix}.symbol`], maxlength: 12, required: !optional, hint: optional ? ctx.t('admin.currencies.overrideHint') : '' })}
${select({ label: ctx.t('admin.currencies.placement'), name: `${prefix}.placement`, value: v[`${prefix}.placement`] || 'suffix', options: [{ value: 'prefix', label: ctx.t('admin.currencies.before') }, { value: 'suffix', label: ctx.t('admin.currencies.after') }] })}
${checkbox({ name: `${prefix}.spacing`, label: ctx.t('admin.currencies.spacing'), checked: v[`${prefix}.spacing`] === 'on' })}
</div>`;
}

function currencyForm(ctx: PageCtx, state: FormState, code: string | null): SafeHtml {
  const v = state.values;
  const e = state.errors;
  return html`<form method="post" action="${href(ctx, code ? `/admin/currencies/${code}` : '/admin/currencies/new')}" class="form">${csrfField(ctx)}${formError(state)}
<div class="form-grid">
${code ? '' : field({ label: ctx.t('admin.currencies.code'), name: 'code', value: v.code, error: e.code, required: true, maxlength: 10, dir: 'ltr', hint: ctx.t('admin.currencies.codeHint') })}
${select({ label: ctx.t('admin.currencies.kind'), name: 'kind', value: v.kind || 'fiat', options: [{ value: 'fiat', label: ctx.t('admin.currencies.fiat') }, { value: 'crypto', label: ctx.t('admin.currencies.crypto') }] })}
${field({ label: ctx.t('admin.currencies.decimals'), name: 'decimals', type: 'number', min: '0', max: '8', value: v.decimals, error: e.decimals, required: true, hint: ctx.t('admin.currencies.decimalsHint') })}
${field({ label: ctx.t('admin.currencies.displayDecimals'), name: 'displayDecimals', type: 'number', min: '0', max: '8', value: v.displayDecimals, error: e.displayDecimals, hint: ctx.t('admin.currencies.displayDecimalsHint') })}
${field({ label: ctx.t('admin.content.order'), name: 'sortOrder', type: 'number', value: v.sortOrder })}
</div>
<fieldset><legend>${ctx.t('admin.content.name')}</legend><div class="form-grid">${LOCALES.map((l) => field({ label: LOCALE_META[l].nativeName, name: `names.${l}`, value: v[`names.${l}`], error: e[`names.${l}`], required: true, maxlength: 80, dir: LOCALE_META[l].direction }))}</div></fieldset>
<fieldset><legend>${ctx.t('admin.currencies.displayDefault')}</legend>${ruleFields(ctx, 'default', v, false)}</fieldset>
${LOCALES.map((l) => html`<fieldset><legend>${ctx.t('admin.currencies.displayFor', { language: LOCALE_META[l].nativeName })}</legend>${ruleFields(ctx, l, v, true)}</fieldset>`)}
${checkbox({ name: 'isEnabled', label: ctx.t('admin.currencies.enabled'), checked: v.isEnabled === 'on' })}
${button(ctx.t('common.save'))}</form>`;
}

function currencyValues(c: Currency | null): Record<string, string> {
  if (!c) return { kind: 'fiat', decimals: '2', sortOrder: '0', 'default.placement': 'suffix', 'default.spacing': 'on' };
  const v: Record<string, string> = { kind: c.kind, decimals: String(c.decimals), displayDecimals: c.displayDecimals === null ? '' : String(c.displayDecimals), sortOrder: String(c.sortOrder), isEnabled: c.isEnabled ? 'on' : '' };
  for (const l of LOCALES) v[`names.${l}`] = c.names[l] ?? '';
  for (const key of ['default', ...LOCALES] as const) {
    const r = (c.display as Record<string, { symbol: string; placement: string; spacing: boolean } | undefined>)[key];
    if (!r) continue;
    v[`${key}.symbol`] = r.symbol;
    v[`${key}.placement`] = r.placement;
    v[`${key}.spacing`] = r.spacing ? 'on' : '';
  }
  return v;
}

function currencyBody(ctx: PageCtx): { values: Record<string, string>; body: Record<string, unknown> } {
  const values: Record<string, string> = {};
  for (const [k, val] of ctx.form) if (k !== '_csrf') values[k] = val.trim();
  const rule = (prefix: string) => ({ symbol: values[`${prefix}.symbol`] ?? '', placement: values[`${prefix}.placement`] === 'prefix' ? 'prefix' : 'suffix', spacing: values[`${prefix}.spacing`] === 'on' });
  const display: Record<string, unknown> = { default: rule('default') };
  for (const l of LOCALES) if (values[`${l}.symbol`]) display[l] = rule(l);
  return {
    values,
    body: {
      ...(values.code ? { code: values.code } : {}),
      kind: values.kind === 'crypto' ? 'crypto' : 'fiat',
      decimals: Number(values.decimals),
      ...(values.displayDecimals !== '' && values.displayDecimals !== undefined ? { displayDecimals: Number(values.displayDecimals) } : {}),
      names: Object.fromEntries(LOCALES.map((l) => [l, values[`names.${l}`] ?? ''])),
      display,
      isEnabled: values.isEnabled === 'on',
      sortOrder: Number(values.sortOrder || '0'),
    },
  };
}

export async function newCurrencyPage(ctx: PageCtx): Promise<PageResult> {
  const me = guardSuper(ctx);
  if (isResult(me)) return me;
  return adminPage(ctx, ctx.t('admin.currencies.new'), html`${pageHeader(ctx.t('admin.currencies.new'), { back: { href: href(ctx, '/admin/currencies'), label: ctx.t('admin.nav.currencies') } })}${card(currencyForm(ctx, emptyForm(currencyValues(null)), null))}`);
}

export async function createCurrency(ctx: PageCtx): Promise<PageResult> {
  const me = guardSuper(ctx);
  if (isResult(me)) return me;
  const { values, body } = currencyBody(ctx);
  try {
    await ctx.api.post('/v1/admin/currencies', body);
    return redirect(href(ctx, '/admin/currencies'), { kind: 'success', key: 'common.saved' });
  } catch (error) {
    return adminPage(ctx, ctx.t('admin.currencies.new'), html`${pageHeader(ctx.t('admin.currencies.new'))}${card(currencyForm(ctx, formFromError(ctx, error, values), null))}`, 422);
  }
}

export async function currencyPage(ctx: PageCtx, params: Record<string, string>): Promise<PageResult> {
  const me = guardSuper(ctx);
  if (isResult(me)) return me;
  const { items } = await ctx.api.get<{ items: Currency[] }>('/v1/admin/currencies');
  const c = items.find((x) => x.code === params.code);
  if (!c) throw new ApiError(404, { code: 'not_found' });
  return adminPage(ctx, c.code, html`${pageHeader(c.code, { back: { href: href(ctx, '/admin/currencies'), label: ctx.t('admin.nav.currencies') } })}${card(currencyForm(ctx, emptyForm(currencyValues(c)), c.code))}`);
}

export async function updateCurrency(ctx: PageCtx, params: Record<string, string>): Promise<PageResult> {
  const me = guardSuper(ctx);
  if (isResult(me)) return me;
  const code = params.code ?? '';
  if (!/^[A-Z][A-Z0-9]{2,9}$/.test(code)) throw new ApiError(404, { code: 'not_found' });
  const { values, body } = currencyBody(ctx);
  try {
    await ctx.api.put(`/v1/admin/currencies/${code}`, body);
    return redirect(href(ctx, `/admin/currencies/${code}`), { kind: 'success', key: 'common.saved' });
  } catch (error) {
    return adminPage(ctx, code, html`${pageHeader(code)}${card(currencyForm(ctx, formFromError(ctx, error, values), code))}`, 422);
  }
}

// ---------------------------------------------------------------------------
// Exchange rates (entered by hand, append-only)
// ---------------------------------------------------------------------------
async function ratesView(ctx: PageCtx, state: FormState = emptyForm(), status = 200): Promise<PageResult> {
  const [{ items }, currencies] = await Promise.all([
    ctx.api.get<{ items: RateDTO[] }>('/v1/admin/exchange-rates', { limit: 200 }),
    ctx.api.get<{ items: Currency[] }>('/v1/admin/currencies'),
  ]);
  const opts = currencies.items.map((c) => ({ value: c.code, label: c.code }));
  const body = html`${pageHeader(ctx.t('admin.nav.rates'), { subtitle: ctx.t('admin.rates.subtitle') })}
${alert('warning', ctx.t('admin.rates.warning'))}
<div class="grid-2 grid-wide-left">
${card(
  table<RateDTO>(
    [
      { label: ctx.t('admin.rates.pair'), cell: (r) => html`<b dir="ltr">1 ${r.base} = ${r.rate} ${r.quote}</b>` },
      { label: ctx.t('admin.rates.source'), cell: (r) => r.source },
      { label: ctx.t('admin.rates.effective'), cell: (r) => date(ctx, r.effectiveAt) },
      { label: ctx.t('admin.counts.note'), cell: (r) => r.note ?? '' },
    ],
    items,
    ctx.t('admin.rates.none'),
  ),
)}
${card(html`<form method="post" action="${href(ctx, '/admin/rates')}" class="form">${csrfField(ctx)}${formError(state)}
${select({ label: ctx.t('admin.rates.base'), name: 'base', value: state.values.base, error: state.errors.base, options: opts })}
${select({ label: ctx.t('admin.rates.quote'), name: 'quote', value: state.values.quote, error: state.errors.quote, options: opts })}
${field({ label: ctx.t('admin.rates.rate'), name: 'rate', value: state.values.rate, error: state.errors.rate, required: true, inputmode: 'decimal', dir: 'ltr', hint: ctx.t('admin.rates.rateHint') })}
${field({ label: ctx.t('admin.rates.source'), name: 'source', value: state.values.source, error: state.errors.source, required: true, maxlength: 100, hint: ctx.t('admin.rates.sourceHint') })}
${field({ label: ctx.t('admin.counts.note'), name: 'note', value: state.values.note, maxlength: 500 })}
${button(ctx.t('admin.rates.add'), { confirm: ctx.t('admin.rates.confirm') })}</form>`, { title: ctx.t('admin.rates.add') })}
</div>`;
  return adminPage(ctx, ctx.t('admin.nav.rates'), body, status);
}

export async function ratesPage(ctx: PageCtx): Promise<PageResult> {
  const me = guardSuper(ctx);
  if (isResult(me)) return me;
  return ratesView(ctx);
}

export async function addRate(ctx: PageCtx): Promise<PageResult> {
  const me = guardSuper(ctx);
  if (isResult(me)) return me;
  const values = formValues(ctx, 'base', 'quote', 'rate', 'source', 'note');
  try {
    await ctx.api.post('/v1/admin/exchange-rates', { base: values.base, quote: values.quote, rate: values.rate, source: values.source, ...(values.note ? { note: values.note } : {}) });
    return redirect(href(ctx, '/admin/rates'), { kind: 'success', key: 'common.saved' });
  } catch (error) {
    const state = formFromError(ctx, error, values);
    if (error instanceof ApiError && error.code === 'invalid_rate') state.errors.rate = state.message ?? '';
    return ratesView(ctx, state, 422);
  }
}

// ---------------------------------------------------------------------------
// Languages, countries, switches
// ---------------------------------------------------------------------------
export async function languagesPage(ctx: PageCtx): Promise<PageResult> {
  const me = guardSuper(ctx);
  if (isResult(me)) return me;
  const { items } = await ctx.api.get<{ items: LanguageDTO[] }>('/v1/admin/languages');
  const body = html`${pageHeader(ctx.t('admin.nav.languages'), { subtitle: ctx.t('admin.languages.subtitle') })}
${card(
  table<LanguageDTO>(
    [
      { label: ctx.t('common.language'), cell: (l) => html`<b>${l.nativeName}</b> <span class="muted small">${l.englishName} · ${l.code} · ${l.direction.toUpperCase()}</span>` },
      { label: ctx.t('common.status'), cell: (l) => html`${l.isEnabled ? badge(ctx.t('common.enabled'), 'green') : badge(ctx.t('common.disabled'), 'grey')} ${l.isDefault ? badge(ctx.t('admin.languages.default'), 'gold') : ''} ${l.hasCatalog ? '' : badge(ctx.t('admin.languages.noCatalog'), 'red')}` },
      {
        label: ctx.t('common.actions'),
        cell: (l) => html`<form method="post" action="${href(ctx, `/admin/languages/${l.code}`)}" class="inline-actions">${csrfField(ctx)}
${l.isDefault ? '' : button(l.isEnabled ? ctx.t('admin.languages.disable') : ctx.t('admin.languages.enable'), { kind: 'ghost', name: 'action', value: l.isEnabled ? 'disable' : 'enable' })}
${l.isDefault || !l.isEnabled ? '' : button(ctx.t('admin.languages.makeDefault'), { kind: 'ghost', name: 'action', value: 'default' })}</form>`,
      },
    ],
    items,
    '',
  ),
)}`;
  return adminPage(ctx, ctx.t('admin.nav.languages'), body);
}

export async function updateLanguage(ctx: PageCtx, params: Record<string, string>): Promise<PageResult> {
  const me = guardSuper(ctx);
  if (isResult(me)) return me;
  const code = params.code ?? '';
  const action = ctx.form.get('action');
  const patch = action === 'enable' ? { isEnabled: true } : action === 'disable' ? { isEnabled: false } : action === 'default' ? { isDefault: true } : null;
  if (!patch || !/^[a-z]{2,3}$/.test(code)) return redirect(href(ctx, '/admin/languages'));
  try {
    await ctx.api.patch(`/v1/admin/languages/${code}`, patch);
    return redirect(href(ctx, '/admin/languages'), { kind: 'success', key: 'common.saved' });
  } catch (error) {
    if (error instanceof ApiError && error.status < 500) return redirect(href(ctx, '/admin/languages'), { kind: 'error', key: 'admin.languages.refused' });
    throw error;
  }
}

export async function countriesPage(ctx: PageCtx): Promise<PageResult> {
  const me = guardSuper(ctx);
  if (isResult(me)) return me;
  const { items } = await ctx.api.get<{ items: CountryDTO[] }>('/v1/admin/countries');
  const sorted = [...items].sort((a, b) => countryName(ctx.locale, a.code).localeCompare(countryName(ctx.locale, b.code), ctx.locale));
  const body = html`${pageHeader(ctx.t('admin.nav.countries'), { subtitle: ctx.t('admin.countries.subtitle') })}
${alert('warning', ctx.t('admin.countries.legal'))}
${card(
  table<CountryDTO>(
    [
      { label: ctx.t('auth.register.country'), cell: (c) => html`<b>${countryName(ctx.locale, c.code)}</b> <span class="muted small">${c.code} · +${c.callingCode}</span>` },
      { label: ctx.t('common.status'), cell: (c) => (c.isEnabled ? badge(ctx.t('common.enabled'), 'green') : badge(ctx.t('common.disabled'), 'grey')) },
      { label: ctx.t('common.actions'), cell: (c) => html`<form method="post" action="${href(ctx, `/admin/countries/${c.code}`)}">${csrfField(ctx)}<input type="hidden" name="enabled" value="${c.isEnabled ? '0' : '1'}">${button(c.isEnabled ? ctx.t('admin.languages.disable') : ctx.t('admin.languages.enable'), { kind: 'ghost' })}</form>` },
    ],
    sorted,
    '',
  ),
)}`;
  return adminPage(ctx, ctx.t('admin.nav.countries'), body);
}

export async function updateCountry(ctx: PageCtx, params: Record<string, string>): Promise<PageResult> {
  const me = guardSuper(ctx);
  if (isResult(me)) return me;
  const code = params.code ?? '';
  if (!/^[A-Z]{2}$/.test(code)) return redirect(href(ctx, '/admin/countries'));
  await ctx.api.patch(`/v1/admin/countries/${code}`, { isEnabled: ctx.form.get('enabled') === '1' });
  return redirect(href(ctx, '/admin/countries'), { kind: 'success', key: 'common.saved' });
}

export async function settingsPage(ctx: PageCtx, state?: FormState): Promise<PageResult> {
  const me = guardSuper(ctx);
  if (isResult(me)) return me;
  const { settings } = await ctx.api.get<{ settings: Settings }>('/v1/admin/settings');
  const body = html`${pageHeader(ctx.t('admin.nav.settings'), { subtitle: ctx.t('admin.settings.subtitle') })}
${card(html`<form method="post" action="${href(ctx, '/admin/settings')}" class="form">${csrfField(ctx)}${state ? formError(state) : ''}
${checkbox({ name: 'registration_open', label: ctx.t('admin.settings.registrationOpen'), checked: settings.registration_open, hint: ctx.t('admin.settings.registrationHint') })}
${checkbox({ name: 'withdrawals_open', label: ctx.t('admin.settings.withdrawalsOpen'), checked: settings.withdrawals_open, hint: ctx.t('admin.settings.withdrawalsHint') })}
${field({ label: ctx.t('admin.settings.expiryHours'), name: 'withdrawal_expiry_hours', type: 'number', min: '1', max: '720', value: String(settings.withdrawal_expiry_hours), error: state?.errors.value, hint: ctx.t('admin.settings.expiryHint') })}
${button(ctx.t('common.save'))}</form>`)}`;
  return adminPage(ctx, ctx.t('admin.nav.settings'), body, state ? 422 : 200);
}

export async function saveSettings(ctx: PageCtx): Promise<PageResult> {
  const me = guardSuper(ctx);
  if (isResult(me)) return me;
  const { settings } = await ctx.api.get<{ settings: Settings }>('/v1/admin/settings');
  const wanted: [keyof Settings, boolean | number][] = [
    ['registration_open', ctx.form.get('registration_open') === 'on'],
    ['withdrawals_open', ctx.form.get('withdrawals_open') === 'on'],
    ['withdrawal_expiry_hours', Number(ctx.form.get('withdrawal_expiry_hours') ?? '')],
  ];
  try {
    for (const [key, value] of wanted) if (settings[key] !== value) await ctx.api.put(`/v1/admin/settings/${key}`, { value });
  } catch (error) {
    return settingsPage(ctx, formFromError(ctx, error, {}));
  }
  return redirect(href(ctx, '/admin/settings'), { kind: 'success', key: 'common.saved' });
}
