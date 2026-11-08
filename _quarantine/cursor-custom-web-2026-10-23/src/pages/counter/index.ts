/** The shop counter, for shop workers: cash deposits, withdrawal payouts, new players, movements, receipts, cash counts. */
import { ApiError } from '../../api.ts';
import { countryName, currencyName, date, dateText, href, htmlPage, money, redirect, signedMoney } from '../../context.ts';
import type { PageCtx, PageResult } from '../../context.ts';
import { html } from '../../html.ts';
import type { SafeHtml } from '../../html.ts';
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
  linkButton,
  pageHeader,
  select,
  stat,
  statusBadge,
  table,
} from '../../layout/components.ts';
import type { FormState } from '../../layout/components.ts';
import { icon, logoMark } from '../../layout/icons.ts';
import { bareLayout, counterLayout } from '../../layout/shell.ts';
import type { WebRoute } from '../../router.ts';
import type { CashCountDTO, CounterDepositResult, CounterPlayerDTO, CounterSummaryDTO, Me, Page, PayoutLookupDTO, PayoutResult, ShopCashEntryDTO, ShopDTO } from '../../types.ts';
import { errorPage } from '../errors.ts';

function isResult(x: unknown): x is PageResult {
  return typeof x === 'object' && x !== null && 'kind' in x && !('role' in x);
}

function guard(ctx: PageCtx, managerOnly = false): Me | PageResult {
  const me = ctx.me;
  if (!me) return redirect(href(ctx, `/login?next=${encodeURIComponent(ctx.path + ctx.url.search)}`));
  if (me.mustChangePassword) return redirect(href(ctx, '/account/password?forced=1'));
  if (me.role !== 'cashier' || !me.shop) return errorPage(ctx, 403);
  if (managerOnly && me.shop.role !== 'manager') return errorPage(ctx, 403);
  return me;
}

function page(ctx: PageCtx, title: string, body: SafeHtml, status = 200): PageResult {
  return htmlPage(counterLayout(ctx, { title, body }), status);
}

// ---------------------------------------------------------------------------
async function home(ctx: PageCtx): Promise<PageResult> {
  const me = guard(ctx);
  if (isResult(me)) return me;
  const s = await ctx.api.get<CounterSummaryDTO>('/v1/shop/summary');
  const body = html`${pageHeader(`${s.shop.name}`, { subtitle: html`${s.shop.code} · ${currencyName(ctx, s.shop.currency)} · ${ctx.t(`admin.workers.roles.${s.shopRole}`)}` })}
${s.shop.status !== 'active' ? alert('error', ctx.t('errors.codes.shop_not_active')) : ''}
<ul class="quick-links big" role="list">
<li><a href="${href(ctx, '/counter/deposit')}">${icon('plus')}<span>${ctx.t('counter.nav.deposit')}</span></a></li>
<li><a href="${href(ctx, '/counter/payout')}">${icon('cash')}<span>${ctx.t('counter.nav.payout')}</span></a></li>
<li><a href="${href(ctx, '/counter/new-player')}">${icon('user')}<span>${ctx.t('counter.nav.newPlayer')}</span></a></li>
</ul>
<div class="stats">
${stat(ctx.t('counter.myDeposits'), money(ctx, s.mine.deposits.total), ctx.t('counter.count', { count: s.mine.deposits.count }))}
${stat(ctx.t('counter.myPayouts'), money(ctx, s.mine.payouts.total), ctx.t('counter.count', { count: s.mine.payouts.count }))}
${s.shopToday ? stat(ctx.t('counter.shopDeposits'), money(ctx, s.shopToday.deposits.total), ctx.t('counter.count', { count: s.shopToday.deposits.count })) : ''}
${s.shopToday ? stat(ctx.t('counter.shopPayouts'), money(ctx, s.shopToday.payouts.total), ctx.t('counter.count', { count: s.shopToday.payouts.count })) : ''}
${s.shopRole === 'manager' ? stat(ctx.t('admin.shops.cashNow'), money(ctx, s.shop.cashBalance), ctx.t('admin.shops.cashNote')) : ''}
${stat(ctx.t('counter.pendingNetwork'), money(ctx, s.pendingWithdrawals.total), ctx.t('counter.count', { count: s.pendingWithdrawals.count }))}
</div>
<p class="small muted">${ctx.t('counter.todayNote')}</p>
${card(html`<ul class="bullets"><li>${ctx.t('counter.rule1')}</li><li>${ctx.t('counter.rule2')}</li><li>${ctx.t('counter.rule3', { currency: s.shop.currency })}</li>${s.shop.maxDeposit ? html`<li>${ctx.t('admin.shops.maxDeposit')}: ${money(ctx, s.shop.maxDeposit)}</li>` : ''}${s.shop.maxPayout ? html`<li>${ctx.t('admin.shops.maxPayout')}: ${money(ctx, s.shop.maxPayout)}</li>` : ''}</ul>`, { title: ctx.t('counter.rulesTitle') })}`;
  return page(ctx, ctx.t('counter.title'), body);
}

