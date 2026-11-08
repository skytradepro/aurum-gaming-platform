// Original HANNIBAL banner art (no stock photos, no text, no brands). Rendered with Chromium.
// node gen.mjs  -> casino-desktop.jpg, casino-mobile.jpg, football-desktop.jpg, football-mobile.jpg
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { writeFileSync } from 'node:fs';

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const f = (n) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------- shared pieces
function defsCommon() {
  return `
  <filter id="blur4" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4"/></filter>
  <filter id="blur10" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="10"/></filter>
  <filter id="blur24" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="24"/></filter>
  <filter id="blur60" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="60"/></filter>
  <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur in="SourceAlpha" stdDeviation="14"/><feOffset dx="0" dy="18"/><feComponentTransfer><feFuncA type="linear" slope="0.65"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  <filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope="0.05"/></feComponentTransfer></filter>
  <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#fff1b8"/><stop offset="0.25" stop-color="#f5c518"/><stop offset="0.55" stop-color="#b8860b"/><stop offset="0.8" stop-color="#f7d76a"/><stop offset="1" stop-color="#8a6208"/>
  </linearGradient>
  <linearGradient id="goldV" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fff3c4"/><stop offset="0.4" stop-color="#f2c230"/><stop offset="1" stop-color="#7d5606"/>
  </linearGradient>
  <radialGradient id="sparkle"><stop offset="0" stop-color="#fffbe6" stop-opacity="1"/><stop offset="0.25" stop-color="#ffe27a" stop-opacity="0.8"/><stop offset="1" stop-color="#f5c518" stop-opacity="0"/></radialGradient>`;
}

function sparkle(x, y, s, o = 1) {
  return `<g transform="translate(${f(x)} ${f(y)})" opacity="${o}">
    <circle r="${f(s * 1.6)}" fill="url(#sparkle)" opacity="0.55"/>
    <path d="M0 ${-s * 2.2} Q ${s * 0.18} ${-s * 0.18} ${s * 2.2} 0 Q ${s * 0.18} ${s * 0.18} 0 ${s * 2.2} Q ${-s * 0.18} ${s * 0.18} ${-s * 2.2} 0 Q ${-s * 0.18} ${-s * 0.18} 0 ${-s * 2.2}Z" fill="#fffbe9"/>
  </g>`;
}

function bokeh(r, n, box, colors, rMin, rMax, oMin, oMax, filter = 'blur4') {
  let s = `<g filter="url(#${filter})">`;
  for (let i = 0; i < n; i++) {
    const x = box[0] + r() * (box[2] - box[0]);
    const y = box[1] + r() * (box[3] - box[1]);
    const rad = rMin + r() * (rMax - rMin);
    const c = colors[Math.floor(r() * colors.length)];
    s += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(rad)}" fill="${c}" opacity="${f(oMin + r() * (oMax - oMin))}"/>`;
  }
  return s + '</g>';
}

// ---------------------------------------------------------------- casino
const ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

function wedge(r1, r2, a1, a2) {
  const p = (r, a) => `${f(r * Math.cos(a))} ${f(r * Math.sin(a))}`;
  return `M ${p(r2, a1)} A ${r2} ${r2} 0 0 1 ${p(r2, a2)} L ${p(r1, a2)} A ${r1} ${r1} 0 0 0 ${p(r1, a1)} Z`;
}

