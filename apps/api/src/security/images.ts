/**
 * Image upload validation. We never trust the file name or the declared content type:
 * the format is recognised from the first bytes and the size is read from the header.
 * Only PNG, JPEG and WebP are accepted (SVG is refused on purpose: it can carry scripts).
 */
export type ImageMime = 'image/png' | 'image/jpeg' | 'image/webp';

export interface ImageInfo {
  mime: ImageMime;
  extension: 'png' | 'jpg' | 'webp';
  width: number;
  height: number;
}

export function inspectImage(bytes: Uint8Array): ImageInfo | null {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return inspectPng(b) ?? inspectJpeg(b) ?? inspectWebp(b);
}

function inspectPng(b: Buffer): ImageInfo | null {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (b.length < 33 || !b.subarray(0, 8).equals(signature)) return null;
  if (b.toString('latin1', 12, 16) !== 'IHDR') return null;
  const width = b.readUInt32BE(16);
  const height = b.readUInt32BE(20);
  if (width === 0 || height === 0) return null;
  return { mime: 'image/png', extension: 'png', width, height };
}

function inspectJpeg(b: Buffer): ImageInfo | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let o = 2;
  while (o + 4 <= b.length) {
    if (b[o] !== 0xff) return null;
    let marker = b[o + 1] as number;
    while (marker === 0xff && o + 2 < b.length) {
      o++;
      marker = b[o + 1] as number;
    }
    o += 2;
    // markers without a length
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (marker === 0xd9 || marker === 0xda) return null; // reached the data without a frame header
    if (o + 2 > b.length) return null;
    const length = b.readUInt16BE(o);
    // start-of-frame markers carry the size (all except DHT 0xC4, JPG 0xC8, DAC 0xCC)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (o + 7 > b.length) return null;
      const height = b.readUInt16BE(o + 3);
      const width = b.readUInt16BE(o + 5);
      if (width === 0 || height === 0) return null;
      return { mime: 'image/jpeg', extension: 'jpg', width, height };
    }
    if (length < 2) return null;
    o += length;
  }
  return null;
}

function inspectWebp(b: Buffer): ImageInfo | null {
  if (b.length < 30 || b.toString('latin1', 0, 4) !== 'RIFF' || b.toString('latin1', 8, 12) !== 'WEBP') return null;
  const chunk = b.toString('latin1', 12, 16);
  let width: number;
  let height: number;
  if (chunk === 'VP8 ') {
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    width = b.readUInt16LE(26) & 0x3fff;
    height = b.readUInt16LE(28) & 0x3fff;
  } else if (chunk === 'VP8L') {
    if (b[20] !== 0x2f) return null;
    const bits = b.readUInt32LE(21);
    width = (bits & 0x3fff) + 1;
    height = ((bits >> 14) & 0x3fff) + 1;
  } else if (chunk === 'VP8X') {
    width = (b[24] as number) + ((b[25] as number) << 8) + ((b[26] as number) << 16) + 1;
    height = (b[27] as number) + ((b[28] as number) << 8) + ((b[29] as number) << 16) + 1;
  } else {
    return null;
  }
  if (width === 0 || height === 0) return null;
  return { mime: 'image/webp', extension: 'webp', width, height };
}
