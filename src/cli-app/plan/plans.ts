// The Plan tab's list: every Lavish artifact under the root's .lavish/, each with its session as
// Lavish keeps it (none for a file that never had one), newest first.

import { createHash } from 'node:crypto';
import { closeSync, openSync, readdirSync, readSync, realpathSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { LavishSetup, PlanEntry } from '../api/contract.ts';
import { relPath } from '../paths.ts';
import {
  hostEnv,
  lavishListeners,
  lavishOrigin,
  lavishSessions,
  type LavishEnv,
  type LavishSession,
} from './lavish.ts';

export const PLAN_DIR = '.lavish';
/** .lavish/<name>.html, and one folder down: an artifact with its assets beside it */
const MAX_DEPTH = 2;

/** A file the list may name: an artifact, not Lavish's own export of one. */
const isPlanFile = (name: string) => name.endsWith('.html') && !name.endsWith('.export.html');

function planFiles(root: string): string[] {
  const walk = (dir: string, depth: number): string[] => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return [];
    }
    return entries.flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return depth < MAX_DEPTH ? walk(path, depth + 1) : [];
      return entry.isFile() && isPlanFile(entry.name) ? [path] : [];
    });
  };
  return walk(join(root, PLAN_DIR), 1);
}

// a title is read once per version of a file: by its path and modified time
const titles = new Map<string, { mtime: number; title: string | null }>();

/** The artifact's <title>, from its first few KB; null without one. */
function titleOf(file: string, mtime: number): string | null {
  const held = titles.get(file);
  if (held?.mtime === mtime) return held.title;
  let title: string | null = null;
  try {
    const fd = openSync(file, 'r');
    const head = Buffer.alloc(8192);
    const read = readSync(fd, head, 0, head.length, 0);
    closeSync(fd);
    const text = /<title[^>]*>([^<]*)<\/title>/i.exec(head.subarray(0, read).toString('utf8'))?.[1].trim();
    title = text ? decodeEntities(text) : null;
  } catch {
    /* gone since the listing */
  }
  titles.set(file, { mtime, title });
  return title;
}

function decodeEntities(text: string): string {
  const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return text.replace(/&(#\d+|[a-z]+);/gi, (whole, name: string) =>
    name.startsWith('#') ? String.fromCodePoint(Number(name.slice(1))) : (named[name.toLowerCase()] ?? whole),
  );
}

const canonical = (file: string) => {
  try {
    return realpathSync(file);
  } catch {
    return resolve(file);
  }
};

/** The root's plans, each with its session, newest first; `listeners` null: who polls isn't known. */
export function listPlans(root: string, sessions: LavishSession[], listeners: ReadonlySet<string> | null): PlanEntry[] {
  const byFile = new Map(sessions.map((session) => [canonical(session.file), session]));
  return planFiles(root)
    .flatMap((path) => {
      let modified;
      try {
        modified = statSync(path).mtimeMs;
      } catch {
        return [];
      }
      const session = byFile.get(canonical(path));
      const entry: PlanEntry = {
        file: relPath(root, path),
        title: titleOf(path, modified),
        modified: Math.round(modified),
        session: session
          ? {
              status: session.status,
              endedByUser: session.endedByUser,
              revision: session.revision,
              pending: session.pending,
              listening: listeners?.has(session.key) ?? false,
            }
          : null,
      };
      return [entry];
    })
    .sort((a, b) => b.modified - a.modified || a.file.localeCompare(b.file));
}

/** The root's plans as they are now: the files, Lavish's state file, and its server's listeners. */
export async function readPlans(root: string, lavishEnv: LavishEnv = hostEnv()): Promise<PlanEntry[]> {
  const sessions = lavishSessions(lavishEnv);
  const files = new Set(planFiles(root).map(canonical));
  const own = sessions.filter((session) => files.has(canonical(session.file)));
  // only a root with a live session asks Lavish's server who polls
  const live = own.find((session) => session.status === 'open');
  const listeners = live ? await lavishListeners(lavishOrigin(live.url, lavishEnv)) : null;
  return listPlans(root, own, listeners);
}

/** The session of a plan the list named (`file` from the root), or null when it has none. */
export function planSession(root: string, file: string, lavishEnv: LavishEnv = hostEnv()): LavishSession | null {
  const path = canonical(join(root, file));
  return lavishSessions(lavishEnv).find((session) => canonical(session.file) === path) ?? null;
}

/** Whether `file` (from the root, `/`-separated) is one of the root's plans: the only files lens opens. */
export function isListedPlan(root: string, file: string): boolean {
  return planFiles(root).some((path) => relPath(root, path) === file);
}

/** What the Plan tab shows (its list, and the setup) in one string, which changes when any of it does: /api/stamp carries it. */
export function plansStamp(shown: { plans: PlanEntry[]; setup: LavishSetup }): string {
  return createHash('sha1')
    .update(JSON.stringify([shown.setup, shown.plans]))
    .digest('hex')
    .slice(0, 16);
}
