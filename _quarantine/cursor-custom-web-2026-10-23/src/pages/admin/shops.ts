/** Shops, shop workers and shop cash (head office). */
import { ApiError } from '../../api.ts';
import { can, currencyName, date, href, money, redirect, signedMoney } from '../../context.ts';
import type { PageCtx, PageResult } from '../../context.ts';
import { html } from '../../html.ts';
import type { SafeHtml } from '../../html.ts';
import {
  alert,
  button,
  card,
  checkbox,
  csrfField,
  cursorPager,
  definitionList,
  emptyForm,
  field,
  formError,
  formFromError,
  formValues,
  idempotencyField,
  linkButton,
  pageHeader,
  select,
  stat,
  statusBadge,
  table,
} from '../../layout/components.ts';
import type { FormState } from '../../layout/components.ts';
import type { CashCountDTO, Page, ShopCashEntryDTO, ShopDTO, WorkerDTO } from '../../types.ts';
import { adminPage, guard, ID_RE, isResult, oneTimeSecret, q, UUID_RE } from './common.ts';
import { withdrawalMini } from './players.ts';
import type { StaffWithdrawalDTO } from '../../types.ts';

const SEE = ['shops.view', 'shops.manage', 'shops.cash'];

function minorToInput(ctx: PageCtx, m: { amountMinor: string; currency: string } | null): string {
  if (!m) return '';
  const c = ctx.publicConfig.currencyFormats.find((x) => x.code === m.currency);
  const d = c?.decimals ?? 0;
  const s = m.amountMinor.padStart(d + 1, '0');
  return d ? `${s.slice(0, -d)}.${s.slice(-d)}` : s;
}

export async function shopsPage(ctx: PageCtx): Promise<PageResult> {
  const me = guard(ctx, ...SEE);
  if (isResult(me)) return me;
  const status = q(ctx, 'status', /^(active|suspended|closed)$/);
  const search = (ctx.url.searchParams.get('q') ?? '').trim().slice(0, 60);
  const { items } = await ctx.api.get<{ items: ShopDTO[] }>('/v1/admin/shops', { status, q: search || undefined });
  const body = html`${pageHeader(ctx.t('admin.nav.shops'), { subtitle: ctx.t('admin.shops.subtitle'), actions: can(me, 'shops.manage') ? linkButton(ctx.t('admin.shops.new'), href(ctx, '/admin/shops/new'), { iconName: 'plus' }) : '' })}
<form class="filters" method="get">
<label class="filter grow"><span>${ctx.t('common.search')}</span><input type="search" name="q" value="${search}"></label>
<label class="filter"><span>${ctx.t('common.status')}</span><select name="status"><option value="">${ctx.t('common.all')}</option>${['active', 'suspended', 'closed'].map((s) => html`<option value="${s}"${s === status ? html` selected` : ''}>${ctx.t(`status.${s}`)}</option>`)}</select></label>
<button class="btn btn-dark" type="submit">${ctx.t('common.apply')}</button>
</form>
${card(
  table<ShopDTO>(
    [
      { label: ctx.t('admin.shops.code'), cell: (s) => html`<a href="${href(ctx, `/admin/shops/${s.id}`)}"><b>${s.code}</b></a>` },
      { label: ctx.t('admin.shops.name'), cell: (s) => html`<a href="${href(ctx, `/admin/shops/${s.id}`)}">${s.name}</a>` },
      { label: ctx.t('shops.city'), cell: (s) => s.city },
      { label: ctx.t('common.currency'), cell: (s) => s.currency },
      { label: ctx.t('admin.shops.cashNow'), cell: (s) => money(ctx, s.cashBalance), className: 'num' },
      { label: ctx.t('admin.shops.workers'), cell: (s) => String(s.activeWorkers), className: 'num' },
      { label: ctx.t('common.status'), cell: (s) => html`${statusBadge(ctx, s.status)}${s.isListed ? '' : html` <span class="badge badge-grey">${ctx.t('admin.shops.unlisted')}</span>`}` },
    ],
    items,
    ctx.t('admin.shops.none'),
  ),
)}`;
  return adminPage(ctx, ctx.t('admin.nav.shops'), body);
}

