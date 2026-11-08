/** Static files (CSS, JS, icons) and the generated artwork for games without an uploaded image. */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { escapeHtml } from './html.ts';

const ASSETS_DIR = fileURLToPath(new URL('../assets/', import.meta.url));

const TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

export interface Asset {
  body: Buffer;
  type: string;
  hash: string;
}

function load(): Map<string, Asset> {
  const out = new Map<string, Asset>();
  const walk = (dir: string, prefix: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full, `${prefix}${name}/`);
      else {
        const type = TYPES[extname(name)];
        if (!type) continue;
        const body = readFileSync(full);
        out.set(`${prefix}${name}`, { body, type, hash: createHash('sha256').update(body).digest('hex').slice(0, 12) });
      }
    }
  };
  walk(ASSETS_DIR, '');
  return out;
}

let assets = load();

/** Development: pick up CSS/JS edits without a restart. */
export function reloadAssets(): void {
  assets = load();
}

export function getAsset(name: string): Asset | undefined {
  return assets.get(name);
}

/** "/assets/app.css?v=<hash>" (cache-busting URL, served with a one-year cache). */
export function assetUrl(name: string): string {
  const a = assets.get(name);
  return a ? `/assets/${name}?v=${a.hash}` : `/assets/${name}`;
}

// ---------------------------------------------------------------------------
// Game artwork. Each placeholder is drawn here from two colours and a symbol (no third-party
// images). Real games use the image the provider supplies under contract.
// ---------------------------------------------------------------------------
const GLYPHS: Record<string, string> = {
  crown: '<path d="M60 128 L44 70 L78 96 L100 56 L122 96 L156 70 L140 128 Z" fill="url(#g)"/><rect x="60" y="134" width="80" height="12" rx="4" fill="url(#g)"/>',
  seven: '<text x="100" y="140" text-anchor="middle" font-family="Georgia,serif" font-weight="700" font-size="104" fill="url(#g)">7</text>',
  cherry: '<path d="M86 118 C 92 80, 108 64, 128 56 M120 112 C 122 84, 126 70, 128 56" stroke="#3fae5a" stroke-width="6" fill="none" stroke-linecap="round"/><circle cx="82" cy="126" r="22" fill="url(#g)"/><circle cx="122" cy="120" r="22" fill="url(#g)"/>',
  diamond: '<path d="M100 52 L148 100 L100 148 L52 100 Z" fill="url(#g)"/><path d="M100 52 L100 148 M52 100 L148 100" stroke="rgba(255,255,255,.35)" stroke-width="3"/>',
  star: '<path d="M100 48 L114 84 L152 86 L122 110 L133 148 L100 126 L67 148 L78 110 L48 86 L86 84 Z" fill="url(#g)"/>',
  rocket: '<path d="M100 44 C 124 64, 130 96, 122 128 L78 128 C 70 96, 76 64, 100 44 Z" fill="url(#g)"/><circle cx="100" cy="88" r="10" fill="rgba(0,0,0,.35)"/><path d="M78 118 L60 140 L80 136 Z M122 118 L140 140 L120 136 Z" fill="url(#g)"/><path d="M88 132 L100 160 L112 132 Z" fill="#ff8a3d"/>',
  bell: '<path d="M100 50 C 72 50, 66 76, 66 104 L56 128 L144 128 L134 104 C 134 76, 128 50, 100 50 Z" fill="url(#g)"/><circle cx="100" cy="138" r="10" fill="url(#g)"/>',
  clover: '<circle cx="100" cy="74" r="20" fill="url(#g)"/><circle cx="74" cy="100" r="20" fill="url(#g)"/><circle cx="126" cy="100" r="20" fill="url(#g)"/><circle cx="100" cy="122" r="20" fill="url(#g)"/><path d="M100 120 C 104 136, 112 146, 120 152" stroke="url(#g)" stroke-width="6" fill="none"/>',
  coin: '<circle cx="100" cy="100" r="48" fill="url(#g)"/><circle cx="100" cy="100" r="36" fill="none" stroke="rgba(0,0,0,.25)" stroke-width="4"/><path d="M100 76 L107 94 L126 95 L111 106 L116 124 L100 114 L84 124 L89 106 L74 95 L93 94 Z" fill="rgba(0,0,0,.25)"/>',
  dice: '<rect x="56" y="56" width="88" height="88" rx="16" fill="url(#g)"/><circle cx="78" cy="78" r="8" fill="#1a1a22"/><circle cx="100" cy="100" r="8" fill="#1a1a22"/><circle cx="122" cy="122" r="8" fill="#1a1a22"/><circle cx="122" cy="78" r="8" fill="#1a1a22"/><circle cx="78" cy="122" r="8" fill="#1a1a22"/>',
  spade: '<path d="M100 46 C 120 76, 150 88, 150 112 C 150 130, 128 138, 108 124 L116 154 L84 154 L92 124 C 72 138, 50 130, 50 112 C 50 88, 80 76, 100 46 Z" fill="url(#g)"/>',
  wheel: '<circle cx="100" cy="100" r="50" fill="none" stroke="url(#g)" stroke-width="10"/><circle cx="100" cy="100" r="10" fill="url(#g)"/><path d="M100 50 V150 M50 100 H150 M65 65 L135 135 M135 65 L65 135" stroke="url(#g)" stroke-width="5"/>',
  flame: '<path d="M100 44 C 112 72, 140 86, 136 120 C 132 148, 110 156, 100 156 C 84 156, 64 146, 64 118 C 64 96, 82 88, 86 68 C 96 84, 100 92, 100 44 Z" fill="url(#g)"/>',
  bolt: '<path d="M112 44 L66 108 L96 108 L86 156 L134 88 L104 88 Z" fill="url(#g)"/>',
  gem: '<path d="M70 70 L130 70 L150 96 L100 150 L50 96 Z" fill="url(#g)"/><path d="M50 96 H150 M70 70 L84 96 L100 150 L116 96 L130 70" stroke="rgba(255,255,255,.35)" stroke-width="2.5" fill="none"/>',
  moon: '<path d="M118 48 C 84 54, 64 82, 70 114 C 76 142, 104 158, 134 150 C 104 140, 88 116, 94 88 C 98 70, 108 56, 118 48 Z" fill="url(#g)"/>',
};

