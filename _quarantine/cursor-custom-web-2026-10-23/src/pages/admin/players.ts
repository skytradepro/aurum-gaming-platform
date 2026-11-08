/** Players: search, detail, status and contact changes, temporary password, balance operations and statement. */
import { ApiError } from '../../api.ts';
import { can, countryName, date, href, money, redirect, signedMoney } from '../../context.ts';
import type { PageCtx, PageResult } from '../../context.ts';
import { html } from '../../html.ts';
import type { SafeHtml } from '../../html.ts';
import {
  alert,
  button,
  card,
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
  statusBadge,
  table,
  textarea,
} from '../../layout/components.ts';
import type { FormState } from '../../layout/components.ts';
import type { LedgerEntryDTO, Page, PlayerDetailDTO, PlayerListItemDTO, StaffWithdrawalDTO } from '../../types.ts';
import { adminPage, guard, isResult, oneTimeSecret, q, UUID_RE } from './common.ts';

export async function playersPage(ctx: PageCtx): Promise<PageResult> {
  const me = guard(ctx, 'users.view', 'users.manage', 'balances.view', 'balances.manage');
  if (isResult(me)) return me;
  const search = (ctx.url.searchParams.get('q') ?? '').trim().slice(0, 60);
  const status = q(ctx, 'status', /^(active|suspended|closed)$/);
  const page = await ctx.api.get<Page<PlayerListItemDTO>>('/v1/admin/players', { q: search || undefined, status, before: q(ctx, 'before', /^\d+$/), limit: 25 });
  const body = html`${pageHeader(ctx.t('admin.nav.players'), { subtitle: ctx.t('admin.players.subtitle') })}
<form class="filters" method="get" role="search">
<label class="filter grow"><span>${ctx.t('common.search')}</span><input type="search" name="q" value="${search}" placeholder="${ctx.t('admin.players.searchHint')}"></label>
<label class="filter"><span>${ctx.t('common.status')}</span><select name="status"><option value="">${ctx.t('common.all')}</option>${['active', 'suspended', 'closed'].map((s) => html`<option value="${s}"${s === status ? html` selected` : ''}>${ctx.t(`status.${s}`)}</option>`)}</select></label>
<button class="btn btn-dark" type="submit">${ctx.t('common.search')}</button>
</form>
${card(html`${table<PlayerListItemDTO>(
    [
      { label: ctx.t('account.accountNumber'), cell: (p) => html`<a href="${href(ctx, `/admin/players/${p.id}`)}"><bdi dir="ltr">${p.accountNo}</bdi></a>` },
      { label: ctx.t('auth.register.username'), cell: (p) => html`<a href="${href(ctx, `/admin/players/${p.id}`)}">${p.username}</a>` },
      { label: ctx.t('admin.players.name'), cell: (p) => `${p.firstName} ${p.lastName}` },
      { label: ctx.t('auth.register.country'), cell: (p) => countryName(ctx.locale, p.country) },
      { label: ctx.t('wallet.balance'), cell: (p) => (p.balance ? money(ctx, p.balance) : '—'), className: 'num' },
      { label: ctx.t('common.status'), cell: (p) => statusBadge(ctx, p.status) },
      { label: ctx.t('admin.players.created'), cell: (p) => date(ctx, p.createdAt, false) },
    ],
    page.items,
    ctx.t('common.noResults'),
  )}${cursorPager(ctx, page.nextCursor)}`)}`;
  return adminPage(ctx, ctx.t('admin.nav.players'), body);
}

interface DetailForms {
  balance?: FormState;
  status?: FormState;
  contact?: FormState;
  secret?: string;
  notice?: SafeHtml;
}

export function ledgerTable(ctx: PageCtx, items: readonly LedgerEntryDTO[], withPlayer = false): SafeHtml {
  return table<LedgerEntryDTO>(
    [
      { label: ctx.t('wallet.columns.date'), cell: (e) => date(ctx, e.createdAt) },
      ...(withPlayer ? [{ label: ctx.t('admin.players.player'), cell: (e: LedgerEntryDTO) => html`<a href="${href(ctx, `/admin/players/${e.userId}`)}">${e.username}</a>` }] : []),
      { label: ctx.t('wallet.columns.type'), cell: (e) => ctx.t(`wallet.entryTypes.${e.entryType}`) },
      { label: ctx.t('wallet.columns.amount'), cell: (e) => signedMoney(ctx, e.amount, e.direction), className: 'num' },
      { label: ctx.t('wallet.columns.balanceBefore'), cell: (e) => money(ctx, e.balanceBefore), className: 'num' },
      { label: ctx.t('wallet.columns.balanceAfter'), cell: (e) => money(ctx, e.balanceAfter), className: 'num' },
      { label: ctx.t('wallet.columns.operator'), cell: (e) => e.operator?.username ?? html`<span class="muted">${ctx.t('admin.ledger.system')}</span>` },
      { label: ctx.t('wallet.columns.reference'), cell: (e) => html`${e.reference ?? ''}${e.original ? html`<br><span class="small muted">${money(ctx, e.original.amount)} × ${e.original.rate}</span>` : ''}` },
      { label: ctx.t('wallet.columns.reason'), cell: (e) => e.reason ?? '' },
    ],
    items,
    ctx.t('wallet.empty'),
  );
}