// ---------------------------------------------------------------------------
function playerCard(ctx: PageCtx, p: CounterPlayerDTO): SafeHtml {
  return definitionList([
    [ctx.t('admin.players.name'), html`<b>${p.firstName} ${p.lastName}</b>`],
    [ctx.t('auth.register.username'), p.username],
    [ctx.t('account.accountNumber'), html`<bdi dir="ltr">${p.accountNo}</bdi>`],
    [ctx.t('account.accountCurrency'), p.currency ?? ''],
    [ctx.t('common.status'), statusBadge(ctx, p.status)],
  ]);
}

async function depositView(ctx: PageCtx, me: Me, state: FormState = emptyForm(), status = 200): Promise<PageResult> {
  const query = (ctx.url.searchParams.get('q') ?? state.values.q ?? '').trim().slice(0, 254);
  const selected = ctx.url.searchParams.get('player') ?? state.values.playerId ?? '';
  const results = query ? (await ctx.api.get<{ items: CounterPlayerDTO[] }>('/v1/shop/players', { q: query })).items : [];
  const player = results.find((p) => p.id === selected) ?? (results.length === 1 ? results[0] : undefined);
  const shopCurrency = me.shop?.currency ?? '';
  const body = html`${pageHeader(ctx.t('counter.nav.deposit'), { subtitle: ctx.t('counter.deposit.subtitle', { currency: shopCurrency }) })}
<div class="grid-2">
${card(html`<form method="get" class="form" role="search">
${field({ label: ctx.t('counter.findPlayer'), name: 'q', value: query, required: true, hint: ctx.t('counter.findHint'), dir: 'auto' })}
${button(ctx.t('common.search'), { kind: 'dark', iconName: 'search' })}</form>
${query && results.length === 0 ? alert('info', ctx.t('counter.noPlayer')) : ''}
${results.length > 1 ? html`<ul class="pick-list" role="list">${results.map((p) => html`<li><a href="${href(ctx, `/counter/deposit?q=${encodeURIComponent(query)}&player=${p.id}`)}"${p.id === player?.id ? html` aria-current="true"` : ''}><b>${p.firstName} ${p.lastName}</b> <span class="muted">@${p.username} · ${p.accountNo}</span></a></li>`)}</ul>` : ''}`, { title: ctx.t('counter.step1') })}
${player
  ? card(html`${playerCard(ctx, player)}
${player.currency !== shopCurrency ? alert('error', ctx.t('errors.codes.shop_currency_mismatch')) : player.status !== 'active' ? alert('warning', ctx.t('counter.playerNotActive')) : ''}
<form method="post" action="${href(ctx, '/counter/deposit')}" class="form">${csrfField(ctx)}${idempotencyField()}
<input type="hidden" name="playerId" value="${player.id}"><input type="hidden" name="q" value="${query}">
${formError(state)}
${field({ label: ctx.t('counter.deposit.amount', { currency: shopCurrency }), name: 'amount', value: state.values.amount, error: state.errors.amount, required: true, inputmode: 'decimal', dir: 'ltr', className: 'big-input' })}
${checkbox({ name: 'cashReceived', label: ctx.t('counter.deposit.cashReceived'), error: state.errors.cashReceived })}
${button(ctx.t('counter.deposit.submit'), { iconName: 'check', confirm: ctx.t('counter.deposit.confirm') })}</form>`, { title: ctx.t('counter.step2') })
  : ''}
</div>`;
  return page(ctx, ctx.t('counter.nav.deposit'), body, status);
}

