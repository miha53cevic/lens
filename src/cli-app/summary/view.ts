import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { relPath } from '../paths.ts';
import { prepareCommand } from './bundle.ts';
import {
  checkoutFirst,
  HOUSEKEEPING,
  isHousekeeping,
  readStored,
  reviewKey,
  summaryArgs,
  summaryStamp,
  unitSetHash,
  type ChangeRow,
  type Concern,
  type Flow,
  type SequenceStep,
  type StoredSummary,
} from './store.ts';
import { citeableLabels, placedHash, removalAnchors, type Unit } from './units.ts';
import { fitStored } from './fit.ts';
import type { RemovedBlock } from '../model.ts';

// What the viewer's Summary tab renders: the diff's current units, each with
// its stored summary when one exists for its current hash.

const PEEK_CONTEXT = 5;

export interface CallerPeek {
  file: string;
  line: number;
  /** ±PEEK_CONTEXT lines around the call, read at render time */
  lines: { n: number; text: string }[];
}

/** A removed block plus the shown line it displays after (see removalAnchors) */
export type AnchoredRemoval = RemovedBlock & { anchor: number };

export interface ViewUnit extends Omit<Unit, 'removals'> {
  removals: AnchoredRemoval[];
  /** Path as the viewer's file list shows it (relative to where lens runs) */
  displayFile: string;
  /** The code changed since the summary was written — it no longer applies */
  stale: boolean;
  /** A stale unit's: the hash its summary was written for, which the reader's marks on it are keyed by */
  staleHash: string | null;
  summary: {
    headline: string;
    gist: string;
    changes: ChangeRow[];
    breaks: { summary: string; callers: CallerPeek[] }[];
    concerns: Concern[];
  } | null;
  /** A deleted unit this one was renamed/moved from: its removed code */
  renamedFrom: { id: string; removals: RemovedBlock[] } | null;
}

/** A screen the change affects, as the agent drew it: served by /api/preview, shown in a sandboxed frame */
export interface PreviewView {
  title: string;
  /** The units it shows changed, that are in the diff now */
  units: string[];
  /** The frame's URL for the screen now, and before the change (null: a new screen) */
  now: string;
  before: string | null;
  /** Some of its units changed since it was drawn */
  stale: boolean;
}

/** A sequence diagram: what happens at run time, before and now */
export interface SequenceView {
  title: string;
  lanes: string[];
  steps: SequenceStep[];
  units: string[];
  stale: boolean;
}

export interface SummaryView {
  key: string;
  /** What to run in the agent, e.g. "/lens-review --staged" */
  command: string;
  /** The same without the skill, for any agent with a shell */
  cli: string;
  /** The branch to check out before a summary can be written (`checkoutFirst`); null: it can be now */
  checkout: string | null;
  /** summary.json mtime; null when nothing was submitted yet */
  stamp: number | null;
  units: ViewUnit[];
  flows: Flow[];
  /** stale: written for other code — the diff changed since */
  overview: { what: string; stale: boolean } | null;
  previews: PreviewView[];
  sequences: SequenceView[];
}

export function buildSummaryView(opts: {
  root: string;
  cwd: string;
  command: 'diff' | 'pr';
  args: string[];
  units: Unit[];
}): SummaryView {
  const key = reviewKey(opts.root, opts.command, opts.args);
  // the arguments as the user passes them to /lens-review or `lens summary prepare`
  const hint = summaryArgs(opts.command, opts.args);
  const stored = readStored(opts.root, key);
  const byId = new Map(opts.units.map((u) => [u.id, u]));
  const hiddenDeleted = new Set<string>();
  const fileCache = new Map<string, string[] | null>();
  const units: ViewUnit[] = opts.units.map((u) => {
    // the stored summary, its labels moved with the unit; stale when it was written for other code
    const s = fitStored(stored?.units[u.id], { ...u, labels: [...citeableLabels(u)] }, opts.root, fileCache);
    const stale = !s && !!stored?.units[u.id];
    // only while the old one is still a deletion: if it's back in the code, it's a unit of its own
    const from = s?.renamedFrom ? byId.get(s.renamedFrom) : undefined;
    const renamed = from?.status === 'deleted' ? from : undefined;
    if (renamed) hiddenDeleted.add(renamed.id);
    const anchored: AnchoredRemoval[] = [];
    for (const [anchor, blocks] of removalAnchors(u)) for (const b of blocks) anchored.push({ ...b, anchor });
    return {
      ...u,
      removals: anchored,
      displayFile: relPath(opts.cwd, join(opts.root, u.file)),
      stale,
      staleHash: stale ? stored!.units[u.id].hash : null,
      summary: s
        ? {
            headline: s.headline,
            gist: s.gist,
            changes: s.changes,
            breaks: s.breaks.map((b) => ({ summary: b.summary, callers: b.callers.map((c) => peek(opts.root, c)) })),
            concerns: s.concerns,
          }
        : null,
      renamedFrom: renamed ? { id: renamed.id, removals: renamed.removals } : null,
    };
  });
  // a deleted file adds nothing to read: the Summary leaves it out (the Code view's tree still lists it)
  const visible = units.filter((u) => !hiddenDeleted.has(u.id) && !(u.kind === 'file' && u.status === 'deleted'));
  const flows = shownFlows(stored?.flows ?? [], visible);
  return {
    key,
    command: `/lens-review${hint ? ' ' + hint : ''}`,
    cli: prepareCommand(opts),
    checkout: checkoutFirst(opts.cwd, opts.command, opts.args),
    stamp: summaryStamp(opts.root, key),
    units: visible,
    flows,
    overview: stored?.overview
      ? { what: stored.overview.what, stale: stored.overview.hash !== unitSetHash(opts.units) }
      : null,
    ...drawings(stored, opts.units),
  };
}