async function detail(ctx: PageCtx, id: string, forms: DetailForms = {}, status = 200): Promise<PageResult> {
  const me = ctx.me;
  const canLedger = can(me, 'balances.view', 'balances.manage');
  const [{ player }, ledger, withdrawals] = await Promise.all([
    ctx.api.get<{ player: PlayerDetailDTO }>(`/v1/admin/players/${id}`),
    canLedger ? ctx.api.get<Page<LedgerEntryDTO>>(`/v1/admin/players/${id}/ledger`, { before: q(ctx, 'before', /^\d+$/), limit: 25 }) : Promise.resolve(null),
    can(me, 'withdrawals.view', 'withdrawals.manage', 'shops.view', 'shops.manage') ? ctx.api.get<Page<StaffWithdrawalDTO>>('/v1/admin/withdrawals', { userId: id, limit: 10 }) : Promise.resolve(null),
  ]);
  const manageUsers = can(me, 'users.manage');
  const manageBalance = can(me, 'balances.manage');
  const otherCurrencies = ctx.publicConfig.currencies.filter((c) => c.code !== player.accountCurrency);
  const bal = forms.balance ?? emptyForm({ entryType: 'deposit' });
  const st = forms.status ?? emptyForm({ status: player.status });
  const ct = forms.contact ?? emptyForm({ firstName: player.firstName, lastName: player.lastName, email: player.email });

  const balanceForm = html`<form method="post" action="${href(ctx, `/admin/players/${id}/balance`)}" class="form">
${csrfField(ctx)}${idempotencyField()}${formError(bal)}
<div class="form-grid">
${select({ label: ctx.t('admin.balance.operation'), name: 'entryType', value: bal.values.entryType, options: ['deposit', 'withdrawal', 'adjustment_credit', 'adjustment_debit'].map((tp) => ({ value: tp, label: ctx.t(`wallet.entryTypes.${tp}`) })) })}
${field({ label: ctx.t('admin.balance.amount', { currency: player.accountCurrency ?? '' }), name: 'amount', value: bal.values.amount, error: bal.errors.amount, inputmode: 'decimal', dir: 'ltr', hint: ctx.t('admin.balance.amountHint') })}
${field({ label: ctx.t('wallet.columns.reference'), name: 'reference', value: bal.values.reference, error: bal.errors.reference, maxlength: 200 })}
${field({ label: ctx.t('wallet.columns.reason'), name: 'reason', value: bal.values.reason, error: bal.errors.reason, maxlength: 500, hint: ctx.t('admin.balance.reasonHint') })}
</div>
${otherCurrencies.length
  ? html`<details class="more"><summary>${ctx.t('admin.balance.otherCurrency')}</summary><div class="form-grid">
${select({ label: ctx.t('admin.balance.originalCurrency'), name: 'originalCurrency', value: bal.values.originalCurrency, empty: '—', options: otherCurrencies.map((c) => ({ value: c.code, label: c.code })) })}
${field({ label: ctx.t('admin.balance.originalAmount'), name: 'originalAmount', value: bal.values.originalAmount, error: bal.errors['original.amount'], inputmode: 'decimal', dir: 'ltr' })}
${field({ label: ctx.t('admin.balance.rate', { to: player.accountCurrency ?? '' }), name: 'rate', value: bal.values.rate, error: bal.errors['original.rate'], inputmode: 'decimal', dir: 'ltr', hint: ctx.t('admin.balance.rateHint') })}
</div></details>`
  : ''}
${button(ctx.t('admin.balance.submit'), { iconName: 'ledger', confirm: ctx.t('admin.balance.confirm') })}
</form>`;

  const statusForm = html`<form method="post" action="${href(ctx, `/admin/players/${id}/status`)}" class="form">
${csrfField(ctx)}${formError(st)}
${select({ label: ctx.t('common.status'), name: 'status', value: st.values.status, error: st.errors.status, options: ['active', 'suspended', 'closed'].map((s) => ({ value: s, label: ctx.t(`status.${s}`), disabled: player.status === 'closed' && s !== 'closed' })) })}
${field({ label: ctx.t('wallet.columns.reason'), name: 'reason', value: st.values.reason, error: st.errors.reason, required: true })}
${button(ctx.t('admin.players.changeStatus'), { kind: 'dark', confirm: ctx.t('admin.players.statusConfirm') })}
</form>`;

  const contactForm = html`<form method="post" action="${href(ctx, `/admin/players/${id}/contact`)}" class="form">
${csrfField(ctx)}${formError(ct)}
<div class="form-grid">
${field({ label: ctx.t('auth.register.firstName'), name: 'firstName', value: ct.values.firstName, error: ct.errors.firstName })}
${field({ label: ctx.t('auth.register.lastName'), name: 'lastName', value: ct.values.lastName, error: ct.errors.lastName })}
${field({ label: ctx.t('auth.register.email'), name: 'email', type: 'email', value: ct.values.email, error: ct.errors.email, dir: 'ltr' })}
${field({ label: ctx.t('admin.players.newPhone'), name: 'mobile', value: ct.values.mobile, error: ct.errors.mobile, dir: 'ltr', placeholder: '+216 20 123 456', hint: ctx.t('admin.players.phoneHint') })}
</div>
${button(ctx.t('common.save'), { kind: 'dark' })}
</form>`;

  const body = html`${pageHeader(`${player.firstName} ${player.lastName}`, { subtitle: html`@${player.username} · ${ctx.t('account.accountNumber')} <bdi dir="ltr">${player.accountNo}</bdi>`, back: { href: href(ctx, '/admin/players'), label: ctx.t('admin.nav.players') } })}
${forms.notice ?? ''}
${forms.secret ? oneTimeSecret(ctx, ctx.t('admin.common.temporaryPassword'), forms.secret, ctx.t('admin.common.temporaryPasswordNote')) : ''}
<div class="grid-2">
${card(definitionList([
    [ctx.t('common.status'), statusBadge(ctx, player.status)],
    [ctx.t('wallet.balance'), player.balance ? money(ctx, player.balance) : '—'],
    [ctx.t('auth.register.email'), html`<bdi dir="ltr">${player.email}</bdi>`],
    [ctx.t('auth.register.mobile'), html`<bdi dir="ltr">${player.phone ?? ''}</bdi>`],
    [ctx.t('auth.register.dateOfBirth'), player.dateOfBirth ?? ''],
    [ctx.t('auth.register.country'), countryName(ctx.locale, player.country)],
    [ctx.t('account.accountCurrency'), player.accountCurrency ?? ''],
    [ctx.t('account.preferredLanguage'), player.preferredLocale ?? ''],
    [ctx.t('admin.players.terms'), player.termsAcceptedAt ? html`${date(ctx, player.termsAcceptedAt)} (v${player.termsVersion ?? ''})` : ''],
    [ctx.t('admin.players.created'), date(ctx, player.createdAt)],
    [ctx.t('admin.players.lastLogin'), date(ctx, player.lastLoginAt)],
    [ctx.t('admin.players.failedLogins'), String(player.failedLoginCount)],
  ]), { title: ctx.t('admin.players.details') })}
${manageBalance ? card(balanceForm, { title: ctx.t('admin.balance.title') }) : ''}
</div>
${manageUsers
  ? html`<div class="grid-2">
${card(statusForm, { title: ctx.t('admin.players.statusTitle') })}
${card(html`${contactForm}<hr><form method="post" action="${href(ctx, `/admin/players/${id}/reset-password`)}">${csrfField(ctx)}<p class="small muted">${ctx.t('admin.players.resetNote')}</p>${button(ctx.t('admin.common.resetPassword'), { kind: 'ghost', iconName: 'key', confirm: ctx.t('admin.common.resetConfirm') })}</form>`, { title: ctx.t('admin.players.contactTitle') })}
</div>`
  : ''}
${withdrawals ? card(withdrawalMini(ctx, withdrawals.items), { title: ctx.t('admin.nav.withdrawals'), actions: html`<a class="link-more" href="${href(ctx, `/admin/withdrawals?userId=${id}`)}">${ctx.t('common.viewAll')}</a>` }) : ''}
${ledger ? card(html`${ledgerTable(ctx, ledger.items)}${cursorPager(ctx, ledger.nextCursor)}`, { title: ctx.t('wallet.history'), actions: html`<a class="link-more" href="${href(ctx, `/admin/ledger.csv?userId=${id}`)}">${ctx.t('common.export')} CSV</a>` }) : ''}`;
  return adminPage(ctx, `${player.username}`, body, status);
}