function wheel(cx, cy, R, tilt, rot = -0.35) {
  const n = ORDER.length;
  const step = (Math.PI * 2) / n;
  let pockets = '';
  let frets = '';
  let nums = '';
  ORDER.forEach((num, i) => {
    const a1 = rot + i * step;
    const a2 = a1 + step;
    const col = num === 0 ? 'url(#green)' : RED.has(num) ? 'url(#red)' : 'url(#black)';
    pockets += `<path d="${wedge(R * 0.7, R * 0.885, a1, a2)}" fill="${col}"/>`;
    pockets += `<path d="${wedge(R * 0.6, R * 0.7, a1, a2)}" fill="${i % 2 ? '#1a1410' : '#221a12'}"/>`;
    const fx = Math.cos(a1), fy = Math.sin(a1);
    frets += `<line x1="${f(R * 0.6 * fx)}" y1="${f(R * 0.6 * fy)}" x2="${f(R * 0.885 * fx)}" y2="${f(R * 0.885 * fy)}" stroke="url(#gold)" stroke-width="${f(R * 0.006)}"/>`;
    const am = a1 + step / 2;
    const tr = R * 0.8;
    nums += `<text x="0" y="0" transform="translate(${f(tr * Math.cos(am))} ${f(tr * Math.sin(am))}) rotate(${f((am * 180) / Math.PI + 90)})" font-family="DejaVu Sans" font-weight="700" font-size="${f(R * 0.062)}" fill="#f7f3e8" text-anchor="middle" dominant-baseline="central">${num}</text>`;
  });
  // turret arms
  let arms = '';
  for (let k = 0; k < 4; k++) {
    const a = rot * 2 + (k * Math.PI) / 2;
    const ex = R * 0.34 * Math.cos(a), ey = R * 0.34 * Math.sin(a);
    arms += `<line x1="0" y1="0" x2="${f(ex)}" y2="${f(ey)}" stroke="url(#gold)" stroke-width="${f(R * 0.035)}" stroke-linecap="round"/>`;
    arms += `<circle cx="${f(ex)}" cy="${f(ey)}" r="${f(R * 0.04)}" fill="url(#goldBall)"/>`;
  }
  // ball on the track (drawn round, outside the tilt)
  const ba = rot + 1.15;
  const br = R * 0.915;
  const bx = cx + br * Math.cos(ba);
  const by = cy + br * Math.sin(ba) * tilt;
  return `
  <g>
    <ellipse cx="${cx}" cy="${f(cy + R * tilt * 0.22)}" rx="${f(R * 1.08)}" ry="${f(R * tilt * 1.02)}" fill="#000" opacity="0.75" filter="url(#blur24)"/>
    <!-- side of the bowl (thickness) -->
    <g transform="translate(${cx} ${f(cy + R * 0.09)}) scale(1 ${tilt})"><circle r="${R * 1.02}" fill="url(#woodSide)"/></g>
    <g transform="translate(${cx} ${cy}) scale(1 ${tilt})">
      <circle r="${R * 1.02}" fill="url(#wood)"/>
      <circle r="${R * 0.985}" fill="none" stroke="url(#gold)" stroke-width="${f(R * 0.022)}"/>
      <circle r="${R * 0.94}" fill="url(#track)"/>
      <circle r="${R * 0.893}" fill="none" stroke="url(#gold)" stroke-width="${f(R * 0.012)}"/>
      ${pockets}
      ${frets}
      ${nums}
      <circle r="${R * 0.6}" fill="url(#cone)"/>
      <circle r="${R * 0.6}" fill="none" stroke="url(#gold)" stroke-width="${f(R * 0.01)}"/>
      <circle r="${R * 0.42}" fill="none" stroke="#f5c518" stroke-opacity="0.35" stroke-width="${f(R * 0.006)}"/>
      ${arms}
      <circle r="${R * 0.09}" fill="url(#goldBall)"/>
      <ellipse cx="${f(-R * 0.35)}" cy="${f(-R * 0.55)}" rx="${f(R * 0.75)}" ry="${f(R * 0.32)}" fill="#fff" opacity="0.07" filter="url(#blur24)"/>
    </g>
    <g transform="translate(${cx} ${f(cy - R * tilt * 0.06)})">
      <rect x="${f(-R * 0.03)}" y="${f(-R * 0.34)}" width="${f(R * 0.06)}" height="${f(R * 0.34)}" fill="url(#goldV)"/>
      <ellipse cx="0" cy="${f(-R * 0.34)}" rx="${f(R * 0.07)}" ry="${f(R * 0.035)}" fill="url(#goldBall)"/>
    </g>
    <circle cx="${f(bx + R * 0.012)}" cy="${f(by + R * 0.02)}" r="${f(R * 0.032)}" fill="#000" opacity="0.6" filter="url(#blur4)"/>
    <circle cx="${f(bx)}" cy="${f(by)}" r="${f(R * 0.03)}" fill="url(#ivory)"/>
  </g>`;
}

function chip(x, y, r, color, tilt, opts = {}) {
  const { edge = '#f6f1e3', stack = 1, rot = 0, blur = 0 } = opts;
  const h = r * 0.16; // thickness
  let s = `<g transform="translate(${f(x)} ${f(y)}) rotate(${rot})"${blur ? ` filter="url(#blur${blur})"` : ''}>`;
  s += `<ellipse cx="0" cy="${f(h * stack + r * tilt * 0.3)}" rx="${f(r * 1.05)}" ry="${f(r * tilt * 1.0)}" fill="#000" opacity="0.55" filter="url(#blur10)"/>`;
  for (let k = stack - 1; k >= 0; k--) {
    const yy = -k * h;
    s += `<path d="M ${-r} ${f(yy)} L ${-r} ${f(yy + h)} A ${r} ${f(r * tilt)} 0 0 0 ${r} ${f(yy + h)} L ${r} ${f(yy)} Z" fill="${color}" filter="brightness(0.55)"/>`;
    s += `<path d="M ${-r} ${f(yy)} L ${-r} ${f(yy + h)} A ${r} ${f(r * tilt)} 0 0 0 ${r} ${f(yy + h)} L ${r} ${f(yy)} Z" fill="url(#chipSide)" opacity="0.6"/>`;
    // side stripes
    for (let j = 0; j < 6; j++) {
      const a = Math.PI * (0.1 + j * 0.16);
      const xx = -r * Math.cos(a);
      s += `<rect x="${f(xx - r * 0.06 * Math.sin(a))}" y="${f(yy + Math.sin(a) * r * tilt + h * 0.12)}" width="${f(r * 0.12 * Math.sin(a))}" height="${f(h * 0.76)}" fill="${edge}" opacity="0.9"/>`;
    }
    s += `<ellipse cx="0" cy="${f(yy)}" rx="${r}" ry="${f(r * tilt)}" fill="${color}"/>`;
    s += `<ellipse cx="0" cy="${f(yy)}" rx="${f(r * 0.94)}" ry="${f(r * tilt * 0.94)}" fill="none" stroke="${edge}" stroke-width="${f(r * 0.12)}" stroke-dasharray="${f(r * 0.32)} ${f(r * 0.46)}"/>`;
    s += `<ellipse cx="0" cy="${f(yy)}" rx="${f(r * 0.62)}" ry="${f(r * tilt * 0.62)}" fill="none" stroke="url(#gold)" stroke-width="${f(r * 0.05)}"/>`;
    s += `<ellipse cx="0" cy="${f(yy)}" rx="${f(r * 0.5)}" ry="${f(r * tilt * 0.5)}" fill="#000" opacity="0.18"/>`;
    s += `<ellipse cx="${f(-r * 0.25)}" cy="${f(yy - r * tilt * 0.35)}" rx="${f(r * 0.55)}" ry="${f(r * tilt * 0.3)}" fill="#fff" opacity="0.12"/>`;
  }
  return s + '</g>';
}

