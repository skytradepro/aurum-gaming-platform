import type { NextRequest } from 'next/server';

/** Absolute URL for server redirects — respects proxy headers and never sends the browser to 0.0.0.0. */
export function absoluteUrl(req: NextRequest, pathname: string): URL {
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const url = new URL(path, req.url);

  const forwardedHost = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const hostHeader = forwardedHost || req.headers.get('host');
  if (hostHeader) {
    const colon = hostHeader.lastIndexOf(':');
    const hasPort = colon > -1 && !hostHeader.startsWith('[');
    let hostname = (hasPort ? hostHeader.slice(0, colon) : hostHeader).toLowerCase();
    const port = hasPort ? hostHeader.slice(colon + 1) : '';
    if (hostname === '0.0.0.0' || hostname === '[::]') hostname = 'localhost';
    url.hostname = hostname.replace(/^\[|\]$/g, '');
    url.port = port;
  } else if (url.hostname === '0.0.0.0' || url.hostname === '[::]') {
    url.hostname = 'localhost';
  }

  const forwardedProto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase();
  if (forwardedProto === 'https' || forwardedProto === 'http') {
    url.protocol = `${forwardedProto}:`;
  }
  // Behind Caddy: public HTTPS uses 443; do not leak internal :3000 from req.url.
  if (url.protocol === 'https:' && url.port === '3000') url.port = '';

  return url;
}
