import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

// How `lens ask` finds the running viewer: the server writes its port to
// <root>/.lens/server.json and removes it when it stops.

export interface ServerInfo {
  port: number;
  pid: number;
}

export function serverInfoPath(root: string): string {
  return join(root, ".lens", "server.json");
}

export function writeServerInfo(root: string, port: number): void {
  const file = serverInfoPath(root);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ port, pid: process.pid } satisfies ServerInfo) + "\n");
}

/** Removes the file only if this process wrote it — another lens may have taken over since. */
export function removeServerInfo(root: string): void {
  const info = readServerInfo(serverInfoPath(root));
  if (info?.pid === process.pid) rmSync(serverInfoPath(root), { force: true });
}

function readServerInfo(file: string): ServerInfo | null {
  try {
    const info = JSON.parse(readFileSync(file, "utf8"));
    return Number.isInteger(info?.port) ? info : null;
  } catch {
    return null;
  }
}

/** The nearest .lens/server.json from `cwd` upwards. */
export function findServerInfo(cwd: string): ServerInfo | null {
  let dir = cwd;
  for (;;) {
    const file = serverInfoPath(dir);
    if (existsSync(file)) return readServerInfo(file);
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