function card(x, y, w, rot, suit, color) {
  const h = w * 1.4;
  const sp = { spade: 'M0 -1 C 0.55 -0.45 1 -0.15 1 0.25 C 1 0.62 0.62 0.8 0.3 0.62 C 0.36 0.85 0.45 1 0.6 1.08 L -0.6 1.08 C -0.45 1 -0.36 0.85 -0.3 0.62 C -0.62 0.8 -1 0.62 -1 0.25 C -1 -0.15 -0.55 -0.45 0 -1 Z', heart: 'M0 1 C -0.7 0.45 -1 0.05 -1 -0.35 C -1 -0.75 -0.55 -0.95 -0.25 -0.8 C -0.1 -0.72 -0.03 -0.6 0 -0.5 C 0.03 -0.6 0.1 -0.72 0.25 -0.8 C 0.55 -0.95 1 -0.75 1 -0.35 C 1 0.05 0.7 0.45 0 1 Z' }[suit];
  const big = w * 0.24;
  const sm = w * 0.075;
  return `<g transform="translate(${f(x)} ${f(y)}) rotate(${rot})" filter="url(#shadow)">
    <rect x="${f(-w / 2)}" y="${f(-h / 2)}" width="${w}" height="${f(h)}" rx="${f(w * 0.07)}" fill="url(#cardFace)"/>
    <rect x="${f(-w / 2 + w * 0.045)}" y="${f(-h / 2 + w * 0.045)}" width="${f(w * 0.91)}" height="${f(h - w * 0.09)}" rx="${f(w * 0.05)}" fill="none" stroke="#c9a227" stroke-width="${f(w * 0.01)}" opacity="0.7"/>
    <path d="${sp}" transform="scale(${f(big)})" fill="${color}"/>
    <text x="${f(-w / 2 + w * 0.13)}" y="${f(-h / 2 + w * 0.2)}" font-family="DejaVu Serif" font-weight="700" font-size="${f(w * 0.17)}" fill="${color}" text-anchor="middle">A</text>
    <path d="${sp}" transform="translate(${f(-w / 2 + w * 0.13)} ${f(-h / 2 + w * 0.33)}) scale(${f(sm)})" fill="${color}"/>
    <g transform="rotate(180)">
      <text x="${f(-w / 2 + w * 0.13)}" y="${f(-h / 2 + w * 0.2)}" font-family="DejaVu Serif" font-weight="700" font-size="${f(w * 0.17)}" fill="${color}" text-anchor="middle">A</text>
      <path d="${sp}" transform="translate(${f(-w / 2 + w * 0.13)} ${f(-h / 2 + w * 0.33)}) scale(${f(sm)})" fill="${color}"/>
    </g>
  </g>`;
}

function coin(x, y, r, tilt, rot) {
  return `<g transform="translate(${f(x)} ${f(y)}) rotate(${rot})">
    <ellipse cx="0" cy="${f(r * 0.14)}" rx="${r}" ry="${f(r * tilt)}" fill="#6b4a05"/>
    <ellipse cx="0" cy="0" rx="${r}" ry="${f(r * tilt)}" fill="url(#gold)"/>
    <ellipse cx="0" cy="0" rx="${f(r * 0.78)}" ry="${f(r * tilt * 0.78)}" fill="none" stroke="#7a5507" stroke-width="${f(r * 0.06)}" opacity="0.6"/>
    <ellipse cx="${f(-r * 0.3)}" cy="${f(-r * tilt * 0.35)}" rx="${f(r * 0.45)}" ry="${f(r * tilt * 0.22)}" fill="#fff" opacity="0.35"/>
  </g>`;
}

