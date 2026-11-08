/**
 * Game catalogue. Rows are created by staff (or by the demo seed, flagged is_demo).
 * Launching a real game needs a licensed provider integration, which does not exist yet:
 * the website shows the catalogue and says so.
 */
import type { Queryable } from '@aurum/db';
import { AppError } from '@aurum/shared';
import type { GameCategory } from '@aurum/shared';
import { slugConflict } from '../errors.ts';
import type { Ctx } from '../http/types.ts';
import { audit } from './audit.ts';
import { auditActor } from './accounts.ts';
import { assertMediaExist, getMediaMap } from './media.ts';
import type { MediaDTO } from './media.ts';

export interface ProviderDTO {
  id: string;
  slug: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  isDemo: boolean;
}

interface ProviderRow {
  id: string;
  slug: string;
  name: string;
  is_active: boolean;
  sort_order: number;
  is_demo: boolean;
}

const toProvider = (r: ProviderRow): ProviderDTO => ({ id: r.id, slug: r.slug, name: r.name, isActive: r.is_active, sortOrder: r.sort_order, isDemo: r.is_demo });
const PROVIDER_COLUMNS = 'id::text, slug, name, is_active, sort_order, is_demo';

export async function listProviders(q: Queryable, options: { activeOnly?: boolean; includeDemo?: boolean } = {}): Promise<ProviderDTO[]> {
  const { rows } = await q.query<ProviderRow>(
    `select ${PROVIDER_COLUMNS} from game_providers
      where ($1::boolean is not true or is_active) and ($2::boolean is true or not is_demo)
      order by sort_order, name`,
    [options.activeOnly ?? false, options.includeDemo ?? true],
  );
  return rows.map(toProvider);
}

export interface ProviderInput {
  slug: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
}

export function saveProvider(ctx: Ctx, id: string | null, input: ProviderInput): Promise<ProviderDTO> {
  return saveProviderTx(ctx, id, input).catch((error: unknown) => {
    throw slugConflict(error);
  });
}

function saveProviderTx(ctx: Ctx, id: string | null, input: ProviderInput): Promise<ProviderDTO> {
  return ctx.db.transaction(async (tx) => {
    const { rows } =
      id === null
        ? await tx.query<ProviderRow>(
            `insert into game_providers (slug, name, is_active, sort_order) values ($1, $2, $3, $4) returning ${PROVIDER_COLUMNS}`,
            [input.slug, input.name, input.isActive, input.sortOrder],
          )
        : await tx.query<ProviderRow>(
            `update game_providers set slug = $2, name = $3, is_active = $4, sort_order = $5 where id = $1::bigint returning ${PROVIDER_COLUMNS}`,
            [id, input.slug, input.name, input.isActive, input.sortOrder],
          );
    const row = rows[0];
    if (!row) throw new AppError('not_found');
    await audit(tx, auditActor(ctx), { action: id === null ? 'provider.created' : 'provider.updated', targetType: 'provider', targetId: row.id, details: { slug: input.slug, isActive: input.isActive } });
    return toProvider(row);
  });
}

export interface GameDTO {
  id: string;
  slug: string;
  name: string;
  provider: { id: string; slug: string; name: string };
  category: GameCategory;
  isFeatured: boolean;
  isNew: boolean;
  isActive: boolean;
  sortOrder: number;
  thumbnail: MediaDTO | null;
  /** Placeholder artwork for demo rows: colours and a glyph, no third-party images. */
  art: Record<string, unknown>;
  externalId: string | null;
  isDemo: boolean;
}

interface GameRow {
  id: string;
  slug: string;
  name: string;
  provider_id: string;
  provider_slug: string;
  provider_name: string;
  category: GameCategory;
  is_featured: boolean;
  is_new: boolean;
  is_active: boolean;
  sort_order: number;
  thumbnail_id: string | null;
  art: Record<string, unknown>;
  external_id: string | null;
  is_demo: boolean;
}

const GAME_SELECT = `select g.id::text, g.slug, g.name, g.provider_id::text, p.slug as provider_slug, p.name as provider_name,
       g.category, g.is_featured, g.is_new, g.is_active, g.sort_order, g.thumbnail_id::text, g.art, g.external_id, g.is_demo
  from games g join game_providers p on p.id = g.provider_id`;

async function toGames(q: Queryable, rows: GameRow[]): Promise<GameDTO[]> {
  const media = await getMediaMap(q, rows.map((r) => r.thumbnail_id));
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    provider: { id: r.provider_id, slug: r.provider_slug, name: r.provider_name },
    category: r.category,
    isFeatured: r.is_featured,
    isNew: r.is_new,
    isActive: r.is_active,
    sortOrder: r.sort_order,
    thumbnail: r.thumbnail_id ? media.get(r.thumbnail_id) ?? null : null,
    art: r.art,
    externalId: r.external_id,
    isDemo: r.is_demo,
  }));
}

export const GAME_SORTS = ['default', 'az', 'za', 'newest'] as const;
export type GameSort = (typeof GAME_SORTS)[number];

const ORDER_BY: Readonly<Record<GameSort, string>> = {
  default: 'g.sort_order, g.id',
  az: 'lower(g.name), g.id',
  za: 'lower(g.name) desc, g.id desc',
  newest: 'g.created_at desc, g.id desc',
};

