import { LOCALES } from '@aurum/i18n';
import { v } from '@aurum/shared';
import { access, ok } from '../http/types.ts';
import type { Route } from '../http/types.ts';
import { aiChat } from '../services/ai.ts';

const chatSchema = v.object({
  locale: v.withDefault(v.choice(LOCALES), 'en'),
  page: v.optional(v.string({ min: 1, max: 400, multiline: true })),
  messages: v.array(v.object({ role: v.choice(['user', 'assistant'] as const), content: v.string({ min: 1, max: 4000, multiline: true }) }), { min: 1, max: 30 }),
});

export const aiRoutes: Route[] = [
  {
    method: 'POST',
    path: '/v1/ai/chat',
    access: access.publicOptionalAuth,
    async handler(ctx) {
      return ok(await aiChat(ctx, await ctx.json(chatSchema)));
    },
  },
];
