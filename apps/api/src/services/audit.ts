import type { Queryable } from '@aurum/db';
import type { Role } from '@aurum/shared';
import { normalizeIp } from '../security/session.ts';

export interface AuditActor {
  actorId: string | null;
  actorRole: Role | null;
  ip: string;
  userAgent: string;
  requestId: string;
}

export interface AuditEntry {
  /** dotted verb, e.g. "balance.post", "auth.login_failed" */
  action: string;
  targetType?: string;
  targetId?: string;
  /** Facts about the action. Never put passwords, tokens or full card/ID numbers here. */
  details?: Record<string, unknown>;
}

export async function audit(q: Queryable, actor: AuditActor, entry: AuditEntry): Promise<void> {
  await q.query(
    `insert into audit_logs (actor_id, actor_role, action, target_type, target_id, details, ip, user_agent, request_id)
     values ($1::uuid, $2::user_role, $3, $4, $5, $6::jsonb, $7::inet, $8, $9)`,
    [
      actor.actorId,
      actor.actorRole,
      entry.action,
      entry.targetType ?? null,
      entry.targetId ?? null,
      JSON.stringify(entry.details ?? {}),
      normalizeIp(actor.ip),
      actor.userAgent.slice(0, 400) || null,
      actor.requestId,
    ],
  );
}
