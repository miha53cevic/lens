// One review: a lens CLI process serving its viewer. The app starts it with the picker's choice,
// waits for the line the CLI prints when the viewer is up, and stops it when the tab closes.

import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { createServer, type AddressInfo } from 'node:net';
import { join } from 'node:path';
import { cliReason, type LensCli } from './cli.ts';

/** What the CLI prints once its viewer answers (serveViewer in src/cli-app/render/web/server.ts). */
const READY = /lens viewer on (http:\/\/127\.0\.0\.1:(\d+)\/)/;

export interface ReviewSession {
  url: string;
  port: number;
  /** Resolves when the CLI process is gone, however it went (End session in the viewer, a crash, stop()). */
  exited: Promise<void>;
  /** Ends the review: asks the viewer to shut down, as its End session does, and kills what doesn't answer. */
  stop(): Promise<void>;
}

export interface StartingReview {
  /** The session once the viewer is up; rejects with the CLI's reason when it exits first. */
  ready: Promise<ReviewSession>;
  /** Stops waiting and ends the process; resolves once it's gone. */
  cancel(): Promise<void>;
}

/** A port nothing listens on right now. */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}

/** Whether the CLI gave up because the port was taken: the caller then tries another. */
export function isPortInUse(error: unknown): boolean {
  return error instanceof Error && /port \d+ is in use/.test(error.message);
}

const serverInfoFile = (root: string) => join(root, '.lens', 'server.json');

/** What the repository's .lens/server.json says (src/cli-app/ask/discovery.ts writes it), or null without one. */
function readServerInfo(root: string): { port: number; pid: number } | null {
  try {
    const info = JSON.parse(readFileSync(serverInfoFile(root), 'utf8'));
    return Number.isInteger(info?.port) && Number.isInteger(info?.pid) ? info : null;
  } catch {
    return null; // no file, or not one lens wrote
  }
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0); // signal 0 sends nothing: it only asks whether the process is there
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'; // there, but someone else's
  }
}

/** A lens viewer that runs for this repository right now: where `lens ask` would go. */
export function runningServer(root: string): { port: number } | null {
  const info = readServerInfo(root);
  return info && isAlive(info.pid) ? { port: info.port } : null;
}

/** Removes the repository's .lens/server.json when the process that wrote it is `pid` (a killed CLI can't). */
function removeStaleServerInfo(root: string, pid: number | undefined): void {
  if (readServerInfo(root)?.pid === pid) rmSync(serverInfoFile(root), { force: true });
}

function waitFor(done: Promise<void>, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), ms);
    void done.then(() => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

/**
 * Starts `lens <args> --no-open --port <port>` in `root`, the repository's root.
 * The CLI's own flags go last, so nothing in `args` can override them.
 */
export function startReview(cli: LensCli, root: string, args: string[], port: number): StartingReview {
  const child: ChildProcess = spawn(cli.command, [...cli.args, ...args, '--no-open', '--port', String(port)], {
    cwd: root,
    env: cli.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let stdout = '';
  let stderr = '';
  let cancelled = false;
  const exited = new Promise<void>((resolve) => child.on('close', () => resolve()));

  const stop = async (url: string | null): Promise<void> => {
    if (child.exitCode === null && url) {
      // the viewer's own shutdown: the CLI then removes .lens/server.json itself
      await fetch(url + 'api/shutdown', { method: 'POST', signal: AbortSignal.timeout(1500) }).catch(() => {});
    }
    if (!(await waitFor(exited, url ? 2000 : 0))) {
      child.kill();
      await exited;
    }
    removeStaleServerInfo(root, child.pid);
  };

  const ready = new Promise<ReviewSession>((resolve, reject) => {
    child.stdout!.on('data', (chunk) => {
      stdout += String(chunk);
      const match = READY.exec(stdout);
      if (match) resolve({ url: match[1], port: Number(match[2]), exited, stop: () => stop(match[1]) });
    });
    child.stderr!.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', (error) => reject(new Error(`lens couldn't be started: ${error.message}`)));
    child.on('close', (code) => {
      if (cancelled) reject(new Error('cancelled'));
      else reject(new Error(cliReason(stderr) ?? `lens exited before its viewer was up (code ${code})`));
    });
  });
  return {
    ready,
    cancel() {
      cancelled = true;
      return stop(null);
    },
  };
}
