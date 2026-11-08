/** Browser calls same-origin /api/v1 (rewritten to the API). Server uses API_INTERNAL_URL. */
export function apiBaseUrl(server = typeof window === 'undefined'): string {
  if (server) {
    const base = (process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4000').replace(/\/$/, '');
    return `${base}/v1`;
  }
  return '/api/v1';
}

export const SITE_COOKIE_DISPLAY_CURRENCY = 'aurum_display_currency';
export const SITE_COOKIE_THEME = 'aurum_theme';
