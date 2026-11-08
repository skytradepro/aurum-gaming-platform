import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const apiInternal = (process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4000').replace(/\/$/, '');

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@aurum/i18n', '@aurum/money', '@aurum/shared'],
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: '127.0.0.1' },
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'https', hostname: 'pp.gitslotgameicons.com' },
      { protocol: 'https', hostname: 'common-static.ppgames.net' },
    ],
    unoptimized: process.env.NODE_ENV === 'development',
  },
  poweredByHeader: false,
  async headers() {
    const security = [
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
      { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
      { key: 'Content-Security-Policy', value: "frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self'" },
    ];
    // HTTPS only once the site runs in production behind a certificate.
    if (process.env.NODE_ENV === 'production') {
      security.push({ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' });
    }
    const noStore = [{ key: 'Cache-Control', value: 'no-store' }, { key: 'X-Robots-Tag', value: 'noindex, nofollow' }];
    const staticLong = [{ key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' }];
    return [
      { source: '/:path*', headers: security },
      { source: '/media/:path*', headers: staticLong },
      { source: '/:locale/admin/:path*', headers: noStore },
      { source: '/:locale/skyx/:path*', headers: noStore },
      { source: '/:locale/shop/:path*', headers: noStore },
    ];
  },
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${apiInternal}/v1/:path*` }];
  },
};

export default withNextIntl(nextConfig);