function shopForm(ctx: PageCtx, state: FormState, editing: ShopDTO | null): SafeHtml {
  const v = state.values;
  const e = state.errors;
  const currencies = editing ? ctx.publicConfig.currencyFormats : ctx.publicConfig.currencies;
  return html`<form method="post" action="${href(ctx, editing ? `/admin/shops/${editing.id}/edit` : '/admin/shops/new')}" class="form">
${csrfField(ctx)}${formError(state)}
<div class="form-grid">
${field({ label: ctx.t('admin.shops.code'), name: 'code', value: v.code, error: e.code, required: true, maxlength: 20, dir: 'ltr', hint: ctx.t('admin.shops.codeHint') })}
${field({ label: ctx.t('admin.shops.name'), name: 'name', value: v.name, error: e.name, required: true, maxlength: 120 })}
${field({ label: ctx.t('shops.city'), name: 'city', value: v.city, error: e.city, maxlength: 80 })}
${field({ label: ctx.t('admin.shops.address'), name: 'address', value: v.address, error: e.address, maxlength: 300 })}
${field({ label: ctx.t('admin.shops.phone'), name: 'phone', value: v.phone, error: e.mobile, dir: 'ltr', placeholder: '+216 71 123 456' })}
${field({ label: ctx.t('admin.shops.hours'), name: 'openingHours', value: v.openingHours, error: e.openingHours, maxlength: 200, placeholder: '09:00–22:00' })}
${select({ label: ctx.t('common.currency'), name: 'currency', value: v.currency, error: e.currency, required: true, options: currencies.map((c) => ({ value: c.code, label: `${c.code} — ${currencyName(ctx, c.code)}` })), hint: ctx.t('admin.shops.currencyHint') })}
${select({ label: ctx.t('common.status'), name: 'status', value: v.status || 'active', error: e.status, options: ['active', 'suspended', 'closed'].map((s) => ({ value: s, label: ctx.t(`status.${s}`), disabled: !editing && s === 'closed' })) })}
${field({ label: ctx.t('admin.shops.maxDeposit'), name: 'maxDeposit', value: v.maxDeposit, error: e.maxDeposit, inputmode: 'decimal', dir: 'ltr', hint: ctx.t('admin.shops.noLimitHint') })}
${field({ label: ctx.t('admin.shops.maxPayout'), name: 'maxPayout', value: v.maxPayout, error: e.maxPayout, inputmode: 'decimal', dir: 'ltr', hint: ctx.t('admin.shops.noLimitHint') })}
</div>
${checkbox({ name: 'isListed', label: ctx.t('admin.shops.listed'), checked: v.isListed === 'on' })}
${checkbox({ name: 'allowNegativeCash', label: ctx.t('admin.shops.allowNegative'), checked: v.allowNegativeCash === 'on', hint: ctx.t('admin.shops.allowNegativeHint') })}
${button(ctx.t('common.save'))}
</form>`;
}

function shopBody(ctx: PageCtx, values: Record<string, string>) {
  const phone = values.phone?.replace(/[\s.()-]/g, '') ?? '';
  const m = /^\+(\d{1,3})(\d{4,14})$/.exec(phone);
  return {
    code: values.code,
    name: values.name,
    city: values.city,
    address: values.address,
    openingHours: values.openingHours,
    currency: values.currency,
    status: values.status || 'active',
    isListed: values.isListed === 'on',
    allowNegativeCash: values.allowNegativeCash === 'on',
    ...(values.maxDeposit ? { maxDeposit: values.maxDeposit } : {}),
    ...(values.maxPayout ? { maxPayout: values.maxPayout } : {}),
    ...(phone ? (m ? { callingCode: m[1], mobile: m[2] } : { callingCode: '', mobile: phone }) : {}),
  };
}

const SHOP_FIELDS = ['code', 'name', 'city', 'address', 'phone', 'openingHours', 'currency', 'status', 'maxDeposit', 'maxPayout', 'isListed', 'allowNegativeCash'];

