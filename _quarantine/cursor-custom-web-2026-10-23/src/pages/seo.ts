/** robots.txt and sitemap.xml for the public pages (dashboards and accounts are excluded). */
import type { WebConfig } from '../config.ts';
import { escapeHtml } from '../html.ts';

const PUBLIC_PATHS = ['/', '/casino', '/live-casino', '/promotions', '/sports', '/live-betting', '/virtuals', '/shops',
  '/page/about-us', '/page/privacy-policy', '/page/terms-and-conditions', '/page/responsible-gaming', '/page/sportsbook-rules'];

export function robotsTxt(config: WebConfig): string {
  if (config.env !== 'production') return 'User-agent: *\nDisallow: /\n';
  return `User-agent: *\nDisallow: /*/admin\nDisallow: /*/counter\nDisallow: /*/account\nDisallow: /api/\nSitemap: ${config.publicOrigin}/sitemap.xml\n`;
}

export function sitemapXml(config: WebConfig, locales: readonly string[]): string {
  const urls = PUBLIC_PATHS.map((p) => {
    const alternates = locales.map((l) => `<xhtml:link rel="alternate" hreflang="${l}" href="${escapeHtml(`${config.publicOrigin}/${l}${p}`)}"/>`).join('');
    return locales.map((l) => `<url><loc>${escapeHtml(`${config.publicOrigin}/${l}${p}`)}</loc>${alternates}</url>`).join('\n');
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`;
}
