/** Page skeletons: the public site (header, navigation, footer) and the dashboards (sidebar). */
import { assetUrl } from '../assets.ts';
import { can, currencyName, href, isStaff, localeHref, money } from '../context.ts';
import type { PageCtx } from '../context.ts';
import { cx, html } from '../html.ts';
import type { Renderable, SafeHtml } from '../html.ts';
import { LOCALE_META, isLocale } from '../i18n.ts';
import type { Locale } from '../i18n.ts';
import { csrfField, flashAlert } from './components.ts';
import { icon, logoMark } from './icons.ts';

export type NavKey = 'home' | 'sports' | 'live' | 'casino' | 'liveCasino' | 'virtuals' | 'promotions' | 'shops' | 'account' | 'none';

interface HeadOptions {
  title: string;
  description?: string;
  noIndex?: boolean;
}

function head(ctx: PageCtx, o: HeadOptions): SafeHtml {
  const site = ctx.t('meta.siteName');
  const fullTitle = o.title === site ? o.title : `${o.title} | ${site}`;
  const canonical = `${ctx.config.publicOrigin}/${ctx.locale}${ctx.path === '/' ? '/' : ctx.path}`;
  const locales = ctx.publicConfig.languages.map((l) => l.code).filter(isLocale);
  return html`<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${fullTitle}</title>
<meta name="description" content="${o.description ?? ctx.t('meta.defaultDescription')}">
${o.noIndex ? html`<meta name="robots" content="noindex, nofollow">` : html`<link rel="canonical" href="${canonical}">${locales.map((l) => html`<link rel="alternate" hreflang="${l}" href="${ctx.config.publicOrigin}/${l}${ctx.path === '/' ? '/' : ctx.path}">`)}`}
<meta name="theme-color" content="#0b0b0f">
<meta property="og:title" content="${fullTitle}">
<meta property="og:site_name" content="${site}">
<link rel="icon" href="${assetUrl('favicon.svg')}" type="image/svg+xml">
<link rel="stylesheet" href="${assetUrl('app.css')}">
<script src="${assetUrl('app.js')}" defer></script>
</head>`;
}

