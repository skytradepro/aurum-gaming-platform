import { AppError } from '@aurum/shared';
import type { ApilxConfig, ApilxProviderConfig } from '../config.ts';
import type { Ctx } from '../http/types.ts';

const SLUG_TO_PROVIDER: Record<string, ApilxProviderConfig['id']> = {
  'pragmatic-play': 'pragmatic',
  amatic: 'amatic',
  'pg-soft': 'pgsoft',
  amusnet: 'amusnet',
  evoplay: 'pgsoft',
};

export function apilxProviderForSlug(cfg: ApilxConfig, providerSlug: string): ApilxProviderConfig | null {
  const id = SLUG_TO_PROVIDER[providerSlug];
  if (!id) return null;
  return cfg.providers.find((p) => p.id === id) ?? null;
}

export async function launchApilxGame(
  ctx: Ctx,
  input: { accountNo: string; externalGameId: string; language: string; lobbyUrl: string; providerSlug: string },
): Promise<{ url: string }> {
  const cfg = ctx.config.apilx;
  if (!cfg) throw new AppError('provider_unavailable');
  const vendor = apilxProviderForSlug(cfg, input.providerSlug);
  if (!vendor) throw new AppError('provider_unavailable', { message: 'API LX provider not configured for this game' });

  const gameid = Number.parseInt(input.externalGameId, 10);
  if (!Number.isFinite(gameid)) throw new AppError('provider_unavailable', { message: 'game missing external_id for API LX' });

  const url = `${vendor.apiUrl.replace(/\/$/, '')}/userAuth`;
  const body = {
    agentID: cfg.agentId,
    userID: input.accountNo,
    lang: input.language.slice(0, 2),
    gameid,
    isaffiliate: false,
    lobbyUrl: input.lobbyUrl,
  };
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        authorization: `Bearer ${vendor.apiToken}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    throw new AppError('provider_unavailable', { message: 'API LX userAuth unreachable', cause: error });
  }
  let json: { code?: number; message?: string; url?: string };
  try {
    json = (await res.json()) as { code?: number; message?: string; url?: string };
  } catch (error) {
    throw new AppError('provider_unavailable', { message: 'API LX userAuth invalid JSON', cause: error });
  }
  if (json.code !== 0 || typeof json.url !== 'string' || !/^https:\/\//.test(json.url)) {
    throw new AppError('provider_unavailable', { message: json.message ?? `API LX userAuth code ${json.code ?? '?'}` });
  }
  return { url: json.url };
}
