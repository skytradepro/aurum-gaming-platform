/**
 * Currency catalogue (managed by the Super Admin).
 * The database stores the symbol placement as "before"/"after"; the money library and the
 * website use "prefix"/"suffix". The conversion lives here, in one place.
 */
import type { Queryable } from '@aurum/db';
import type { CurrencyConfig, CurrencyDisplayRule, FormatLocale } from '@aurum/money';
import { AppError } from '@aurum/shared';

export interface CurrencyDTO {
  code: string;
  kind: 'fiat' | 'crypto';
  /** Accounting precision (immutable once a wallet uses the currency). */
  decimals: number;
  /** Presentation precision for player-facing summaries (null = same as decimals). */
  displayDecimals: number | null;
  names: Partial<Record<FormatLocale, string>>;
  display: { default: CurrencyDisplayRule } & Partial<Record<FormatLocale, CurrencyDisplayRule>>;
  isEnabled: boolean;
  sortOrder: number;
}

interface DbRule {
  symbol: string;
  placement: 'before' | 'after';
  spacing: boolean;
}

interface CurrencyRow {
  code: string;
  kind: 'fiat' | 'crypto';
  decimals: number;
  display_decimals: number | null;
  names: Record<string, string>;
  display: Record<string, DbRule>;
  is_enabled: boolean;
  sort_order: number;
}

const COLUMNS = 'code, kind, decimals::int, display_decimals::int, names, display, is_enabled, sort_order';
const LOCALE_KEYS: readonly FormatLocale[] = ['en', 'fr', 'ar'];

function ruleFromDb(rule: DbRule): CurrencyDisplayRule {
  return { symbol: rule.symbol, placement: rule.placement === 'before' ? 'prefix' : 'suffix', spacing: rule.spacing };
}

function ruleToDb(rule: CurrencyDisplayRule): DbRule {
  return { symbol: rule.symbol, placement: rule.placement === 'prefix' ? 'before' : 'after', spacing: rule.spacing };
}

function toDTO(row: CurrencyRow): CurrencyDTO {
  const display: CurrencyDTO['display'] = { default: ruleFromDb(row.display.default as DbRule) };
  for (const locale of LOCALE_KEYS) {
    const rule = row.display[locale];
    if (rule) display[locale] = ruleFromDb(rule);
  }
  const names: CurrencyDTO['names'] = {};
  for (const locale of LOCALE_KEYS) {
    const name = row.names[locale];
    if (typeof name === 'string') names[locale] = name;
  }
  return {
    code: row.code,
    kind: row.kind,
    decimals: row.decimals,
    displayDecimals: row.display_decimals,
    names,
    display,
    isEnabled: row.is_enabled,
    sortOrder: row.sort_order,
  };
}

/** The shape @aurum/money formatting functions expect. */
export function toCurrencyConfig(dto: CurrencyDTO): CurrencyConfig {
  return {
    code: dto.code,
    decimals: dto.decimals,
    ...(dto.displayDecimals !== null ? { displayDecimals: dto.displayDecimals } : {}),
    display: dto.display,
  };
}

export async function listCurrencies(q: Queryable, options: { enabledOnly?: boolean } = {}): Promise<CurrencyDTO[]> {
  const { rows } = await q.query<CurrencyRow>(
    `select ${COLUMNS} from currencies ${options.enabledOnly ? 'where is_enabled' : ''} order by sort_order, code`,
  );
  return rows.map(toDTO);
}

export async function getCurrency(q: Queryable, code: string): Promise<CurrencyDTO | null> {
  const { rows } = await q.query<CurrencyRow>(`select ${COLUMNS} from currencies where code = $1`, [code]);
  return rows[0] ? toDTO(rows[0]) : null;
}

export interface CurrencyInput {
  kind: 'fiat' | 'crypto';
  decimals: number;
  displayDecimals: number | null;
  names: Partial<Record<FormatLocale, string>>;
  display: { default: CurrencyDisplayRule } & Partial<Record<FormatLocale, CurrencyDisplayRule>>;
  isEnabled: boolean;
  sortOrder: number;
}

function dbDisplay(display: CurrencyInput['display']): Record<string, DbRule> {
  const out: Record<string, DbRule> = { default: ruleToDb(display.default) };
  for (const locale of LOCALE_KEYS) {
    const rule = display[locale];
    if (rule) out[locale] = ruleToDb(rule);
  }
  return out;
}

export async function createCurrency(q: Queryable, code: string, input: CurrencyInput): Promise<CurrencyDTO> {
  if (input.displayDecimals !== null && input.displayDecimals > input.decimals) {
    throw new AppError('validation', { fields: { displayDecimals: 'outOfRange' } });
  }
  const exists = await q.query('select 1 from currencies where code = $1', [code]);
  if (exists.rowCount > 0) throw new AppError('conflict', { fields: { code: 'alreadyExists' } });
  const { rows } = await q.query<CurrencyRow>(
    `insert into currencies (code, kind, decimals, display_decimals, names, display, is_enabled, sort_order)
     values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8)
     returning ${COLUMNS}`,
    [code, input.kind, input.decimals, input.displayDecimals, JSON.stringify(input.names), JSON.stringify(dbDisplay(input.display)), input.isEnabled, input.sortOrder],
  );
  return toDTO(rows[0] as CurrencyRow);
}

/** Full replace of the editable fields. `decimals` cannot change once a wallet uses the currency (database rule). */
export async function updateCurrency(q: Queryable, code: string, input: CurrencyInput): Promise<CurrencyDTO> {
  if (input.displayDecimals !== null && input.displayDecimals > input.decimals) {
    throw new AppError('validation', { fields: { displayDecimals: 'outOfRange' } });
  }
  const { rows } = await q.query<CurrencyRow>(
    `update currencies
        set kind = $2, decimals = $3, display_decimals = $4, names = $5::jsonb, display = $6::jsonb,
            is_enabled = $7, sort_order = $8
      where code = $1
      returning ${COLUMNS}`,
    [code, input.kind, input.decimals, input.displayDecimals, JSON.stringify(input.names), JSON.stringify(dbDisplay(input.display)), input.isEnabled, input.sortOrder],
  );
  const row = rows[0];
  if (!row) throw new AppError('not_found');
  return toDTO(row);
}