function casinoDefs() {
  return `
  <radialGradient id="red" cx="0.5" cy="0.3" r="0.8"><stop offset="0" stop-color="#e3263a"/><stop offset="1" stop-color="#8e0c18"/></radialGradient>
  <radialGradient id="black" cx="0.5" cy="0.3" r="0.8"><stop offset="0" stop-color="#2a2a30"/><stop offset="1" stop-color="#0b0b0e"/></radialGradient>
  <radialGradient id="green" cx="0.5" cy="0.3" r="0.8"><stop offset="0" stop-color="#1fa25a"/><stop offset="1" stop-color="#0a5a2e"/></radialGradient>
  <radialGradient id="wood" cx="0.4" cy="0.35" r="0.75"><stop offset="0.82" stop-color="#3a1a0c"/><stop offset="0.9" stop-color="#6a3216"/><stop offset="1" stop-color="#241008"/></radialGradient>
  <linearGradient id="woodSide" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a1208"/><stop offset="1" stop-color="#0c0503"/></linearGradient>
  <radialGradient id="track" cx="0.45" cy="0.35" r="0.7"><stop offset="0.9" stop-color="#2b1d12"/><stop offset="0.96" stop-color="#5c4128"/><stop offset="1" stop-color="#1a110a"/></radialGradient>
  <radialGradient id="cone" cx="0.42" cy="0.35" r="0.75"><stop offset="0" stop-color="#ffe9a6"/><stop offset="0.25" stop-color="#d8a81c"/><stop offset="0.6" stop-color="#7a5408"/><stop offset="1" stop-color="#2a1c05"/></radialGradient>
  <radialGradient id="goldBall" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="#fffbe0"/><stop offset="0.35" stop-color="#f5c518"/><stop offset="1" stop-color="#6b4a05"/></radialGradient>
  <radialGradient id="ivory" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="#ffffff"/><stop offset="0.6" stop-color="#e8e4da"/><stop offset="1" stop-color="#8d887c"/></radialGradient>
  <linearGradient id="chipSide" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity="0.6"/><stop offset="0.3" stop-color="#fff" stop-opacity="0.15"/><stop offset="1" stop-color="#000" stop-opacity="0.7"/></linearGradient>
  <linearGradient id="cardFace" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fffdf7"/><stop offset="1" stop-color="#e9e2d0"/></linearGradient>
  <linearGradient id="ray" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe7a0" stop-opacity="0.55"/><stop offset="1" stop-color="#ffe7a0" stop-opacity="0"/></linearGradient>`;
}