async function depositPage(ctx: PageCtx): Promise<PageResult> {
  const me = guard(ctx);
  if (isResult(me)) return me;
  return depositView(ctx, me);
}

async function depositSubmit(ctx: PageCtx): Promise<PageResult> {
  const me = guard(ctx);
  if (isResult(me)) return me;
  const values = formValues(ctx, 'playerId', 'amount', 'q', 'idempotencyKey', 'cashReceived');
  if (values.cashReceived !== 'on') return depositView(ctx, me, { values, errors: { cashReceived: ctx.t('validation.required') }, message: ctx.t('counter.deposit.confirmCash') }, 422);
  try {
    const result = await ctx.api.post<CounterDepositResult>('/v1/shop/deposits', { playerId: values.playerId, amount: values.amount, idempotencyKey: values.idempotencyKey });
    return redirect(href(ctx, `/counter/receipt/${result.cashEntry.id}`), { kind: 'success', key: 'counter.deposit.done' });
  } catch (error) {
    const state = formFromError(ctx, error, values);
    if (error instanceof ApiError && !state.errors.amount) state.errors.amount = state.message ?? '';
    return depositView(ctx, me, state, 422);
  }
}

// ---------------------------------------------------------------------------
function payoutLookupForm(ctx: PageCtx, state: FormState): SafeHtml {
  return html`<form method="post" action="${href(ctx, '/counter/payout')}" class="form">${csrfField(ctx)}${formError(state)}
${field({ label: ctx.t('counter.payout.code'), name: 'code', value: state.values.code, error: state.errors.code, required: true, dir: 'ltr', placeholder: 'XXXXX-XXXXX', className: 'big-input', autocomplete: 'off' })}
${field({ label: ctx.t('counter.payout.account'), name: 'account', value: state.values.account, error: state.errors.account, required: true, dir: 'ltr', hint: ctx.t('counter.payout.accountHint'), autocomplete: 'off' })}
${button(ctx.t('counter.payout.find'), { kind: 'dark', iconName: 'search' })}</form>`;
}

async function payoutPage(ctx: PageCtx): Promise<PageResult> {
  const me = guard(ctx);
  if (isResult(me)) return me;
  const body = html`${pageHeader(ctx.t('counter.nav.payout'), { subtitle: ctx.t('counter.payout.subtitle') })}
<div class="grid-2">${card(payoutLookupForm(ctx, emptyForm()), { title: ctx.t('counter.step1') })}${card(html`<ol class="bullets"><li>${ctx.t('counter.payout.rule1')}</li><li>${ctx.t('counter.payout.rule2')}</li><li>${ctx.t('counter.payout.rule3')}</li></ol>`, { title: ctx.t('counter.rulesTitle') })}</div>`;
  return page(ctx, ctx.t('counter.nav.payout'), body);
}

async function payoutLookup(ctx: PageCtx): Promise<PageResult> {
  const me = guard(ctx);
  if (isResult(me)) return me;
  const values = formValues(ctx, 'code', 'account');
  let found: PayoutLookupDTO;
  try {
    found = await ctx.api.post<PayoutLookupDTO>('/v1/shop/payouts/lookup', values);
  } catch (error) {
    const state = formFromError(ctx, error, values);
    return page(ctx, ctx.t('counter.nav.payout'), html`${pageHeader(ctx.t('counter.nav.payout'))}${card(payoutLookupForm(ctx, state), { title: ctx.t('counter.step1') })}`, 422);
  }
  return payoutConfirm(ctx, found, emptyForm());
}

