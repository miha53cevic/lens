import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { readStored, summaryPath, wholeDiffLeft, type Bundle } from "./store.ts";

// How far the agent's summary run has got, from what it leaves on disk: the bundle `prepare`
// wrote and the summary its submits merged into. lens never sees the agent itself.

export interface BuildProgress {
  /** The bundle's units with a summary for their code */
  done: number;
  total: number;
  /** Every unit is in: the flows, the overview (and the drawings) are left */
  finalPass: boolean;
}

/**
 * Reads a review's run, again only when the bundle or the summary changed on disk: the page asks
 * every few seconds, and a bundle can be big. Null when no run is going. A run the agent left
 * unfinished stays shown: the reader checks the agent, rather than lens guessing it stopped.
 */
export function buildProgressReader(root: string, key: string): () => BuildProgress | null {
  const bundlePath = join(dirname(summaryPath(root, key)), "bundle.json");
  let held: { stamps: string; progress: BuildProgress | null } | null = null;
  return () => {
    if (!existsSync(bundlePath)) return null;
    const stamps = fileStamp(bundlePath) + "|" + fileStamp(summaryPath(root, key));
    if (held?.stamps !== stamps) held = { stamps, progress: progressOf(bundlePath, root, key) };
    return held.progress;
  };
}

/** A file's time and size: two writes in one tick of the clock still tell apart, unless they're the same size */
function fileStamp(path: string): string {
  const stats = statSync(path, { throwIfNoEntry: false });
  return stats ? stats.mtimeMs + ":" + stats.size : "none";
}

function progressOf(bundlePath: string, root: string, key: string): BuildProgress | null {
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
  return stored && wholeDiffLeft(bundle, stored) ? { done, total, finalPass: true } : null;
}
