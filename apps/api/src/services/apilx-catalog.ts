import { AppError } from '@aurum/shared';
import type { ApilxProviderId } from '../config.ts';
import type { Queryable } from '@aurum/db';
import type { Ctx } from '../http/types.ts';
import { audit } from './audit.ts';
import { auditActor } from './accounts.ts';
import { fetchApilxGamelist } from './apilx-gamelist.ts';
import { apilxProviderForSlug } from './apilx-launch.ts';

const PROVIDER_ROW: Record<ApilxProviderId, { slug: string; name: string; sortOrder: number }> = {
  pragmatic: { slug: 'pragmatic-play', name: 'Pragmatic Play', sortOrder: 10 },
  amatic: { slug: 'amatic', name: 'Amatic', sortOrder: 20 },
  pgsoft: { slug: 'pg-soft', name: 'PG Soft', sortOrder: 25 },
  amusnet: { slug: 'amusnet', name: 'Amusnet', sortOrder: 26 },
};

export interface ApilxSyncResult {
  provider: ApilxProviderId;
  remoteCount: number;
  matched: number;
  inserted: number;
  updated: number;
  sampleIds: string[];
}

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

function slugForInsert(providerSlug: string, externalId: string, name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  const suffix = `lx-${providerSlug}-${externalId}`.slice(0, 80);
  return base.length >= 3 ? `${base}-${externalId}`.slice(0, 96) : suffix;
}

async function ensureProvider(tx: Queryable, id: ApilxProviderId): Promise<string> {
  const meta = PROVIDER_ROW[id];
  const { rows } = await tx.query<{ id: string }>(
    `insert into game_providers (slug, name, is_active, sort_order, is_demo)
     values ($1, $2, true, $3, false)
     on conflict (slug) do update set name = excluded.name, is_active = true, sort_order = excluded.sort_order
     returning id::text`,
    [meta.slug, meta.name, meta.sortOrder],
  );
  const row = rows[0];
  if (!row) throw new AppError('internal_error');
  return row.id;
}

export async function syncApilxProviderCatalog(ctx: Ctx, providerId: ApilxProviderId): Promise<ApilxSyncResult> {
  const cfg = ctx.config.apilx;
  if (!cfg) throw new AppError('provider_unavailable', { message: 'APILX_* is not configured' });
  const vendor = cfg.providers.find((p) => p.id === providerId);
  if (!vendor) throw new AppError('provider_unavailable', { message: `API LX provider ${providerId} is not configured in .env` });

  const remote = await fetchApilxGamelist(cfg, vendor);
  const meta = PROVIDER_ROW[providerId];
  const byName = new Map<string, (typeof remote)[number]>();
  for (const g of remote) {
    const key = norm(g.name);
    if (!byName.has(key)) byName.set(key, g);
  }

  let matched = 0;
  let inserted = 0;
  let updated = 0;
  const linkedExternal = new Set<string>();

  await ctx.db.transaction(async (tx) => {
    const providerPk = await ensureProvider(tx, providerId);
    const { rows: existing } = await tx.query<{ id: string; name: string; external_id: string | null; slug: string }>(
      `select g.id::text, g.name, g.external_id, g.slug from games g
        where g.provider_id = $1::bigint and g.art->>'source' = 'aggregator' and not g.is_demo`,
      [providerPk],
    );

    for (const row of existing) {
      const hit =
        (row.external_id && remote.find((r) => r.externalId === row.external_id)) ??
        byName.get(norm(row.name)) ??
        undefined;
      if (!hit) continue;
      linkedExternal.add(hit.externalId);
      matched += 1;
      const artPatch =
        hit.image && /^https:\/\//.test(hit.image)
          ? { image: hit.image, apilxProvider: providerId }
          : { apilxProvider: providerId };
      await tx.query(
        `update games set external_id = $2, is_active = true, name = $3,
                art = art || $4::jsonb || jsonb_build_object('source', 'aggregator')
          where id = $1::bigint`,
        [row.id, hit.externalId, hit.name, JSON.stringify(artPatch)],
      );
      updated += 1;
    }

    for (const game of remote) {
      if (linkedExternal.has(game.externalId)) continue;
      const slug = slugForInsert(meta.slug, game.externalId, game.name);
      const art = {
        source: 'aggregator',
        apilxProvider: providerId,
        ...(game.image ? { image: game.image } : {}),
      };
      const ins = await tx.query<{ id: string }>(
        `insert into games (slug, name, provider_id, category, is_active, sort_order, external_id, art, is_demo)
         values ($1, $2, $3::bigint, 'slots', true, 5000, $4, $5::jsonb, false)
         on conflict (slug) do update set
           external_id = excluded.external_id,
           name = excluded.name,
           is_active = true,
           art = games.art || excluded.art
         returning id::text`,
        [slug, game.name, providerPk, game.externalId, JSON.stringify(art)],
      );
      if (ins.rows[0]) inserted += 1;
      linkedExternal.add(game.externalId);
    }

    await audit(tx, auditActor(ctx), {
      action: 'apilx.catalog_synced',
      targetType: 'provider',
      targetId: meta.slug,
      details: { providerId, remote: remote.length, matched, inserted, updated },
    });
  });

  return {
    provider: providerId,
    remoteCount: remote.length,
    matched,
    inserted,
    updated,
    sampleIds: remote.slice(0, 5).map((g) => g.externalId),
  };
}

export async function syncApilxCatalog(ctx: Ctx, filter?: { provider?: string }): Promise<{ results: ApilxSyncResult[] }> {
  const cfg = ctx.config.apilx;
  if (!cfg) throw new AppError('provider_unavailable', { message: 'APILX_* is not configured' });
  const want = filter?.provider?.trim().toLowerCase();
  const ids = cfg.providers.map((p) => p.id);
  const selected = want
    ? ids.filter((id) => id === want || PROVIDER_ROW[id].slug === want || apilxProviderForSlug(cfg, want)?.id === id)
    : ids;
  if (selected.length === 0) throw new AppError('not_found', { message: 'unknown API LX provider filter' });
  const results: ApilxSyncResult[] = [];
  for (const id of selected) results.push(await syncApilxProviderCatalog(ctx, id));
  return { results };
}