function payoutConfirm(ctx: PageCtx, found: PayoutLookupDTO, state: FormState, status = 200): PageResult {
  const w = found.withdrawal;
  const p = found.player;
  const body = html`${pageHeader(ctx.t('counter.nav.payout'), { back: { href: href(ctx, '/counter/payout'), label: ctx.t('counter.payout.another') } })}
<div class="grid-2">
${card(html`<p class="payout-amount">${money(ctx, w.amount)}</p>
${definitionList([
    [ctx.t('withdrawals.pickupCode'), html`<span class="code-inline" dir="ltr">${w.code}</span>`],
    [ctx.t('common.status'), statusBadge(ctx, w.status)],
    [ctx.t('withdrawals.requestedAt'), date(ctx, w.createdAt)],
    [ctx.t('withdrawals.validUntilShort'), date(ctx, w.expiresAt)],
  ])}`, { title: ctx.t('withdrawals.title') })}
${card(html`${alert('warning', ctx.t('counter.payout.checkId'))}
${definitionList([
    [ctx.t('admin.players.name'), html`<b class="big">${p.firstName} ${p.lastName}</b>`],
    [ctx.t('auth.register.dateOfBirth'), html`<b dir="ltr">${p.dateOfBirth ?? ''}</b>`],
    [ctx.t('auth.register.country'), countryName(ctx.locale, p.country)],
    [ctx.t('account.accountNumber'), html`<bdi dir="ltr">${p.accountNo}</bdi>`],
    [ctx.t('auth.register.username'), p.username],
  ])}`, { title: ctx.t('counter.payout.identity') })}
</div>
${found.payable
  ? card(html`<form method="post" action="${href(ctx, `/counter/payout/${w.id}`)}" class="form">${csrfField(ctx)}${formError(state)}
<input type="hidden" name="code" value="${w.code}"><input type="hidden" name="account" value="${p.accountNo}">
${checkbox({ name: 'idChecked', label: ctx.t('counter.payout.idChecked'), error: state.errors.idChecked })}
${field({ label: ctx.t('counter.payout.note'), name: 'note', value: state.values.note, maxlength: 300, hint: ctx.t('counter.payout.noteHint') })}
${button(ctx.t('counter.payout.pay', { amount: '' }).trim(), { iconName: 'cash', confirm: ctx.t('counter.payout.confirm') })}</form>`, { title: ctx.t('counter.step2') })
  : alert('error', ctx.t(`errors.codes.${found.blockedBy ?? 'withdrawal_not_pending'}`))}`;
  return page(ctx, ctx.t('counter.nav.payout'), body, status);
}

async function payoutSubmit(ctx: PageCtx, params: Record<string, string>): Promise<PageResult> {
  const me = guard(ctx);
  if (isResult(me)) return me;
  const id = params.id ?? '';
  if (!/^\d{1,18}$/.test(id)) return errorPage(ctx, 404);
  const values = formValues(ctx, 'idChecked', 'note', 'code', 'account');
  try {
    const result = await ctx.api.post<PayoutResult>(`/v1/shop/payouts/${id}`, { idChecked: values.idChecked === 'on', ...(values.note ? { note: values.note } : {}) });
    return redirect(href(ctx, `/counter/receipt/${result.cashEntry.id}`), { kind: 'success', key: 'counter.payout.done' });
  } catch (error) {
    const state = formFromError(ctx, error, values);
    if (state.errors.idChecked) state.errors.idChecked = ctx.t('counter.payout.idRequired');
    const found = await ctx.api.post<PayoutLookupDTO>('/v1/shop/payouts/lookup', { code: values.code, account: values.account });
    return payoutConfirm(ctx, found, state, 422);
  }
}