export async function newShopPage(ctx: PageCtx): Promise<PageResult> {
  const me = guard(ctx, 'shops.manage');
  if (isResult(me)) return me;
  const state = emptyForm({ status: 'active', isListed: 'on', currency: ctx.publicConfig.currencies[0]?.code ?? '' });
  return adminPage(ctx, ctx.t('admin.shops.new'), html`${pageHeader(ctx.t('admin.shops.new'), { back: { href: href(ctx, '/admin/shops'), label: ctx.t('admin.nav.shops') } })}${card(shopForm(ctx, state, null))}`);
}

export async function createShop(ctx: PageCtx): Promise<PageResult> {
  const me = guard(ctx, 'shops.manage');
  if (isResult(me)) return me;
  const values = formValues(ctx, ...SHOP_FIELDS);
  try {
    const { shop } = await ctx.api.post<{ shop: ShopDTO }>('/v1/admin/shops', shopBody(ctx, values));
    return redirect(href(ctx, `/admin/shops/${shop.id}`), { kind: 'success', key: 'admin.shops.created' });
  } catch (error) {
    return adminPage(ctx, ctx.t('admin.shops.new'), html`${pageHeader(ctx.t('admin.shops.new'))}${card(shopForm(ctx, formFromError(ctx, error, values), null))}`, 422);
  }
}

function shopValues(ctx: PageCtx, s: ShopDTO): Record<string, string> {
  return {
    code: s.code, name: s.name, city: s.city, address: s.address, phone: s.phone ?? '', openingHours: s.openingHours, currency: s.currency, status: s.status,
    maxDeposit: minorToInput(ctx, s.maxDeposit), maxPayout: minorToInput(ctx, s.maxPayout), isListed: s.isListed ? 'on' : '', allowNegativeCash: s.allowNegativeCash ? 'on' : '',
  };
}

export async function editShopPage(ctx: PageCtx, params: Record<string, string>): Promise<PageResult> {
  const me = guard(ctx, 'shops.manage');
  if (isResult(me)) return me;
  if (!ID_RE.test(params.id ?? '')) throw new ApiError(404, { code: 'shop_not_found' });
  const { shop } = await ctx.api.get<{ shop: ShopDTO }>(`/v1/admin/shops/${params.id}`);
  return adminPage(ctx, shop.name, html`${pageHeader(`${ctx.t('common.edit')}: ${shop.code}`, { back: { href: href(ctx, `/admin/shops/${shop.id}`), label: shop.name } })}${card(shopForm(ctx, emptyForm(shopValues(ctx, shop)), shop))}`);
}

export async function updateShop(ctx: PageCtx, params: Record<string, string>): Promise<PageResult> {
  const me = guard(ctx, 'shops.manage');
  if (isResult(me)) return me;
  const id = params.id ?? '';
  if (!ID_RE.test(id)) throw new ApiError(404, { code: 'shop_not_found' });
  const values = formValues(ctx, ...SHOP_FIELDS);
  try {
    await ctx.api.put(`/v1/admin/shops/${id}`, shopBody(ctx, values));
    return redirect(href(ctx, `/admin/shops/${id}`), { kind: 'success', key: 'common.saved' });
  } catch (error) {
    const { shop } = await ctx.api.get<{ shop: ShopDTO }>(`/v1/admin/shops/${id}`);
    return adminPage(ctx, shop.name, html`${pageHeader(`${ctx.t('common.edit')}: ${shop.code}`)}${card(shopForm(ctx, formFromError(ctx, error, values), shop))}`, 422);
  }
}