function htmlOpen(ctx: PageCtx, bodyClass: string, inner: SafeHtml, headHtml: SafeHtml): SafeHtml {
  return html`<html lang="${LOCALE_META[ctx.locale].htmlLang}" dir="${ctx.dir}" data-theme="${ctx.theme}">
${headHtml}
<body class="${bodyClass}" data-locale="${ctx.locale}">
<a class="skip-link" href="#main">${ctx.t('common.skipToContent')}</a>
${inner}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Header pieces
// ---------------------------------------------------------------------------
function languageMenu(ctx: PageCtx): SafeHtml {
  const enabled = ctx.publicConfig.languages.filter((l) => isLocale(l.code));
  return html`<details class="dropdown" data-dropdown>
<summary class="chip" aria-label="${ctx.t('nav.languageSelector')}">${icon('globe')}<span class="chip-text">${LOCALE_META[ctx.locale].nativeName}</span>${icon('down', 'icon icon-sm')}</summary>
<ul class="menu" role="list">${enabled.map((l) => html`<li><a href="${localeHref(ctx, l.code as Locale)}" hreflang="${l.code}" lang="${l.code}"${l.code === ctx.locale ? html` aria-current="true"` : ''}>${l.nativeName}</a></li>`)}</ul>
</details>`;
}

function currencyMenu(ctx: PageCtx): SafeHtml {
  const list = ctx.publicConfig.currencies;
  if (list.length === 0 || ctx.me?.role === 'admin' || ctx.me?.role === 'super_admin' || ctx.me?.role === 'cashier') return html``;
  return html`<details class="dropdown" data-dropdown>
<summary class="chip" aria-label="${ctx.t('header.currencySelector')}">${icon('currency')}<span class="chip-text">${ctx.displayCurrency ?? ''}</span>${icon('down', 'icon icon-sm')}</summary>
<div class="menu menu-wide">
<p class="menu-note">${ctx.me?.role === 'user' ? ctx.t('header.displayCurrencyNote', { currency: ctx.me.accountCurrency ?? '' }) : ctx.t('header.currencyNote')}</p>
${list.map(
  (c) => html`<form method="post" action="${href(ctx, '/preferences/currency')}">${csrfField(ctx)}<input type="hidden" name="code" value="${c.code}"><input type="hidden" name="back" value="${ctx.url.pathname + ctx.url.search}"><button type="submit" class="menu-item"${c.code === ctx.displayCurrency ? html` aria-current="true"` : ''}><b>${c.code}</b> <span class="muted">${currencyName(ctx, c.code)}</span></button></form>`,
)}
</div>
</details>`;
}

function themeToggle(ctx: PageCtx): SafeHtml {
  const next = ctx.theme === 'dark' ? 'light' : 'dark';
  return html`<form method="post" action="${href(ctx, '/preferences/theme')}" class="inline-form">${csrfField(ctx)}<input type="hidden" name="theme" value="${next}"><input type="hidden" name="back" value="${ctx.url.pathname + ctx.url.search}">
<button type="submit" class="chip chip-icon" data-theme-toggle aria-label="${ctx.t('nav.toggleTheme')}" title="${ctx.t(ctx.theme === 'dark' ? 'common.lightMode' : 'common.darkMode')}">${icon(ctx.theme === 'dark' ? 'sun' : 'moon')}</button></form>`;
}

function accountMenu(ctx: PageCtx): SafeHtml {
  const me = ctx.me;
  if (!me) {
    return html`<a class="btn btn-dark" href="${href(ctx, `/login?next=${encodeURIComponent(ctx.path + ctx.url.search)}`)}" data-dialog="login">${ctx.t('nav.login')}</a>
<a class="btn btn-gold" href="${href(ctx, '/register')}" data-dialog="register">${ctx.t('nav.register')}</a>`;
  }
  const links: SafeHtml[] = [];
  if (me.role === 'user') {
    links.push(html`<li><a href="${href(ctx, '/account')}">${icon('user')}<span>${ctx.t('nav.account')}</span></a></li>`);
    links.push(html`<li><a href="${href(ctx, '/account/withdrawals')}">${icon('cash')}<span>${ctx.t('account.withdrawals')}</span></a></li>`);
    links.push(html`<li><a href="${href(ctx, '/account/transactions')}">${icon('ledger')}<span>${ctx.t('account.transactions')}</span></a></li>`);
  }
  if (isStaff(me)) links.push(html`<li><a href="${href(ctx, '/admin')}">${icon('dashboard')}<span>${ctx.t(me.role === 'super_admin' ? 'admin.superTitle' : 'admin.adminTitle')}</span></a></li>`);
  if (me.role === 'cashier') links.push(html`<li><a href="${href(ctx, '/counter')}">${icon('shop')}<span>${ctx.t('counter.title')}</span></a></li>`);
  links.push(html`<li><a href="${href(ctx, '/account/password')}">${icon('key')}<span>${ctx.t('account.changePassword')}</span></a></li>`);
  const balance = me.wallet ? html`<a class="balance-pill" href="${href(ctx, '/account')}" title="${ctx.t('wallet.balance')}">${icon('wallet')}${money(ctx, me.wallet.balance, { mode: 'display' })}</a>` : html``;
  return html`${balance}
<details class="dropdown dropdown-end" data-dropdown>
<summary class="chip" aria-label="${ctx.t('nav.account')}">${icon('user')}<span class="chip-text">${me.username}</span>${icon('down', 'icon icon-sm')}</summary>
<ul class="menu" role="list">${links}
<li><form method="post" action="${href(ctx, '/logout')}">${csrfField(ctx)}<button type="submit" class="menu-item">${icon('logout')}<span>${ctx.t('nav.logout')}</span></button></form></li>
</ul>
</details>`;
}

const NAV: readonly { key: NavKey; path: string; label: string }[] = [
  { key: 'home', path: '/', label: 'nav.home' },
  { key: 'sports', path: '/sports', label: 'nav.sportsBetting' },
  { key: 'live', path: '/live-betting', label: 'nav.liveBetting' },
  { key: 'casino', path: '/casino', label: 'nav.casino' },
  { key: 'liveCasino', path: '/live-casino', label: 'nav.liveCasino' },
  { key: 'virtuals', path: '/virtuals', label: 'nav.virtuals' },
  { key: 'promotions', path: '/promotions', label: 'nav.promotions' },
  { key: 'shops', path: '/shops', label: 'nav.shops' },
];

function siteHeader(ctx: PageCtx, active: NavKey): SafeHtml {
  return html`<header class="site-header">
<div class="topbar"><div class="container topbar-row">
<a class="brand" href="${href(ctx, '/')}" aria-label="${ctx.t('meta.siteName')}">${logoMark()}<span class="brand-name">${ctx.t('meta.siteName')}</span></a>
<div class="top-actions">${currencyMenu(ctx)}${languageMenu(ctx)}${themeToggle(ctx)}${accountMenu(ctx)}</div>
</div></div>
<nav class="mainnav" aria-label="${ctx.t('nav.mainNavigation')}"><div class="container"><ul role="list">
${NAV.map((n) => html`<li><a href="${href(ctx, n.path)}"${n.key === active ? html` aria-current="page" class="active"` : ''}>${ctx.t(n.label)}</a></li>`)}
</ul></div></nav>
</header>`;
}

function siteFooter(ctx: PageCtx): SafeHtml {
  const year = ctx.now.getUTCFullYear();
  const legal: [string, string][] = [
    ['/page/about-us', 'footer.aboutUs'],
    ['/page/privacy-policy', 'footer.privacyPolicy'],
    ['/page/terms-and-conditions', 'footer.termsConditions'],
    ['/page/responsible-gaming', 'footer.responsibleGaming'],
    ['/page/sportsbook-rules', 'footer.sportsbookRules'],
    ['/promotions', 'footer.promotions'],
  ];
  return html`<footer class="site-footer">
<div class="container footer-grid">
<div class="footer-brand"><a class="brand" href="${href(ctx, '/')}">${logoMark()}<span class="brand-name">${ctx.t('meta.siteName')}</span></a><p class="muted">${ctx.t('footer.tagline')}</p></div>
<nav aria-label="${ctx.t('footer.siteLinks')}"><h2 class="footer-title">${ctx.t('footer.explore')}</h2><ul role="list">${NAV.slice(1).map((n) => html`<li><a href="${href(ctx, n.path)}">${ctx.t(n.label)}</a></li>`)}</ul></nav>
<nav aria-label="${ctx.t('footer.legalLinks')}"><h2 class="footer-title">${ctx.t('footer.information')}</h2><ul role="list">${legal.map(([p, k]) => html`<li><a href="${href(ctx, p)}">${ctx.t(k)}</a></li>`)}</ul></nav>
<div><h2 class="footer-title">${ctx.t('footer.paymentMethods')}</h2>
<p class="muted small">${ctx.t('footer.cashAtShops')}</p>
<ul class="currency-badges" role="list">${ctx.publicConfig.currencies.map((c) => html`<li title="${currencyName(ctx, c.code)}">${c.code}</li>`)}</ul>
<a class="btn btn-ghost btn-sm" href="${href(ctx, '/shops')}">${icon('shop')}<span>${ctx.t('shops.findShop')}</span></a></div>
</div>
<div class="container footer-bottom">
<span class="age-badge" aria-label="${ctx.t('footer.ageNotice')}">18+</span>
<p class="small muted">${ctx.t('footer.ageNotice')}</p>
<a class="btn btn-dark btn-sm" href="${href(ctx, '/page/responsible-gaming')}">${icon('shield')}<span>${ctx.t('footer.playResponsibly')}</span></a>
<p class="small muted copyright">${ctx.t('footer.copyright', { year, name: ctx.t('meta.siteName') })}</p>
</div>
</footer>`;
}

export interface LayoutOptions extends HeadOptions {
  body: Renderable;
  active?: NavKey;
  bodyClass?: string;
  /** Rendered for visitors only: the login and register dialogs (filled by the auth pages). */
  dialogs?: Renderable;
}

export function layout(ctx: PageCtx, o: LayoutOptions): SafeHtml {
  const inner = html`${siteHeader(ctx, o.active ?? 'none')}
<main id="main" class="site-main" tabindex="-1">${ctx.flash ? html`<div class="container flash-wrap">${flashAlert(ctx)}</div>` : ''}${o.body}</main>
${siteFooter(ctx)}
${o.dialogs ?? ''}`;
  return htmlOpen(ctx, cx('site', o.bodyClass), inner, head(ctx, o));
}

// ---------------------------------------------------------------------------
// Dashboards (Super Admin / Admin and the shop counter)
// ---------------------------------------------------------------------------
export interface SideLink {
  path: string;
  label: string;
  iconName: string;
  /** Matches when the current path starts with this prefix. */
  match?: string;
  show?: boolean;
}

export interface SideGroup {
  title: string;
  links: readonly SideLink[];
}

export function dashboardLayout(ctx: PageCtx, o: HeadOptions & { body: Renderable; groups: readonly SideGroup[]; heading: string; area: 'admin' | 'counter' }): SafeHtml {
  const me = ctx.me;
  const isActive = (l: SideLink) => {
    const m = l.match ?? l.path;
    return m === `/${o.area}` ? ctx.path === m : ctx.path === m || ctx.path.startsWith(`${m}/`);
  };
  const sidebar = html`<aside class="dash-side" id="dash-side">
<nav aria-label="${o.heading}">${o.groups.map((g) => {
    const links = g.links.filter((l) => l.show !== false);
    if (links.length === 0) return '';
    return html`<div class="side-group"><p class="side-title">${g.title}</p><ul role="list">${links.map((l) => html`<li><a href="${href(ctx, l.path)}"${isActive(l) ? html` aria-current="page" class="active"` : ''}>${icon(l.iconName)}<span>${l.label}</span></a></li>`)}</ul></div>`;
  })}</nav>
</aside>`;
  const inner = html`<header class="dash-header">
<div class="dash-header-row">
<a class="brand" href="${href(ctx, '/')}">${logoMark()}<span class="brand-name">${ctx.t('meta.siteName')}</span></a>
<span class="dash-area">${o.heading}</span>
<div class="top-actions">${languageMenu(ctx)}${themeToggle(ctx)}
${me ? html`<details class="dropdown dropdown-end" data-dropdown><summary class="chip">${icon('user')}<span class="chip-text">${me.username}</span>${icon('down', 'icon icon-sm')}</summary>
<ul class="menu" role="list"><li><a href="${href(ctx, '/account/password')}">${icon('key')}<span>${ctx.t('account.changePassword')}</span></a></li>
<li><form method="post" action="${href(ctx, '/logout')}">${csrfField(ctx)}<button type="submit" class="menu-item">${icon('logout')}<span>${ctx.t('nav.logout')}</span></button></form></li></ul></details>` : ''}
</div></div>
</header>
<div class="dash">
${sidebar}
<main id="main" class="dash-main" tabindex="-1">${ctx.flash ? flashAlert(ctx) : ''}${o.body}</main>
</div>`;
  return htmlOpen(ctx, `dashboard area-${o.area}`, inner, head(ctx, { ...o, noIndex: true }));
}

/** Navigation of the Super Admin / Admin dashboard, filtered by permission. */
export function adminGroups(ctx: PageCtx): SideGroup[] {
  const me = ctx.me;
  const superAdmin = me?.role === 'super_admin';
  return [
    {
      title: ctx.t('admin.groups.overview'),
      links: [
        { path: '/admin', label: ctx.t('admin.nav.dashboard'), iconName: 'dashboard' },
        { path: '/admin/reports', label: ctx.t('admin.nav.reports'), iconName: 'rate', show: can(me, 'reports.view', 'shops.view', 'shops.manage', 'shops.cash') },
      ],
    },
    {
      title: ctx.t('admin.groups.players'),
      links: [
        { path: '/admin/players', label: ctx.t('admin.nav.players'), iconName: 'users', show: can(me, 'users.view', 'users.manage', 'balances.view', 'balances.manage') },
        { path: '/admin/ledger', label: ctx.t('admin.nav.ledger'), iconName: 'ledger', show: can(me, 'balances.view', 'balances.manage') },
        { path: '/admin/withdrawals', label: ctx.t('admin.nav.withdrawals'), iconName: 'cash', show: can(me, 'withdrawals.view', 'withdrawals.manage', 'shops.view', 'shops.manage') },
      ],
    },
    {
      title: ctx.t('admin.groups.shops'),
      links: [
        { path: '/admin/shops', label: ctx.t('admin.nav.shops'), iconName: 'shop', show: can(me, 'shops.view', 'shops.manage', 'shops.cash') },
        { path: '/admin/workers', label: ctx.t('admin.nav.workers'), iconName: 'users', show: can(me, 'shops.view', 'shops.manage', 'shops.cash') },
        { path: '/admin/shop-cash', label: ctx.t('admin.nav.shopCash'), iconName: 'coins', show: can(me, 'shops.view', 'shops.manage', 'shops.cash') },
      ],
    },
    {
      title: ctx.t('admin.groups.content'),
      links: [
        { path: '/admin/banners', label: ctx.t('admin.nav.banners'), iconName: 'image', show: can(me, 'banners.manage') },
        { path: '/admin/promotions', label: ctx.t('admin.nav.promotions'), iconName: 'megaphone', show: can(me, 'promotions.manage') },
        { path: '/admin/pages', label: ctx.t('admin.nav.pages'), iconName: 'page', show: can(me, 'pages.manage') },
        { path: '/admin/games', label: ctx.t('admin.nav.games'), iconName: 'game', show: can(me, 'games.manage') },
        { path: '/admin/providers', label: ctx.t('admin.nav.providers'), iconName: 'grid', show: can(me, 'games.manage') },
        { path: '/admin/media', label: ctx.t('admin.nav.media'), iconName: 'image', show: can(me, 'banners.manage', 'promotions.manage', 'games.manage') },
      ],
    },
    {
      title: ctx.t('admin.groups.system'),
      links: [
        { path: '/admin/staff', label: ctx.t('admin.nav.staff'), iconName: 'shield', show: superAdmin },
        { path: '/admin/currencies', label: ctx.t('admin.nav.currencies'), iconName: 'currency', show: superAdmin },
        { path: '/admin/rates', label: ctx.t('admin.nav.rates'), iconName: 'rate', show: superAdmin },
        { path: '/admin/languages', label: ctx.t('admin.nav.languages'), iconName: 'language', show: superAdmin },
        { path: '/admin/countries', label: ctx.t('admin.nav.countries'), iconName: 'flag', show: superAdmin },
        { path: '/admin/settings', label: ctx.t('admin.nav.settings'), iconName: 'settings', show: superAdmin },
        { path: '/admin/audit', label: ctx.t('admin.nav.audit'), iconName: 'audit', show: can(me, 'audit.view') },
      ],
    },
  ];
}

export function adminLayout(ctx: PageCtx, o: HeadOptions & { body: Renderable }): SafeHtml {
  const heading = ctx.t(ctx.me?.role === 'super_admin' ? 'admin.superTitle' : 'admin.adminTitle');
  return dashboardLayout(ctx, { ...o, heading, groups: adminGroups(ctx), area: 'admin' });
}

export function counterLayout(ctx: PageCtx, o: HeadOptions & { body: Renderable }): SafeHtml {
  const manager = ctx.me?.shop?.role === 'manager';
  const groups: SideGroup[] = [
    {
      title: ctx.me?.shop ? `${ctx.me.shop.name} · ${ctx.me.shop.code}` : ctx.t('counter.title'),
      links: [
        { path: '/counter', label: ctx.t('counter.nav.home'), iconName: 'dashboard' },
        { path: '/counter/deposit', label: ctx.t('counter.nav.deposit'), iconName: 'plus' },
        { path: '/counter/payout', label: ctx.t('counter.nav.payout'), iconName: 'cash' },
        { path: '/counter/new-player', label: ctx.t('counter.nav.newPlayer'), iconName: 'user' },
        { path: '/counter/transactions', label: ctx.t('counter.nav.transactions'), iconName: 'ledger' },
        { path: '/counter/cash-count', label: ctx.t('counter.nav.cashCount'), iconName: 'coins', show: manager },
      ],
    },
  ];
  return dashboardLayout(ctx, { ...o, heading: ctx.t('counter.title'), groups, area: 'counter' });
}

/** A bare page (receipts for printing, the maintenance page). */
export function bareLayout(ctx: PageCtx, o: HeadOptions & { body: Renderable; bodyClass?: string }): SafeHtml {
  return htmlOpen(ctx, cx('bare', o.bodyClass), html`<main id="main">${o.body}</main>`, head(ctx, { ...o, noIndex: true }));
}
