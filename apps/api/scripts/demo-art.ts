/**
 * Procedural demo artwork (valid PNG files) for the local demo seed.
 * No third-party or copyrighted images are used: banners are generated from gradients, light rays and gold coins.
 * Real operators upload their own artwork from the admin area; this is only for design work.
 */
import { crc32, deflateSync } from 'node:zlib';

export interface ArtSpec {
  width: number;
  height: number;
  /** Base hue (0-360) of the background. */
  hue: number;
  /** Accent hue (0-360) of the glow and coins. Gold is about 45. */
  accent: number;
  /** Where the light source sits, as a fraction of width and height. */
  glow: [number, number];
  /** Number of decorative coins. */
  coins: number;
  seed: number;
}

function hsl(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}

function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return ((h >>> 0) % 1000) / 1000;
}

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

interface Coin {
  cx: number;
  cy: number;
  r: number;
}

export function renderPng(spec: ArtSpec): Buffer {
  const { width, height } = spec;
  const aspect = width / height;
  const rand = mulberry(spec.seed);
  const [gx, gy] = spec.glow;

  const coins: Coin[] = [];
  for (let i = 0; i < spec.coins; i++) {
    coins.push({
      cx: Math.min(0.97, Math.max(0.35, gx + (rand() - 0.5) * 0.5)),
      cy: Math.min(0.92, Math.max(0.08, gy + (rand() - 0.5) * 0.8)),
      r: 0.05 + rand() * 0.09,
    });
  }

  const dark = hsl(spec.hue, 0.6, 0.05);
  const mid = hsl(spec.hue, 0.65, 0.2);
  const gold = hsl(spec.accent, 0.95, 0.55);
  const pale = hsl(spec.accent, 0.95, 0.8);

  const raw = Buffer.alloc((width * 3 + 1) * height);
  let p = 0;
  for (let y = 0; y < height; y++) {
    raw[p++] = 0; // filter: none
    const v = y / height;
    for (let x = 0; x < width; x++) {
      const u = x / width;
      const t = Math.min(1, Math.max(0, u * 0.75 + (1 - v) * 0.25));
      let r = dark[0] + (mid[0] - dark[0]) * t;
      let g = dark[1] + (mid[1] - dark[1]) * t;
      let b = dark[2] + (mid[2] - dark[2]) * t;

      const dx = (u - gx) * aspect;
      const dy = v - gy;
      const d = Math.sqrt(dx * dx + dy * dy);

      // light rays
      const ang = Math.atan2(dy, dx);
      const ray = Math.pow(0.5 + 0.5 * Math.sin(ang * 11 + spec.seed), 3) * Math.exp(-d * 1.7) * 0.2;
      // soft glow
      const glow = Math.exp(-(d * d) / 0.07) * 0.6;
      const lift = ray + glow;
      r += (gold[0] - r) * Math.min(1, lift);
      g += (gold[1] - g) * Math.min(1, lift);
      b += (gold[2] - b) * Math.min(1, lift);

      // coins: bright rim, dark centre, pale highlight
      for (const c of coins) {
        const cdx = (u - c.cx) * aspect;
        const cdy = v - c.cy;
        const cd = Math.sqrt(cdx * cdx + cdy * cdy);
        if (cd > c.r * 1.15) continue;
        const rim = smooth(c.r * 0.82, c.r * 0.92, cd) * (1 - smooth(c.r * 0.98, c.r * 1.04, cd));
        const disc = 1 - smooth(c.r * 0.98, c.r * 1.04, cd);
        const shade = 0.35 + 0.65 * (0.5 + 0.5 * ((cdx - cdy) / c.r));
        const inner = disc * (1 - rim) * 0.5;
        r += (gold[0] * shade * 0.55 - r) * inner;
        g += (gold[1] * shade * 0.55 - g) * inner;
        b += (gold[2] * shade * 0.55 - b) * inner;
        r += (pale[0] - r) * rim * 0.9;
        g += (pale[1] - g) * rim * 0.9;
        b += (pale[2] - b) * rim * 0.9;
      }

      // darken the left so text stays readable
      const veil = 1 - 0.55 * (1 - smooth(0, 0.55, u));
      r *= veil;
      g *= veil;
      b *= veil;

      const n = (hash(x, y, spec.seed) - 0.5) * 0.02;
      raw[p++] = Math.max(0, Math.min(255, Math.round((r + n) * 255)));
      raw[p++] = Math.max(0, Math.min(255, Math.round((g + n) * 255)));
      raw[p++] = Math.max(0, Math.min(255, Math.round((b + n) * 255)));
    }
  }

  return encodePng(width, height, raw);
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0, 0);
  return Buffer.concat([length, body, crc]);
}

function encodePng(width: number, height: number, raw: Buffer): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
