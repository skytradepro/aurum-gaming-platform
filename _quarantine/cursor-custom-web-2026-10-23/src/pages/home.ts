/** Home page: hero banners, top winners (demo only), section tiles, jackpot levels (demo only), featured games, promotions, shops. */
import { GLYPH_NAMES } from '../assets.ts';
import { href, htmlPage, money } from '../context.ts';
import type { PageCtx, PageResult } from '../context.ts';
import { cx, html, safeHref } from '../html.ts';
import type { SafeHtml } from '../html.ts';
import { linkButton } from '../layout/components.ts';
import { icon } from '../layout/icons.ts';
import { layout } from '../layout/shell.ts';
import * as data from '../public-data.ts';
import type { DemoJackpotDTO, DemoWinnerDTO, PublicBannerDTO, PublicPromotionDTO } from '../types.ts';
import { authDialogs } from './auth.ts';
import { demoNotice, gameRow } from './catalog.ts';
import { promotionCard } from './promotions.ts';

export function heroSlider(ctx: PageCtx, list: readonly PublicBannerDTO[], fallback: { title: string; text: string; cta: string; link: string } | null): SafeHtml {
  if (list.length === 0 && !fallback) return html``;
  const slides =
    list.length > 0
      ? list.map(
          (b, i) => html`<article class="hero-slide" aria-roledescription="${ctx.t('home.slide')}" aria-label="${i + 1} / ${list.length}" id="hero-${b.id}">
<picture>${b.imageMobile ? html`<source media="(max-width: 700px)" srcset="${b.imageMobile.url}">` : ''}<img src="${b.imageDesktop.url}" alt="${b.alt}" width="${b.imageDesktop.width}" height="${b.imageDesktop.height}"${i === 0 ? html` fetchpriority="high"` : html` loading="lazy"`}></picture>
${b.title || b.subtitle || b.ctaLabel ? html`<div class="hero-content"><div class="container">${b.title ? html`<h2 class="hero-title">${b.title}</h2>` : ''}${b.subtitle ? html`<p class="hero-text">${b.subtitle}</p>` : ''}${b.ctaLabel ? html`<a class="btn btn-gold btn-lg" href="${safeHref(b.linkUrl || '/')}">${b.ctaLabel}</a>` : ''}</div></div>` : ''}
</article>`,
        )
      : [
          html`<article class="hero-slide hero-fallback" aria-label="1 / 1">
<div class="hero-art" aria-hidden="true"><span></span><span></span><span></span></div>
<div class="hero-content"><div class="container"><h2 class="hero-title">${fallback?.title}</h2><p class="hero-text">${fallback?.text}</p><a class="btn btn-gold btn-lg" href="${fallback?.link ?? '#'}">${fallback?.cta}</a></div></div>
</article>`,
        ];
  const count = list.length || 1;
  return html`<section class="hero" data-slider aria-roledescription="${ctx.t('home.carousel')}" aria-label="${ctx.t('home.featuredBanners')}">
<div class="hero-track" data-track tabindex="0">${slides}</div>
${count > 1
  ? html`<button type="button" class="hero-arrow hero-prev" data-prev aria-label="${ctx.t('home.heroPrevious')}">${icon(ctx.dir === 'rtl' ? 'right' : 'left')}</button>
<button type="button" class="hero-arrow hero-next" data-next aria-label="${ctx.t('home.heroNext')}">${icon(ctx.dir === 'rtl' ? 'left' : 'right')}</button>
<div class="hero-dots">${Array.from({ length: count }, (_, i) => html`<button type="button" data-goto="${i}" aria-label="${ctx.t('home.heroGoTo', { number: i + 1 })}"${i === 0 ? html` aria-current="true"` : ''}></button>`)}</div>`
  : ''}
</section>`;
}

function glyphFor(text: string): string {
  let h = 0;
  for (const ch of text) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return GLYPH_NAMES[h % GLYPH_NAMES.length] as string;
}

const WINNER_COLORS: readonly [string, string][] = [['2a0b4e', '7b2ff7'], ['3d0a0a', 'e0453a'], ['06283d', '1fa2ff'], ['0b3d2e', '19b37a'], ['3d2a06', 'f5a300'], ['1d1d2b', '6c6c8a']];

function topWinners(ctx: PageCtx, list: readonly DemoWinnerDTO[]): SafeHtml {
  if (list.length === 0) return html``;
  return html`<section class="section winners">
<div class="section-head"><h2>${icon('trophy')}<span>${ctx.t('home.topWinners')}</span></h2>${demoNotice(ctx)}</div>
<ul class="winner-strip" role="list">${list.map((w, i) => {
    const [c1, c2] = WINNER_COLORS[i % WINNER_COLORS.length] as [string, string];
    const art = `/art/game.svg?c1=${c1}&c2=${c2}&g=${glyphFor(w.game)}&t=${encodeURIComponent(w.game)}`;
    return html`<li class="winner-card"><img src="${art}" alt="" width="64" height="64" loading="lazy"><div><p class="winner-user">${w.username}</p><p class="winner-game">${w.game}</p><p class="winner-amount">${money(ctx, { amountMinor: w.amountMinor, currency: w.currency }, { compact: true })}</p></div></li>`;
  })}</ul>
</section>`;
}

