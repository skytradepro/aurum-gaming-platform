import { AppError } from '@aurum/shared';
import type { ApilxConfig, ApilxProviderConfig, ApilxProviderId } from '../config.ts';

export interface ApilxRemoteGame {
  /** Provider numeric game id (wire format for userAuth.gameid and wallet gameID). */
  externalId: string;
  name: string;
  image: string | null;
}

export async function fetchApilxGamelist(cfg: ApilxConfig, vendor: ApilxProviderConfig): Promise<ApilxRemoteGame[]> {
  const base = vendor.apiUrl.replace(/\/$/, '');
  const q = new URLSearchParams({ agentID: cfg.agentId });
  const url = `${base}/gamelist?${q}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${vendor.apiToken}`,
      },
      signal: AbortSignal.timeout(120_000),
    });
  } catch (error) {
    throw new AppError('provider_unavailable', { message: `API LX gamelist unreachable (${vendor.id})`, cause: error });
  }
  let json: unknown;
  try {
    json = await res.json();
  } catch (error) {
    throw new AppError('provider_unavailable', { message: `API LX gamelist invalid JSON (${vendor.id})`, cause: error });
  }
  const parsed = parseApilxGamelistResponse(json, vendor.id);
  if (parsed.length === 0) {
    throw new AppError('provider_unavailable', { message: `API LX gamelist empty (${vendor.id})` });
  }
  return parsed;
}

export function parseApilxGamelistResponse(json: unknown, providerId: ApilxProviderId): ApilxRemoteGame[] {
  if (!json || typeof json !== 'object') return [];
  const root = json as Record<string, unknown>;
  const code = root.code;
  if (code !== undefined && code !== 0) {
    const message = typeof root.message === 'string' ? root.message : `code ${String(code)}`;
    throw new AppError('provider_unavailable', { message: `API LX gamelist (${providerId}): ${message}` });
  }
  const list = extractGameArray(root);
  const out: ApilxRemoteGame[] = [];
  const seen = new Set<string>();
  for (const raw of list) {
    const game = parseRemoteGameRow(raw);
    if (!game || seen.has(game.externalId)) continue;
    seen.add(game.externalId);
    out.push(game);
  }
  return out;
}

function extractGameArray(root: Record<string, unknown>): unknown[] {
  for (const key of ['gamelist', 'gameList', 'games', 'data', 'list', 'game_list'] as const) {
    const v = root[key];
    if (Array.isArray(v)) return v;
  }
  if (Array.isArray(root)) return root;
  return [];
}

function parseRemoteGameRow(raw: unknown): ApilxRemoteGame | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const idRaw = r.gameid ?? r.gameID ?? r.gameId ?? r.GameID ?? r.id ?? r.ID;
  if (idRaw === null || idRaw === undefined) return null;
  const externalId = String(idRaw).trim();
  if (!/^\d+$/.test(externalId)) return null;
  const nameRaw = r.gamename ?? r.gameName ?? r.name ?? r.title ?? r.GameName;
  const name = typeof nameRaw === 'string' ? nameRaw.trim() : '';
  if (name.length < 2) return null;
  const image = firstHttpsIcon(
    r.iconurl3,
    r.iconUrl3,
    r.iconurl2,
    r.iconUrl2,
    r.iconurl1,
    r.iconUrl1,
    r.iconurl,
    r.iconUrl,
    r.image,
    r.img,
    r.thumbnail,
    r.icon,
    r.vertical,
  );
  return { externalId, name, image };
}

function firstHttpsIcon(...candidates: unknown[]): string | null {
  for (const c of candidates) {
    if (typeof c === 'string' && /^https:\/\//.test(c.trim())) return c.trim();
  }
  return null;
}