export function withdrawalMini(ctx: PageCtx, items: readonly StaffWithdrawalDTO[]): SafeHtml {
  return table<StaffWithdrawalDTO>(
    [
      { label: ctx.t('wallet.columns.date'), cell: (w) => html`<a href="${href(ctx, `/admin/withdrawals/${w.id}`)}">${date(ctx, w.createdAt)}</a>` },
      { label: ctx.t('wallet.columns.amount'), cell: (w) => money(ctx, w.amount), className: 'num' },
      { label: ctx.t('common.status'), cell: (w) => statusBadge(ctx, w.status) },
      { label: ctx.t('admin.shops.shop'), cell: (w) => w.paidShop?.code ?? w.preferredShop?.code ?? '' },
    ],
    items,
    ctx.t('withdrawals.none'),
  );
}

function playerId(params: Record<string, string>): string | null {
  const id = params.id ?? '';
  return UUID_RE.test(id) ? id : null;
}

export async function playerPage(ctx: PageCtx, params: Record<string, string>): Promise<PageResult> {
  const me = guard(ctx, 'users.view', 'users.manage', 'balances.view', 'balances.manage');
  if (isResult(me)) return me;
  const id = playerId(params);
  if (!id) throw new ApiError(404, { code: 'user_not_found' });
  return detail(ctx, id);
}

