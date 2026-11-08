/** The full ledger with filters and CSV export, and the audit trail. */
import { date, href, moneyText } from '../../context.ts';
import type { PageCtx, PageResult } from '../../context.ts';
import { html } from '../../html.ts';
import { card, cursorPager, pageHeader, table } from '../../layout/components.ts';
import type { AuditEntryDTO, LedgerEntryDTO, Page } from '../../types.ts';
import { adminPage, dayStart, guard, isResult, q, UUID_RE } from './common.ts';
import { ledgerTable } from './players.ts';

const TYPES = ['deposit', 'withdrawal', 'adjustment_credit', 'adjustment_debit', 'withdrawal_request', 'withdrawal_release', 'bet_stake', 'bet_win', 'bet_refund', 'bonus_credit', 'bonus_debit'];

function ledgerQuery(ctx: PageCtx) {
  const type = ctx.url.searchParams.get('type') ?? '';
  return {
    userId: q(ctx, 'userId', UUID_RE),
    operatorId: q(ctx, 'operatorId', UUID_RE),
    currency: q(ctx, 'currency', /^[A-Z][A-Z0-9]{2,9}$/),
    type: TYPES.includes(type) ? type : undefined,
    from: dayStart(q(ctx, 'from', /^\d{4}-\d{2}-\d{2}$/)),
    to: dayStart(q(ctx, 'to', /^\d{4}-\d{2}-\d{2}$/), 1),
  };
}

export async function ledgerPage(ctx: PageCtx): Promise<PageResult> {
  const me = guard(ctx, 'balances.view', 'balances.manage');
  if (isResult(me)) return me;
  const filter = ledgerQuery(ctx);
  const page = await ctx.api.get<Page<LedgerEntryDTO>>('/v1/admin/ledger', { ...filter, before: q(ctx, 'before', /^\d+$/), limit: 50 });
  const csv = new URL(ctx.url);
  csv.pathname = href(ctx, '/admin/ledger.csv');
  csv.searchParams.delete('before');
  const body = html`${pageHeader(ctx.t('admin.nav.ledger'), { subtitle: ctx.t('admin.ledger.subtitle'), actions: html`<a class="btn btn-ghost" href="${csv.pathname + csv.search}">${ctx.t('common.export')} CSV</a>` })}
<form class="filters" method="get">
${filter.userId ? html`<input type="hidden" name="userId" value="${filter.userId}">` : ''}
<label class="filter"><span>${ctx.t('wallet.columns.type')}</span><select name="type"><option value="">${ctx.t('common.all')}</option>${TYPES.map((tp) => html`<option value="${tp}"${tp === filter.type ? html` selected` : ''}>${ctx.t(`wallet.entryTypes.${tp}`)}</option>`)}</select></label>
<label class="filter"><span>${ctx.t('common.currency')}</span><select name="currency"><option value="">${ctx.t('common.all')}</option>${ctx.publicConfig.currencyFormats.map((c) => html`<option value="${c.code}"${c.code === filter.currency ? html` selected` : ''}>${c.code}</option>`)}</select></label>
<label class="filter"><span>${ctx.t('admin.common.from')}</span><input type="date" name="from" value="${ctx.url.searchParams.get('from') ?? ''}"></label>
<label class="filter"><span>${ctx.t('admin.common.to')}</span><input type="date" name="to" value="${ctx.url.searchParams.get('to') ?? ''}"></label>
<button class="btn btn-dark" type="submit">${ctx.t('common.apply')}</button>
</form>
${card(html`${ledgerTable(ctx, page.items, true)}${cursorPager(ctx, page.nextCursor)}`)}`;
  return adminPage(ctx, ctx.t('admin.nav.ledger'), body);
}