// ---------------------------------------------------------------------------
function newPlayerForm(ctx: PageCtx, state: FormState): SafeHtml {
  const pc = ctx.publicConfig;
  const v = state.values;
  const e = state.errors;
  const countries = pc.countries.map((c) => ({ ...c, name: countryName(ctx.locale, c.code) })).sort((a, b) => a.name.localeCompare(b.name, ctx.locale));
  const codes = [...new Map(pc.countries.map((c) => [c.callingCode, c])).values()];
  return html`<form method="post" action="${href(ctx, '/counter/new-player')}" class="form">${csrfField(ctx)}${formError(state)}
<div class="form-grid">
${field({ label: ctx.t('auth.register.firstName'), name: 'firstName', value: v.firstName, error: e.firstName, required: true })}
${field({ label: ctx.t('auth.register.lastName'), name: 'lastName', value: v.lastName, error: e.lastName, required: true })}
${field({ label: ctx.t('auth.register.dateOfBirth'), name: 'dateOfBirth', type: 'date', value: v.dateOfBirth, error: e.dateOfBirth, required: true })}
${select({ label: ctx.t('auth.register.country'), name: 'country', value: v.country || pc.countries[0]?.code || '', error: e.country, options: countries.map((c) => ({ value: c.code, label: c.name })) })}
${field({ label: ctx.t('auth.register.username'), name: 'username', value: v.username, error: e.username, required: true, dir: 'ltr' })}
${field({ label: ctx.t('auth.register.email'), name: 'email', type: 'email', value: v.email, error: e.email, required: true, dir: 'ltr' })}
<div class="field${e.mobile ? ' has-error' : ''}"><label for="f-mobile">${ctx.t('auth.register.mobile')}</label><div class="phone-row" dir="ltr">
<select name="callingCode" aria-label="${ctx.t('auth.register.countryCode')}">${codes.map((c) => html`<option value="${c.callingCode}"${c.callingCode === (v.callingCode || pc.countries[0]?.callingCode) ? html` selected` : ''}>+${c.callingCode}</option>`)}</select>
<input id="f-mobile" name="mobile" type="tel" value="${v.mobile ?? ''}" required></div>${e.mobile ? html`<p class="field-error">${e.mobile}</p>` : ''}</div>
</div>
<p class="small muted">${ctx.t('counter.newPlayer.currencyNote', { currency: ctx.me?.shop?.currency ?? '' })}</p>
${checkbox({ name: 'termsAcceptedInPerson', label: ctx.t('counter.newPlayer.terms'), error: e.termsAcceptedInPerson })}
${button(ctx.t('counter.newPlayer.submit'), { iconName: 'user' })}</form>`;
}

async function newPlayerPage(ctx: PageCtx): Promise<PageResult> {
  const me = guard(ctx);
  if (isResult(me)) return me;
  return page(ctx, ctx.t('counter.nav.newPlayer'), html`${pageHeader(ctx.t('counter.nav.newPlayer'), { subtitle: ctx.t('counter.newPlayer.subtitle') })}${card(newPlayerForm(ctx, emptyForm()))}`);
}

async function newPlayerSubmit(ctx: PageCtx): Promise<PageResult> {
  const me = guard(ctx);
  if (isResult(me)) return me;
  const values = formValues(ctx, 'firstName', 'lastName', 'dateOfBirth', 'country', 'username', 'email', 'callingCode', 'mobile', 'termsAcceptedInPerson');
  try {
    const result = await ctx.api.post<{ player: CounterPlayerDTO; temporaryPassword: string }>('/v1/shop/players', { ...values, termsAcceptedInPerson: values.termsAcceptedInPerson === 'on', preferredLocale: ctx.locale });
    const p = result.player;
    const body = html`${pageHeader(ctx.t('counter.newPlayer.created'))}
${alert('success', ctx.t('counter.newPlayer.createdText', { name: `${p.firstName} ${p.lastName}` }))}
<div class="grid-2">${card(playerCard(ctx, p))}
${card(html`<div class="secret-box"><p class="small">${ctx.t('admin.common.temporaryPassword')}</p><p class="code" dir="ltr">${result.temporaryPassword}</p>${copyButton(ctx, result.temporaryPassword)}<p class="small muted">${ctx.t('counter.newPlayer.passwordNote')}</p></div>`)}</div>
<p>${linkButton(ctx.t('counter.nav.deposit'), href(ctx, `/counter/deposit?q=${encodeURIComponent(p.accountNo)}`), { iconName: 'plus' })}</p>`;
    return page(ctx, ctx.t('counter.newPlayer.created'), body);
  } catch (error) {
    return page(ctx, ctx.t('counter.nav.newPlayer'), html`${pageHeader(ctx.t('counter.nav.newPlayer'))}${card(newPlayerForm(ctx, formFromError(ctx, error, values)))}`, 422);
  }
}