function casinoSvg(W, H, L) {
  const r = rng(11);
  const rays = [];
  for (let i = 0; i < 7; i++) {
    const a = -1.1 + i * 0.28 + r() * 0.08;
    const len = H * 1.6;
    const wdt = 0.05 + r() * 0.05;
    const x0 = L.light[0], y0 = L.light[1];
    rays.push(`<path d="M ${x0} ${y0} L ${f(x0 + len * Math.sin(a - wdt))} ${f(y0 + len * Math.cos(a - wdt))} L ${f(x0 + len * Math.sin(a + wdt))} ${f(y0 + len * Math.cos(a + wdt))} Z" fill="url(#ray)" opacity="${f(0.15 + r() * 0.2)}"/>`);
  }
  const R = L.R;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>${defsCommon()}${casinoDefs()}
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="0.3"><stop offset="0" stop-color="#060509"/><stop offset="0.45" stop-color="#0d0710"/><stop offset="1" stop-color="#1c0a16"/></linearGradient>
    <radialGradient id="glowA" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#9e1b3c" stop-opacity="0.65"/><stop offset="1" stop-color="#9e1b3c" stop-opacity="0"/></radialGradient>
    <radialGradient id="glowB" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#f5c518" stop-opacity="0.32"/><stop offset="1" stop-color="#f5c518" stop-opacity="0"/></radialGradient>
    <linearGradient id="table" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0d3a24" stop-opacity="0"/><stop offset="0.35" stop-color="#0b2e1d" stop-opacity="0.85"/><stop offset="1" stop-color="#03110a"/></linearGradient>
    <linearGradient id="leftShade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#050408" stop-opacity="0.92"/><stop offset="${L.shadeEnd}" stop-color="#050408" stop-opacity="0"/></linearGradient>
    <radialGradient id="vig" cx="0.6" cy="0.45" r="0.85"><stop offset="0.6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.7"/></radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <ellipse cx="${L.wheel[0]}" cy="${L.wheel[1]}" rx="${f(R * 2.1)}" ry="${f(R * 1.5)}" fill="url(#glowA)"/>
  <ellipse cx="${L.light[0]}" cy="${L.light[1] + H * 0.1}" rx="${f(W * 0.35)}" ry="${f(H * 0.45)}" fill="url(#glowB)"/>
  <g filter="url(#blur10)">${rays.join('')}</g>
  ${bokeh(r, L.bokehN, [W * 0.35, 0, W, H * 0.7], ['#f5c518', '#ffb347', '#e0407a', '#ffd98a'], 6, 34, 0.08, 0.45, 'blur10')}
  ${bokeh(r, Math.round(L.bokehN * 0.6), [W * 0.4, 0, W, H], ['#ffe9a6', '#f5c518'], 2, 6, 0.3, 0.8, 'blur4')}
  <rect x="0" y="${f(L.tableY)}" width="${W}" height="${f(H - L.tableY)}" fill="url(#table)"/>
  ${wheel(L.wheel[0], L.wheel[1], R, L.tilt)}
  ${L.cards.map((c) => card(...c)).join('')}
  ${L.chips.map((c) => chip(...c)).join('')}
  ${L.coins.map((c) => coin(...c)).join('')}
  ${L.sparkles.map((s) => sparkle(...s)).join('')}
  <rect width="${W}" height="${H}" fill="url(#leftShade)"/>
  <rect width="${W}" height="${H}" fill="url(#vig)"/>
  <rect width="${W}" height="${H}" filter="url(#grain)"/>
</svg>`;
}

// ---------------------------------------------------------------- football
function ball(cx, cy, R, rot) {
  // Real soccer ball: truncated icosahedron (12 black pentagons, 20 white hexagons) projected on a sphere.
  const phi = (1 + Math.sqrt(5)) / 2;
  const V = [];
  for (const a of [-1, 1]) for (const b of [-phi, phi]) { V.push([0, a, b], [a, b, 0], [b, 0, a]); }
  const nrm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
  const sub = (a, b) => a.map((x, i) => x - b[i]);
  const add = (a, b) => a.map((x, i) => x + b[i]);
  const mul = (a, k) => a.map((x) => x * k);
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const adj = V.map((v, i) => V.map((w, j) => j).filter((j) => j !== i && Math.abs(Math.hypot(...sub(V[j], v)) - 2) < 1e-6));
  const faces = [];
  // pentagons around each icosahedron vertex
  V.forEach((v, i) => {
    const n = nrm(v);
    const u = nrm(sub(V[adj[i][0]], mul(n, dot(V[adj[i][0]], n))));
    const w = cross(n, u);
    const pts = adj[i].map((j) => add(v, mul(sub(V[j], v), 1 / 3)));
    pts.sort((p1, p2) => Math.atan2(dot(p1, w), dot(p1, u)) - Math.atan2(dot(p2, w), dot(p2, u)));
    faces.push({ pts, black: true });
  });
  // hexagons for each icosahedron triangle
  for (let a = 0; a < 12; a++) for (const b of adj[a]) for (const c of adj[a]) {
    if (!(a < b && b < c) || !adj[b].includes(c)) continue;
    const A = V[a], B = V[b], C = V[c];
    const pts = [add(A, mul(sub(B, A), 1 / 3)), add(A, mul(sub(B, A), 2 / 3)), add(B, mul(sub(C, B), 1 / 3)), add(B, mul(sub(C, B), 2 / 3)), add(C, mul(sub(A, C), 1 / 3)), add(C, mul(sub(A, C), 2 / 3))];
    faces.push({ pts, black: false });
  }
  // rotation
  const rx = 0.55 + rot, ry = -0.45, rz = 0.3;
  const rotP = (p) => {
    let [x, y, z] = p;
    [y, z] = [y * Math.cos(rx) - z * Math.sin(rx), y * Math.sin(rx) + z * Math.cos(rx)];
    [x, z] = [x * Math.cos(ry) + z * Math.sin(ry), -x * Math.sin(ry) + z * Math.cos(ry)];
    [x, y] = [x * Math.cos(rz) - y * Math.sin(rz), x * Math.sin(rz) + y * Math.cos(rz)];
    return [x, y, z];
  };
  const light = nrm([-0.55, -0.65, 0.75]);
  const out = [];
  for (const fc of faces) {
    const ring = [];
    const P = fc.pts.map((p) => rotP(p));
    for (let k = 0; k < P.length; k++) {
      const a = P[k], b = P[(k + 1) % P.length];
      for (let t = 0; t < 8; t++) ring.push(nrm(add(a, mul(sub(b, a), t / 8))));
    }
    const c = nrm(P.reduce((acc, p) => add(acc, p), [0, 0, 0]));
    if (c[2] < -0.35) continue;
    const lam = Math.max(0, dot(c, light));
    const base = fc.black ? 22 : 246;
    const lum = Math.round(base * (0.45 + 0.6 * lam));
    const col = fc.black ? `rgb(${lum},${lum},${lum + 4})` : `rgb(${Math.min(255, lum)},${Math.min(255, lum - 2)},${Math.min(255, lum - 8)})`;
    const d = ring.map((p, k) => `${k ? 'L' : 'M'} ${f(p[0] * R)} ${f(p[1] * R)}`).join(' ') + ' Z';
    out.push({ z: c[2], svg: `<path d="${d}" fill="${col}" stroke="#3a3a3e" stroke-width="${f(R * 0.012)}" stroke-linejoin="round"/>` });
  }
  out.sort((a, b) => a.z - b.z);
  return `<g transform="translate(${f(cx)} ${f(cy)})">
    <circle r="${f(R * 1.3)}" fill="url(#ballGlow)"/>
    <clipPath id="ballClip"><circle r="${R}"/></clipPath>
    <g clip-path="url(#ballClip)">
      <circle r="${R}" fill="#d9d9d6"/>
      ${out.map((o) => o.svg).join('')}
      <circle r="${R}" fill="url(#ballShade)"/>
      <circle r="${R}" fill="url(#ballRim)"/>
      <ellipse cx="${f(-R * 0.36)}" cy="${f(-R * 0.4)}" rx="${f(R * 0.3)}" ry="${f(R * 0.18)}" fill="#fff" opacity="0.5" filter="url(#blur10)" transform="rotate(-35 ${f(-R * 0.36)} ${f(-R * 0.4)})"/>
    </g>
    <circle r="${R}" fill="none" stroke="#f5c518" stroke-opacity="0.45" stroke-width="${f(R * 0.012)}"/>
  </g>`;
}

function footballDefs() {
  return `
  <radialGradient id="panel" cx="0.4" cy="0.35" r="0.8"><stop offset="0" stop-color="#2c2c30"/><stop offset="1" stop-color="#050506"/></radialGradient>
  <radialGradient id="ballShade" cx="0.38" cy="0.32" r="0.78"><stop offset="0.45" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.72"/></radialGradient>
  <radialGradient id="ballRim" cx="0.5" cy="0.5" r="0.5"><stop offset="0.86" stop-color="#ffd76a" stop-opacity="0"/><stop offset="1" stop-color="#ffd76a" stop-opacity="0.35"/></radialGradient>
  <radialGradient id="ballGlow" cx="0.5" cy="0.5" r="0.5"><stop offset="0.6" stop-color="#f5c518" stop-opacity="0.35"/><stop offset="1" stop-color="#f5c518" stop-opacity="0"/></radialGradient>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#02040a"/><stop offset="0.6" stop-color="#081222"/><stop offset="1" stop-color="#071a12"/></linearGradient>
  <linearGradient id="grass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b6b33"/><stop offset="1" stop-color="#06260f"/></linearGradient>
  <linearGradient id="beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eaf4ff" stop-opacity="0.55"/><stop offset="1" stop-color="#eaf4ff" stop-opacity="0"/></linearGradient>
  <radialGradient id="lamp" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#ffffff"/><stop offset="0.3" stop-color="#e8f3ff" stop-opacity="0.9"/><stop offset="1" stop-color="#bcdcff" stop-opacity="0"/></radialGradient>
  <linearGradient id="trail" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#ffe9a6" stop-opacity="0.9"/><stop offset="1" stop-color="#f5c518" stop-opacity="0"/></linearGradient>`;
}

