import { existsSync, readdirSync, readFileSync, statSync, type Dirent } from "node:fs";
import { basename, dirname, join } from "node:path";
import { readStored, summaryArgs, summaryPath, summaryStamp, wholeDiffLeft, type Bundle } from "./store.ts";

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
    const stamps = statSync(bundlePath).mtimeMs + ":" + (summaryStamp(root, key) ?? 0);
    if (held?.stamps !== stamps) held = { stamps, progress: progressOf(bundlePath, root, key) };
    return held.progress;
  };
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

/** Another review's summary run in the same repository: other arguments, or another branch, than the page shows. */
export interface ElsewhereRun {
  /** What that run was asked, as the reader would type it: "/lens-review --staged" */
  command: string;
}

/**
 * The newest run of another review whose bundle or summary was written after `since` (when the
 * page's review became this one) and after this review's own: a summary the page would otherwise
 * wait for in vain. Null when there's none, or once this review's own run has moved since.
 */
export function elsewhereReader(root: string, key: string, since: number): () => ElsewhereRun | null {
  const own = dirname(summaryPath(root, key));
  const reviews = dirname(own);
  let held: { at: string; run: ElsewhereRun } | null = null;
  return () => {
    let entries: Dirent[];
    try {
      entries = readdirSync(reviews, { withFileTypes: true });
    } catch {
      return null;
    }
    let newest = Math.max(since, lastWritten(own));
    let found: string | null = null;
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === key) continue;
      const at = lastWritten(join(reviews, entry.name));
      if (at > newest) [newest, found] = [at, join(reviews, entry.name)];
    }
    if (!found) return null;
    // a bundle can be big: read it again only when that run writes again
    const at = found + ":" + newest;
    if (held?.at !== at) held = { at, run: { command: commandOf(found) } };
    return held.run;
  };
}

/** When the agent last wrote to a review's folder: its bundle (prepare) or its summary (submit). 0: never. */
function lastWritten(folder: string): number {
  let at = 0;
  for (const name of ["bundle.json", "summary.json"]) {
    const path = join(folder, name);
    if (existsSync(path)) at = Math.max(at, statSync(path).mtimeMs);
  }
  return at;
}

function commandOf(folder: string): string {
  try {
    const bundle: Bundle = JSON.parse(readFileSync(join(folder, "bundle.json"), "utf8"));
    const hint = summaryArgs(bundle.command, bundle.args);
    return "/lens-review" + (hint ? " " + hint : "");
  } catch {
    // no bundle to read (or not one of ours): the folder's name is the review's key
    return basename(folder);
  }
}
