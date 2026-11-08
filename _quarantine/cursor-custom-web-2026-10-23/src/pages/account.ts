/** Player account: overview, statement, withdrawals at a shop, preferences, password (all signed-in users). */
import { ApiError } from '../api.ts';
import { currencyName, date, dateText, href, htmlPage, money, redirect, signedMoney } from '../context.ts';
import type { PageCtx, PageResult } from '../context.ts';
import { cx, html } from '../html.ts';
import type { SafeHtml } from '../html.ts';
import { isLocale } from '../i18n.ts';
import {
  alert,
  button,
  card,
  checkbox,
  copyButton,
  csrfField,
  cursorPager,
  definitionList,
  emptyForm,
  field,
  formError,
  formFromError,
  formValues,
  idempotencyField,
  pageHeader,
  select,
  stat,
  statusBadge,
  table,
} from '../layout/components.ts';
import type { FormState } from '../layout/components.ts';
import { icon } from '../layout/icons.ts';
import { layout } from '../layout/shell.ts';
import * as data from '../public-data.ts';
import type { Indicative, Me, Page, PlayerEntryDTO, PublicShopDTO, WithdrawalDTO } from '../types.ts';
import { errorPage } from './errors.ts';

function requirePlayer(ctx: PageCtx): Me | PageResult {
  if (!ctx.me) return redirect(href(ctx, `/login?next=${encodeURIComponent(ctx.path + ctx.url.search)}`));
  if (ctx.me.mustChangePassword && ctx.path !== '/account/password') return redirect(href(ctx, '/account/password?forced=1'));
  if (ctx.me.role !== 'user') return errorPage(ctx, 403);
  return ctx.me;
}

function isResult(x: unknown): x is PageResult {
  return typeof x === 'object' && x !== null && 'kind' in x;
}

function accountTabs(ctx: PageCtx, active: string): SafeHtml {
  const tabs: [string, string, string][] = [
    ['/account', 'account.overview', 'user'],
    ['/account/transactions', 'account.transactions', 'ledger'],
    ['/account/withdrawals', 'account.withdrawals', 'cash'],
    ['/account/profile', 'account.profile', 'settings'],
    ['/account/password', 'account.security', 'key'],
  ];
  return html`<nav class="tabs" aria-label="${ctx.t('account.title')}"><ul role="list">${tabs.map(([p, k, i]) => html`<li><a class="${cx(p === active && 'active')}" href="${href(ctx, p)}"${p === active ? html` aria-current="page"` : ''}>${icon(i)}<span>${ctx.t(k)}</span></a></li>`)}</ul></nav>`;
}

function accountPage(ctx: PageCtx, active: string, title: string, body: SafeHtml, status = 200): PageResult {
  return htmlPage(layout(ctx, { title, noIndex: true, active: 'account', body: html`<div class="container">${pageHeader(title)}${accountTabs(ctx, active)}${body}</div>` }), status);
}

function entryLabel(ctx: PageCtx, type: string): string {
  return ctx.t(`wallet.entryTypes.${type}`);
}

function statement(ctx: PageCtx, items: readonly PlayerEntryDTO[]): SafeHtml {
  return table<PlayerEntryDTO>(
    [
      { label: ctx.t('wallet.columns.date'), cell: (e) => date(ctx, e.createdAt) },
      { label: ctx.t('wallet.columns.type'), cell: (e) => entryLabel(ctx, e.entryType) },
      { label: ctx.t('wallet.columns.amount'), cell: (e) => signedMoney(ctx, e.amount, e.direction), className: 'num' },
      { label: ctx.t('wallet.columns.balanceAfter'), cell: (e) => money(ctx, e.balanceAfter), className: 'num' },
      { label: ctx.t('wallet.columns.reference'), cell: (e) => e.reference ?? '' },
    ],
    items,
    ctx.t('wallet.empty'),
    ctx.t('wallet.history'),
  );
}

