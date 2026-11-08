import type { Method, Route } from './types.ts';

interface Compiled {
  route: Route;
  regex: RegExp;
  names: string[];
}

export interface Match {
  route: Route;
  params: Record<string, string>;
}

export class Router {
  private readonly compiled: Compiled[] = [];

  add(routes: readonly Route[]): void {
    for (const route of routes) {
      const names: string[] = [];
      const source = route.path
        .split('/')
        .map((segment) => {
          if (segment.startsWith(':')) {
            names.push(segment.slice(1));
            return '([^/]+)';
          }
          return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        })
        .join('/');
      const duplicate = this.compiled.find((c) => c.route.method === route.method && c.regex.source === `^${source}$`);
      if (duplicate) throw new Error(`Duplicate route ${route.method} ${route.path}`);
      this.compiled.push({ route, regex: new RegExp(`^${source}$`), names });
    }
  }

  /** Finds the route for a request. `methodNotAllowed` is true when the path exists under another method. */
  match(method: Method, path: string): { match: Match | null; methodNotAllowed: boolean } {
    let pathExists = false;
    for (const c of this.compiled) {
      const m = c.regex.exec(path);
      if (!m) continue;
      pathExists = true;
      if (c.route.method !== method) continue;
      const params: Record<string, string> = {};
      for (let i = 0; i < c.names.length; i++) {
        const raw = m[i + 1] ?? '';
        try {
          params[c.names[i] as string] = decodeURIComponent(raw);
        } catch {
          return { match: null, methodNotAllowed: false };
        }
      }
      return { match: { route: c.route, params }, methodNotAllowed: false };
    }
    return { match: null, methodNotAllowed: pathExists };
  }

  get routes(): readonly Route[] {
    return this.compiled.map((c) => c.route);
  }
}

export function isMethod(value: string | undefined): value is Method {
  return value === 'GET' || value === 'POST' || value === 'PUT' || value === 'PATCH' || value === 'DELETE';
}