function floodlight(x, y, s) {
  let lamps = '';
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) lamps += `<circle cx="${f(x + (i - 1.5) * s * 0.3)}" cy="${f(y + (j - 1) * s * 0.3)}" r="${f(s * 0.11)}" fill="#fff"/>`;
  return `<g>
    <circle cx="${x}" cy="${y}" r="${f(s * 2.6)}" fill="url(#lamp)" opacity="0.55" filter="url(#blur24)"/>
    <rect x="${f(x - s * 0.62)}" y="${f(y - s * 0.46)}" width="${f(s * 1.24)}" height="${f(s * 0.92)}" rx="${f(s * 0.05)}" fill="#0d1420" opacity="0.85"/>
    <g filter="url(#blur4)">${lamps}</g>${lamps}
  </g>`;
}

function footballSvg(W, H, L) {
  const r = rng(29);
  const hz = L.horizon;
  // pitch stripes in perspective toward a vanishing point
  const vp = [W * L.vpX, hz - H * 0.9];
  let stripes = '';
  const nS = 18;
  for (let i = -nS; i < nS; i++) {
    const x1 = W * 0.5 + i * W * 0.11, x2 = x1 + W * 0.11;
    const t = (hz - vp[1]) / (H - vp[1]);
    const xa = vp[0] + (x1 - vp[0]) * t, xb = vp[0] + (x2 - vp[0]) * t;
    stripes += `<path d="M ${f(xa)} ${hz} L ${f(xb)} ${hz} L ${f(x2)} ${H} L ${f(x1)} ${H} Z" fill="${i % 2 ? '#ffffff' : '#000000'}" opacity="${i % 2 ? 0.035 : 0.06}"/>`;
  }
  // crowd: tiny lights in the stands
  let crowd = '';
  for (let i = 0; i < L.crowdN; i++) {
    const x = r() * W;
    const y = L.standTop + r() * (hz - L.standTop - H * 0.02);
    const c = ['#ffd27a', '#ffffff', '#ffe6a8', '#ff9f7a', '#f5c518', '#9fc7ff'][Math.floor(r() * 6)];
    crowd += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(0.8 + r() * 2.2)}" fill="${c}" opacity="${f(0.15 + r() * 0.5)}"/>`;
  }
  const beams = L.lights.map(([x, y, s]) => {
    const spread = W * 0.28;
    return `<path d="M ${f(x - s * 0.5)} ${y} L ${f(x + s * 0.5)} ${y} L ${f(x - spread * 0.2)} ${H} L ${f(x - spread * 1.2)} ${H} Z" fill="url(#beam)" opacity="0.32"/>`;
  }).join('');
  const [bx, by, bR] = L.ball;
  let streaks = '';
  for (let i = 0; i < 9; i++) {
    const off = (i - 4) * bR * 0.18;
    const len = bR * (2.2 + r() * 2.6);
    streaks += `<rect x="${f(bx - len - bR * 0.2)}" y="${f(by + off - 3)}" width="${f(len)}" height="${f(3 + r() * 5)}" rx="3" fill="url(#trail)" opacity="${f(0.25 + r() * 0.5)}" transform="rotate(${L.trailRot} ${bx} ${by})"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>${defsCommon()}${footballDefs()}
    <linearGradient id="leftShade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#03060a" stop-opacity="0.9"/><stop offset="${L.shadeEnd}" stop-color="#03060a" stop-opacity="0"/></linearGradient>
    <radialGradient id="vig" cx="0.62" cy="0.5" r="0.85"><stop offset="0.6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.7"/></radialGradient>
    <linearGradient id="stand" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#101a2c"/><stop offset="0.5" stop-color="#0a1120"/><stop offset="1" stop-color="#05080f"/></linearGradient>
    <radialGradient id="pitchLight" cx="0.5" cy="0" r="1"><stop offset="0" stop-color="#7dffb0" stop-opacity="0.25"/><stop offset="1" stop-color="#7dffb0" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  ${bokeh(r, 40, [0, 0, W, L.standTop], ['#2c4a7a', '#7aa7e0', '#ffffff'], 1, 3, 0.2, 0.6, 'blur4')}
  <path d="M 0 ${f(L.standTop + H * 0.06)} Q ${W * 0.5} ${f(L.standTop - H * 0.08)} ${W} ${f(L.standTop + H * 0.06)} L ${W} ${hz} L 0 ${hz} Z" fill="url(#stand)"/>
  <g filter="url(#blur4)">${crowd}</g>
  ${[0.28, 0.55, 0.8].map((k) => { const y = L.standTop + (hz - L.standTop) * k; return `<path d="M 0 ${f(y + H * 0.03)} Q ${W * 0.5} ${f(y - H * 0.04)} ${W} ${f(y + H * 0.03)}" fill="none" stroke="#1e2c44" stroke-width="${f(H * 0.006)}" opacity="0.8"/>`; }).join('')}
  <rect x="0" y="${f(hz - H * 0.012)}" width="${W}" height="${f(H * 0.014)}" fill="#f5c518" opacity="0.55"/>
  <rect x="0" y="${f(hz - H * 0.012)}" width="${W}" height="${f(H * 0.014)}" fill="#f5c518" opacity="0.35" filter="url(#blur10)"/>
  <rect x="0" y="${hz}" width="${W}" height="${H - hz}" fill="url(#grass)"/>
  ${stripes}
  <clipPath id="belowHz"><rect x="0" y="${hz}" width="${W}" height="${H - hz}"/></clipPath>
  <ellipse cx="${W * 0.5}" cy="${hz}" rx="${W * 0.7}" ry="${f((H - hz) * 0.9)}" fill="url(#pitchLight)" clip-path="url(#belowHz)"/>
  <g fill="none" stroke="#ffffff" stroke-opacity="0.55" stroke-width="${f(H * 0.005)}">
    <ellipse cx="${f(W * L.circleX)}" cy="${f(hz + (H - hz) * 0.62)}" rx="${f(W * 0.2)}" ry="${f((H - hz) * 0.3)}"/>
    <line x1="${f(W * L.circleX - W * 0.06)}" y1="${hz}" x2="${f(W * L.circleX + W * 0.08)}" y2="${H}"/>
    <ellipse cx="${f(W * L.circleX + W * 0.01)}" cy="${f(hz + (H - hz) * 0.62)}" rx="${f(W * 0.006)}" ry="${f(H * 0.004)}" fill="#fff"/>
  </g>
  <g filter="url(#blur24)">${beams}</g>
  ${L.lights.map(([x, y, s]) => floodlight(x, y, s)).join('')}
  <ellipse cx="${f(bx + bR * 0.3)}" cy="${f(L.shadowY)}" rx="${f(bR * 1.1)}" ry="${f(bR * 0.22)}" fill="#000" opacity="0.6" filter="url(#blur24)"/>
  <g filter="url(#blur4)">${streaks}</g>
  ${bokeh(r, 26, [bx - bR * 3, by - bR * 1.5, bx + bR * 1.5, by + bR * 1.5], ['#ffe9a6', '#f5c518', '#ffffff'], 2, 6, 0.3, 0.9, 'blur4')}
  ${ball(bx, by, bR, 0.35)}
  ${L.sparkles.map((s) => sparkle(...s)).join('')}
  <rect width="${W}" height="${H}" fill="url(#leftShade)"/>
  <rect width="${W}" height="${H}" fill="url(#vig)"/>
  <rect width="${W}" height="${H}" filter="url(#grain)"/>
</svg>`;
}

