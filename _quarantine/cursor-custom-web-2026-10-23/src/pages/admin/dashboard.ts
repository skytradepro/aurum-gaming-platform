/** Dashboard home, reports per shop and worker, and the books check. */
import { can, href, money } from '../../context.ts';
import type { PageCtx, PageResult } from '../../context.ts';
import { html } from '../../html.ts';
import { alert, button, card, csrfField, pageHeader, stat, table } from '../../layout/components.ts';
import { icon } from '../../layout/icons.ts';
import type { DashboardDTO, LedgerHealthDTO, ShopDTO, ShopReportDTO } from '../../types.ts';
import { adminPage, dayStart, guard, isResult, q, todayIso } from './common.ts';

export async function dashboardPage(ctx: PageCtx): Promise<PageResult> {
  const me = guard(ctx);
  if (isResult(me)) return me;
  const canReports = can(me, 'reports.view');
  const summary = canReports ? await ctx.api.get<DashboardDTO>('/v1/admin/dashboard') : null;
  const quick: [string, string, string, boolean][] = [
    ['/admin/players', 'admin.nav.players', 'users', can(me, 'users.view', 'users.manage', 'balances.view', 'balances.manage')],
    ['/admin/withdrawals?status=pending', 'admin.quick.pendingWithdrawals', 'cash', can(me, 'withdrawals.view', 'withdrawals.manage', 'shops.view', 'shops.manage')],
    ['/admin/shops', 'admin.nav.shops', 'shop', can(me, 'shops.view', 'shops.manage', 'shops.cash')],
    ['/admin/banners', 'admin.nav.banners', 'image', can(me, 'banners.manage')],
    ['/admin/games', 'admin.nav.games', 'game', can(me, 'games.manage')],
    ['/admin/staff', 'admin.nav.staff', 'shield', me.role === 'super_admin'],
  ];
  const body = html`${pageHeader(ctx.t(me.role === 'super_admin' ? 'admin.superTitle' : 'admin.adminTitle'), { subtitle: ctx.t('admin.welcome', { name: me.firstName }) })}
<ul class="quick-links" role="list">${quick.filter((x) => x[3]).map(([p, k, i]) => html`<li><a href="${href(ctx, p)}">${icon(i)}<span>${ctx.t(k)}</span></a></li>`)}</ul>
${summary
  ? html`<div class="stats">
${stat(ctx.t('admin.dash.players'), String(summary.players.total), ctx.t('admin.dash.playersNote', { active: summary.players.byStatus.active, suspended: summary.players.byStatus.suspended, fresh: summary.players.newLast7Days }))}
${summary.balances.map((b) => stat(ctx.t('admin.dash.balances', { currency: b.currency }), money(ctx, b.total), ctx.t('admin.dash.wallets', { count: b.wallets })))}
${summary.pendingWithdrawals.map((p) => stat(ctx.t('admin.dash.pending', { currency: p.currency }), money(ctx, p.total), ctx.t('admin.dash.requests', { count: p.count })))}
${summary.shopCash.map((s) => stat(ctx.t('admin.dash.shopCash', { currency: s.currency }), money(ctx, s.total), ctx.t('admin.dash.shops', { count: s.activeShops })))}
</div>
${card(
  table(
    [
      { label: ctx.t('common.currency'), cell: (r) => r.currency },
      { label: ctx.t('wallet.columns.type'), cell: (r) => ctx.t(`wallet.entryTypes.${r.entryType}`) },
      { label: ctx.t('admin.dash.entries'), cell: (r) => String(r.entries), className: 'num' },
      { label: ctx.t('wallet.credit'), cell: (r) => money(ctx, r.credited), className: 'num' },
      { label: ctx.t('wallet.debit'), cell: (r) => money(ctx, r.debited), className: 'num' },
    ],
    summary.recentActivity,
    ctx.t('admin.dash.noActivity'),
  ),
  { title: ctx.t('admin.dash.activity30') },
)}
${card(html`<p class="muted">${ctx.t('admin.health.intro')}</p><form method="post" action="${href(ctx, '/admin/health')}">${csrfField(ctx)}${button(ctx.t('admin.health.run'), { kind: 'dark', iconName: 'shield' })}</form>`, { title: ctx.t('admin.health.title') })}`
  : alert('info', ctx.t('admin.dash.noReports'))}`;
  return adminPage(ctx, ctx.t('admin.nav.dashboard'), body);
}

