import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { readStored, summaryPath, wholeDiffLeft, type Bundle } from "./store.ts";

// How far the agent's summary run has got, from what it leaves on disk: the bundle `prepare`
// wrote, the summary its submits merged into, and whether the last submit asked for another.
// lens never sees the agent itself.

export interface BuildProgress {
  /** The bundle's units with a summary for their code */
  done: number;
  total: number;
  /** Every unit is in: the flows, the overview (and the drawings) are left, or the last submit's fixes */
  finalPass: boolean;
}

/** What the last submit of a bundle told the agent: `again` when it asked for fixes and another submit */
interface SubmitRecord {
  bundle: string;
  again: boolean;
}

const SUBMIT_FILE = "submit.json";

/** Kept next to the bundle, so a later prepare's bundle (another createdAt) leaves it behind. */
export function recordSubmit(dir: string, bundle: { createdAt: string }, again: boolean): void {
  const record: SubmitRecord = { bundle: bundle.createdAt, again };
  writeFileSync(join(dir, SUBMIT_FILE), JSON.stringify(record) + "\n");
}

/**
 * Reads a review's run, again only when the bundle or the summary changed on disk: the page asks
 * every few seconds, and a bundle can be big. Null when no run is going. A run the agent left
 * unfinished stays shown: the reader checks the agent, rather than lens guessing it stopped.
 */
export function buildProgressReader(root: string, key: string): () => BuildProgress | null {
  const dir = dirname(summaryPath(root, key));
  const bundlePath = join(dir, "bundle.json");
  const submitPath = join(dir, SUBMIT_FILE);
  let held: { stamps: string; progress: BuildProgress | null } | null = null;
  return () => {
    if (!existsSync(bundlePath)) return null;
    const stamps = [bundlePath, summaryPath(root, key), submitPath].map(fileStamp).join("|");
    if (held?.stamps !== stamps) held = { stamps, progress: progressOf(bundlePath, submitPath, root, key) };
    return held.progress;
  };
}

/** A file's time and size: two writes in one tick of the clock still tell apart, unless they're the same size */
function fileStamp(path: string): string {
  const stats = statSync(path, { throwIfNoEntry: false });
  return stats ? stats.mtimeMs + ":" + stats.size : "none";
}

function progressOf(bundlePath: string, submitPath: string, root: string, key: string): BuildProgress | null {
  let bundle: Bundle;
  try {
    bundle = JSON.parse(readFileSync(bundlePath, "utf8"));
  } catch {
    return null;
  }
  if (bundle?.version !== 1 || !Array.isArray(bundle.units) || bundle.units.length === 0) return null;
  const stored = readStored(root, key);
  const done = bundle.units.filter((unit) => stored?.units[unit.id]?.hash === unit.hash).length;
  const total = bundle.units.length;
  if (done < total) return { done, total, finalPass: false };
  // the whole-diff work can be in while the agent fixes what the submit rejected or left out of the flows
  const going = stored ? wholeDiffLeft(bundle, stored) : false;
  return going || askedAgain(submitPath, bundle) ? { done, total, finalPass: true } : null;
}

function askedAgain(submitPath: string, bundle: Bundle): boolean {
  try {
    const record: Partial<SubmitRecord> = JSON.parse(readFileSync(submitPath, "utf8"));
    return record.bundle === bundle.createdAt && record.again === true;
  } catch {
    return false;
  }
}
