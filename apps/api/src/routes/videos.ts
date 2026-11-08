import { AppError, v } from '@aurum/shared';
import { readQuery } from '../http/query.ts';
import { access, cacheable, ok } from '../http/types.ts';
import type { Route } from '../http/types.ts';
import { getVideoSlots, isVideoSlot, isVideoVariant, serveVideo, setVideoMode, uploadVideoChunk } from '../services/videos.ts';

const chunkQuery = v.object({
  upload: v.string({ min: 32, max: 32, pattern: /^[a-f0-9]{32}$/ }),
  part: v.integer({ min: 0, max: 100, coerce: true }),
  parts: v.integer({ min: 1, max: 100, coerce: true }),
});
const modeSchema = v.object({ mode: v.choice(['default', 'off'] as const) });

function slotOf(params: Readonly<Record<string, string>>) {
  const slot = params.slot ?? '';
  const variant = params.variant ?? '';
  if (!isVideoSlot(slot) || !isVideoVariant(variant)) throw new AppError('not_found');
  return { slot, variant };
}

const canManage = access.staff('banners.manage');

export const videoRoutes: Route[] = [
  {
    method: 'GET',
    path: '/v1/public/videos',
    access: access.public,
    async handler(ctx) {
      return cacheable({ slots: await getVideoSlots(ctx.db) }, 30);
    },
  },
  {
    method: 'GET',
    path: '/v1/media/videos/:key',
    access: access.public,
    async handler(ctx) {
      return serveVideo(ctx, ctx.params.key ?? '');
    },
  },
  {
    method: 'GET',
    path: '/v1/admin/videos',
    access: canManage,
    async handler(ctx) {
      return ok({ slots: await getVideoSlots(ctx.db) });
    },
  },
  {
    method: 'POST',
    path: '/v1/admin/videos/:slot/:variant/chunk',
    access: canManage,
    limit: { name: 'video-upload', max: 600, windowMs: 60 * 60_000 },
    async handler(ctx) {
      const { slot, variant } = slotOf(ctx.params);
      return ok(await uploadVideoChunk(ctx, slot, variant, readQuery(ctx, chunkQuery)));
    },
  },
  {
    method: 'POST',
    path: '/v1/admin/videos/:slot/:variant/mode',
    access: canManage,
    async handler(ctx) {
      const { slot, variant } = slotOf(ctx.params);
      const body = await ctx.json(modeSchema);
      return ok({ slots: await setVideoMode(ctx, slot, variant, body.mode) });
    },
  },
];