export const GLYPH_NAMES = Object.keys(GLYPHS);

const HEX = /^[0-9a-fA-F]{6}$/;

/** Builds the SVG for /art/game.svg?c1=..&c2=..&g=..&t=.. (all inputs validated). */
export function gameArtSvg(query: URLSearchParams): string {
  const c1 = HEX.test(query.get('c1') ?? '') ? `#${query.get('c1')}` : '#3b1d6e';
  const c2 = HEX.test(query.get('c2') ?? '') ? `#${query.get('c2')}` : '#7b2ff7';
  const glyph = GLYPHS[query.get('g') ?? ''] ?? (GLYPHS.star as string);
  const title = escapeHtml((query.get('t') ?? '').slice(0, 28));
  const size = title.length > 16 ? 15 : 18;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" role="img" aria-label="${title}">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>
<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3b0"/><stop offset=".55" stop-color="#ffcc00"/><stop offset="1" stop-color="#d48f00"/></linearGradient>
<radialGradient id="glow" cx=".5" cy=".42" r=".55"><stop offset="0" stop-color="#ffffff" stop-opacity=".28"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
</defs>
<rect width="200" height="200" fill="url(#bg)"/>
<g opacity=".12" stroke="#fff" stroke-width="1">${Array.from({ length: 12 }, (_, i) => `<line x1="100" y1="86" x2="${100 + Math.round(160 * Math.cos((i * Math.PI) / 6))}" y2="${86 + Math.round(160 * Math.sin((i * Math.PI) / 6))}"/>`).join('')}</g>
<rect width="200" height="200" fill="url(#glow)"/>
<g transform="translate(0,-14)">${glyph}</g>
<rect x="0" y="152" width="200" height="48" fill="rgba(0,0,0,.38)"/>
<text x="100" y="182" text-anchor="middle" font-family="Segoe UI,Tahoma,Arial,sans-serif" font-weight="700" font-size="${size}" fill="#ffffff">${title}</text>
</svg>`;
}