export async function accountOverview(ctx: PageCtx): Promise<PageResult> {
  const me = requirePlayer(ctx);
  if (isResult(me)) return me;
  const [wallet, recent, pending] = await Promise.all([
    ctx.api.get<{ wallet: { id: string; currency: string; balance: { amountMinor: string; currency: string } }; indicative: Indicative | null }>('/v1/account/wallet'),
    ctx.api.get<Page<PlayerEntryDTO>>('/v1/account/transactions', { limit: 5 }),
    ctx.api.get<Page<WithdrawalDTO>>('/v1/account/withdrawals', { status: 'pending', limit: 10 }),
  ]);
  const ind = wallet.indicative;
  const body = html`<div class="stats">
${stat(ctx.t('wallet.balance'), money(ctx, wallet.wallet.balance), ctx.t('account.accountCurrencyNote', { currency: wallet.wallet.currency }))}
${ind ? stat(ctx.t('account.indicativeLabel'), html`≈ ${money(ctx, ind)}`, ctx.t('account.indicativeNote', { date: dateText(ctx, ind.asOf, false), currency: wallet.wallet.currency })) : ''}
${stat(ctx.t('account.pendingWithdrawals'), String(pending.items.length), pending.items.length ? html`<a href="${href(ctx, '/account/withdrawals')}">${ctx.t('account.seeCodes')}</a>` : ctx.t('account.noPending'))}
${stat(ctx.t('account.accountNumber'), html`<bdi dir="ltr">${me.accountNo}</bdi>`, me.username)}
</div>
<div class="grid-2">
${card(html`<p class="muted">${ctx.t('account.depositHowTo')}</p><p><a class="btn btn-gold" href="${href(ctx, '/shops')}">${icon('map')}<span>${ctx.t('shops.findShop')}</span></a></p><p class="small muted">${ctx.t('account.depositAccountHint', { account: me.accountNo })}</p>`, { title: ctx.t('account.depositTitle') })}
${card(html`<p class="muted">${ctx.t('account.withdrawHowTo')}</p><p><a class="btn btn-dark" href="${href(ctx, '/account/withdrawals')}">${icon('cash')}<span>${ctx.t('withdrawals.request')}</span></a></p>`, { title: ctx.t('account.withdrawTitle') })}
</div>
${card(html`${statement(ctx, recent.items)}<p><a class="link-more" href="${href(ctx, '/account/transactions')}">${ctx.t('account.viewAllTransactions')}</a></p>`, { title: ctx.t('account.recentTransactions') })}`;
  return accountPage(ctx, '/account', ctx.t('account.title'), body);
}

export async function accountTransactions(ctx: PageCtx): Promise<PageResult> {
  const me = requirePlayer(ctx);
  if (isResult(me)) return me;
  const type = ctx.url.searchParams.get('type') ?? '';
  const before = ctx.url.searchParams.get('before') ?? '';
  const types = ['deposit', 'withdrawal', 'withdrawal_request', 'withdrawal_release', 'adjustment_credit', 'adjustment_debit', 'bet_stake', 'bet_win', 'bet_refund'];
  const page = await ctx.api.get<Page<PlayerEntryDTO>>('/v1/account/transactions', { type: types.includes(type) ? type : undefined, before: /^\d+$/.test(before) ? before : undefined, limit: 25 });
  const body = html`<form class="filters" method="get">
<label class="filter"><span>${ctx.t('wallet.columns.type')}</span><select name="type" data-autosubmit><option value="">${ctx.t('common.all')}</option>${types.map((tp) => html`<option value="${tp}"${tp === type ? html` selected` : ''}>${entryLabel(ctx, tp)}</option>`)}</select></label>
<noscript><button class="btn btn-dark">${ctx.t('common.apply')}</button></noscript>
</form>
${card(html`${statement(ctx, page.items)}${cursorPager(ctx, page.nextCursor)}`)}`;
  return accountPage(ctx, '/account/transactions', ctx.t('account.transactions'), body);
}

