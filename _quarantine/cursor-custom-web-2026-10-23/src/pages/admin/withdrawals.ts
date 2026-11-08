/** Withdrawals collected at shops: list, detail, rejection (returns the money to the player). */
import { ApiError } from '../../api.ts';
import { can, date, href, money, redirect } from '../../context.ts';
import type { PageCtx, PageResult } from '../../context.ts';
import { html } from '../../html.ts';
import { button, card, csrfField, cursorPager, definitionList, emptyForm, field, formError, formFromError, formValues, pageHeader, statusBadge, table } from '../../layout/components.ts';
import type { FormState } from '../../layout/components.ts';
import type { Page, StaffWithdrawalDTO } from '../../types.ts';
import { adminPage, guard, ID_RE, isResult, q, UUID_RE } from './common.ts';

const STATUSES = ['pending', 'paid', 'cancelled', 'rejected', 'expired'];

export async function withdrawalsPage(ctx: PageCtx): Promise<PageResult> {
  const me = guard(ctx, 'withdrawals.view', 'withdrawals.manage', 'shops.view', 'shops.manage');
  if (isResult(me)) return me;
  const status = q(ctx, 'status', /^(pending|paid|cancelled|rejected|expired)$/);
  const userId = q(ctx, 'userId', UUID_RE);
  const page = await ctx.api.get<Page<StaffWithdrawalDTO>>('/v1/admin/withdrawals', { status, userId, shopId: q(ctx, 'shopId', ID_RE), before: q(ctx, 'before', /^\d+$/), limit: 50 });
  const body = html`${pageHeader(ctx.t('admin.nav.withdrawals'), { subtitle: ctx.t('admin.withdrawals.subtitle') })}
<nav class="tabs"><ul role="list"><li><a href="${href(ctx, '/admin/withdrawals')}"${!status ? html` class="active" aria-current="page"` : ''}>${ctx.t('common.all')}</a></li>${STATUSES.map((s) => html`<li><a href="${href(ctx, `/admin/withdrawals?status=${s}`)}"${s === status ? html` class="active" aria-current="page"` : ''}>${ctx.t(`withdrawals.status.${s}`)}</a></li>`)}</ul></nav>
${card(html`${table<StaffWithdrawalDTO>(
    [
      { label: ctx.t('wallet.columns.date'), cell: (w) => html`<a href="${href(ctx, `/admin/withdrawals/${w.id}`)}">${date(ctx, w.createdAt)}</a>` },
      { label: ctx.t('admin.players.player'), cell: (w) => html`<a href="${href(ctx, `/admin/players/${w.player.id}`)}">${w.player.username}</a> <span class="small muted">${w.player.firstName} ${w.player.lastName}</span>` },
      { label: ctx.t('wallet.columns.amount'), cell: (w) => money(ctx, w.amount), className: 'num' },
      { label: ctx.t('common.status'), cell: (w) => statusBadge(ctx, w.status) },
      { label: ctx.t('withdrawals.validUntilShort'), cell: (w) => (w.status === 'pending' ? date(ctx, w.expiresAt) : '') },
      { label: ctx.t('admin.shops.shop'), cell: (w) => (w.paidShop ? html`${w.paidShop.code} <span class="small muted">${w.paidBy?.username ?? ''}</span>` : w.preferredShop ? html`<span class="muted">${w.preferredShop.code}</span>` : '') },
    ],
    page.items,
    ctx.t('withdrawals.none'),
  )}${cursorPager(ctx, page.nextCursor)}`)}`;
  return adminPage(ctx, ctx.t('admin.nav.withdrawals'), body);
}

async function detail(ctx: PageCtx, id: string, reject: FormState = emptyForm(), status = 200): Promise<PageResult> {
  const { withdrawal: w } = await ctx.api.get<{ withdrawal: StaffWithdrawalDTO }>(`/v1/admin/withdrawals/${id}`);
  const body = html`${pageHeader(`${ctx.t('withdrawals.title')} #${w.id}`, { back: { href: href(ctx, '/admin/withdrawals'), label: ctx.t('admin.nav.withdrawals') } })}
<div class="grid-2">
${card(definitionList([
    [ctx.t('common.status'), statusBadge(ctx, w.status)],
    [ctx.t('wallet.columns.amount'), money(ctx, w.amount)],
    [ctx.t('admin.players.player'), html`<a href="${href(ctx, `/admin/players/${w.player.id}`)}">${w.player.firstName} ${w.player.lastName}</a> (@${w.player.username}, <bdi dir="ltr">${w.player.accountNo}</bdi>)`],
    [ctx.t('withdrawals.pickupCode'), html`<span class="code-inline" dir="ltr">${w.code}</span>`],
    [ctx.t('withdrawals.requestedAt'), date(ctx, w.createdAt)],
    [ctx.t('withdrawals.validUntilShort'), date(ctx, w.expiresAt)],
    [ctx.t('withdrawals.preferredShop'), w.preferredShop ? `${w.preferredShop.code} — ${w.preferredShop.name}` : ctx.t('withdrawals.anyShop')],
    [ctx.t('admin.withdrawals.paidAt'), w.paidAt ? html`${date(ctx, w.paidAt)} · ${w.paidShop?.code ?? ''} · ${w.paidBy?.username ?? ''}` : ''],
    [ctx.t('admin.withdrawals.idCheck'), w.idCheckNote ?? ''],
    [ctx.t('admin.withdrawals.closed'), w.closedAt ? html`${date(ctx, w.closedAt)} · ${w.closedBy?.username ?? ctx.t('admin.ledger.system')}` : ''],
    [ctx.t('withdrawals.reason'), w.closeReason ?? ''],
  ]))}
${w.status === 'pending' && can(ctx.me, 'withdrawals.manage')
  ? card(html`<form method="post" action="${href(ctx, `/admin/withdrawals/${w.id}/reject`)}" class="form">${csrfField(ctx)}${formError(reject)}
<p class="muted small">${ctx.t('admin.withdrawals.rejectNote')}</p>
${field({ label: ctx.t('withdrawals.reason'), name: 'reason', value: reject.values.reason, error: reject.errors.reason, required: true, maxlength: 500 })}
${button(ctx.t('admin.withdrawals.reject'), { kind: 'danger', confirm: ctx.t('admin.withdrawals.rejectConfirm') })}</form>`, { title: ctx.t('admin.withdrawals.reject') })
  : ''}
</div>`;
  return adminPage(ctx, ctx.t('withdrawals.title'), body, status);
}

export async function withdrawalPage(ctx: PageCtx, params: Record<string, string>): Promise<PageResult> {
  const me = guard(ctx, 'withdrawals.view', 'withdrawals.manage', 'shops.view', 'shops.manage');
  if (isResult(me)) return me;
  if (!ID_RE.test(params.id ?? '')) throw new ApiError(404, { code: 'withdrawal_not_found' });
  return detail(ctx, params.id as string);
}

export async function rejectWithdrawal(ctx: PageCtx, params: Record<string, string>): Promise<PageResult> {
  const me = guard(ctx, 'withdrawals.manage');
  if (isResult(me)) return me;
  const id = params.id ?? '';
  if (!ID_RE.test(id)) throw new ApiError(404, { code: 'withdrawal_not_found' });
  const values = formValues(ctx, 'reason');
  try {
    await ctx.api.post(`/v1/admin/withdrawals/${id}/reject`, { reason: values.reason });
    return redirect(href(ctx, `/admin/withdrawals/${id}`), { kind: 'success', key: 'admin.withdrawals.rejected' });
  } catch (error) {
    return detail(ctx, id, formFromError(ctx, error, values), 422);
  }
}
