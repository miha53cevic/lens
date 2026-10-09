import type { IncomingMessage, ServerResponse } from "node:http";

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

export function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/**
 * Only the viewer's own page and `lens ask` may talk to the server. A page on
 * another site can still send it simple POSTs (and, by DNS rebinding, read it):
 * those carry a foreign Host or Origin.
 */
export function isLocalRequest(req: IncomingMessage, port: number): boolean {
  const { host, origin } = req.headers;
  if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return false;
  // an <img>/<script> GET from another site carries no Origin, but browsers mark it
  const site = req.headers["sec-fetch-site"];
  if (site !== undefined && site !== "same-origin" && site !== "none") return false;
  return origin === undefined || origin === `http://${host}`;
}
