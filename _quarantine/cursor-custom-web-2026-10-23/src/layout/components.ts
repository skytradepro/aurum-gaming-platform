/** Reusable pieces of markup: forms, alerts, tables, pagination, badges. */
import { ApiError } from '../api.ts';
import type { PageCtx } from '../context.ts';
import { cx, html, join } from '../html.ts';
import type { Renderable, SafeHtml } from '../html.ts';
import { errorText, fieldText } from '../i18n.ts';
import { icon } from './icons.ts';

export function csrfField(ctx: PageCtx): SafeHtml {
  return html`<input type="hidden" name="_csrf" value="${ctx.csrfToken}">`;
}

/** A one-time key so that a double-clicked or retried money form is applied once. */
export function idempotencyField(): SafeHtml {
  return html`<input type="hidden" name="idempotencyKey" value="${`web-${crypto.randomUUID()}`}">`;
}

export interface FormState {
  values: Record<string, string>;
  errors: Record<string, string>;
  /** General error message (already translated). */
  message?: string | undefined;
}

export const emptyForm = (values: Record<string, string> = {}): FormState => ({ values, errors: {} });

/** Turns an API error into form state: field messages next to fields, a general message on top. */
export function formFromError(ctx: PageCtx, error: unknown, values: Record<string, string>): FormState {
  if (!(error instanceof ApiError)) throw error;
  if (error.status >= 500 || error.status === 401) throw error;
  const errors: Record<string, string> = {};
  for (const [field, code] of Object.entries(error.fields)) errors[field.replace(/^\$\.?/, '') || '_'] = fieldText(ctx.t, code);
  const message = error.code === 'validation' && Object.keys(errors).length > 0 ? ctx.t('errors.validation') : errorText(ctx.t, error.code);
  return { values, errors, message };
}

export function formValues<K extends string>(ctx: PageCtx, ...names: K[]): Record<K, string> {
  const out = {} as Record<K, string>;
  for (const n of names) out[n] = (ctx.form.get(n) ?? '').trim();
  return out;
}

export function alert(kind: 'success' | 'error' | 'info' | 'warning', message: Renderable, extra?: Renderable): SafeHtml {
  const glyph = kind === 'success' ? 'check' : kind === 'error' || kind === 'warning' ? 'alert' : 'info';
  return html`<div class="alert alert-${kind}" role="${kind === 'error' ? 'alert' : 'status'}">${icon(glyph)}<div>${message}${extra ? html`<div class="alert-extra">${extra}</div>` : ''}</div></div>`;
}

export function flashAlert(ctx: PageCtx): SafeHtml {
  if (!ctx.flash) return html``;
  return alert(ctx.flash.kind, ctx.t(ctx.flash.key, ctx.flash.vars));
}

export function formError(state: FormState): SafeHtml {
  return state.message ? alert('error', state.message) : html``;
}

interface FieldOptions {
  label: string;
  name: string;
  type?: string;
  value?: string | undefined;
  error?: string | undefined;
  hint?: Renderable;
  required?: boolean;
  autocomplete?: string;
  placeholder?: string;
  inputmode?: string;
  min?: string;
  max?: string;
  maxlength?: number;
  pattern?: string;
  dir?: 'ltr' | 'rtl' | 'auto';
  className?: string;
  readonly?: boolean;
}

export function field(o: FieldOptions): SafeHtml {
  const id = `f-${o.name.replace(/[^\w-]/g, '-')}`;
  return html`<div class="${cx('field', o.error && 'has-error', o.className)}">
<label for="${id}">${o.label}${o.required ? html`<span class="req" aria-hidden="true">*</span>` : ''}</label>
<input id="${id}" name="${o.name}" type="${o.type ?? 'text'}" value="${o.type === 'password' ? '' : o.value ?? ''}"${o.required ? html` required` : ''}${o.autocomplete ? html` autocomplete="${o.autocomplete}"` : ''}${o.placeholder ? html` placeholder="${o.placeholder}"` : ''}${o.inputmode ? html` inputmode="${o.inputmode}"` : ''}${o.min ? html` min="${o.min}"` : ''}${o.max ? html` max="${o.max}"` : ''}${o.maxlength ? html` maxlength="${o.maxlength}"` : ''}${o.pattern ? html` pattern="${o.pattern}"` : ''}${o.dir ? html` dir="${o.dir}"` : ''}${o.readonly ? html` readonly` : ''}${o.error ? html` aria-invalid="true" aria-describedby="${id}-err"` : ''}>
${o.hint ? html`<p class="hint">${o.hint}</p>` : ''}${o.error ? html`<p class="field-error" id="${id}-err">${o.error}</p>` : ''}
</div>`;
}