export function cashTable(ctx: PageCtx, items: readonly ShopCashEntryDTO[], withShop = false): SafeHtml {
  return table<ShopCashEntryDTO>(
    [
      { label: ctx.t('wallet.columns.date'), cell: (c) => date(ctx, c.createdAt) },
      ...(withShop ? [{ label: ctx.t('admin.shops.shop'), cell: (c: ShopCashEntryDTO) => html`<a href="${href(ctx, `/admin/shops/${c.shop.id}`)}">${c.shop.code}</a>` }] : []),
      { label: ctx.t('wallet.columns.type'), cell: (c) => ctx.t(`admin.shopCash.types.${c.entryType}`) },
      { label: ctx.t('wallet.columns.amount'), cell: (c) => signedMoney(ctx, c.amount, c.direction), className: 'num' },
      { label: ctx.t('admin.shopCash.cashAfter'), cell: (c) => money(ctx, c.balanceAfter), className: 'num' },
      { label: ctx.t('admin.players.player'), cell: (c) => (c.player ? html`<a href="${href(ctx, `/admin/players/${c.player.id}`)}">${c.player.username}</a>` : '') },
      { label: ctx.t('wallet.columns.operator'), cell: (c) => c.operator.username },
      { label: ctx.t('wallet.columns.reference'), cell: (c) => html`${c.withdrawal ? html`<a href="${href(ctx, `/admin/withdrawals/${c.withdrawal.id}`)}">${c.withdrawal.code}</a> ` : ''}${c.reference ?? ''}` },
      { label: ctx.t('wallet.columns.reason'), cell: (c) => c.reason ?? '' },
    ],
    items,
    ctx.t('admin.shopCash.none'),
  );
}

interface ShopForms {
  cash?: FormState;
  count?: FormState;
  worker?: FormState;
  secret?: { username: string; password: string };
}

