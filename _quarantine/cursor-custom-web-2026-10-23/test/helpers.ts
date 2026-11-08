/**
 * Test harness for the website: a real API (temporary database) plus the web server in front
 * of it, and a small cookie-keeping client that fills and submits the forms the pages render.
 */
import { startServer, type TestServer } from '../../api/test/helpers.ts';
import { loadWebConfig } from '../src/config.ts';
import { createLogger } from '../src/log.ts';
import { webRoutes } from '../src/routes.ts';
import { createWebServer, type WebServer } from '../src/server.ts';

export const ORIGIN = 'http://localhost:3000';

export interface Site {
  api: TestServer;
  web: WebServer;
  baseUrl: string;
  client(): WebClient;
  stop(): Promise<void>;
}

export async function startSite(options: { env?: Record<string, string> } = {}): Promise<Site> {
  const api = await startServer({ env: options.env });
  const config = { ...loadWebConfig({ NODE_ENV: 'test', WEB_ORIGIN: ORIGIN, API_INTERNAL_URL: api.baseUrl, WEB_SECRET: 'test-secret-0123456789abcdef0123456789', LOG_LEVEL: 'silent' }), port: 0, host: '127.0.0.1' };
  const web = createWebServer({ config, routes: webRoutes, logger: createLogger('silent') });
  const address = await web.listen();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return {
    api,
    web,
    baseUrl,
    client: () => new WebClient(baseUrl),
    async stop() {
      await web.close();
      await api.stop();
    },
  };
}

export interface Page {
  status: number;
  url: string;
  html: string;
  headers: Headers;
}

const decode = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

function attr(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return m ? decode(m[1] as string) : undefined;
}

/** The fields a browser would submit for a form: hidden and filled inputs, checked boxes, selected options. */
export function formFields(formHtml: string): Map<string, string> {
  const fields = new Map<string, string>();
  for (const m of formHtml.matchAll(/<input\b[^>]*>/g)) {
    const tag = m[0];
    const name = attr(tag, 'name');
    if (!name) continue;
    const type = attr(tag, 'type') ?? 'text';
    if ((type === 'checkbox' || type === 'radio') && !/\schecked[\s>]/.test(tag)) continue;
    fields.set(name, attr(tag, 'value') ?? (type === 'checkbox' ? 'on' : ''));
  }
  for (const m of formHtml.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/g)) {
    const name = attr(m[1] as string, 'name');
    if (!name) continue;
    const options = [...(m[2] as string).matchAll(/<option\b([^>]*)>/g)].map((o) => o[1] as string);
    const chosen = options.find((o) => /\sselected/.test(o)) ?? options[0];
    if (chosen !== undefined) fields.set(name, attr(chosen, 'value') ?? '');
  }
  for (const m of formHtml.matchAll(/<textarea\b([^>]*)>([\s\S]*?)<\/textarea>/g)) {
    const name = attr(m[1] as string, 'name');
    if (name) fields.set(name, decode(m[2] as string));
  }
  return fields;
}

export class WebClient {
  readonly cookies = new Map<string, string>();
  last: Page | null = null;
  readonly baseUrl: string;
  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private store(headers: Headers): void {
    for (const line of headers.getSetCookie()) {
      const [pair] = line.split(';');
      const eq = (pair as string).indexOf('=');
      const name = (pair as string).slice(0, eq).trim();
      const value = (pair as string).slice(eq + 1).trim();
      if (/max-age=0/i.test(line) || value === '') this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  async request(path: string, init: { method?: string; body?: URLSearchParams; follow?: boolean; headers?: Record<string, string> } = {}): Promise<Page> {
    let url = new URL(path, this.baseUrl).toString();
    let method = init.method ?? 'GET';
    let body: URLSearchParams | undefined = init.body;
    for (let hop = 0; hop < 10; hop++) {
      const headers: Record<string, string> = { cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '), 'accept-language': 'en', ...init.headers };
      if (method === 'POST') Object.assign(headers, { origin: ORIGIN, 'sec-fetch-site': 'same-origin', 'content-type': 'application/x-www-form-urlencoded' });
      const res = await fetch(url, { method, headers, body: body?.toString(), redirect: 'manual' });
      this.store(res.headers);
      const location = res.headers.get('location');
      if (init.follow !== false && location && res.status >= 300 && res.status < 400) {
        url = new URL(location, url).toString();
        method = 'GET';
        body = undefined;
        await res.arrayBuffer();
        continue;
      }
      const page = { status: res.status, url: new URL(url).pathname + new URL(url).search, html: await res.text(), headers: res.headers };
      this.last = page;
      return page;
    }
    throw new Error('too many redirects');
  }

  get(path: string, follow = true): Promise<Page> {
    return this.request(path, { follow });
  }

  /** Finds the form posting to `action` on the page at `path` (or the last page) and submits it with `values` on top. */
  async submit(action: string, values: Record<string, string | boolean>, from?: string): Promise<Page> {
    const page = from ? await this.get(from) : this.last;
    if (!page) throw new Error('no page loaded');
    const forms = [...page.html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/g)];
    const form = forms.find((f) => attr(f[1] as string, 'action') === action);
    if (!form) throw new Error(`no form posting to ${action} on ${page.url} (forms: ${forms.map((f) => attr(f[1] as string, 'action')).join(', ')})`);
    const fields = formFields(form[2] as string);
    for (const [k, v] of Object.entries(values)) {
      if (v === false) fields.delete(k);
      else fields.set(k, v === true ? 'on' : v);
    }
    return this.request(action, { method: 'POST', body: new URLSearchParams([...fields]) });
  }
}

/** The text of the first element matching a class (rough, for assertions). */
export function textOf(html: string, className: string): string {
  const m = new RegExp(`class="[^"]*\\b${className}\\b[^"]*"[^>]*>([\\s\\S]*?)</`).exec(html);
  return m ? decode((m[1] as string).replace(/<[^>]+>/g, '')).trim() : '';
}