function tiles(ctx: PageCtx): SafeHtml {
  const items: [string, string, string][] = [
    ['/sports', 'home.tiles.sports', 'ball'],
    ['/live-betting', 'home.tiles.liveSports', 'live'],
    ['/promotions', 'home.tiles.promos', 'gift'],
    ['/casino', 'home.tiles.casino', 'cards'],
    ['/live-casino', 'home.tiles.liveCasino', 'dealer'],
    ['/live-channels', 'home.tiles.liveChannels', 'tv'],
  ];
  return html`<section class="section"><ul class="tiles" role="list">${items.map(([p, k, i]) => html`<li><a class="tile" href="${href(ctx, p)}"><span class="tile-icon">${icon(i, 'icon icon-xl')}</span><span class="tile-label">${ctx.t(k)}</span></a></li>`)}</ul></section>`;
}

const HEX_BADGE = (n: number) =>
  html`<svg class="hex" viewBox="0 0 60 68" width="60" height="68" aria-hidden="true"><path d="M30 2 L57 17 L57 51 L30 66 L3 51 L3 17 Z" fill="rgba(0,0,0,.25)" stroke="currentColor" stroke-width="3"/><text x="30" y="43" text-anchor="middle" font-size="24" font-weight="800" fill="currentColor">${n}</text></svg>`;

function jackpots(ctx: PageCtx, list: readonly DemoJackpotDTO[]): SafeHtml {
  if (list.length === 0) return html``;
  const levels = ['ultimate', 'vip', 'plus', 'basic'] as const;
  return html`<section class="section">
<div class="section-head"><h2>${ctx.t('home.jackpotLevels')}</h2>${demoNotice(ctx)}</div>
<ul class="tiers" role="list">${levels.map((level, i) => {
    const j = list.find((x) => x.level === level);
    return html`<li class="${cx('tier', `tier-${level}`)}">${HEX_BADGE(4 - i)}<div><p class="tier-name">${ctx.t(`home.tiers.${level}`)}</p><p class="tier-amount">${j ? money(ctx, { amountMinor: j.amountMinor, currency: j.currency }) : '—'}</p></div></li>`;
  })}</ul>
</section>`;
}

function promoRow(ctx: PageCtx, list: readonly PublicPromotionDTO[]): SafeHtml {
  if (list.length === 0) return html``;
  return html`<section class="section">
<div class="section-head"><h2>${ctx.t('promotions.title')}</h2><a class="link-more" href="${href(ctx, '/promotions')}">${ctx.t('common.viewAll')}</a></div>
<ul class="promo-grid" role="list">${list.slice(0, 3).map((p) => promotionCard(ctx, p))}</ul>
</section>`;
}

export function shopsBand(ctx: PageCtx): SafeHtml {
  return html`<section class="section shops-band">
<div class="shops-band-inner">
<div><h2>${icon('shop')}<span>${ctx.t('home.shopsTitle')}</span></h2><p class="muted">${ctx.t('home.shopsText')}</p></div>
<ol class="steps" role="list">
<li><span class="step-n">1</span><span>${ctx.t('home.shopsStep1')}</span></li>
<li><span class="step-n">2</span><span>${ctx.t('home.shopsStep2')}</span></li>
<li><span class="step-n">3</span><span>${ctx.t('home.shopsStep3')}</span></li>
</ol>
${linkButton(ctx.t('shops.findShop'), href(ctx, '/shops'), { kind: 'gold', iconName: 'map' })}
</div>
</section>`;
}

export async function homePage(ctx: PageCtx): Promise<PageResult> {
  const currency = ctx.displayCurrency ?? ctx.publicConfig.currencies[0]?.code ?? 'TND';
  const [heroes, winners, levels, featured, newest, promos] = await Promise.all([
    data.banners(ctx, 'home_hero'),
    data.demoWinners(ctx, currency).catch(() => []),
    data.demoJackpots(ctx, currency).catch(() => []),
    data.games(ctx, { featured: true, limit: 12 }),
    data.games(ctx, { new: true, sort: 'newest', limit: 12 }),
    data.promotions(ctx),
  ]);
  const fallback = {
    title: ctx.t('home.fallbackTitle'),
    text: ctx.t('home.fallbackText'),
    cta: ctx.me ? ctx.t('home.fallbackCtaPlay') : ctx.t('nav.register'),
    link: ctx.me ? href(ctx, '/casino') : href(ctx, '/register'),
  };
  const body = html`${heroSlider(ctx, heroes, fallback)}
<div class="container">
${topWinners(ctx, winners)}
${tiles(ctx)}
${jackpots(ctx, levels)}
${gameRow(ctx, ctx.t('casino.featured'), featured.items, href(ctx, '/casino/featured'))}
${gameRow(ctx, ctx.t('casino.new'), newest.items, href(ctx, '/casino/new'))}
${promoRow(ctx, promos)}
${shopsBand(ctx)}
</div>`;
  return htmlPage(layout(ctx, { title: ctx.t('meta.homeTitle'), active: 'home', body, dialogs: authDialogs(ctx) }));
}
