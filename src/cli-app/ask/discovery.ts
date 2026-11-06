import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { lensDir } from '../summary/store.ts';

// How `lens ask` finds the running viewer: the server writes its port to
// <root>/.lens/server.json and removes it when it stops.

export interface ServerInfo {
  port: number;
  pid: number;
  /** The Plan tab's proxy (plan/proxy.ts): the desktop app lets the viewer frame it */
  planPort?: number;
}

export function serverInfoPath(root: string): string {
  return join(root, '.lens', 'server.json');
}

export function writeServerInfo(root: string, port: number, planPort?: number): void {
  writeFileSync(
    join(lensDir(root), 'server.json'),
    JSON.stringify({ port, pid: process.pid, planPort } satisfies ServerInfo) + '\n',
  );
}

/** Removes the file only if this process wrote it — another lens may have taken over since. */
export function removeServerInfo(root: string): void {
  const info = readServerInfo(serverInfoPath(root));
  if (info?.pid === process.pid) rmSync(serverInfoPath(root), { force: true });
}

function readServerInfo(file: string): ServerInfo | null {
  try {
    const info = JSON.parse(readFileSync(file, 'utf8'));
    return Number.isInteger(info?.port) ? info : null;
  } catch {
    return null;
  }
}

/** The viewer that runs for `root` right now: its server.json, while the process that wrote it lives. */
export function runningServer(root: string): ServerInfo | null {
  const info = readServerInfo(serverInfoPath(root));
  if (!info || !Number.isInteger(info.pid)) return null;
  try {
    process.kill(info.pid, 0); // signal 0 sends nothing: it only asks whether the process is there
    return info;
  } catch (err) {
    // EPERM: it is there, and someone else's
    return (err as NodeJS.ErrnoException).code === 'EPERM' ? info : null;
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