function withdrawalForm(ctx: PageCtx, me: Me, shops: readonly PublicShopDTO[], state: FormState): SafeHtml {
  if (!ctx.publicConfig.withdrawalsOpen) return alert('warning', ctx.t('errors.codes.withdrawals_closed'));
  const currency = me.accountCurrency ?? '';
  return html`<form method="post" action="${href(ctx, '/account/withdrawals')}" class="form">
${csrfField(ctx)}${idempotencyField()}
${formError(state)}
<div class="form-grid">
${field({ label: ctx.t('withdrawals.amount', { currency }), name: 'amount', value: state.values.amount, error: state.errors.amount, required: true, inputmode: 'decimal', dir: 'ltr' })}
${select({ label: ctx.t('withdrawals.preferredShop'), name: 'preferredShopId', value: state.values.preferredShopId, error: state.errors.preferredShopId, empty: ctx.t('withdrawals.anyShop'), options: shops.map((s) => ({ value: s.id, label: `${s.name} — ${s.city}` })) })}
</div>
${me.wallet ? html`<p class="small muted">${ctx.t('withdrawals.availableLabel')} ${money(ctx, me.wallet.balance)}</p>` : ''}
<p class="small muted">${ctx.t('withdrawals.howItWorks', { hours: ctx.publicConfig.withdrawalExpiryHours })}</p>
${button(ctx.t('withdrawals.request'), { iconName: 'cash' })}
</form>`;
}

function withdrawalList(ctx: PageCtx, items: readonly WithdrawalDTO[]): SafeHtml {
  if (items.length === 0) return html`<div class="empty">${icon('cash')}<p>${ctx.t('withdrawals.none')}</p></div>`;
  return html`<ul class="withdrawal-list" role="list">${items.map(
    (w) => html`<li class="${cx('withdrawal', `withdrawal-${w.status}`)}">
<div class="withdrawal-main">
<p class="withdrawal-amount">${money(ctx, w.amount)}</p>
${statusBadge(ctx, w.status)}
<p class="small muted">${ctx.t('withdrawals.requestedOn', { date: dateText(ctx, w.createdAt) })}</p>
</div>
${w.status === 'pending'
  ? html`<div class="pickup"><p class="small">${ctx.t('withdrawals.pickupCode')}</p><p class="code" dir="ltr">${w.code}</p>${copyButton(ctx, w.code)}
<p class="small muted">${ctx.t('withdrawals.validUntil', { date: dateText(ctx, w.expiresAt) })}</p>
${w.preferredShop ? html`<p class="small">${icon('shop')}<span>${w.preferredShop.name} — ${w.preferredShop.city}</span></p>` : ''}
<form method="post" action="${href(ctx, `/account/withdrawals/${w.id}/cancel`)}">${csrfField(ctx)}${button(ctx.t('withdrawals.cancel'), { kind: 'ghost', confirm: ctx.t('withdrawals.cancelConfirm') })}</form></div>`
  : html`<div class="pickup">${w.status === 'paid' && w.paidShop ? html`<p class="small">${ctx.t('withdrawals.paidAt', { shop: w.paidShop.name, date: dateText(ctx, w.paidAt) })}</p>` : ''}${w.status === 'rejected' && w.closeReason ? html`<p class="small">${ctx.t('withdrawals.reason')}: ${w.closeReason}</p>` : ''}${w.status !== 'paid' ? html`<p class="small muted">${ctx.t('withdrawals.returned')}</p>` : ''}</div>`}
</li>`,
  )}</ul>`;
}

async function withdrawalsView(ctx: PageCtx, me: Me, state: FormState, status = 200): Promise<PageResult> {
  const before = ctx.url.searchParams.get('before') ?? '';
  const [list, shops] = await Promise.all([
    ctx.api.get<Page<WithdrawalDTO>>('/v1/account/withdrawals', { before: /^\d+$/.test(before) ? before : undefined, limit: 20 }),
    data.shops(ctx, me.accountCurrency ?? undefined),
  ]);
  const body = html`<div class="grid-2 grid-wide-left">
${card(html`${withdrawalList(ctx, list.items)}${cursorPager(ctx, list.nextCursor)}`, { title: ctx.t('withdrawals.yours') })}
${card(withdrawalForm(ctx, me, shops, state), { title: ctx.t('withdrawals.newTitle') })}
</div>`;
  return accountPage(ctx, '/account/withdrawals', ctx.t('account.withdrawals'), body, status);
}

