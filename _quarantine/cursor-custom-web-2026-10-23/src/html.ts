/**
 * HTML building with automatic escaping.
 *
 *   html`<p class="${cls}">${userText}</p>`
 *
 * Every interpolated value is escaped unless it is itself the result of html`` (or raw()).
 * Arrays are joined; null, undefined and false render nothing. There is no other way to put
 * text into a page, so text coming from the database or from a visitor can never become markup.
 */

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"'`]/g, (c) => ESCAPES[c] as string);
}

export class SafeHtml {
  readonly value: string;
  constructor(value: string) {
    this.value = value;
  }
  toString(): string {
    return this.value;
  }
}

export type Renderable = SafeHtml | string | number | bigint | boolean | null | undefined | readonly Renderable[];

function render(value: Renderable): string {
  if (value === null || value === undefined || value === false || value === true) return '';
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return (value as readonly Renderable[]).map(render).join('');
  return escapeHtml(String(value));
}

export function html(strings: TemplateStringsArray, ...values: Renderable[]): SafeHtml {
  let out = strings[0] ?? '';
  for (let i = 0; i < values.length; i++) out += render(values[i]) + (strings[i + 1] ?? '');
  return new SafeHtml(out);
}

/** Trusted markup only (constants written in this code base, never data). */
export function raw(markup: string): SafeHtml {
  return new SafeHtml(markup);
}

export function join(parts: readonly Renderable[], separator: Renderable = ''): SafeHtml {
  const sep = render(separator);
  return new SafeHtml(parts.map(render).filter((p) => p !== '').join(sep));
}

/** Only same-site paths and https links may be used as hrefs coming from content. */
export function safeHref(url: string | null | undefined): string {
  if (!url) return '#';
  if (/^\/(?![/\\])/.test(url)) return url;
  if (/^https:\/\/[^\s]+$/i.test(url)) return url;
  return '#';
}

/** Plain text with blank-line paragraphs and single line breaks, as stored by the dashboards. */
export function paragraphs(text: string): SafeHtml {
  const blocks = text.replace(/\r\n/g, '\n').split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return join(blocks.map((b) => html`<p>${join(b.split('\n').map((line) => html`${line}`), raw('<br>'))}</p>`));
}

/** class="a b" from a list where falsy entries are skipped. */
export function cx(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(' ');
}
