/** Sign in, registration, sign out, and the header preferences (display currency, theme). */
import { isApiError } from '../api.ts';
import { countryName, currencyName, href, htmlPage, redirect } from '../context.ts';
import type { PageCtx, PageResult } from '../context.ts';
import { html, join } from '../html.ts';
import type { SafeHtml } from '../html.ts';
import { serializeCookie } from '../http.ts';
import { button, checkbox, csrfField, emptyForm, field, formError, formFromError, formValues, select } from '../layout/components.ts';
import type { FormState } from '../layout/components.ts';
import { icon } from '../layout/icons.ts';
import { layout } from '../layout/shell.ts';
import type { Me } from '../types.ts';

/** Only same-site paths (without the language prefix) are accepted as "next". */
function safeNext(value: string | null): string | null {
  if (!value) return null;
  if (!/^\/(?![/\\])[\w\-./?=&%]*$/.test(value)) return null;
  return value;
}

/** Where a person lands after signing in. */
export function homeFor(ctx: PageCtx, me: Pick<Me, 'role' | 'mustChangePassword'>, next: string | null): string {
  if (me.mustChangePassword) return href(ctx, '/account/password?forced=1');
  if (next && !next.startsWith('/login') && !next.startsWith('/register')) {
    if (me.role === 'user' && !next.startsWith('/admin') && !next.startsWith('/counter')) return href(ctx, next);
    if ((me.role === 'admin' || me.role === 'super_admin') && next.startsWith('/admin')) return href(ctx, next);
    if (me.role === 'cashier' && next.startsWith('/counter')) return href(ctx, next);
  }
  if (me.role === 'admin' || me.role === 'super_admin') return href(ctx, '/admin');
  if (me.role === 'cashier') return href(ctx, '/counter');
  return href(ctx, '/');
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------
function loginForm(ctx: PageCtx, state: FormState, next: string | null, idPrefix = ''): SafeHtml {
  return html`<form method="post" action="${href(ctx, '/login')}" class="form" novalidate>
${csrfField(ctx)}${next ? html`<input type="hidden" name="next" value="${next}">` : ''}
${formError(state)}
${field({ label: ctx.t('auth.login.identifier'), name: `${idPrefix}identifier`, value: state.values.identifier, error: state.errors.identifier, required: true, autocomplete: 'username', dir: 'auto' })}
${field({ label: ctx.t('auth.login.password'), name: `${idPrefix}password`, type: 'password', error: state.errors.password, required: true, autocomplete: 'current-password' })}
${button(ctx.t('auth.login.submit'), { className: 'btn-block' })}
<p class="small muted center">${ctx.t('auth.login.noAccount')} <a href="${href(ctx, '/register')}" data-dialog="register">${ctx.t('auth.login.registerLink')}</a></p>
</form>`;
}

function registerForm(ctx: PageCtx, state: FormState): SafeHtml {
  const pc = ctx.publicConfig;
  const v = state.values;
  const e = state.errors;
  const countries = [...pc.countries].map((c) => ({ ...c, name: countryName(ctx.locale, c.code) }));
  const byName = [...countries].sort((a, b) => a.name.localeCompare(b.name, ctx.locale));
  const callingCodes = [...new Map(countries.map((c) => [c.callingCode, c])).values()];
  const defaultCountry = v.country || countries[0]?.code || '';
  const defaultCode = v.callingCode || countries.find((c) => c.code === defaultCountry)?.callingCode || '';
  const terms = html`<a href="${href(ctx, '/page/terms-and-conditions')}" target="_blank" rel="noopener">${ctx.t('auth.register.termsLink')}</a>`;
  const [before, after] = ctx.t('auth.register.acceptTerms', { terms: '\u0000' }).split('\u0000');
  if (!pc.registrationOpen) return html`<p class="muted">${ctx.t('errors.codes.registration_closed')}</p>`;
  return html`<form method="post" action="${href(ctx, '/register')}" class="form" novalidate>
${csrfField(ctx)}
${formError(state)}
<div class="form-grid">
${field({ label: ctx.t('auth.register.username'), name: 'username', value: v.username, error: e.username, required: true, autocomplete: 'username', maxlength: 24, dir: 'ltr', hint: ctx.t('validation.invalidUsername') })}
${field({ label: ctx.t('auth.register.email'), name: 'email', type: 'email', value: v.email, error: e.email, required: true, autocomplete: 'email', dir: 'ltr' })}
<div class="field phone-field${e.mobile || e.callingCode ? ' has-error' : ''}">
<label for="f-mobile">${ctx.t('auth.register.mobile')}<span class="req" aria-hidden="true">*</span></label>
<div class="phone-row" dir="ltr">
<select name="callingCode" aria-label="${ctx.t('auth.register.countryCode')}">${callingCodes.map((c) => html`<option value="${c.callingCode}"${c.callingCode === defaultCode ? html` selected` : ''}>+${c.callingCode}</option>`)}</select>
<input id="f-mobile" name="mobile" type="tel" inputmode="tel" autocomplete="tel-national" value="${v.mobile ?? ''}" required>
</div>
${e.mobile ? html`<p class="field-error">${e.mobile}</p>` : ''}
</div>
${field({ label: ctx.t('auth.register.password'), name: 'password', type: 'password', error: e.password, required: true, autocomplete: 'new-password', hint: ctx.t('auth.register.passwordHint') })}
${field({ label: ctx.t('auth.register.firstName'), name: 'firstName', value: v.firstName, error: e.firstName, required: true, autocomplete: 'given-name', maxlength: 80 })}
${field({ label: ctx.t('auth.register.lastName'), name: 'lastName', value: v.lastName, error: e.lastName, required: true, autocomplete: 'family-name', maxlength: 80 })}
${field({ label: ctx.t('auth.register.dateOfBirth'), name: 'dateOfBirth', type: 'date', value: v.dateOfBirth, error: e.dateOfBirth, required: true, autocomplete: 'bday', max: `${ctx.now.getUTCFullYear() - 18}-12-31` })}
${select({ label: ctx.t('auth.register.country'), name: 'country', value: defaultCountry, error: e.country, required: true, options: byName.map((c) => ({ value: c.code, label: c.name })), autocomplete: 'country' })}
${select({ label: ctx.t('auth.register.currency'), name: 'currency', value: v.currency || ctx.displayCurrency || '', error: e.currency, required: true, options: pc.currencies.map((c) => ({ value: c.code, label: `${c.code} — ${currencyName(ctx, c.code)}` })), hint: ctx.t('auth.register.currencyHint') })}
</div>
${checkbox({ name: 'acceptTerms', label: html`${before}${terms}${after}`, checked: v.acceptTerms === 'on', error: e.acceptTerms })}
${checkbox({ name: 'marketingOptIn', label: ctx.t('auth.register.marketingOptIn'), checked: v.marketingOptIn === 'on' })}
${pc.captcha.enabled && pc.captcha.siteKey ? html`<div class="cf-turnstile" data-sitekey="${pc.captcha.siteKey}"></div><script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>` : ''}
${button(ctx.t('auth.register.submit'), { className: 'btn-block' })}
<p class="small muted center">${ctx.t('auth.register.haveAccount')} <a href="${href(ctx, '/login')}" data-dialog="login">${ctx.t('auth.register.loginLink')}</a></p>
</form>`;
}

/** The login and register dialogs, rendered for visitors on public pages (opened by app.js). */
export function authDialogs(ctx: PageCtx): SafeHtml {
  if (ctx.me) return html``;
  const dialog = (id: string, title: string, body: SafeHtml) => html`<dialog class="modal" id="dialog-${id}" aria-labelledby="dialog-${id}-title">
<div class="modal-head"><h2 id="dialog-${id}-title">${title}</h2><button type="button" class="btn btn-ghost btn-icon" data-close aria-label="${ctx.t('common.close')}">${icon('close')}</button></div>
<div class="modal-body">${body}</div>
</dialog>`;
  return join([
    dialog('login', ctx.t('auth.login.title'), loginForm(ctx, emptyForm(), ctx.path === '/' ? null : ctx.path + ctx.url.search, '')),
    dialog('register', ctx.t('auth.register.title'), registerForm(ctx, emptyForm())),
  ]);
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------
function authPage(ctx: PageCtx, title: string, form: SafeHtml, status = 200): PageResult {
  return htmlPage(layout(ctx, { title, noIndex: true, body: html`<div class="container narrow auth-page"><section class="card auth-card"><h1>${title}</h1>${form}</section></div>` }), status);
}

export async function loginPage(ctx: PageCtx): Promise<PageResult> {
  const next = safeNext(ctx.url.searchParams.get('next'));
  if (ctx.me) return redirect(homeFor(ctx, ctx.me, next));
  return authPage(ctx, ctx.t('auth.login.title'), loginForm(ctx, emptyForm(), next));
}

export async function loginSubmit(ctx: PageCtx): Promise<PageResult> {
  const values = formValues(ctx, 'identifier');
  const next = safeNext(ctx.form.get('next'));
  try {
    const result = await ctx.api.post<{ user: Me }>('/v1/auth/login', { identifier: values.identifier, password: ctx.form.get('password') ?? '' });
    return redirect(homeFor(ctx, result.user, next), { kind: 'success', key: 'auth.login.success' });
  } catch (error) {
    if (isApiError(error, 'account_locked') || isApiError(error, 'rate_limited')) {
      return authPage(ctx, ctx.t('auth.login.title'), loginForm(ctx, { values, errors: {}, message: ctx.t(isApiError(error, 'account_locked') ? 'errors.codes.account_locked' : 'errors.rateLimited') }, next), 429);
    }
    const state = formFromError(ctx, error, values);
    if (isApiError(error, 'validation')) state.message = ctx.t('errors.codes.invalid_credentials');
    return authPage(ctx, ctx.t('auth.login.title'), loginForm(ctx, state, next), 401);
  }
}

export async function registerPage(ctx: PageCtx): Promise<PageResult> {
  if (ctx.me) return redirect(homeFor(ctx, ctx.me, null));
  return authPage(ctx, ctx.t('auth.register.title'), registerForm(ctx, emptyForm()));
}

export async function registerSubmit(ctx: PageCtx): Promise<PageResult> {
  const values = formValues(ctx, 'username', 'email', 'callingCode', 'mobile', 'firstName', 'lastName', 'dateOfBirth', 'country', 'currency', 'acceptTerms', 'marketingOptIn');
  try {
    await ctx.api.post('/v1/auth/register', {
      username: values.username,
      email: values.email,
      callingCode: values.callingCode,
      mobile: values.mobile,
      password: ctx.form.get('password') ?? '',
      firstName: values.firstName,
      lastName: values.lastName,
      dateOfBirth: values.dateOfBirth,
      country: values.country,
      currency: values.currency,
      acceptTerms: values.acceptTerms === 'on',
      marketingOptIn: values.marketingOptIn === 'on',
      preferredLocale: ctx.locale,
      ...(ctx.form.get('cf-turnstile-response') ? { captchaToken: ctx.form.get('cf-turnstile-response') } : {}),
    });
    return redirect(href(ctx, '/account'), { kind: 'success', key: 'auth.register.success' });
  } catch (error) {
    return authPage(ctx, ctx.t('auth.register.title'), registerForm(ctx, formFromError(ctx, error, values)), 422);
  }
}

export async function logoutSubmit(ctx: PageCtx): Promise<PageResult> {
  if (ctx.me) {
    try {
      await ctx.api.post('/v1/auth/logout');
    } catch {
      // already signed out: the cookie is cleared anyway
    }
  }
  ctx.setCookies.push(serializeCookie(ctx.config.sessionCookie, '', { secure: ctx.config.cookieSecure, maxAgeSeconds: 0 }));
  return redirect(href(ctx, '/'), { kind: 'info', key: 'auth.loggedOut' });
}

function backTo(ctx: PageCtx): string {
  const back = ctx.form.get('back') ?? '';
  return /^\/[a-z]{2,3}\/(?![/\\])[\w\-./?=&%]*$/.test(back) ? back : href(ctx, '/');
}

export async function currencySubmit(ctx: PageCtx): Promise<PageResult> {
  const code = ctx.form.get('code') ?? '';
  if (!ctx.publicConfig.currencies.some((c) => c.code === code)) return redirect(backTo(ctx));
  if (ctx.me?.role === 'user') {
    await ctx.api.patch('/v1/account/preferences', { displayCurrency: code === ctx.me.accountCurrency ? null : code });
  }
  ctx.setCookies.push(serializeCookie('aurum_currency', code, { secure: ctx.config.cookieSecure, maxAgeSeconds: 365 * 86_400 }));
  return redirect(backTo(ctx));
}

export async function themeSubmit(ctx: PageCtx): Promise<PageResult> {
  const theme = ctx.form.get('theme') === 'light' ? 'light' : 'dark';
  // readable by app.js so the switch can happen instantly without a reload
  ctx.setCookies.push(serializeCookie('aurum_theme', theme, { secure: ctx.config.cookieSecure, maxAgeSeconds: 365 * 86_400, httpOnly: false }));
  return redirect(backTo(ctx));
}