export async function accountWithdrawals(ctx: PageCtx): Promise<PageResult> {
  const me = requirePlayer(ctx);
  if (isResult(me)) return me;
  return withdrawalsView(ctx, me, emptyForm());
}

export async function requestWithdrawal(ctx: PageCtx): Promise<PageResult> {
  const me = requirePlayer(ctx);
  if (isResult(me)) return me;
  const values = formValues(ctx, 'amount', 'preferredShopId', 'idempotencyKey');
  try {
    const result = await ctx.api.post<{ withdrawal: WithdrawalDTO }>('/v1/account/withdrawals', {
      amount: values.amount,
      ...(values.preferredShopId ? { preferredShopId: values.preferredShopId } : {}),
      idempotencyKey: values.idempotencyKey,
    });
    return redirect(href(ctx, '/account/withdrawals'), { kind: 'success', key: 'withdrawals.created', vars: { code: result.withdrawal.code } });
  } catch (error) {
    const state = formFromError(ctx, error, values);
    if (error instanceof ApiError && error.code === 'insufficient_funds') state.errors.amount = ctx.t('errors.codes.insufficient_funds');
    const fresh = (await ctx.api.get<{ user: Me }>('/v1/auth/me')).user;
    return withdrawalsView(ctx, fresh, state, 422);
  }
}

export async function cancelWithdrawal(ctx: PageCtx, params: Record<string, string>): Promise<PageResult> {
  const me = requirePlayer(ctx);
  if (isResult(me)) return me;
  try {
    await ctx.api.post(`/v1/account/withdrawals/${encodeURIComponent(params.id ?? '')}/cancel`);
    return redirect(href(ctx, '/account/withdrawals'), { kind: 'success', key: 'withdrawals.cancelled' });
  } catch (error) {
    if (error instanceof ApiError && error.status < 500) return redirect(href(ctx, '/account/withdrawals'), { kind: 'error', key: error.code === 'withdrawal_not_pending' ? 'errors.codes.withdrawal_not_pending' : 'errors.generic' });
    throw error;
  }
}

function profileForm(ctx: PageCtx, me: Me, state: FormState): SafeHtml {
  const languages = ctx.publicConfig.languages.filter((l) => isLocale(l.code));
  return html`<form method="post" action="${href(ctx, '/account/profile')}" class="form">
${csrfField(ctx)}${formError(state)}
<div class="form-grid">
${select({ label: ctx.t('account.preferredLanguage'), name: 'preferredLocale', value: state.values.preferredLocale ?? me.preferredLocale ?? ctx.locale, options: languages.map((l) => ({ value: l.code, label: l.nativeName })) })}
${select({ label: ctx.t('account.displayCurrency'), name: 'displayCurrency', value: state.values.displayCurrency ?? me.displayCurrency ?? '', empty: ctx.t('account.displayCurrencyNone'), options: ctx.publicConfig.currencies.filter((c) => c.code !== me.accountCurrency).map((c) => ({ value: c.code, label: `${c.code} — ${currencyName(ctx, c.code)}` })), hint: ctx.t('account.displayCurrencyHint') })}
</div>
${checkbox({ name: 'marketingOptIn', label: ctx.t('auth.register.marketingOptIn'), checked: state.values.marketingOptIn === 'on' })}
${button(ctx.t('common.save'))}
</form>`;
}

export async function accountProfile(ctx: PageCtx): Promise<PageResult> {
  const me = requirePlayer(ctx);
  if (isResult(me)) return me;
  const body = html`<div class="grid-2">
${card(definitionList([
    [ctx.t('account.accountNumber'), html`<bdi dir="ltr">${me.accountNo}</bdi>`],
    [ctx.t('auth.register.username'), me.username],
    [ctx.t('auth.register.firstName'), me.firstName],
    [ctx.t('auth.register.lastName'), me.lastName],
    [ctx.t('auth.register.email'), html`<bdi dir="ltr">${me.email}</bdi>`],
    [ctx.t('account.accountCurrency'), me.accountCurrency ? `${me.accountCurrency} — ${currencyName(ctx, me.accountCurrency)}` : ''],
    [ctx.t('common.status'), statusBadge(ctx, me.status)],
  ]), { title: ctx.t('account.profile') })}
${card(profileForm(ctx, me, emptyForm({ marketingOptIn: me.marketingOptIn ? 'on' : '' })), { title: ctx.t('account.preferences') })}
</div>
<p class="small muted">${ctx.t('account.profileChangeNote')}</p>`;
  return accountPage(ctx, '/account/profile', ctx.t('account.profile'), body);
}