// ---------------------------------------------------------------------------
async function transactionsPage(ctx: PageCtx): Promise<PageResult> {
  const me = guard(ctx);
  if (isResult(me)) return me;
  const manager = me.shop?.role === 'manager';
  const scope = manager && ctx.url.searchParams.get('scope') === 'shop' ? 'shop' : 'mine';
  const before = ctx.url.searchParams.get('before') ?? '';
  const list = await ctx.api.get<Page<ShopCashEntryDTO>>('/v1/shop/transactions', { scope, before: /^\d+$/.test(before) ? before : undefined, limit: 50 });
  const body = html`${pageHeader(ctx.t('counter.nav.transactions'))}
${manager ? html`<nav class="tabs"><ul role="list"><li><a href="${href(ctx, '/counter/transactions')}"${scope === 'mine' ? html` class="active"` : ''}>${ctx.t('counter.mine')}</a></li><li><a href="${href(ctx, '/counter/transactions?scope=shop')}"${scope === 'shop' ? html` class="active"` : ''}>${ctx.t('counter.wholeShop')}</a></li></ul></nav>` : ''}
${card(html`${table<ShopCashEntryDTO>(
    [
      { label: ctx.t('wallet.columns.date'), cell: (c) => html`<a href="${href(ctx, `/counter/receipt/${c.id}`)}">${date(ctx, c.createdAt)}</a>` },
      { label: ctx.t('wallet.columns.type'), cell: (c) => ctx.t(`admin.shopCash.types.${c.entryType}`) },
      { label: ctx.t('wallet.columns.amount'), cell: (c) => signedMoney(ctx, c.amount, c.direction), className: 'num' },
      { label: ctx.t('admin.players.player'), cell: (c) => (c.player ? html`${c.player.firstName} ${c.player.lastName} <span class="small muted">${c.player.accountNo}</span>` : '') },
      { label: ctx.t('wallet.columns.operator'), cell: (c) => c.operator.username },
      { label: ctx.t('wallet.columns.reference'), cell: (c) => c.withdrawal?.code ?? c.reference ?? '' },
    ],
    list.items,
    ctx.t('counter.noMovements'),
  )}${cursorPager(ctx, list.nextCursor)}`)}`;
  return page(ctx, ctx.t('counter.nav.transactions'), body);
}

async function receiptPage(ctx: PageCtx, params: Record<string, string>): Promise<PageResult> {
  const me = guard(ctx);
  if (isResult(me)) return me;
  const id = params.id ?? '';
  if (!/^\d{1,18}$/.test(id)) return errorPage(ctx, 404);
  const { entry, shop } = await ctx.api.get<{ entry: ShopCashEntryDTO; shop: ShopDTO }>(`/v1/shop/receipts/${id}`);
  const body = html`<div class="receipt-actions no-print container narrow">${linkButton(ctx.t('common.back'), href(ctx, '/counter'), { kind: 'ghost', iconName: 'left' })}<button type="button" class="btn btn-gold" data-print>${icon('print')}<span>${ctx.t('counter.receipt.print')}</span></button></div>
<article class="receipt">
<header>${logoMark()}<h1>${ctx.t('meta.siteName')}</h1><p>${shop.name} · ${shop.code}</p><p class="small">${[shop.address, shop.city].filter(Boolean).join(', ')}</p></header>
<h2>${ctx.t(`admin.shopCash.types.${entry.entryType}`)}</h2>
<p class="receipt-amount">${money(ctx, entry.amount)}</p>
${definitionList([
    [ctx.t('counter.receipt.number'), html`<bdi dir="ltr">${entry.id}</bdi>`],
    [ctx.t('wallet.columns.date'), dateText(ctx, entry.createdAt)],
    ...(entry.player ? ([[ctx.t('admin.players.player'), `${entry.player.firstName} ${entry.player.lastName}`], [ctx.t('account.accountNumber'), entry.player.accountNo]] as [string, string][]) : []),
    ...(entry.withdrawal ? ([[ctx.t('withdrawals.pickupCode'), entry.withdrawal.code]] as [string, string][]) : []),
    [ctx.t('counter.receipt.cashier'), entry.operator.username],
  ])}
<p class="small">${ctx.t('counter.receipt.footer')}</p>
<p class="small">18+ · ${ctx.t('footer.playResponsibly')}</p>
</article>`;
  return htmlPage(bareLayout(ctx, { title: ctx.t('counter.receipt.title'), body, bodyClass: 'receipt-page' }));
}

