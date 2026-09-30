import { existsSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { readStored, summaryStamp, type ChangeRow, type Flow } from "./store.ts";
import type { Unit } from "./units.ts";
import type { RemovedBlock } from "../model.ts";

// What the viewer's Summary tab renders: the diff's current units, each with
// its stored summary when one exists for its current hash.

const PEEK_CONTEXT = 5;

export interface CallerPeek {
  file: string;
  line: number;
  /** ±PEEK_CONTEXT lines around the call, read at render time */
  lines: { n: number; text: string }[];
}

export interface ViewUnit extends Unit {
  /** Path as the viewer's file list shows it (relative to where lens runs) */
  displayFile: string;
  /** The code changed since the summary was written — it no longer applies */
  stale: boolean;
  summary: {
    headline: string;
    gist: string;
    needsLook: boolean;
    changes: ChangeRow[];
    breaks: { summary: string; callers: CallerPeek[] }[];
  } | null;
  /** A deleted unit this one was renamed/moved from: its removed code */
  renamedFrom: { id: string; removals: RemovedBlock[] } | null;
}

export interface SummaryView {
  key: string;
  /** What to run in the agent, e.g. "/lens-review --staged" */
  command: string;
  /** The same without the skill, for any agent with a shell */
  cli: string;
  /** summary.json mtime; null when nothing was submitted yet */
  stamp: number | null;
  units: ViewUnit[];
  flows: Flow[];
}

export function buildSummaryView(opts: {
  root: string;
  cwd: string;
  key: string;
  args: string;
  units: Unit[];
}): SummaryView {
  const stored = readStored(opts.root, opts.key);
  const byId = new Map(opts.units.map((u) => [u.id, u]));
  const hiddenDeleted = new Set<string>();
  const units: ViewUnit[] = opts.units.map((u) => {
    const s = stored?.units[u.id];
    const stale = !!s && s.hash !== u.hash;
    const renamed = s && !stale && s.renamedFrom ? byId.get(s.renamedFrom) : undefined;
    if (renamed) hiddenDeleted.add(renamed.id);
    return {
      ...u,
      displayFile: relative(opts.cwd, join(opts.root, u.file)) || u.file,
      stale,
      summary: s && !stale ? {
        headline: s.headline,
        gist: s.gist,
        needsLook: s.needsLook,
        changes: s.changes,
        breaks: s.breaks.map((b) => ({ summary: b.summary, callers: b.callers.map((c) => peek(opts.root, c)) })),
      } : null,
      renamedFrom: renamed ? { id: renamed.id, removals: renamed.removals } : null,
    };
  });
  const visible = units.filter((u) => !hiddenDeleted.has(u.id));
  const ids = new Set(visible.map((u) => u.id));
  const flows = (stored?.flows ?? [])
    .map((f) => ({ ...f, units: Object.fromEntries(Object.entries(f.units).filter(([id]) => ids.has(id))) }))
    .filter((f) => Object.keys(f.units).length >= 2);
  return {
    key: opts.key,
    command: `/lens-review${opts.args ? " " + opts.args : ""}`,
    cli: `lens summary prepare${opts.args ? " " + opts.args : ""}`,
    stamp: summaryStamp(opts.root, opts.key),
    units: visible,
    flows,
  };
}

function peek(root: string, caller: string): CallerPeek {
  const at = caller.lastIndexOf(":");
  const file = caller.slice(0, at);
  const line = Number(caller.slice(at + 1));
  const abs = join(root, file);
  let lines: { n: number; text: string }[] = [];
  if (existsSync(abs) && statSync(abs).isFile()) {
    const all = readFileSync(abs, "utf8").split("\n");
    const from = Math.max(1, line - PEEK_CONTEXT);
    const to = Math.min(all.length, line + PEEK_CONTEXT);
    for (let n = from; n <= to; n++) lines.push({ n, text: all[n - 1] });
  }
  return { file, line, lines };
}