export function textarea(o: Omit<FieldOptions, 'type'> & { rows?: number }): SafeHtml {
  const id = `f-${o.name.replace(/[^\w-]/g, '-')}`;
  return html`<div class="${cx('field', o.error && 'has-error', o.className)}">
<label for="${id}">${o.label}${o.required ? html`<span class="req" aria-hidden="true">*</span>` : ''}</label>
<textarea id="${id}" name="${o.name}" rows="${o.rows ?? 4}"${o.required ? html` required` : ''}${o.maxlength ? html` maxlength="${o.maxlength}"` : ''}${o.dir ? html` dir="${o.dir}"` : ''}>${o.value ?? ''}</textarea>
${o.hint ? html`<p class="hint">${o.hint}</p>` : ''}${o.error ? html`<p class="field-error">${o.error}</p>` : ''}
</div>`;
}

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export function select(o: Omit<FieldOptions, 'type'> & { options: readonly SelectOption[]; empty?: string; autosubmit?: boolean }): SafeHtml {
  const id = `f-${o.name.replace(/[^\w-]/g, '-')}`;
  return html`<div class="${cx('field', o.error && 'has-error', o.className)}">
<label for="${id}">${o.label}${o.required ? html`<span class="req" aria-hidden="true">*</span>` : ''}</label>
<select id="${id}" name="${o.name}"${o.required ? html` required` : ''}${o.autosubmit ? html` data-autosubmit` : ''}${o.autocomplete ? html` autocomplete="${o.autocomplete}"` : ''}>
${o.empty !== undefined ? html`<option value="">${o.empty}</option>` : ''}${o.options.map((opt) => html`<option value="${opt.value}"${opt.value === (o.value ?? '') ? html` selected` : ''}${opt.disabled ? html` disabled` : ''}>${opt.label}</option>`)}
</select>
${o.hint ? html`<p class="hint">${o.hint}</p>` : ''}${o.error ? html`<p class="field-error">${o.error}</p>` : ''}
</div>`;
}

export function checkbox(o: { label: Renderable; name: string; checked?: boolean; error?: string | undefined; value?: string; hint?: Renderable }): SafeHtml {
  const id = `f-${o.name.replace(/[^\w-]/g, '-')}-${(o.value ?? 'on').replace(/[^\w-]/g, '-')}`;
  return html`<div class="${cx('check', o.error && 'has-error')}">
<input id="${id}" type="checkbox" name="${o.name}" value="${o.value ?? 'on'}"${o.checked ? html` checked` : ''}>
<label for="${id}">${o.label}</label>
${o.hint ? html`<p class="hint">${o.hint}</p>` : ''}${o.error ? html`<p class="field-error">${o.error}</p>` : ''}
</div>`;
}

export function button(label: Renderable, o: { kind?: 'gold' | 'dark' | 'ghost' | 'danger' | 'light'; type?: 'submit' | 'button'; name?: string; value?: string; className?: string; confirm?: string; iconName?: string } = {}): SafeHtml {
  return html`<button class="${cx('btn', `btn-${o.kind ?? 'gold'}`, o.className)}" type="${o.type ?? 'submit'}"${o.name ? html` name="${o.name}"` : ''}${o.value !== undefined ? html` value="${o.value}"` : ''}${o.confirm ? html` data-confirm="${o.confirm}"` : ''}>${o.iconName ? icon(o.iconName) : ''}<span>${label}</span></button>`;
}

export function linkButton(label: Renderable, hrefValue: string, o: { kind?: 'gold' | 'dark' | 'ghost' | 'light'; className?: string; iconName?: string; attrs?: SafeHtml } = {}): SafeHtml {
  return html`<a class="${cx('btn', `btn-${o.kind ?? 'gold'}`, o.className)}" href="${hrefValue}"${o.attrs ?? ''}>${o.iconName ? icon(o.iconName) : ''}<span>${label}</span></a>`;
}

export function badge(text: Renderable, tone: 'gold' | 'green' | 'red' | 'grey' | 'blue' | 'purple' = 'grey'): SafeHtml {
  return html`<span class="badge badge-${tone}">${text}</span>`;
}