export interface GameFilter {
  category?: GameCategory | undefined;
  provider?: string | undefined;
  search?: string | undefined;
  featured?: boolean | undefined;
  /** Only games flagged "new". */
  isNew?: boolean | undefined;
  /** 'default' = staff order (sort_order); 'az' / 'za' = by name; 'newest' = most recently added first. */
  sort?: GameSort | undefined;
  activeOnly: boolean;
  includeDemo: boolean;
  offset?: number | undefined;
  limit?: number | undefined;
}

export async function listGames(q: Queryable, filter: GameFilter): Promise<{ items: GameDTO[]; total: number }> {
  const limit = Math.min(Math.max(filter.limit ?? 48, 1), 200);
  const offset = Math.max(filter.offset ?? 0, 0);
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, value: unknown) => {
    params.push(value);
    where.push(sql.replace(/\?/g, `$${params.length}`));
  };
  if (filter.activeOnly) where.push('g.is_active and p.is_active');
  if (!filter.includeDemo) where.push('not g.is_demo');
  if (filter.category) add('g.category = ?', filter.category);
  if (filter.provider) add('p.slug = ?', filter.provider);
  if (filter.featured) where.push('g.is_featured');
  if (filter.isNew) where.push('g.is_new');
  const search = filter.search?.trim().toLowerCase();
  if (search) add('lower(g.name) like ?', `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
  const whereSql = where.length > 0 ? `where ${where.join(' and ')}` : '';
  const total = await q.query<{ n: string }>(`select count(*)::text as n from games g join game_providers p on p.id = g.provider_id ${whereSql}`, params);
  params.push(limit, offset);
  const { rows } = await q.query<GameRow>(
    `${GAME_SELECT} ${whereSql} order by ${ORDER_BY[filter.sort ?? 'default']} limit $${params.length - 1} offset $${params.length}`,
    params,
  );
  return { items: await toGames(q, rows), total: Number(total.rows[0]?.n ?? '0') };
}

/** One game by id (dashboard; any status). */
export async function getGameById(q: Queryable, id: string): Promise<GameDTO | null> {
  const { rows } = await q.query<GameRow>(`${GAME_SELECT} where g.id = $1::bigint`, [id]);
  return rows[0] ? ((await toGames(q, rows))[0] ?? null) : null;
}

/** One game for its public page (active, and demo rows only when demo data is on). */
export async function getPublicGame(q: Queryable, slug: string, includeDemo: boolean): Promise<GameDTO | null> {
  const { rows } = await q.query<GameRow>(
    `${GAME_SELECT} where g.slug = $1 and g.is_active and p.is_active and ($2::boolean or not g.is_demo)`,
    [slug, includeDemo],
  );
  return rows[0] ? ((await toGames(q, rows))[0] ?? null) : null;
}

export interface GameInput {
  slug: string;
  name: string;
  providerId: string;
  category: GameCategory;
  isFeatured: boolean;
  isNew: boolean;
  isActive: boolean;
  sortOrder: number;
  thumbnailId: string | null;
  externalId: string | null;
}

export function saveGame(ctx: Ctx, id: string | null, input: GameInput): Promise<GameDTO> {
  return saveGameTx(ctx, id, input).catch((error: unknown) => {
    throw slugConflict(error);
  });
}

function saveGameTx(ctx: Ctx, id: string | null, input: GameInput): Promise<GameDTO> {
  return ctx.db.transaction(async (tx) => {
    await assertMediaExist(tx, { thumbnailId: input.thumbnailId });
    const provider = await tx.query('select 1 from game_providers where id = $1::bigint', [input.providerId]);
    if (provider.rowCount === 0) throw new AppError('validation', { fields: { providerId: 'invalidChoice' } });
    const params = [input.slug, input.name, input.providerId, input.category, input.isFeatured, input.isNew, input.isActive, input.sortOrder, input.thumbnailId, input.externalId];
    const { rows } =
      id === null
        ? await tx.query<{ id: string }>(
            `insert into games (slug, name, provider_id, category, is_featured, is_new, is_active, sort_order, thumbnail_id, external_id)
             values ($1, $2, $3::bigint, $4, $5, $6, $7, $8, $9::uuid, $10) returning id::text`,
            params,
          )
        : await tx.query<{ id: string }>(
            `update games set slug = $2, name = $3, provider_id = $4::bigint, category = $5, is_featured = $6, is_new = $7,
                    is_active = $8, sort_order = $9, thumbnail_id = $10::uuid, external_id = $11
              where id = $1::bigint returning id::text`,
            [id, ...params],
          );
    const saved = rows[0];
    if (!saved) throw new AppError('not_found');
    await audit(tx, auditActor(ctx), { action: id === null ? 'game.created' : 'game.updated', targetType: 'game', targetId: saved.id, details: { slug: input.slug, isActive: input.isActive } });
    const full = await tx.query<GameRow>(`${GAME_SELECT} where g.id = $1::bigint`, [saved.id]);
    return (await toGames(tx, full.rows))[0] as GameDTO;
  });
}
