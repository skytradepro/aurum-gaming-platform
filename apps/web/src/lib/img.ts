/**
 * Smaller copies of local pictures through the Next.js image optimizer (production only).
 * The original file is never changed; the browser just downloads a lighter version (WebP when supported).
 */
type Width = 384 | 640 | 828 | 1080 | 1200 | 1920;

function canOptimize(src: string | undefined): src is string {
  return process.env.NODE_ENV === 'production' && typeof src === 'string' && src.startsWith('/media/');
}

export function optimizedSrc(src: string | undefined, width: Width = 640): string | undefined {
  if (!canOptimize(src)) return src;
  return `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=75`;
}

/** srcSet for a game cover shown as a card (about 150-260 px wide). */
export function coverSrcSet(src: string | undefined): string | undefined {
  if (!canOptimize(src)) return undefined;
  return `${optimizedSrc(src, 384)} 384w, ${optimizedSrc(src, 640)} 640w`;
}