// ---------------------------------------------------------------- layouts
const casinoDesktop = (() => {
  const W = 2880, H = 970;
  return {
    W, H, svg: casinoSvg(W, H, {
      R: 470, tilt: 0.5, wheel: [1950, 520], light: [2500, -60], tableY: 560, shadeEnd: 0.5, bokehN: 90,
      cards: [[2560, 520, 230, 14, 'spade', '#121214'], [2420, 560, 230, -9, 'heart', '#c4121f']],
      chips: [
        [1460, 760, 92, '#b3121f', 0.42, { stack: 4 }],
        [1330, 810, 80, '#121214', 0.42, { stack: 2, edge: '#f5c518' }],
        [2330, 820, 96, '#f5c518', 0.42, { stack: 5, edge: '#7a1020' }],
        [2470, 860, 84, '#0f5a35', 0.42, { stack: 3 }],
        [2690, 790, 70, '#b3121f', 0.42, { stack: 1 }],
        [1180, 300, 56, '#f5c518', 0.75, { rot: -25, edge: '#7a1020', blur: 4 }],
        [2760, 190, 64, '#b3121f', 0.7, { rot: 30, blur: 4 }],
      ],
      coins: [[1640, 230, 40, 0.5, -20], [2230, 140, 34, 0.45, 25], [1250, 560, 30, 0.5, 10], [2790, 470, 30, 0.5, -30]],
      sparkles: [[1700, 300, 10], [2200, 330, 8], [1430, 470, 7], [2650, 300, 9], [1980, 120, 7, 0.8]],
    }),
  };
})();

