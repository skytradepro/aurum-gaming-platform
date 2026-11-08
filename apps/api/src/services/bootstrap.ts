/**
 * Creating the first Super Admin. This is only ever called from the command line
 * (scripts/create-super-admin.ts): the database refuses super_admin rows unless the
 * transaction sets app.bootstrap = 'on', and no API route does that.
 */
import type { Db } from '@aurum/db';
import { AppError, normalizeEmail, parseOrThrow, passwordProblem, v } from '@aurum/shared';
import { hashPassword } from '../security/password.ts';

const NAME = /^[\p{L}\p{M}][\p{L}\p{M}\s'’.-]*$/u;

const schema = v.object({
  username: v.username(),
  email: v.email(),
  firstName: v.string({ max: 80, pattern: NAME }),
  lastName: v.string({ max: 80, pattern: NAME }),
});

export const SUPER_ADMIN_MIN_PASSWORD_LENGTH = 12;

export interface SuperAdminInput {
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  password: string;
}

export async function createSuperAdmin(db: Db, input: SuperAdminInput, scryptLog2N: number): Promise<{ id: string; username: string }> {
  const person = parseOrThrow(schema, input);
  if (input.password.length < SUPER_ADMIN_MIN_PASSWORD_LENGTH) {
    throw new AppError('weak_password', { fields: { password: 'passwordTooShort' } });
  }
  const problem = passwordProblem(input.password, { username: person.username, email: person.email });
  if (problem) throw new AppError('weak_password', { fields: { password: problem } });
  const hash = await hashPassword(input.password, scryptLog2N);

  return db.transaction(async (tx) => {
    await tx.query("select set_config('app.bootstrap', 'on', true)");
    const { rows } = await tx.query<{ id: string }>(
      `insert into users (username, email, password_hash, first_name, last_name, role, must_change_password)
       values ($1, $2, $3, $4, $5, 'super_admin', false) returning id::text`,
      [person.username, normalizeEmail(person.email), hash, person.firstName, person.lastName],
    );
    const id = (rows[0] as { id: string }).id;
    await tx.query(
      `insert into audit_logs (actor_id, actor_role, action, target_type, target_id, details)
       values (null, null, 'bootstrap.super_admin_created', 'user', $1, '{}'::jsonb)`,
      [id],
    );
    return { id, username: person.username };
  });
}