/** The URL a preview's file is served at (server.ts) */
export function previewUrl(asset: string): string {
  return '/api/preview/' + asset;
}

/**
 * The stored previews and sequences over the diff as it is now: one whose units have all changed
 * since it was drawn is gone, one with some changed is stale.
 */
function drawings(stored: StoredSummary | null, units: Unit[]): Pick<SummaryView, 'previews' | 'sequences'> {
  // by place too: a drawing cites lines, which a unit that moved has elsewhere
  const hashes = new Map(units.map((u) => [u.id, placedHash(u)]));
  const fit = (drawn: Record<string, string>) => {
    const ids = Object.keys(drawn);
    const current = ids.filter((id) => hashes.get(id) === drawn[id]);
    return current.length === 0
      ? null
      : { units: ids.filter((id) => hashes.has(id)), stale: current.length < ids.length };
  };
  const previews: PreviewView[] = [];
  for (const preview of stored?.previews ?? []) {
    const shown = fit(preview.units);
    if (!shown) continue;
    previews.push({
      title: preview.title,
      ...shown,
      now: previewUrl(preview.now),
      before: preview.before ? previewUrl(preview.before) : null,
    });
  }
  const sequences: SequenceView[] = [];
  for (const sequence of stored?.sequences ?? []) {
    const shown = fit(sequence.units);
    if (shown) sequences.push({ title: sequence.title, lanes: sequence.lanes, steps: sequence.steps, ...shown });
  }
  return { previews, sequences };
}

/**
 * The stored flows over the units shown, each unit in one flow (submit keeps it so, but the
 * file is on disk: if one lists it in several, the first keeps it), and the units lens files
 * itself added to Housekeeping.
 */
function shownFlows(stored: Flow[], visible: ViewUnit[]): Flow[] {
  const ids = new Set(visible.map((u) => u.id));
  const placed = new Set<string>();
  const flows = stored
    .map((f) => {
      const units = Object.fromEntries(Object.entries(f.units).filter(([id]) => ids.has(id) && !placed.has(id)));
      for (const id of Object.keys(units)) placed.add(id);
      return { ...f, units };
    })
    .filter((f) => Object.keys(f.units).length >= (f.title === HOUSEKEEPING ? 1 : 2));
  // only next to the agent's flows: a diff without them lists every change as it is
  const filed = visible.filter((u) => isHousekeeping(u) && !placed.has(u.id));
  if (flows.length === 0 || filed.length === 0) return flows;
  const units = Object.fromEntries(filed.map((u) => [u.id, '']));
  const own = flows.find((f) => f.title === HOUSEKEEPING);
  if (own) return flows.map((f) => (f === own ? { ...f, units: { ...f.units, ...units } } : f));
  return [...flows, { title: HOUSEKEEPING, path: '', units, priority: 3, why: 'Imports and formatting only' }];
}

function peek(root: string, caller: string): CallerPeek {
  const at = caller.lastIndexOf(':');
  const file = caller.slice(0, at);
  const line = Number(caller.slice(at + 1));
  const abs = join(root, file);
  let lines: { n: number; text: string }[] = [];
  if (existsSync(abs) && statSync(abs).isFile()) {
    const all = readFileSync(abs, 'utf8').split('\n');
    const from = Math.max(1, line - PEEK_CONTEXT);
    const to = Math.min(all.length, line + PEEK_CONTEXT);
    for (let n = from; n <= to; n++) lines.push({ n, text: all[n - 1] });
  }
  return { file, line, lines };
}