export async function healthCheck(ctx: PageCtx): Promise<PageResult> {
  const me = guard(ctx, 'reports.view');
  if (isResult(me)) return me;
  const [wallets, shops] = await Promise.all([
    ctx.api.get<LedgerHealthDTO>('/v1/admin/reports/ledger-health'),
    ctx.api.get<{ ok: boolean; problems: unknown[] }>('/v1/admin/reports/shop-cash-health'),
  ]);
  const ok = wallets.ok && shops.ok;
  const body = html`${pageHeader(ctx.t('admin.health.title'), { back: { href: href(ctx, '/admin'), label: ctx.t('admin.nav.dashboard') } })}
${ok ? alert('success', ctx.t('admin.health.ok')) : alert('error', ctx.t('admin.health.problems', { count: wallets.problems.length + shops.problems.length }))}
${!ok ? html`<pre class="code-block">${JSON.stringify({ wallets: wallets.problems, shops: shops.problems }, null, 2)}</pre>` : ''}`;
  return adminPage(ctx, ctx.t('admin.health.title'), body);
}

export async function reportsPage(ctx: PageCtx): Promise<PageResult> {
  const me = guard(ctx, 'reports.view', 'shops.view', 'shops.manage', 'shops.cash');
  if (isResult(me)) return me;
  const fromDay = q(ctx, 'from', /^\d{4}-\d{2}-\d{2}$/) ?? todayIso(ctx);
  const toDay = q(ctx, 'to', /^\d{4}-\d{2}-\d{2}$/) ?? fromDay;
  const shopId = q(ctx, 'shopId', /^\d{1,18}$/);
  const from = dayStart(fromDay) as string;
  const to = dayStart(toDay, 1) as string;
  const [report, shops] = await Promise.all([
    ctx.api.get<ShopReportDTO>('/v1/admin/reports/shops', { from, to, shopId }),
    ctx.api.get<{ items: ShopDTO[] }>('/v1/admin/shops'),
  ]);
  const body = html`${pageHeader(ctx.t('admin.reports.title'), { subtitle: ctx.t('admin.reports.subtitle') })}
<form class="filters" method="get">
<label class="filter"><span>${ctx.t('admin.common.from')}</span><input type="date" name="from" value="${fromDay}"></label>
<label class="filter"><span>${ctx.t('admin.common.to')}</span><input type="date" name="to" value="${toDay}"></label>
<label class="filter"><span>${ctx.t('admin.nav.shops')}</span><select name="shopId"><option value="">${ctx.t('common.all')}</option>${shops.items.map((s) => html`<option value="${s.id}"${s.id === shopId ? html` selected` : ''}>${s.code} — ${s.name}</option>`)}</select></label>
<button class="btn btn-dark" type="submit">${ctx.t('common.apply')}</button>
</form>
${card(
  table(
    [
      { label: ctx.t('admin.shops.shop'), cell: (r) => html`<a href="${href(ctx, `/admin/shops/${r.shop.id}`)}">${r.shop.code}</a> <span class="muted">${r.shop.name}</span>` },
      { label: ctx.t('admin.reports.deposits'), cell: (r) => html`${money(ctx, r.deposits.total)} <span class="muted small">(${r.deposits.count})</span>`, className: 'num' },
      { label: ctx.t('admin.reports.payouts'), cell: (r) => html`${money(ctx, r.payouts.total)} <span class="muted small">(${r.payouts.count})</span>`, className: 'num' },
      { label: ctx.t('admin.shopCash.types.float_in'), cell: (r) => money(ctx, r.floatIn), className: 'num' },
      { label: ctx.t('admin.shopCash.types.cash_collection'), cell: (r) => money(ctx, r.collections), className: 'num' },
      { label: ctx.t('admin.reports.adjustments'), cell: (r) => money(ctx, r.adjustments), className: 'num' },
      { label: ctx.t('admin.reports.net'), cell: (r) => money(ctx, r.netCash), className: 'num' },
      { label: ctx.t('admin.shops.cashNow'), cell: (r) => money(ctx, r.cashBalance), className: 'num' },
    ],
    report.shops,
    ctx.t('admin.reports.none'),
  ),
  { title: ctx.t('admin.reports.byShop') },
)}
${card(
  table(
    [
      { label: ctx.t('admin.workers.worker'), cell: (r) => html`${r.worker.firstName} ${r.worker.lastName} <span class="muted small">@${r.worker.username}</span>` },
      { label: ctx.t('admin.reports.deposits'), cell: (r) => html`${money(ctx, r.deposits.total)} <span class="muted small">(${r.deposits.count})</span>`, className: 'num' },
      { label: ctx.t('admin.reports.payouts'), cell: (r) => html`${money(ctx, r.payouts.total)} <span class="muted small">(${r.payouts.count})</span>`, className: 'num' },
    ],
    report.workers,
    ctx.t('admin.reports.none'),
  ),
  { title: ctx.t('admin.reports.byWorker') },
)}
<p class="small muted">${ctx.t('admin.reports.timezoneNote')}</p>`;
  return adminPage(ctx, ctx.t('admin.reports.title'), body);
}
