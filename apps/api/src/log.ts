import type { LogLevel } from './config.ts';

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

/** One JSON object per line on stdout/stderr. Never pass passwords, tokens or request bodies. */
export function createLogger(level: LogLevel, sink: (line: string, isError: boolean) => void = defaultSink): Logger {
  const write = (name: Exclude<LogLevel, 'silent'>, message: string, fields?: Record<string, unknown>) => {
    if (ORDER[name] < ORDER[level]) return;
    sink(JSON.stringify({ time: new Date().toISOString(), level: name, message, ...fields }), name === 'error' || name === 'warn');
  };
  return {
    debug: (m, f) => write('debug', m, f),
    info: (m, f) => write('info', m, f),
    warn: (m, f) => write('warn', m, f),
    error: (m, f) => write('error', m, f),
  };
}

function defaultSink(line: string, isError: boolean): void {
  (isError ? process.stderr : process.stdout).write(`${line}\n`);
}

export function errorFields(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return { errorName: error.name, errorMessage: error.message, stack: error.stack?.split('\n').slice(0, 8).join('\n') };
  }
  return { errorMessage: String(error) };
}
