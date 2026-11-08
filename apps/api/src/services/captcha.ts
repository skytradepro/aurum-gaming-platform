/**
 * Optional CAPTCHA. Disabled unless TURNSTILE_SECRET and TURNSTILE_SITE_KEY are configured
 * (Cloudflare Turnstile is an external service: it is only contacted when the operator turns it on).
 */
import type { Config } from '../config.ts';

export interface Captcha {
  readonly enabled: boolean;
  readonly siteKey: string | null;
  verify(token: string | undefined, ip: string): Promise<boolean>;
}

export function createCaptcha(config: Config, fetchImpl: typeof fetch = fetch): Captcha {
  const settings = config.turnstile;
  if (!settings) {
    return { enabled: false, siteKey: null, verify: async () => true };
  }
  return {
    enabled: true,
    siteKey: settings.siteKey,
    async verify(token, ip) {
      if (!token || token.length > 4096) return false;
      try {
        const body = new URLSearchParams({ secret: settings.secret, response: token, remoteip: ip });
        const response = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
          method: 'POST',
          body,
          signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) return false;
        const result = (await response.json()) as { success?: boolean };
        return result.success === true;
      } catch {
        return false; // fail closed: if the check cannot be made, the request is refused
      }
    },
  };
}
