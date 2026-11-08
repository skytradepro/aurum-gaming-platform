/**
 * Background videos of the public site (casino and football sections), changeable from the admin panel.
 * Uploads arrive in chunks (the web proxy keeps request bodies small) and are checked from their own
 * bytes (MP4 or WebM). Choices are stored in site_settings under "site_videos".
 * A slot without an uploaded file uses the clip bundled with the website.
 */
import { randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { appendFile, mkdir, open, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Queryable } from '@aurum/db';
import { AppError } from '@aurum/shared';
import type { Config } from '../config.ts';
import type { Ctx, RawReply } from '../http/types.ts';
import { audit } from './audit.ts';
import { auditActor } from './accounts.ts';

export const VIDEO_SLOTS = ['home_casino', 'home_football', 'casino_hero', 'live_casino_hero', 'sports_hero', 'sports_side'] as const;
export type VideoSlot = (typeof VIDEO_SLOTS)[number];
export const VIDEO_VARIANTS = ['desktop', 'mobile'] as const;
export type VideoVariant = (typeof VIDEO_VARIANTS)[number];

export const VIDEO_CHUNK_BYTES = 4 * 1024 * 1024;
export const VIDEO_MAX_PARTS = 25; // 100 MB
const KEY_PATTERN = /^[a-f0-9]{32}\.(mp4|webm)$/;
const SETTING_KEY = 'site_videos';

/** Clips shipped with the website (apps/web/public/media/videos). */
const DEFAULTS: Record<VideoSlot, Record<VideoVariant, { src: string; poster: string } | null>> = {
  home_casino: {
    desktop: { src: '/media/videos/casino-neon-desktop.mp4', poster: '/media/videos/casino-neon-desktop.jpg' },
    mobile: { src: '/media/videos/casino-table-mobile.mp4', poster: '/media/videos/casino-table-mobile.jpg' },
  },
  home_football: {
    desktop: { src: '/media/videos/football-stadium-desktop.mp4', poster: '/media/videos/football-stadium-desktop.jpg' },
    mobile: { src: '/media/videos/football-crowd-mobile.mp4', poster: '/media/videos/football-crowd-mobile.jpg' },
  },
  casino_hero: {
    desktop: { src: '/media/videos/slots-hall-desktop.mp4', poster: '/media/videos/slots-hall-desktop.jpg' },
    mobile: { src: '/media/videos/casino-table-mobile.mp4', poster: '/media/videos/casino-table-mobile.jpg' },
  },
  live_casino_hero: {
    desktop: { src: '/media/videos/roulette-spin-desktop.mp4', poster: '/media/videos/roulette-spin-desktop.jpg' },
    mobile: { src: '/media/videos/roulette-spin-mobile.mp4', poster: '/media/videos/roulette-spin-mobile.jpg' },
  },
  sports_hero: {
    desktop: { src: '/media/videos/football-stadium-desktop.mp4', poster: '/media/videos/football-stadium-desktop.jpg' },
    mobile: { src: '/media/videos/football-crowd-mobile.mp4', poster: '/media/videos/football-crowd-mobile.jpg' },
  },
  // Sidebar card beside the bet slip: a portrait clip on every screen.
  sports_side: {
    desktop: { src: '/media/videos/football-crowd-mobile.mp4', poster: '/media/videos/football-crowd-mobile.jpg' },
    mobile: { src: '/media/videos/football-crowd-mobile.mp4', poster: '/media/videos/football-crowd-mobile.jpg' },
  },
};

/** Stored value per slot and variant: an uploaded file key, "off", or absent (= bundled default). */
type Stored = Partial<Record<VideoSlot, Partial<Record<VideoVariant, string>>>>;

export interface VideoSource {
  src: string;
  poster: string | null;
  source: 'default' | 'uploaded';
}
export type VideoSlots = Record<VideoSlot, Record<VideoVariant, VideoSource | null>>;

export const isVideoSlot = (v: string): v is VideoSlot => (VIDEO_SLOTS as readonly string[]).includes(v);
export const isVideoVariant = (v: string): v is VideoVariant => (VIDEO_VARIANTS as readonly string[]).includes(v);

async function readStored(q: Queryable): Promise<Stored> {
  const { rows } = await q.query<{ value: unknown }>('select value from site_settings where key = $1', [SETTING_KEY]);
  const v = rows[0]?.value;
  return v && typeof v === 'object' ? (v as Stored) : {};
}

export async function getVideoSlots(q: Queryable): Promise<VideoSlots> {
  const stored = await readStored(q);
  const out = {} as VideoSlots;
  for (const slot of VIDEO_SLOTS) {
    out[slot] = { desktop: null, mobile: null };
    for (const variant of VIDEO_VARIANTS) {
      const value = stored[slot]?.[variant];
      if (value === 'off') out[slot][variant] = null;
      else if (typeof value === 'string' && KEY_PATTERN.test(value)) out[slot][variant] = { src: `/api/v1/media/videos/${value}`, poster: null, source: 'uploaded' };
      else {
        const d = DEFAULTS[slot][variant];
        out[slot][variant] = d ? { ...d, source: 'default' } : null;
      }
    }
  }
  return out;
}

async function writeStored(ctx: Ctx, next: Stored, details: Record<string, unknown>): Promise<void> {
  await ctx.db.transaction(async (tx) => {
    await tx.query(
      `insert into site_settings (key, value, updated_by) values ($1, $2::jsonb, $3::uuid)
       on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by`,
      [SETTING_KEY, JSON.stringify(next), ctx.principal().id],
    );
    await audit(tx, auditActor(ctx), { action: 'videos.changed', targetType: 'setting', targetId: SETTING_KEY, details });
  });
}

const videoDir = (config: Config): string => join(config.uploadDir, 'videos');

async function removeFile(config: Config, value: string | undefined): Promise<void> {
  if (typeof value === 'string' && KEY_PATTERN.test(value)) await unlink(join(videoDir(config), value)).catch(() => undefined);
}

/** Sets a slot back to the bundled clip ("default") or turns it off ("off"). */
export async function setVideoMode(ctx: Ctx, slot: VideoSlot, variant: VideoVariant, mode: 'default' | 'off'): Promise<VideoSlots> {
  const stored = await readStored(ctx.db);
  const previous = stored[slot]?.[variant];
  const next: Stored = { ...stored, [slot]: { ...(stored[slot] ?? {}) } };
  const entry = next[slot] as Partial<Record<VideoVariant, string>>;
  if (mode === 'off') entry[variant] = 'off';
  else delete entry[variant];
  await writeStored(ctx, next, { slot, variant, mode });
  if (previous !== entry[variant]) await removeFile(ctx.config, previous);
  return getVideoSlots(ctx.db);
}

function detectVideo(head: Buffer): 'mp4' | 'webm' | null {
  if (head.length >= 12 && head.toString('latin1', 4, 8) === 'ftyp') return 'mp4';
  if (head.length >= 4 && head.readUInt32BE(0) === 0x1a45dfa3) return 'webm';
  return null;
}

/**
 * One chunk of an upload. Chunks must arrive in order (part 0..parts-1); every chunk but the last is
 * exactly VIDEO_CHUNK_BYTES. When the last chunk arrives the file is checked and becomes the slot's video.
 */
export async function uploadVideoChunk(
  ctx: Ctx,
  slot: VideoSlot,
  variant: VideoVariant,
  input: { upload: string; part: number; parts: number },
): Promise<{ done: boolean; slots?: VideoSlots }> {
  if (!/^[a-f0-9]{32}$/.test(input.upload)) throw new AppError('validation', { fields: { upload: 'invalidFormat' } });
  if (input.parts < 1 || input.parts > VIDEO_MAX_PARTS) throw new AppError('upload_too_large', { fields: { file: 'tooLong' } });
  if (input.part < 0 || input.part >= input.parts) throw new AppError('validation', { fields: { part: 'outOfRange' } });

  const bytes = await ctx.rawBody(VIDEO_CHUNK_BYTES);
  const last = input.part === input.parts - 1;
  if (bytes.length === 0 || (!last && bytes.length !== VIDEO_CHUNK_BYTES)) throw new AppError('upload_invalid', { fields: { file: 'invalidFormat' } });

  const dir = videoDir(ctx.config);
  await mkdir(dir, { recursive: true });
  const temp = join(dir, `.${input.upload}.part`);
  if (input.part === 0) {
    if (!detectVideo(bytes.subarray(0, 16))) throw new AppError('upload_invalid', { fields: { file: 'invalidFormat' } });
    await writeFile(temp, bytes, { flag: 'w', mode: 0o640 });
  } else {
    let size: number;
    try {
      size = (await stat(temp)).size;
    } catch {
      throw new AppError('upload_invalid', { fields: { file: 'invalidFormat' } });
    }
    if (size !== input.part * VIDEO_CHUNK_BYTES) throw new AppError('upload_invalid', { fields: { part: 'outOfRange' } });
    await appendFile(temp, bytes);
  }
  if (!last) return { done: false };

  const fh = await open(temp, 'r');
  const head = Buffer.alloc(16);
  await fh.read(head, 0, 16, 0);
  await fh.close();
  const kind = detectVideo(head);
  if (!kind) {
    await unlink(temp).catch(() => undefined);
    throw new AppError('upload_invalid', { fields: { file: 'invalidFormat' } });
  }
  const key = `${randomBytes(16).toString('hex')}.${kind}`;
  await rename(temp, join(dir, key));

  const stored = await readStored(ctx.db);
  const previous = stored[slot]?.[variant];
  const next: Stored = { ...stored, [slot]: { ...(stored[slot] ?? {}), [variant]: key } };
  try {
    await writeStored(ctx, next, { slot, variant, mode: 'uploaded', bytes: (await stat(join(dir, key))).size });
  } catch (error) {
    await unlink(join(dir, key)).catch(() => undefined);
    throw error;
  }
  await removeFile(ctx.config, previous);
  return { done: true, slots: await getVideoSlots(ctx.db) };
}

/** Streams an uploaded video, with HTTP Range support (needed by Safari / iOS and for seeking). */
export async function serveVideo(ctx: Ctx, key: string): Promise<RawReply> {
  if (!KEY_PATTERN.test(key)) throw new AppError('not_found');
  const path = join(videoDir(ctx.config), key);
  let size: number;
  try {
    size = (await stat(path)).size;
  } catch {
    throw new AppError('not_found');
  }
  const type = key.endsWith('.webm') ? 'video/webm' : 'video/mp4';
  const base = { 'content-type': type, 'accept-ranges': 'bytes', 'cache-control': 'public, max-age=31536000, immutable', 'content-security-policy': "default-src 'none'; sandbox" };
  const range = typeof ctx.headers.range === 'string' ? /^bytes=(\d*)-(\d*)$/.exec(ctx.headers.range.trim()) : null;
  if (range && (range[1] || range[2])) {
    let start: number;
    let end: number;
    if (range[1]) {
      start = Number(range[1]);
      end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    } else {
      start = Math.max(0, size - Number(range[2]));
      end = size - 1;
    }
    if (!Number.isSafeInteger(start) || start >= size || end < start) {
      return { type: 'raw', status: 416, headers: { ...base, 'content-range': `bytes */${size}`, 'content-length': '0' }, body: Buffer.alloc(0) };
    }
    return {
      type: 'raw',
      status: 206,
      headers: { ...base, 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': String(end - start + 1) },
      body: createReadStream(path, { start, end }),
    };
  }
  return { type: 'raw', status: 200, headers: { ...base, 'content-length': String(size) }, body: createReadStream(path) };
}
