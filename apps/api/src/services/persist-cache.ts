/**
 * Small disk-backed cache for provider data, so restarting the API does not spend the provider's daily request
 * limit again. One JSON file per cache under storage/cache (development and single-server use).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = process.env.AURUM_STORAGE_CACHE
  ? resolve(process.env.AURUM_STORAGE_CACHE)
  : resolve(dirname(fileURLToPath(import.meta.url)), '../../../../storage/cache');

export function persistentMap<K extends string | number, V>(name: string): Map<K, V> {
  const file = join(DIR, `${name}.json`);
  const map = new Map<K, V>();
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as [K, V][];
    for (const [k, v] of raw) map.set(k, v);
  } catch {
    /* no cache yet */
  }
  let timer: ReturnType<typeof setTimeout> | null = null;
  const save = () => {
    timer = null;
    try {
      mkdirSync(DIR, { recursive: true });
      writeFileSync(file, JSON.stringify([...map.entries()]));
    } catch {
      /* cache is best effort */
    }
  };
  const set = map.set.bind(map);
  map.set = (k: K, v: V) => {
    set(k, v);
    timer ??= setTimeout(save, 2000);
    timer.unref?.();
    return map;
  };
  return map;
}