async function shopDetail(ctx: PageCtx, id: string, forms: ShopForms = {}, status = 200): Promise<PageResult> {
  const me = ctx.me;
  const [{ shop }, cash, workers, counts, withdrawals] = await Promise.all([
    ctx.api.get<{ shop: ShopDTO }>(`/v1/admin/shops/${id}`),
    ctx.api.get<Page<ShopCashEntryDTO>>(`/v1/admin/shops/${id}/cash`, { before: q(ctx, 'before', /^\d+$/), limit: 25 }),
    ctx.api.get<{ items: WorkerDTO[] }>('/v1/admin/workers', { shopId: id }),
    ctx.api.get<{ items: CashCountDTO[] }>(`/v1/admin/shops/${id}/cash-counts`),
    can(me, 'withdrawals.view', 'withdrawals.manage', 'shops.view', 'shops.manage') ? ctx.api.get<Page<StaffWithdrawalDTO>>('/v1/admin/withdrawals', { shopId: id, limit: 10 }) : Promise.resolve(null),
  ]);
  const cf = forms.cash ?? emptyForm({ entryType: 'float_in' });
  const cnt = forms.count ?? emptyForm();
  const wf = forms.worker ?? emptyForm({ shopRole: 'cashier' });
  const canCash = can(me, 'shops.cash');
  const canManage = can(me, 'shops.manage');
  const body = html`${pageHeader(`${shop.code} — ${shop.name}`, { subtitle: [shop.address, shop.city].filter(Boolean).join(', '), back: { href: href(ctx, '/admin/shops'), label: ctx.t('admin.nav.shops') }, actions: canManage ? linkButton(ctx.t('common.edit'), href(ctx, `/admin/shops/${shop.id}/edit`), { kind: 'dark', iconName: 'settings' }) : '' })}
${forms.secret ? html`${alert('success', ctx.t('admin.workers.created', { username: forms.secret.username }))}${oneTimeSecret(ctx, ctx.t('admin.common.temporaryPassword'), forms.secret.password, ctx.t('admin.common.temporaryPasswordNote'))}` : ''}
<div class="stats">
${stat(ctx.t('admin.shops.cashNow'), money(ctx, shop.cashBalance), ctx.t('admin.shops.cashNote'))}
${stat(ctx.t('common.status'), statusBadge(ctx, shop.status), shop.isListed ? ctx.t('admin.shops.listedShort') : ctx.t('admin.shops.unlisted'))}
${stat(ctx.t('admin.shops.limits'), html`${shop.maxDeposit ? money(ctx, shop.maxDeposit) : '∞'} / ${shop.maxPayout ? money(ctx, shop.maxPayout) : '∞'}`, ctx.t('admin.shops.limitsNote'))}
${stat(ctx.t('admin.shops.workers'), String(shop.activeWorkers), `${shop.currency} · ${shop.openingHours || '—'}`)}
</div>
<div class="grid-2">
${canCash
  ? card(html`<form method="post" action="${href(ctx, `/admin/shops/${shop.id}/cash`)}" class="form">${csrfField(ctx)}${idempotencyField()}${formError(cf)}
<div class="form-grid">
${select({ label: ctx.t('admin.shopCash.type'), name: 'entryType', value: cf.values.entryType, options: ['float_in', 'cash_collection', 'adjustment_credit', 'adjustment_debit'].map((tp) => ({ value: tp, label: ctx.t(`admin.shopCash.types.${tp}`) })) })}
${field({ label: ctx.t('admin.balance.amount', { currency: shop.currency }), name: 'amount', value: cf.values.amount, error: cf.errors.amount, required: true, inputmode: 'decimal', dir: 'ltr' })}
${field({ label: ctx.t('wallet.columns.reference'), name: 'reference', value: cf.values.reference, maxlength: 200 })}
${field({ label: ctx.t('wallet.columns.reason'), name: 'reason', value: cf.values.reason, error: cf.errors.reason, maxlength: 500, hint: ctx.t('admin.shopCash.reasonHint') })}
</div>
${button(ctx.t('admin.shopCash.submit'), { iconName: 'coins', confirm: ctx.t('admin.balance.confirm') })}</form>`, { title: ctx.t('admin.shopCash.title') })
  : ''}
${card(html`${canCash ? html`<form method="post" action="${href(ctx, `/admin/shops/${shop.id}/count`)}" class="form form-inline">${csrfField(ctx)}${formError(cnt)}
${field({ label: ctx.t('admin.counts.counted', { currency: shop.currency }), name: 'counted', value: cnt.values.counted, error: cnt.errors.counted, required: true, inputmode: 'decimal', dir: 'ltr' })}
${field({ label: ctx.t('admin.counts.note'), name: 'note', value: cnt.values.note, maxlength: 500 })}
${button(ctx.t('admin.counts.record'), { kind: 'dark' })}</form>` : ''}
${countsTable(ctx, counts.items)}`, { title: ctx.t('admin.counts.title') })}
</div>
${card(html`${table<WorkerDTO>(
    [
      { label: ctx.t('admin.workers.worker'), cell: (w) => html`<a href="${href(ctx, `/admin/workers/${w.id}`)}">${w.firstName} ${w.lastName}</a> <span class="small muted">@${w.username}</span>` },
      { label: ctx.t('admin.workers.role'), cell: (w) => ctx.t(`admin.workers.roles.${w.shopRole}`) },
      { label: ctx.t('common.status'), cell: (w) => statusBadge(ctx, w.status) },
      { label: ctx.t('admin.players.lastLogin'), cell: (w) => date(ctx, w.lastLoginAt) },
    ],
    workers.items,
    ctx.t('admin.workers.none'),
  )}
${canManage && shop.status !== 'closed'
  ? html`<details class="more"${wf.message ? html` open` : ''}><summary>${ctx.t('admin.workers.add')}</summary><form method="post" action="${href(ctx, `/admin/shops/${shop.id}/workers`)}" class="form">${csrfField(ctx)}${formError(wf)}
<div class="form-grid">
${field({ label: ctx.t('auth.register.username'), name: 'username', value: wf.values.username, error: wf.errors.username, required: true, dir: 'ltr' })}
${field({ label: ctx.t('auth.register.email'), name: 'email', type: 'email', value: wf.values.email, error: wf.errors.email, required: true, dir: 'ltr' })}
${field({ label: ctx.t('auth.register.firstName'), name: 'firstName', value: wf.values.firstName, error: wf.errors.firstName, required: true })}
${field({ label: ctx.t('auth.register.lastName'), name: 'lastName', value: wf.values.lastName, error: wf.errors.lastName, required: true })}
${select({ label: ctx.t('admin.workers.role'), name: 'shopRole', value: wf.values.shopRole, options: ['cashier', 'manager'].map((r) => ({ value: r, label: ctx.t(`admin.workers.roles.${r}`) })) })}
</div>${button(ctx.t('admin.workers.add'), { iconName: 'plus' })}</form></details>`
  : ''}`, { title: ctx.t('admin.shops.workers') })}
${withdrawals ? card(withdrawalMini(ctx, withdrawals.items), { title: ctx.t('admin.nav.withdrawals') }) : ''}
${card(html`${cashTable(ctx, cash.items)}${cursorPager(ctx, cash.nextCursor)}`, { title: ctx.t('admin.shopCash.ledger') })}`;
  return adminPage(ctx, shop.name, body, status);
}

