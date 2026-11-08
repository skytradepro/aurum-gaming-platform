import { randomBytes } from 'node:crypto';
import type { Db } from '@aurum/db';

let counter = 0;
const unique = () => `${Date.now().toString(36)}${(counter++).toString(36)}${randomBytes(2).toString('hex')}`;

export async function makeAdmin(db: Db, permissions: string[] = ['balances.manage']): Promise<string> {
  const u = unique();
  const { rows } = await db.query<{ id: string }>(
    `insert into users (username, email, password_hash, first_name, last_name, role, permissions)
     values ($1, $2, 'x', 'Staff', 'Member', 'admin', $3::text[]) returning id`,
    [`admin_${u}`, `admin_${u}@example.test`, permissions],
  );
  return (rows[0] as { id: string }).id;
}

export async function makePlayer(db: Db, currency = 'TND'): Promise<{ userId: string; walletId: string; username: string }> {
  const u = unique();
  const phone = `+216${String(20_000_000 + (counter % 70_000_000)).padStart(8, '0')}`;
  const { rows } = await db.query<{ id: string }>(
    `insert into users (username, email, phone, password_hash, first_name, last_name,
                        date_of_birth, country_code, account_currency, terms_accepted_at)
     values ($1, $2, $3, 'x', 'Test', 'Player', date '1990-01-01', 'TN', $4, now()) returning id`,
    [`player_${u}`, `player_${u}@example.test`, phone, currency],
  );
  const userId = (rows[0] as { id: string }).id;
  const w = await db.query<{ id: string }>('select id::text from wallets where user_id = $1::uuid', [userId]);
  return { userId, walletId: (w.rows[0] as { id: string }).id, username: `player_${u}` };
}

/** Deterministic pseudo-random numbers (mulberry32) so a failing run can be replayed. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