const casinoMobile = (() => {
  const W = 1200, H = 1020;
  return {
    W, H, svg: casinoSvg(W, H, {
      R: 430, tilt: 0.52, wheel: [700, 700], light: [1000, -60], tableY: 640, shadeEnd: 0.0001, bokehN: 50,
      cards: [[1040, 470, 190, 16, 'spade', '#121214'], [930, 500, 190, -8, 'heart', '#c4121f']],
      chips: [
        [260, 930, 90, '#b3121f', 0.42, { stack: 4 }],
        [1050, 930, 96, '#f5c518', 0.42, { stack: 5, edge: '#7a1020' }],
        [150, 520, 54, '#f5c518', 0.75, { rot: -25, edge: '#7a1020', blur: 4 }],
      ],
      coins: [[300, 330, 36, 0.5, -20], [880, 230, 30, 0.45, 25]],
      sparkles: [[520, 380, 9], [980, 330, 8], [200, 700, 7]],
    }),
  };
})();

const footballDesktop = (() => {
  const W = 2880, H = 970;
  return {
    W, H, svg: footballSvg(W, H, {
      horizon: 560, standTop: 250, vpX: 0.62, crowdN: 2600, circleX: 0.66, shadeEnd: 0.5,
      lights: [[2330, 95, 90], [2760, 150, 74], [1420, 120, 60]],
      ball: [2050, 470, 250], trailRot: 12, shadowY: 900,
      sparkles: [[1700, 420, 10], [2380, 300, 9], [2350, 640, 8], [1820, 620, 7]],
    }),
  };
})();

const footballMobile = (() => {
  const W = 1200, H = 1020;
  return {
    W, H, svg: footballSvg(W, H, {
      horizon: 600, standTop: 260, vpX: 0.6, crowdN: 1400, circleX: 0.55, shadeEnd: 0.0001,
      lights: [[950, 110, 80], [260, 130, 62]],
      ball: [780, 690, 220], trailRot: 12, shadowY: 980,
      sparkles: [[480, 640, 9], [1060, 520, 8], [600, 860, 7]],
    }),
  };
})();

const jobs = { 'casino-desktop': casinoDesktop, 'casino-mobile': casinoMobile, 'football-desktop': footballDesktop, 'football-mobile': footballMobile };
const only = process.argv[2];
const browser = await chromium.launch();
for (const [name, job] of Object.entries(jobs)) {
  if (only && !name.startsWith(only)) continue;
  writeFileSync(`${name}.svg`, job.svg);
  const page = await browser.newPage({ viewport: { width: job.W, height: job.H }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><html><body style="margin:0;background:#000">${job.svg}</body></html>`);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${name}.jpg`, type: 'jpeg', quality: 90, clip: { x: 0, y: 0, width: job.W, height: job.H } });
  await page.close();
  console.log('rendered', name);
}
await browser.close();
