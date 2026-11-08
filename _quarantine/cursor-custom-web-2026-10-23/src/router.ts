import type { PageCtx, PageResult } from './context.ts';

export type Handler = (ctx: PageCtx, params: Record<string, string>) => Promise<PageResult>;

export interface WebRoute {
  method: 'GET' | 'POST';
  /** Path after the locale prefix, e.g. "/admin/players/:id". */
  path: string;
  handler: Handler;
}

interface Compiled {
  route: WebRoute;
  segments: string[];
}

export class Router {
  private readonly routes: Compiled[] = [];

  add(routes: readonly WebRoute[]): void {
    for (const route of routes) {
      this.routes.push({ route, segments: route.path.split('/').filter(Boolean) });
    }
  }

  match(method: string, path: string): { route: WebRoute; params: Record<string, string> } | { methodNotAllowed: true } | null {
    const parts = path.split('/').filter(Boolean);
    let pathMatched = false;
    for (const { route, segments } of this.routes) {
      if (segments.length !== parts.length) continue;
      const params: Record<string, string> = {};
      let ok = true;
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i] as string;
        const part = parts[i] as string;
        if (seg.startsWith(':')) {
          try {
            params[seg.slice(1)] = decodeURIComponent(part);
          } catch {
            ok = false;
            break;
          }
        } else if (seg !== part) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      pathMatched = true;
      if (route.method === method || (method === 'HEAD' && route.method === 'GET')) return { route, params };
    }
    return pathMatched ? { methodNotAllowed: true } : null;
  }
}
