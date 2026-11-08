/**
 * Prints which APILX_* keys are set (length only). Never prints secret values.
 */
import { loadConfig } from '../src/config.ts';

const KEYS = [
  'APILX_AGENT_ID',
  'APILX_PRAGMATIC_API_URL',
  'APILX_PRAGMATIC_TOKEN',
  'APILX_PRAGMATIC_SECRET',
  'APILX_AMATIC_API_URL',
  'APILX_AMATIC_TOKEN',
  'APILX_AMATIC_SECRET',
  'APILX_PGSOFT_API_URL',
  'APILX_PGSOFT_TOKEN',
  'APILX_PGSOFT_SECRET',
  'APILX_AMUSNET_API_URL',
  'APILX_AMUSNET_TOKEN',
  'APILX_AMUSNET_SECRET',
] as const;

for (const key of KEYS) {
  const v = process.env[key]?.trim() ?? '';
  process.stdout.write(`${key}: ${v ? `set (len=${v.length})` : 'missing'}\n`);
}

try {
  const cfg = loadConfig();
  if (!cfg.apilx) {
    process.stdout.write('apilx config: inactive (no APILX_* bundle)\n');
  } else {
    process.stdout.write(`apilx config: active agent len=${cfg.apilx.agentId.length} providers=${cfg.apilx.providers.map((p) => p.id).join(',')}\n`);
  }
} catch (error) {
  process.stderr.write(`config error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
