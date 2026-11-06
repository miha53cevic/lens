import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  isHousekeeping,
  needsFlows,
  readStored,
  summaryPath,
  unitSetHash,
  wholeDiffLeft,
  type Bundle,
} from './store.ts';

// How far the agent's summary run has got, from what it leaves on disk: the bundle `prepare`
// wrote, the summary its submits merged into, and whether the last submit asked for another.
// lens never sees the agent itself.

/** Where a run is: the units, then the story (flows, overview), then the drawings, or the last submit's fixes */
export type BuildStage = 'changes' | 'story' | 'drawings' | 'fixes';

export interface BuildProgress {
  /** The agent's own units with a summary for their code: what lens files itself isn't its work */
  done: number;
  total: number;
  stage: BuildStage;
  /** This run asks for previews and sequences */
  drawings: boolean;
  /** How long ago the agent last wrote anything, as of this read: lens can't see the agent, only this */
  quietMs: number;
}

/** What the last submit of a bundle told the agent: `again` when it asked for fixes and another submit */
interface SubmitRecord {
  bundle: string;
  again: boolean;
}

const SUBMIT_FILE = 'submit.json';

/**
 * A submit that asked for fixes, and no write since for this long: the agent has moved on and left
 * them, so the run is over. A fix and its submit take an agent a minute at most; the summary is in.
 */
const FIXES_QUIET_MS = 3 * 60 * 1000;

/** Kept next to the bundle, so a later prepare's bundle (another createdAt) leaves it behind. */
export function recordSubmit(dir: string, bundle: { createdAt: string }, again: boolean): void {
  const record: SubmitRecord = { bundle: bundle.createdAt, again };
  writeFileSync(join(dir, SUBMIT_FILE), JSON.stringify(record) + '\n');
}

/**
 * Reads a review's run, again only when the bundle or the summary changed on disk: the page asks
 * every few seconds, and a bundle can be big. Null when no run is going. A run the agent left
 * unfinished stays shown: the reader checks the agent, rather than lens guessing it stopped. The one
 * exception is the fixes a submit asked for: the summary is in by then, so their wait is short.
 */
export function buildProgressReader(root: string, key: string): () => BuildProgress | null {
  const dir = dirname(summaryPath(root, key));
  const bundlePath = join(dir, 'bundle.json');
  const submitPath = join(dir, SUBMIT_FILE);
  let held: { stamps: string; progress: Omit<BuildProgress, 'quietMs'> | null; wrote: number } | null = null;
  return () => {
    if (!existsSync(bundlePath)) return null;
    const paths = [bundlePath, summaryPath(root, key), submitPath];
    const stamps = paths.map(fileStamp).join('|');
    if (held?.stamps !== stamps) {
      const wrote = Math.max(...paths.map((path) => statSync(path, { throwIfNoEntry: false })?.mtimeMs ?? 0));
      held = { stamps, progress: progressOf(bundlePath, submitPath, root, key), wrote };
    }
    if (!held.progress) return null;
    const quietMs = Math.max(0, Date.now() - held.wrote);
    if (held.progress.stage === 'fixes' && quietMs > FIXES_QUIET_MS) return null;
    return { ...held.progress, quietMs };
  };
}

/** A file's time and size: two writes in one tick of the clock still tell apart, unless they're the same size */
function fileStamp(path: string): string {
  const stats = statSync(path, { throwIfNoEntry: false });
  return stats ? stats.mtimeMs + ':' + stats.size : 'none';
}

function progressOf(
  bundlePath: string,
  submitPath: string,
  root: string,
  key: string,
): Omit<BuildProgress, 'quietMs'> | null {
  let bundle: Bundle;
  try {
    bundle = JSON.parse(readFileSync(bundlePath, 'utf8'));
  } catch {
    return null;
  }
  if (bundle?.version !== 1 || !Array.isArray(bundle.units) || bundle.units.length === 0) return null;
  const stored = readStored(root, key);
  const own = bundle.units.filter((unit) => !isHousekeeping(unit));
  const done = own.filter((unit) => stored?.units[unit.id]?.hash === unit.hash).length;
  const total = own.length;
  const drawings = !!bundle.drawings;
  // lens's own units count too here: a stored one that no longer fits is prepare's to write again
  const allIn = bundle.units.every((unit) => stored?.units[unit.id]?.hash === unit.hash);
  if (!allIn) return { done, total, stage: 'changes', drawings };
  // the whole-diff work can be in while the agent fixes what the submit rejected or left out of the flows
  if (stored && wholeDiffLeft(bundle, stored)) {
    const hash = unitSetHash(bundle.units);
    const story = stored.overview?.hash === hash && (stored.flows.length > 0 || !needsFlows(bundle.units));
    // past the story and the drawings, what's left (the self-checks) is still the story's pass
    return { done, total, stage: story && drawings && stored.drawn !== hash ? 'drawings' : 'story', drawings };
  }
  return askedAgain(submitPath, bundle) ? { done, total, stage: 'fixes', drawings } : null;
}

function askedAgain(submitPath: string, bundle: Bundle): boolean {
  try {
    const record: Partial<SubmitRecord> = JSON.parse(readFileSync(submitPath, 'utf8'));
    return record.bundle === bundle.createdAt && record.again === true;
  } catch {
    return false;
  }
}