export function statusBadge(ctx: PageCtx, status: string): SafeHtml {
  const tone: Record<string, 'gold' | 'green' | 'red' | 'grey' | 'blue' | 'purple'> = {
    active: 'green', suspended: 'gold', closed: 'grey',
    pending: 'gold', paid: 'green', cancelled: 'grey', rejected: 'red', expired: 'grey',
  };
  const key = ['active', 'suspended', 'closed'].includes(status) ? `status.${status}` : `withdrawals.status.${status}`;
  return badge(ctx.t(key), tone[status] ?? 'grey');
}

export interface Column<T> {
  label: Renderable;
  cell: (row: T) => Renderable;
  className?: string;
}

export function table<T>(columns: readonly Column<T>[], rows: readonly T[], empty: Renderable, caption?: string): SafeHtml {
  if (rows.length === 0) return html`<div class="empty">${icon('info')}<p>${empty}</p></div>`;
  return html`<div class="table-wrap"><table class="table">${caption ? html`<caption class="sr-only">${caption}</caption>` : ''}
<thead><tr>${columns.map((c) => html`<th scope="col" class="${c.className ?? ''}">${c.label}</th>`)}</tr></thead>
<tbody>${rows.map((r) => html`<tr>${columns.map((c) => html`<td class="${c.className ?? ''}" data-label="${typeof c.label === 'string' ? c.label : ''}">${c.cell(r)}</td>`)}</tr>`)}</tbody>
</table></div>`;
}

/** "Older entries" link for keyset-paginated lists. */
export function cursorPager(ctx: PageCtx, nextCursor: string | null, param = 'before'): SafeHtml {
  const parts: SafeHtml[] = [];
  if (ctx.url.searchParams.get(param)) {
    const first = new URL(ctx.url);
    first.searchParams.delete(param);
    parts.push(html`<a class="btn btn-ghost" href="${first.pathname + first.search}">${ctx.t('common.first')}</a>`);
  }
  if (nextCursor) {
    const next = new URL(ctx.url);
    next.searchParams.set(param, nextCursor);
    parts.push(html`<a class="btn btn-ghost" href="${next.pathname + next.search}">${ctx.t('common.older')}</a>`);
  }
  return parts.length ? html`<nav class="pager" aria-label="${ctx.t('common.pagination')}">${join(parts)}</nav>` : html``;
}

export function pageHeader(title: Renderable, o: { subtitle?: Renderable; actions?: Renderable; back?: { href: string; label: string } } = {}): SafeHtml {
  return html`<header class="page-head">
${o.back ? html`<a class="back-link" href="${o.back.href}">${icon('left')}<span>${o.back.label}</span></a>` : ''}
<div class="page-head-row"><div><h1>${title}</h1>${o.subtitle ? html`<p class="muted">${o.subtitle}</p>` : ''}</div>${o.actions ? html`<div class="page-actions">${o.actions}</div>` : ''}</div>
</header>`;
}

export function card(body: Renderable, o: { title?: Renderable; className?: string; actions?: Renderable } = {}): SafeHtml {
  return html`<section class="${cx('card', o.className)}">${o.title ? html`<div class="card-head"><h2>${o.title}</h2>${o.actions ? html`<div class="card-actions">${o.actions}</div>` : ''}</div>` : ''}${body}</section>`;
}

export function stat(label: Renderable, value: Renderable, note?: Renderable): SafeHtml {
  return html`<div class="stat"><p class="stat-label">${label}</p><p class="stat-value">${value}</p>${note ? html`<p class="stat-note">${note}</p>` : ''}</div>`;
}

export function definitionList(items: readonly [Renderable, Renderable][]): SafeHtml {
  return html`<dl class="dl">${items.map(([k, v]) => html`<div><dt>${k}</dt><dd>${v === '' || v === null || v === undefined ? '—' : v}</dd></div>`)}</dl>`;
}

/** Keeps current filters when a GET filter form is submitted. */
export function hiddenInputs(values: Record<string, string | undefined>): SafeHtml {
  return join(Object.entries(values).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => html`<input type="hidden" name="${k}" value="${v}">`));
}

/** A small "copy" button (JS) next to a code or password shown once. */
export function copyButton(ctx: PageCtx, value: string): SafeHtml {
  return html`<button type="button" class="btn btn-ghost btn-sm" data-copy="${value}">${icon('copy')}<span>${ctx.t('common.copy')}</span></button>`;
}
