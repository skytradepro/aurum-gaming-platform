import { cookies } from 'next/headers';
import { apiFetch } from './api';
import type { MeUser } from './types';

export async function getSessionUser(): Promise<MeUser | null> {
  try {
    const jar = await cookies();
    const cookieHeader = jar.toString();
    if (!cookieHeader) return null;
    const { user } = await apiFetch<{ user: MeUser }>('/auth/me', { cookieHeader });
    return user;
  } catch {
    return null;
  }
}

export function isStaff(user: MeUser): boolean {
  return user.role === 'admin' || user.role === 'super_admin';
}

export function isCashier(user: MeUser): boolean {
  return user.role === 'cashier';
}

export function isPlayer(user: MeUser): boolean {
  return user.role === 'user';
}

export function hasPermission(user: MeUser, ...anyOf: string[]): boolean {
  if (user.role === 'super_admin') return true;
  if (user.role !== 'admin') return false;
  return anyOf.some((p) => user.permissions.includes(p as never));
}