export async function saveProfile(ctx: PageCtx): Promise<PageResult> {
  const me = requirePlayer(ctx);
  if (isResult(me)) return me;
  const values = formValues(ctx, 'preferredLocale', 'displayCurrency', 'marketingOptIn');
  await ctx.api.patch('/v1/account/preferences', {
    ...(isLocale(values.preferredLocale) ? { preferredLocale: values.preferredLocale } : {}),
    displayCurrency: values.displayCurrency || null,
    marketingOptIn: values.marketingOptIn === 'on',
  });
  const locale = isLocale(values.preferredLocale) ? values.preferredLocale : ctx.locale;
  return redirect(`/${locale}/account/profile`, { kind: 'success', key: 'account.profileSaved' });
}

// ---------------------------------------------------------------------------
// Password (every role; also the forced change after a temporary password)
// ---------------------------------------------------------------------------
function passwordForm(ctx: PageCtx, state: FormState, forced: boolean): SafeHtml {
  return html`<form method="post" action="${href(ctx, '/account/password')}" class="form narrow-form">
${csrfField(ctx)}${forced ? html`<input type="hidden" name="forced" value="1">` : ''}
${forced ? alert('warning', ctx.t('account.mustChangePassword')) : ''}
${formError(state)}
${field({ label: ctx.t('account.currentPassword'), name: 'currentPassword', type: 'password', error: state.errors.currentPassword, required: true, autocomplete: 'current-password' })}
${field({ label: ctx.t('account.newPassword'), name: 'newPassword', type: 'password', error: state.errors.newPassword, required: true, autocomplete: 'new-password', hint: ctx.t('auth.register.passwordHint') })}
${button(ctx.t('account.changePassword'), { iconName: 'key' })}
</form>`;
}

function passwordPage(ctx: PageCtx, state: FormState, forced: boolean, status = 200): PageResult {
  const me = ctx.me as Me;
  const title = ctx.t('account.changePassword');
  if (me.role === 'user' && !forced) return accountPage(ctx, '/account/password', title, card(passwordForm(ctx, state, forced)), status);
  return htmlPage(layout(ctx, { title, noIndex: true, body: html`<div class="container narrow auth-page"><section class="card auth-card"><h1>${title}</h1>${passwordForm(ctx, state, forced)}</section></div>` }), status);
}

export async function passwordView(ctx: PageCtx): Promise<PageResult> {
  if (!ctx.me) return redirect(href(ctx, `/login?next=${encodeURIComponent('/account/password')}`));
  return passwordPage(ctx, emptyForm(), ctx.me.mustChangePassword);
}

export async function passwordSubmit(ctx: PageCtx): Promise<PageResult> {
  if (!ctx.me) return redirect(href(ctx, '/login'));
  const forced = ctx.me.mustChangePassword;
  try {
    await ctx.api.post('/v1/auth/change-password', { currentPassword: ctx.form.get('currentPassword') ?? '', newPassword: ctx.form.get('newPassword') ?? '' });
  } catch (error) {
    if (error instanceof ApiError && error.code === 'invalid_credentials') {
      return passwordPage(ctx, { values: {}, errors: { currentPassword: ctx.t('validation.invalidCredentials') } }, forced, 422);
    }
    return passwordPage(ctx, formFromError(ctx, error, {}), forced, 422);
  }
  const target = ctx.me.role === 'admin' || ctx.me.role === 'super_admin' ? '/admin' : ctx.me.role === 'cashier' ? '/counter' : '/account';
  return redirect(href(ctx, target), { kind: 'success', key: 'account.passwordChanged' });
}