function csvCell(value: string): string {
  // also neutralises spreadsheet formulas (=, +, -, @ at the start of a cell)
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Up to 5,000 entries matching the filters, newest first (UTF-8 with BOM so spreadsheets read Arabic correctly). */
export async function ledgerCsv(ctx: PageCtx): Promise<PageResult> {
  const me = guard(ctx, 'balances.view', 'balances.manage');
  if (isResult(me)) return me;
  const filter = ledgerQuery(ctx);
  const rows: LedgerEntryDTO[] = [];
  let before: string | undefined;
  for (let i = 0; i < 25; i++) {
    const page = await ctx.api.get<Page<LedgerEntryDTO>>('/v1/admin/ledger', { ...filter, before, limit: 200 });
    rows.push(...page.items);
    if (!page.nextCursor || rows.length >= 5000) break;
    before = page.nextCursor;
  }
  const header = ['id', 'created_at', 'username', 'entry_type', 'currency', 'amount', 'balance_before', 'balance_after', 'original_amount', 'original_currency', 'rate', 'operator', 'reference', 'reason'];
  const plain = (m: { amountMinor: string; currency: string }) => moneyText({ ...ctx, locale: 'en' }, m, {}).replace(/[^\d.\-]/g, '');
  const lines = rows.map((e) =>
    [
      e.id, e.createdAt, e.username, e.entryType, e.amount.currency,
      `${e.direction === -1 ? '-' : ''}${plain(e.amount)}`, plain(e.balanceBefore), plain(e.balanceAfter),
      e.original ? plain(e.original.amount) : '', e.original?.amount.currency ?? '', e.original?.rate ?? '',
      e.operator?.username ?? '', e.reference ?? '', e.reason ?? '',
    ].map((v) => csvCell(String(v))).join(','),
  );
  const body = `﻿${header.join(',')}\r\n${lines.join('\r\n')}\r\n`;
  return { kind: 'raw', status: 200, headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="aurum-ledger-${ctx.now.toISOString().slice(0, 10)}.csv"` }, body };
}

export async function auditPage(ctx: PageCtx): Promise<PageResult> {
  const me = guard(ctx, 'audit.view');
  if (isResult(me)) return me;
  const action = q(ctx, 'action', /^[a-z_.]{1,60}$/);
  const targetId = (ctx.url.searchParams.get('targetId') ?? '').trim().slice(0, 80) || undefined;
  const page = await ctx.api.get<Page<AuditEntryDTO>>('/v1/admin/audit', { action, targetId, actorId: q(ctx, 'actorId', UUID_RE), before: q(ctx, 'before', /^\d+$/), limit: 50 });
  const body = html`${pageHeader(ctx.t('admin.nav.audit'), { subtitle: ctx.t('admin.audit.subtitle') })}
<form class="filters" method="get">
<label class="filter"><span>${ctx.t('admin.audit.action')}</span><input name="action" value="${action ?? ''}" placeholder="balance., shop., auth.login"></label>
<label class="filter"><span>${ctx.t('admin.audit.target')}</span><input name="targetId" value="${targetId ?? ''}"></label>
<button class="btn btn-dark" type="submit">${ctx.t('common.apply')}</button>
</form>
${card(html`${table<AuditEntryDTO>(
    [
      { label: ctx.t('wallet.columns.date'), cell: (a) => date(ctx, a.at) },
      { label: ctx.t('admin.audit.actor'), cell: (a) => (a.actor ? html`${a.actor.username} <span class="muted small">${a.actorRole ?? ''}</span>` : html`<span class="muted">${ctx.t('admin.ledger.system')}</span>`) },
      { label: ctx.t('admin.audit.action'), cell: (a) => html`<code>${a.action}</code>` },
      { label: ctx.t('admin.audit.target'), cell: (a) => (a.targetType ? html`${a.targetType} <span class="small muted" dir="ltr">${a.targetId ?? ''}</span>` : '') },
      { label: ctx.t('common.details'), cell: (a) => html`<code class="small details">${JSON.stringify(a.details)}</code>` },
      { label: 'IP', cell: (a) => html`<span dir="ltr">${a.ip ?? ''}</span>` },
    ],
    page.items,
    ctx.t('common.noResults'),
  )}${cursorPager(ctx, page.nextCursor)}`)}`;
  return adminPage(ctx, ctx.t('admin.nav.audit'), body);
}