function countsTable(ctx: PageCtx, items: readonly CashCountDTO[]): SafeHtml {
  return table<CashCountDTO>(
    [
      { label: ctx.t('wallet.columns.date'), cell: (c) => date(ctx, c.createdAt) },
      { label: ctx.t('admin.counts.expected'), cell: (c) => money(ctx, c.expected), className: 'num' },
      { label: ctx.t('admin.counts.countedShort'), cell: (c) => money(ctx, c.counted), className: 'num' },
      { label: ctx.t('admin.counts.difference'), cell: (c) => money(ctx, c.difference), className: 'num' },
      { label: ctx.t('wallet.columns.operator'), cell: (c) => c.countedBy.username },
      { label: ctx.t('admin.counts.note'), cell: (c) => c.note ?? '' },
    ],
    items.slice(0, 10),
    ctx.t('admin.counts.none'),
  );
}

function shopId(params: Record<string, string>): string {
  const id = params.id ?? '';
  if (!ID_RE.test(id)) throw new ApiError(404, { code: 'shop_not_found' });
  return id;
}

export async function shopPage(ctx: PageCtx, params: Record<string, string>): Promise<PageResult> {
  const me = guard(ctx, ...SEE);
  if (isResult(me)) return me;
  return shopDetail(ctx, shopId(params));
}

export async function postShopCash(ctx: PageCtx, params: Record<string, string>): Promise<PageResult> {
  const me = guard(ctx, 'shops.cash');
  if (isResult(me)) return me;
  const id = shopId(params);
  const values = formValues(ctx, 'entryType', 'amount', 'reference', 'reason', 'idempotencyKey');
  try {
    await ctx.api.post(`/v1/admin/shops/${id}/cash`, { entryType: values.entryType, amount: values.amount, ...(values.reference ? { reference: values.reference } : {}), ...(values.reason ? { reason: values.reason } : {}), idempotencyKey: values.idempotencyKey });
    return redirect(href(ctx, `/admin/shops/${id}`), { kind: 'success', key: 'admin.shopCash.done' });
  } catch (error) {
    const state = formFromError(ctx, error, values);
    if (error instanceof ApiError && !state.errors.amount && ['shop_cash_insufficient', 'invalid_amount', 'too_many_decimals'].includes(error.code)) state.errors.amount = state.message ?? '';
    return shopDetail(ctx, id, { cash: state }, 422);
  }
}

export async function postCount(ctx: PageCtx, params: Record<string, string>): Promise<PageResult> {
  const me = guard(ctx, 'shops.cash');
  if (isResult(me)) return me;
  const id = shopId(params);
  const values = formValues(ctx, 'counted', 'note');
  try {
    await ctx.api.post(`/v1/admin/shops/${id}/cash-counts`, { counted: values.counted, ...(values.note ? { note: values.note } : {}) });
    return redirect(href(ctx, `/admin/shops/${id}`), { kind: 'success', key: 'admin.counts.done' });
  } catch (error) {
    return shopDetail(ctx, id, { count: formFromError(ctx, error, values) }, 422);
  }
}

export async function postWorker(ctx: PageCtx, params: Record<string, string>): Promise<PageResult> {
  const me = guard(ctx, 'shops.manage');
  if (isResult(me)) return me;
  const id = shopId(params);
  const values = formValues(ctx, 'username', 'email', 'firstName', 'lastName', 'shopRole');
  try {
    const result = await ctx.api.post<{ worker: WorkerDTO; temporaryPassword: string }>('/v1/admin/workers', { shopId: id, ...values });
    return shopDetail(ctx, id, { secret: { username: result.worker.username, password: result.temporaryPassword } });
  } catch (error) {
    return shopDetail(ctx, id, { worker: formFromError(ctx, error, values) }, 422);
  }
}

