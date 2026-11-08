import { htmlPage, href } from '../context.ts';
import type { PageCtx, PageResult } from '../context.ts';
import { html, raw } from '../html.ts';
import type { SafeHtml } from '../html.ts';
import { translator } from '../i18n.ts';
import type { Locale } from '../i18n.ts';
import { linkButton } from '../layout/components.ts';
import { icon } from '../layout/icons.ts';
import { layout } from '../layout/shell.ts';

const KEYS: Record<number, [string, string]> = {
  403: ['errorPages.forbiddenTitle', 'errorPages.forbiddenBody'],
  404: ['errorPages.notFoundTitle', 'errorPages.notFoundBody'],
  405: ['errorPages.notFoundTitle', 'errorPages.notFoundBody'],
  413: ['errorPages.tooLargeTitle', 'errorPages.tooLargeBody'],
  429: ['errorPages.rateLimitedTitle', 'errorPages.rateLimitedBody'],
  500: ['errorPages.serverTitle', 'errorPages.serverBody'],
};

export function errorPage(ctx: PageCtx, status: number, messageKey?: string): PageResult {
  const [title, body] = KEYS[status] ?? (KEYS[500] as [string, string]);
  return htmlPage(
    layout(ctx, {
      title: ctx.t(title),
      noIndex: true,
      body: html`<section class="container narrow error-page">
<div class="error-code">${status}</div>
<h1>${ctx.t(title)}</h1>
<p class="muted">${ctx.t(messageKey ?? body)}</p>
<p>${linkButton(ctx.t('errorPages.backHome'), href(ctx, '/'), { iconName: 'home' })}</p>
</section>`,
    }),
    status,
  );
}

/** Shown when the API cannot be reached (no configuration, so no full layout). */
export function unavailablePage(locale: Locale): SafeHtml {
  const t = translator(locale);
  return html`<!doctype html>
<html lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}" data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${t('errorPages.unavailableTitle')}</title><link rel="stylesheet" href="/assets/app.css"></head>
<body class="bare"><main class="container narrow error-page"><div class="error-code">${raw(icon('clock').value)}</div><h1>${t('errorPages.unavailableTitle')}</h1><p class="muted">${t('errorPages.unavailableBody')}</p></main></body></html>`;
}
