/** Shared helpers for the Super Admin / Admin dashboard pages. */
import { can, href, htmlPage, redirect } from '../../context.ts';
import type { PageCtx, PageResult } from '../../context.ts';
import { html } from '../../html.ts';
import type { Renderable, SafeHtml } from '../../html.ts';
import { adminLayout } from '../../layout/shell.ts';
import type { Me } from '../../types.ts';
import { errorPage } from '../errors.ts';

export function isResult(x: unknown): x is PageResult {
  return typeof x === 'object' && x !== null && 'kind' in x && !('role' in x);
}

/** Dashboard staff with at least one of the permissions (the Super Admin has them all). */
export function guard(ctx: PageCtx, ...permissions: string[]): Me | PageResult {
  const me = ctx.me;
  if (!me) return redirect(href(ctx, `/login?next=${encodeURIComponent(ctx.path + ctx.url.search)}`));
  if (me.mustChangePassword) return redirect(href(ctx, '/account/password?forced=1'));
  if (!can(me, ...permissions)) return errorPage(ctx, 403);
  return me;
}

export function guardSuper(ctx: PageCtx): Me | PageResult {
  const me = guard(ctx);
  if (isResult(me)) return me;
  if (me.role !== 'super_admin') return errorPage(ctx, 403);
  return me;
}

export function adminPage(ctx: PageCtx, title: string, body: Renderable, status = 200): PageResult {
  return htmlPage(adminLayout(ctx, { title, body }), status);
}

/** Reads a query parameter that must match a pattern (else undefined). */
export function q(ctx: PageCtx, name: string, pattern: RegExp): string | undefined {
  const value = ctx.url.searchParams.get(name);
  return value !== null && value !== '' && pattern.test(value) ? value : undefined;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ID_RE = /^\d{1,18}$/;

/** "2026-10-23" (date input) -> ISO instant at the start of that day in UTC; "to" dates are exclusive (+1 day). */
export function dayStart(value: string | undefined, plusDays = 0): string | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const d = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return undefined;
  d.setUTCDate(d.getUTCDate() + plusDays);
  return d.toISOString();
}

export function todayIso(ctx: PageCtx): string {
  return ctx.now.toISOString().slice(0, 10);
}

/** A one-time secret (temporary password) shown on its own, with a warning. */
export function oneTimeSecret(ctx: PageCtx, label: string, secret: string, note: string): SafeHtml {
  return html`<div class="secret-box" role="status">
<p class="small">${label}</p>
<p class="code" dir="ltr">${secret}</p>
<button type="button" class="btn btn-ghost btn-sm" data-copy="${secret}">${ctx.t('common.copy')}</button>
<p class="small muted">${note}</p>
</div>`;
}

/** Permission names in the visitor's language. */
export function permissionLabel(ctx: PageCtx, permission: string): string {
  return ctx.t(`admin.permissions.${permission.replace('.', '_')}`);
}