async function cashCountView(ctx: PageCtx, state: FormState = emptyForm(), status = 200): Promise<PageResult> {
  const [summary, counts] = await Promise.all([ctx.api.get<CounterSummaryDTO>('/v1/shop/summary'), ctx.api.get<{ items: CashCountDTO[] }>('/v1/shop/cash-counts')]);
  const body = html`${pageHeader(ctx.t('counter.nav.cashCount'), { subtitle: ctx.t('counter.cashCount.subtitle') })}
<div class="grid-2">
${card(html`${stat(ctx.t('admin.counts.expected'), money(ctx, summary.shop.cashBalance))}
<form method="post" action="${href(ctx, '/counter/cash-count')}" class="form">${csrfField(ctx)}${formError(state)}
${field({ label: ctx.t('admin.counts.counted', { currency: summary.shop.currency }), name: 'counted', value: state.values.counted, error: state.errors.counted, required: true, inputmode: 'decimal', dir: 'ltr', className: 'big-input' })}
${field({ label: ctx.t('admin.counts.note'), name: 'note', value: state.values.note, maxlength: 500 })}
${button(ctx.t('admin.counts.record'))}</form>`)}
${card(table<CashCountDTO>(
    [
      { label: ctx.t('wallet.columns.date'), cell: (c) => date(ctx, c.createdAt) },
      { label: ctx.t('admin.counts.expected'), cell: (c) => money(ctx, c.expected), className: 'num' },
      { label: ctx.t('admin.counts.countedShort'), cell: (c) => money(ctx, c.counted), className: 'num' },
      { label: ctx.t('admin.counts.difference'), cell: (c) => money(ctx, c.difference), className: 'num' },
      { label: ctx.t('wallet.columns.operator'), cell: (c) => c.countedBy.username },
    ],
    counts.items,
    ctx.t('admin.counts.none'),
  ), { title: ctx.t('admin.counts.title') })}
</div>`;
  return page(ctx, ctx.t('counter.nav.cashCount'), body, status);
}

async function cashCountPage(ctx: PageCtx): Promise<PageResult> {
  const me = guard(ctx, true);
  if (isResult(me)) return me;
  return cashCountView(ctx);
}

async function cashCountSubmit(ctx: PageCtx): Promise<PageResult> {
  const me = guard(ctx, true);
  if (isResult(me)) return me;
  const values = formValues(ctx, 'counted', 'note');
  try {
    await ctx.api.post('/v1/shop/cash-counts', { counted: values.counted, ...(values.note ? { note: values.note } : {}) });
    return redirect(href(ctx, '/counter/cash-count'), { kind: 'success', key: 'admin.counts.done' });
  } catch (error) {
    const state = formFromError(ctx, error, values);
    if (!state.errors.counted) state.errors.counted = state.message ?? '';
    return cashCountView(ctx, state, 422);
  }
}

const get = (path: string, handler: WebRoute['handler']): WebRoute => ({ method: 'GET', path, handler });
const post = (path: string, handler: WebRoute['handler']): WebRoute => ({ method: 'POST', path, handler });

export const counterRoutes: WebRoute[] = [
  get('/counter', home),
  get('/counter/deposit', depositPage),
  post('/counter/deposit', depositSubmit),
  get('/counter/payout', payoutPage),
  post('/counter/payout', payoutLookup),
  post('/counter/payout/:id', payoutSubmit),
  get('/counter/new-player', newPlayerPage),
  post('/counter/new-player', newPlayerSubmit),
  get('/counter/transactions', transactionsPage),
  get('/counter/receipt/:id', receiptPage),
  get('/counter/cash-count', cashCountPage),
  post('/counter/cash-count', cashCountSubmit),
];
