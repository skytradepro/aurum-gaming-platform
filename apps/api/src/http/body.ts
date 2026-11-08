import { Readable, Transform } from 'node:stream';
import type { IncomingMessage } from 'node:http';
import { AppError, MAX_UPLOAD_BYTES, parseOrThrow } from '@aurum/shared';
import type { Schema } from '@aurum/shared';

export const MAX_JSON_BYTES = 256 * 1024;
/** Upload limit plus room for the multipart framing. */
export const MAX_MULTIPART_BYTES = MAX_UPLOAD_BYTES + 512 * 1024;

function declaredLength(req: IncomingMessage): number | null {
  const header = req.headers['content-length'];
  if (header === undefined) return null;
  const n = Number(header);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

export async function readLimited(req: IncomingMessage, limit: number): Promise<Buffer> {
  const declared = declaredLength(req);
  if (declared !== null && declared > limit) throw new AppError('payload_too_large');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > limit) throw new AppError('payload_too_large');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

export function isJsonContentType(value: string | undefined): boolean {
  return /^application\/json(\s*;.*)?$/i.test(value ?? '');
}

export async function readJson<T>(req: IncomingMessage, schema: Schema<T>): Promise<T> {
  if (!isJsonContentType(req.headers['content-type'])) throw new AppError('unsupported_media_type');
  const raw = await readLimited(req, MAX_JSON_BYTES);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.toString('utf8'));
  } catch {
    throw new AppError('validation', { fields: { $: 'invalidFormat' } });
  }
  return parseOrThrow(schema, parsed);
}

export async function readRawJson(req: IncomingMessage): Promise<{ raw: string; value: unknown }> {
  if (!isJsonContentType(req.headers['content-type'])) throw new AppError('unsupported_media_type');
  const raw = (await readLimited(req, MAX_JSON_BYTES)).toString('utf8');
  try {
    return { raw, value: JSON.parse(raw) as unknown };
  } catch {
    throw new AppError('validation', { fields: { $: 'invalidFormat' } });
  }
}

export async function readBinary(req: IncomingMessage, limit: number): Promise<Buffer> {
  if (!/^application\/octet-stream(\s*;.*)?$/i.test(req.headers['content-type'] ?? '')) throw new AppError('unsupported_media_type');
  return readLimited(req, limit);
}

export async function readFormData(req: IncomingMessage): Promise<FormData> {
  const type = req.headers['content-type'] ?? '';
  if (!/^multipart\/form-data\s*;/i.test(type)) throw new AppError('unsupported_media_type');
  const declared = declaredLength(req);
  if (declared !== null && declared > MAX_MULTIPART_BYTES) throw new AppError('upload_too_large');
  let size = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      size += chunk.length;
      if (size > MAX_MULTIPART_BYTES) callback(new AppError('upload_too_large'));
      else callback(null, chunk);
    },
  });
  req.pipe(limiter);
  req.on('error', (error) => limiter.destroy(error));
  const request = new Request('http://localhost/upload', {
    method: 'POST',
    headers: { 'content-type': type },
    body: Readable.toWeb(limiter) as unknown as ReadableStream,
    duplex: 'half',
  } as RequestInit);
  try {
    return await request.formData();
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof Error && (error.cause instanceof AppError)) throw error.cause;
    throw new AppError('validation', { fields: { $: 'invalidFormat' }, cause: error });
  }
}
