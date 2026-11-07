// The viewer server's routes, as a table: each is a method and a path, and the server answers the
// first that matches. A contract route (api/contract.ts) is registered with `json`: its body is
// parsed, checked by its own parser (a 400 with the parser's reason when it isn't one), and its
// answer typed. What isn't JSON (the page, a preview, `lens ask`'s long poll) is `raw`.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { readBody, sendJson } from '../render/web/http.ts';
import type { ApiAnswer, ApiBody, ApiRoute } from './contract.ts';

/** Thrown in a handler: the request gets this status, with the message as its `{ error }`. */
export class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface RouteContext {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  /** The path's `:name` segments, decoded; `*` is the rest of the path */
  params: Record<string, string>;
}

/** A body read from JSON, or why it isn't one the route takes. */
export type BodyParser<T> = (raw: unknown) => T | { error: string };

/** A route with no body: nothing is read. */
export const noBody = null;

/** A route with a body takes a parser; what it parses to may be more than the body (what the server adds) */
type Parse<R extends ApiRoute, P> = ApiBody<R> extends null ? typeof noBody : BodyParser<P>;

export interface Router {
  /** A contract route, answered with JSON */
  json<R extends ApiRoute, P = ApiBody<R>>(
    route: R,
    parse: Parse<R, P>,
    run: (body: P, context: RouteContext) => ApiAnswer<R> | Promise<ApiAnswer<R>>,
  ): Router;
  /** Any other route: the handler writes the response. `*` as the method matches any. */
  raw(route: string, handler: (context: RouteContext) => void | Promise<void>): Router;
  /** Another router's routes, after this one's */
  use(other: Router): Router;
  /** Answers the request if a route matches it: the route that did, or null when none does */
  handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<string | null>;
  /** Every route, as `METHOD /path` */
  routes(): string[];
}

interface Entry {
  route: string;
  method: string;
  segments: string[];
  handler: (context: RouteContext) => void | Promise<void>;
}

/** The path's params when it matches the pattern's segments, else null. */
function match(segments: string[], path: string): Record<string, string> | null {
  const parts = path.split('/').slice(1);
  const params: Record<string, string> = {};
  for (let at = 0; at < segments.length; at++) {
    const segment = segments[at];
    if (segment === '*') {
      params['*'] = parts.slice(at).join('/');
      return params;
    }
    const part = parts[at];
    if (part === undefined) return null;
    if (segment.startsWith(':')) {
      if (!part) return null;
      try {
        params[segment.slice(1)] = decodeURIComponent(part);
      } catch {
        return null;
      }
    } else if (segment !== part) return null;
  }
  return parts.length === segments.length ? params : null;
}

export function createRouter(): Router {
  const entries: Entry[] = [];
  const add = (route: string, handler: Entry['handler']) => {
    const [method, path] = route.split(' ');
    entries.push({ route, method, segments: path.split('/').slice(1), handler });
  };

  const router: Router = {
    json(route, parse, run) {
      add(route, async (context) => {
        let body: unknown = null;
        if (parse !== noBody) {
          let raw: unknown;
          try {
            raw = JSON.parse(await readBody(context.req));
          } catch {
            throw new HttpError(400, 'not JSON');
          }
          const parsed = (parse as BodyParser<unknown>)(raw);
          if (parsed && typeof parsed === 'object' && 'error' in parsed) throw new HttpError(400, String(parsed.error));
          body = parsed;
        }
        sendJson(context.res, 200, await run(body as never, context));
      });
      return router;
    },
    raw(route, handler) {
      add(route, handler);
      return router;
    },
    use(other) {
      for (const route of other.routes()) {
        add(route, (context) => other.handle(context.req, context.res, context.url).then(() => undefined));
      }
      return router;
    },
    async handle(req, res, url) {
      for (const entry of entries) {
        if (entry.method !== '*' && entry.method !== req.method) continue;
        const params = match(entry.segments, url.pathname);
        if (!params) continue;
        try {
          await entry.handler({ req, res, url, params });
        } catch (error) {
          if (!(error instanceof HttpError)) throw error;
          sendJson(res, error.status, { error: error.message });
        }
        return entry.route;
      }
      return null;
    },
    routes: () => entries.map((entry) => entry.route),
  };
  return router;
}