// ---------------------------------------------------------------------------
// Workers
// ---------------------------------------------------------------------------
export async function workersPage(ctx: PageCtx): Promise<PageResult> {
  const me = guard(ctx, ...SEE);
  if (isResult(me)) return me;
  const { items } = await ctx.api.get<{ items: WorkerDTO[] }>('/v1/admin/workers');
  const body = html`${pageHeader(ctx.t('admin.nav.workers'), { subtitle: ctx.t('admin.workers.subtitle') })}
${card(
  table<WorkerDTO>(
    [
      { label: ctx.t('admin.workers.worker'), cell: (w) => html`<a href="${href(ctx, `/admin/workers/${w.id}`)}">${w.firstName} ${w.lastName}</a> <span class="small muted">@${w.username}</span>` },
      { label: ctx.t('admin.shops.shop'), cell: (w) => html`<a href="${href(ctx, `/admin/shops/${w.shop.id}`)}">${w.shop.code}</a> <span class="small muted">${w.shop.name}</span>` },
      { label: ctx.t('admin.workers.role'), cell: (w) => ctx.t(`admin.workers.roles.${w.shopRole}`) },
      { label: ctx.t('common.status'), cell: (w) => statusBadge(ctx, w.status) },
      { label: ctx.t('admin.players.lastLogin'), cell: (w) => date(ctx, w.lastLoginAt) },
    ],
    items,
    ctx.t('admin.workers.none'),
  ),
)}`;
  return adminPage(ctx, ctx.t('admin.nav.workers'), body);
}

async function workerDetail(ctx: PageCtx, id: string, state?: FormState, secret?: string, status = 200): Promise<PageResult> {
  const [{ worker }, shops] = await Promise.all([
    ctx.api.get<{ worker: WorkerDTO }>(`/v1/admin/workers/${id}`),
    ctx.api.get<{ items: ShopDTO[] }>('/v1/admin/shops', { status: 'active' }),
  ]);
  const st = state ?? emptyForm({ shopId: worker.shop.id, shopRole: worker.shopRole, status: worker.status, firstName: worker.firstName, lastName: worker.lastName, email: worker.email });
  const canManage = can(ctx.me, 'shops.manage');
  const body = html`${pageHeader(`${worker.firstName} ${worker.lastName}`, { subtitle: `@${worker.username}`, back: { href: href(ctx, '/admin/workers'), label: ctx.t('admin.nav.workers') } })}
${secret ? oneTimeSecret(ctx, ctx.t('admin.common.temporaryPassword'), secret, ctx.t('admin.common.temporaryPasswordNote')) : ''}
<div class="grid-2">
${card(definitionList([
    [ctx.t('admin.shops.shop'), html`<a href="${href(ctx, `/admin/shops/${worker.shop.id}`)}">${worker.shop.code} — ${worker.shop.name}</a>`],
    [ctx.t('admin.workers.role'), ctx.t(`admin.workers.roles.${worker.shopRole}`)],
    [ctx.t('common.status'), statusBadge(ctx, worker.status)],
    [ctx.t('auth.register.email'), html`<bdi dir="ltr">${worker.email}</bdi>`],
    [ctx.t('admin.players.created'), date(ctx, worker.createdAt)],
    [ctx.t('admin.players.lastLogin'), date(ctx, worker.lastLoginAt)],
    [ctx.t('admin.common.mustChange'), worker.mustChangePassword ? ctx.t('common.yes') : ctx.t('common.no')],
  ]))}
${canManage
  ? card(html`<form method="post" action="${href(ctx, `/admin/workers/${id}`)}" class="form">${csrfField(ctx)}${formError(st)}
<div class="form-grid">
${select({ label: ctx.t('admin.shops.shop'), name: 'shopId', value: st.values.shopId, options: shops.items.map((s) => ({ value: s.id, label: `${s.code} — ${s.name}` })).concat(shops.items.some((s) => s.id === worker.shop.id) ? [] : [{ value: worker.shop.id, label: worker.shop.code }]) })}
${select({ label: ctx.t('admin.workers.role'), name: 'shopRole', value: st.values.shopRole, options: ['cashier', 'manager'].map((r) => ({ value: r, label: ctx.t(`admin.workers.roles.${r}`) })) })}
${select({ label: ctx.t('common.status'), name: 'status', value: st.values.status, options: ['active', 'suspended'].map((s) => ({ value: s, label: ctx.t(`status.${s}`) })) })}
${field({ label: ctx.t('auth.register.firstName'), name: 'firstName', value: st.values.firstName, error: st.errors.firstName })}
${field({ label: ctx.t('auth.register.lastName'), name: 'lastName', value: st.values.lastName, error: st.errors.lastName })}
${field({ label: ctx.t('auth.register.email'), name: 'email', type: 'email', value: st.values.email, error: st.errors.email, dir: 'ltr' })}
</div>${button(ctx.t('common.save'))}</form>
<hr><form method="post" action="${href(ctx, `/admin/workers/${id}/reset-password`)}">${csrfField(ctx)}${button(ctx.t('admin.common.resetPassword'), { kind: 'ghost', iconName: 'key', confirm: ctx.t('admin.common.resetConfirm') })}</form>`, { title: ctx.t('common.edit') })
  : ''}
</div>`;
  return adminPage(ctx, worker.username, body, status);
}

