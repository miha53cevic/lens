// The Plan tab's frame shows Lavish's own page, and Lavish refuses to be framed: its session page
// says `x-frame-options: DENY` and `frame-ancestors 'none'`, and its server answers only a loopback
// Host, with an Origin of its own. So each lens server has a second loopback listener that
// forwards to Lavish (HTTP, and its WebSocket at /events/<key>): it puts back Lavish's Host and
// Origin, and swaps the framing guard for one that lets only this viewer's page frame it.
//
// It forwards only what Lavish's page loads, and for a session only one the Plan tab opened
// (`admit`): not Lavish's agent endpoints (poll, sessions, shutdown) and not another repository's plans.

import { createServer, request, type IncomingHttpHeaders, type IncomingMessage } from 'node:http';
import { connect } from 'node:net';
import type { AddressInfo } from 'node:net';

export interface PlanProxy {
  /** `http://127.0.0.1:<port>`: where the Plan tab's frame loads from */
  origin: string;
  port: number;
  /** Lets the frame reach session `key`, on the Lavish server at `upstream` (`http://127.0.0.1:4387`) */
  admit(key: string, upstream: string): void;
  close(): void;
}

/** What Lavish's page loads besides its session's own paths */
const SHARED_PATHS = new Set([
  '/chrome.css',
  '/chrome-client.js',
  '/sdk.js',
  '/whiteboard-frame',
  '/api/whiteboard-libraries',
]);
/** A session's own paths: the page, its artifact (and the artifact's files), its API, its events */
const KEYED = /^\/(?:session|artifact|api|events)\/([^/]+)(?:\/|$)/;
/** Lavish's own endpoints under /api/ that are no session's */
const AGENT_ONLY = new Set(['poll', 'sessions', 'end']);

/** The session a path belongs to, `''` for one every page loads, null for one the frame never needs. */
export function pathKey(pathname: string): string | null {
  if (SHARED_PATHS.has(pathname) || pathname.startsWith('/design/')) return '';
  const key = KEYED.exec(pathname)?.[1];
  if (!key || AGENT_ONLY.has(key)) return null;
  try {
    return decodeURIComponent(key);
  } catch {
    return null;
  }
}

/** The framing guard as this viewer's page may frame it: only `frame-ancestors` changes. */
export function frameablePolicy(policy: string | undefined, viewerPort: number): string {
  const ancestors = `frame-ancestors http://127.0.0.1:${viewerPort} http://localhost:${viewerPort}`;
  const directives = (policy ?? '')
    .split(';')
    .map((directive) => directive.trim())
    .filter((directive) => directive && !/^frame-ancestors\b/i.test(directive));
  return [...directives, ancestors].join('; ');
}

/** The request's headers as Lavish expects them from its own page: its Host, and its origin where the page put the proxy's. */
export function upstreamHeaders(headers: IncomingHttpHeaders, own: string, upstream: string): IncomingHttpHeaders {
  const out: IncomingHttpHeaders = { ...headers, host: new URL(upstream).host };
  for (const name of ['x-forwarded-host', 'x-forwarded-proto', 'x-forwarded-for', 'forwarded']) delete out[name];
  if (out.origin === own) out.origin = upstream;
  if (typeof out.referer === 'string' && out.referer.startsWith(own + '/')) {
    out.referer = upstream + out.referer.slice(own.length);
  }
  return out;
}

export function startPlanProxy(viewerPort: number): Promise<PlanProxy> {
  const admitted = new Set<string>();
  let upstream: string | null = null;
  let port = 0;

  const localHost = (req: IncomingMessage) =>
    req.headers.host === `127.0.0.1:${port}` || req.headers.host === `localhost:${port}`;
  const allowed = (pathname: string) => {
    const key = pathKey(pathname);
    return key !== null && (key === '' || admitted.has(key));
  };

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    // a foreign Host is DNS rebinding: Lavish's own server refuses it too
    if (!localHost(req)) {
      res.writeHead(403).end('forbidden host');
      return;
    }
    if (!upstream || !allowed(url.pathname)) {
      res.writeHead(404).end('not found');
      return;
    }
    const target = upstream;
    // the frame may be on either loopback name: its origin is whichever it used
    const self = 'http://' + req.headers.host;
    const forward = request(
      target + url.pathname + url.search,
      { method: req.method, headers: upstreamHeaders(req.headers, self, target) },
      (answer) => {
        const headers = { ...answer.headers };
        delete headers['x-frame-options'];
        if (url.pathname.startsWith('/session/')) {
          headers['content-security-policy'] = frameablePolicy(
            [answer.headers['content-security-policy']].flat().join('; ') || undefined,
            viewerPort,
          );
        }
        const location = headers.location;
        if (typeof location === 'string' && location.startsWith(target))
          headers.location = self + location.slice(target.length);
        res.writeHead(answer.statusCode ?? 502, headers);
        answer.pipe(res);
      },
    );
    forward.on('error', () => {
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' });
      res.end("Lavish's server isn't answering");
    });
    req.pipe(forward);
  });

  // Lavish's page keeps a WebSocket open to /events/<key>: the upgrade is passed through as bytes
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (!localHost(req) || !upstream || !url.pathname.startsWith('/events/') || !allowed(url.pathname)) {
      socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
      return;
    }
    const target = new URL(upstream);
    const headers = upstreamHeaders(req.headers, 'http://' + req.headers.host, upstream);
    const lines = [`${req.method} ${url.pathname}${url.search} HTTP/1.1`];
    for (const [name, value] of Object.entries(headers)) {
      for (const one of [value ?? []].flat()) lines.push(`${name}: ${one}`);
    }
    const lavish = connect(Number(target.port), target.hostname, () => {
      lavish.write(lines.join('\r\n') + '\r\n\r\n');
      if (head.length) lavish.write(head);
      lavish.pipe(socket);
      socket.pipe(lavish);
    });
    const drop = () => {
      lavish.destroy();
      socket.destroy();
    };
    lavish.on('error', drop);
    socket.on('error', drop);
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      port = (server.address() as AddressInfo).port;
      resolve({
        origin: 'http://127.0.0.1:' + port,
        port,
        admit(key, target) {
          admitted.add(key);
          upstream = target;
        },
        close: () => server.close(),
      });
    });
  });
}
