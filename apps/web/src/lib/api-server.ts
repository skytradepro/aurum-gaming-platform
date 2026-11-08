import { cookies } from 'next/headers';
import { apiFetch } from './api';

/** Server Components: forwards the visitor session cookie to the API. */
export async function serverApiFetch<T>(path: string, init: Parameters<typeof apiFetch>[1] = {}): Promise<T> {
  const jar = await cookies();
  return apiFetch<T>(path, { ...init, cookieHeader: jar.toString() });
}