function workerId(params: Record<string, string>): string {
  const id = params.id ?? '';
  if (!UUID_RE.test(id)) throw new ApiError(404, { code: 'user_not_found' });
  return id;
}

export async function workerPage(ctx: PageCtx, params: Record<string, string>): Promise<PageResult> {
  const me = guard(ctx, ...SEE);
  if (isResult(me)) return me;
  return workerDetail(ctx, workerId(params));
}

export async function updateWorker(ctx: PageCtx, params: Record<string, string>): Promise<PageResult> {
  const me = guard(ctx, 'shops.manage');
  if (isResult(me)) return me;
  const id = workerId(params);
  const values = formValues(ctx, 'shopId', 'shopRole', 'status', 'firstName', 'lastName', 'email');
  try {
    await ctx.api.patch(`/v1/admin/workers/${id}`, values);
    return redirect(href(ctx, `/admin/workers/${id}`), { kind: 'success', key: 'common.saved' });
  } catch (error) {
    return workerDetail(ctx, id, formFromError(ctx, error, values), undefined, 422);
  }
}

export async function resetWorkerPassword(ctx: PageCtx, params: Record<string, string>): Promise<PageResult> {
  const me = guard(ctx, 'shops.manage');
  if (isResult(me)) return me;
  const id = workerId(params);
  const result = await ctx.api.post<{ temporaryPassword: string }>(`/v1/admin/workers/${id}/reset-password`);
  return workerDetail(ctx, id, undefined, result.temporaryPassword);
}

export async function shopCashPage(ctx: PageCtx): Promise<PageResult> {
  const me = guard(ctx, ...SEE);
  if (isResult(me)) return me;
  const type = ctx.url.searchParams.get('type') ?? '';
  const types = ['player_deposit', 'withdrawal_payout', 'float_in', 'cash_collection', 'adjustment_credit', 'adjustment_debit'];
  const page = await ctx.api.get<Page<ShopCashEntryDTO>>('/v1/admin/shop-cash', { type: types.includes(type) ? type : undefined, before: q(ctx, 'before', /^\d+$/), limit: 50 });
  const body = html`${pageHeader(ctx.t('admin.nav.shopCash'), { subtitle: ctx.t('admin.shopCash.subtitle') })}
<form class="filters" method="get"><label class="filter"><span>${ctx.t('wallet.columns.type')}</span><select name="type" data-autosubmit><option value="">${ctx.t('common.all')}</option>${types.map((tp) => html`<option value="${tp}"${tp === type ? html` selected` : ''}>${ctx.t(`admin.shopCash.types.${tp}`)}</option>`)}</select></label><noscript><button class="btn btn-dark">${ctx.t('common.apply')}</button></noscript></form>
${card(html`${cashTable(ctx, page.items, true)}${cursorPager(ctx, page.nextCursor)}`)}`;
  return adminPage(ctx, ctx.t('admin.nav.shopCash'), body);
}
