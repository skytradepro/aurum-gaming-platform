import { parseOrThrow } from '@aurum/shared';
import type { Schema } from '@aurum/shared';
import type { Ctx } from './types.ts';

/** Validates the query string. Repeated keys: the first value wins. Unknown keys are ignored. */
export function readQuery<T>(ctx: Ctx, schema: Schema<T>): T {
  const plain: Record<string, string> = {};
  for (const [key, value] of ctx.query.entries()) {
    if (!Object.hasOwn(plain, key)) plain[key] = value;
  }
  return parseOrThrow(schema, plain);
}
