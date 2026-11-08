/**
 * Image uploads for banners, promotions and game thumbnails.
 * Files are stored on disk under UPLOAD_DIR with a random name; only metadata is in the database.
 * The format is recognised from the file's own bytes (never from the name or declared type).
 */
import { createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Db, Queryable } from '@aurum/db';
import { ALLOWED_IMAGE_TYPES, AppError, MAX_IMAGE_DIMENSION, MAX_UPLOAD_BYTES } from '@aurum/shared';
import type { Config } from '../config.ts';
import type { Ctx, RawReply } from '../http/types.ts';
import { inspectImage } from '../security/images.ts';
import { audit } from './audit.ts';
import { auditActor } from './accounts.ts';

export const MEDIA_URL_PREFIX = '/api/v1/media/';
const KEY_PATTERN = /^[a-f0-9]{32}\.(png|jpg|webp)$/;

export interface MediaDTO {
  id: string;
  url: string;
  width: number;
  height: number;
  mimeType: string;
  byteSize: number;
  originalName: string | null;
  createdAt: string;
}

interface MediaRow {
  id: string;
  storage_key: string;
  original_name: string | null;
  mime_type: string;
  byte_size: number;
  width: number;
  height: number;
  created_at: Date;
}

const COLUMNS = 'id::text, storage_key, original_name, mime_type, byte_size, width, height, created_at';

export function mediaToDTO(r: MediaRow): MediaDTO {
  return {
    id: r.id,
    url: `${MEDIA_URL_PREFIX}${r.storage_key}`,
    width: r.width,
    height: r.height,
    mimeType: r.mime_type,
    byteSize: r.byte_size,
    originalName: r.original_name,
    createdAt: r.created_at.toISOString(),
  };
}

export async function getMediaMap(q: Queryable, ids: readonly (string | null | undefined)[]): Promise<Map<string, MediaDTO>> {
  const wanted = [...new Set(ids.filter((id): id is string => typeof id === 'string'))];
  const map = new Map<string, MediaDTO>();
  if (wanted.length === 0) return map;
  const { rows } = await q.query<MediaRow>(`select ${COLUMNS} from media_assets where id = any($1::uuid[])`, [wanted]);
  for (const row of rows) map.set(row.id, mediaToDTO(row));
  return map;
}

/** Throws a validation error naming the first field whose media id does not exist. */
export async function assertMediaExist(q: Queryable, refs: Record<string, string | null | undefined>): Promise<void> {
  const present = Object.entries(refs).filter((entry): entry is [string, string] => typeof entry[1] === 'string');
  if (present.length === 0) return;
  const map = await getMediaMap(q, present.map(([, id]) => id));
  for (const [field, id] of present) {
    if (!map.has(id)) throw new AppError('validation', { fields: { [field]: 'invalidChoice' } });
  }
}

export async function listMedia(q: Queryable, options: { beforeCreatedAt?: string; limit?: number } = {}): Promise<MediaDTO[]> {
  const limit = Math.min(Math.max(options.limit ?? 60, 1), 200);
  const { rows } = await q.query<MediaRow>(
    `select ${COLUMNS} from media_assets
      where ($1::timestamptz is null or created_at < $1::timestamptz)
      order by created_at desc, id desc limit $2`,
    [options.beforeCreatedAt ?? null, limit],
  );
  return rows.map(mediaToDTO);
}

export interface StoredImage {
  media: MediaDTO;
  duplicate: boolean;
}

/**
 * Validates image bytes, stores the file and records it. Identical files (same SHA-256) are stored once.
 * Used by the upload route and by the demo seed.
 */
export async function storeImage(
  db: Db,
  uploadDir: string,
  args: { bytes: Uint8Array; originalName: string | null; uploadedBy: string | null; audit?: (tx: Queryable, media: MediaDTO) => Promise<void> },
): Promise<StoredImage> {
  const { bytes } = args;
  if (bytes.length === 0) throw new AppError('upload_invalid', { fields: { file: 'required' } });
  if (bytes.length > MAX_UPLOAD_BYTES) throw new AppError('upload_too_large', { fields: { file: 'tooLong' } });
  const info = inspectImage(bytes);
  if (!info || !(ALLOWED_IMAGE_TYPES as readonly string[]).includes(info.mime)) {
    throw new AppError('upload_invalid', { fields: { file: 'invalidFormat' } });
  }
  if (info.width > MAX_IMAGE_DIMENSION || info.height > MAX_IMAGE_DIMENSION) {
    throw new AppError('upload_invalid', { fields: { file: 'outOfRange' } });
  }

  const sha = createHash('sha256').update(bytes).digest();
  const existing = await db.query<MediaRow>(`select ${COLUMNS} from media_assets where sha256 = $1::bytea limit 1`, [sha]);
  if (existing.rows[0]) return { media: mediaToDTO(existing.rows[0]), duplicate: true };

  const key = `${randomBytes(16).toString('hex')}.${info.extension}`;
  await mkdir(uploadDir, { recursive: true });
  const finalPath = join(uploadDir, key);
  const tempPath = join(uploadDir, `.${key}.part`);
  await writeFile(tempPath, bytes, { flag: 'wx', mode: 0o640 });
  await rename(tempPath, finalPath);

  const originalName = args.originalName ? args.originalName.normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 200) : null;
  try {
    const media = await db.transaction(async (tx) => {
      const inserted = await tx.query<MediaRow>(
        `insert into media_assets (storage_key, original_name, mime_type, byte_size, width, height, sha256, uploaded_by)
         values ($1, $2, $3, $4, $5, $6, $7::bytea, $8::uuid)
         returning ${COLUMNS}`,
        [key, originalName || null, info.mime, bytes.length, info.width, info.height, sha, args.uploadedBy],
      );
      const dto = mediaToDTO(inserted.rows[0] as MediaRow);
      await args.audit?.(tx, dto);
      return dto;
    });
    return { media, duplicate: false };
  } catch (error) {
    await unlink(finalPath).catch(() => undefined); // do not leave an orphan file behind
    throw error;
  }
}

export async function saveUpload(ctx: Ctx, form: FormData): Promise<StoredImage> {
  const file = form.get('file');
  if (!(file instanceof File)) throw new AppError('validation', { fields: { file: 'required' } });
  const bytes = new Uint8Array(await file.arrayBuffer());
  return storeImage(ctx.db, ctx.config.uploadDir, {
    bytes,
    originalName: file.name || null,
    uploadedBy: ctx.principal().id,
    audit: (tx, media) =>
      audit(tx, auditActor(ctx), {
        action: 'media.uploaded',
        targetType: 'media',
        targetId: media.id,
        details: { bytes: media.byteSize, mime: media.mimeType, width: media.width, height: media.height },
      }),
  });
}

const MIME_BY_EXTENSION: Readonly<Record<string, string>> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };

/** Streams an uploaded image. Names are random, so a long cache lifetime is safe. */
export async function serveMedia(config: Config, key: string): Promise<RawReply> {
  if (!KEY_PATTERN.test(key)) throw new AppError('not_found');
  const path = join(config.uploadDir, key);
  let size: number;
  try {
    size = (await stat(path)).size;
  } catch {
    throw new AppError('not_found');
  }
  const extension = key.slice(key.lastIndexOf('.') + 1);
  return {
    type: 'raw',
    status: 200,
    headers: {
      'content-type': MIME_BY_EXTENSION[extension] ?? 'application/octet-stream',
      'content-length': String(size),
      'cache-control': 'public, max-age=31536000, immutable',
      'content-security-policy': "default-src 'none'; sandbox",
    },
    body: createReadStream(path),
  };
}