export async function postBalance(ctx: PageCtx, params: Record<string, string>): Promise<PageResult> {
  const me = guard(ctx, 'balances.manage');
  if (isResult(me)) return me;
  const id = playerId(params);
  if (!id) throw new ApiError(404, { code: 'user_not_found' });
  const values = formValues(ctx, 'entryType', 'amount', 'reference', 'reason', 'originalCurrency', 'originalAmount', 'rate', 'idempotencyKey');
  const useOriginal = values.originalCurrency !== '';
  try {
    await ctx.api.post(`/v1/admin/players/${id}/balance`, {
      entryType: values.entryType,
      ...(useOriginal ? { original: { amount: values.originalAmount, currency: values.originalCurrency, rate: values.rate } } : { amount: values.amount }),
      ...(values.reason ? { reason: values.reason } : {}),
      ...(values.reference ? { reference: values.reference } : {}),
      idempotencyKey: values.idempotencyKey,
    });
    return redirect(href(ctx, `/admin/players/${id}`), { kind: 'success', key: 'admin.balance.done' });
  } catch (error) {
    const state = formFromError(ctx, error, values);
    if (error instanceof ApiError && ['invalid_amount', 'too_many_decimals', 'ambiguous_separator', 'out_of_range', 'negative_not_allowed', 'insufficient_funds'].includes(error.code)) state.errors.amount = state.message ?? '';
    return detail(ctx, id, { balance: state }, 422);
  }
}

export async function postStatus(ctx: PageCtx, params: Record<string, string>): Promise<PageResult> {
  const me = guard(ctx, 'users.manage');
  if (isResult(me)) return me;
  const id = playerId(params);
  if (!id) throw new ApiError(404, { code: 'user_not_found' });
  const values = formValues(ctx, 'status', 'reason');
  try {
    await ctx.api.patch(`/v1/admin/players/${id}`, { status: values.status, reason: values.reason });
    return redirect(href(ctx, `/admin/players/${id}`), { kind: 'success', key: 'admin.players.statusSaved' });
  } catch (error) {
    return detail(ctx, id, { status: formFromError(ctx, error, values) }, 422);
  }
}

export async function postContact(ctx: PageCtx, params: Record<string, string>): Promise<PageResult> {
  const me = guard(ctx, 'users.manage');
  if (isResult(me)) return me;
  const id = playerId(params);
  if (!id) throw new ApiError(404, { code: 'user_not_found' });
  const values = formValues(ctx, 'firstName', 'lastName', 'email', 'mobile');
  const phone = values.mobile.replace(/[\s.()-]/g, '');
  const body: Record<string, string> = { firstName: values.firstName, lastName: values.lastName, email: values.email };
  if (phone) {
    // "+21620123456": the API takes calling code and national number separately; send the whole number as national with code 0-less split
    const m = /^\+(\d{1,3})(\d{4,14})$/.exec(phone);
    if (!m) return detail(ctx, id, { contact: { values, errors: { mobile: ctx.t('validation.invalidPhone') } } }, 422);
    body.callingCode = m[1] as string;
    body.mobile = m[2] as string;
  }
  try {
    await ctx.api.patch(`/v1/admin/players/${id}`, body);
    return redirect(href(ctx, `/admin/players/${id}`), { kind: 'success', key: 'common.saved' });
  } catch (error) {
    return detail(ctx, id, { contact: formFromError(ctx, error, values) }, 422);
  }
}

export async function postResetPassword(ctx: PageCtx, params: Record<string, string>): Promise<PageResult> {
  const me = guard(ctx, 'users.manage');
  if (isResult(me)) return me;
  const id = playerId(params);
  if (!id) throw new ApiError(404, { code: 'user_not_found' });
  const result = await ctx.api.post<{ temporaryPassword: string }>(`/v1/admin/players/${id}/reset-password`);
  return detail(ctx, id, { secret: result.temporaryPassword, notice: alert('success', ctx.t('admin.common.passwordReset')) });
}
