import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { basename, join } from 'node:path';
import { buildProgressReader } from './summary/progress.ts';
import { NOTES_DIR, OLD_NOTES_PATH, readStoredNotes } from './notes/store.ts';
import { countMarks, MARKS_DIR, readStoredMarks } from './marks/store.ts';
import { countText } from './text.ts';
import { readTimings, timingsPath } from './timings.ts';
import { toPosix } from './paths.ts';

// What lens keeps on disk that the reader can clear: one entry per kind in CLEAR_KINDS. The
// viewer's dialog and `lens clear` both list them, so a new kind is one more entry here and
// shows up in both. What only the browser keeps is the viewer's own list
// (src/viewer/actions/clear.ts). Settings aren't data: nothing here touches them.

/** This review's data, or every review's in the repository */
export type ClearScope = 'this' | 'all';

export interface ClearContext {
  /** The repository: .lens/ is here */
  root: string;
  /** The open review's summary key, null when there is none (paths mode) */
  key: string | null;
  /** The open review's key, which its notes and marks are kept under; null when none is open (`lens clear` alone) */
  review: string | null;
}

/** What a clear would remove, or did */
export interface ClearPlan {
  /** In the kind's own unit (a summary is one review) */
  count: number;
  /** Repo-relative, `/`-separated */
  paths: string[];
}

export interface ClearKind {
  id: string;
  label: string;
  /** What one of `count` is, singular and plural */
  unit: [string, string];
  /** The scopes it offers here: "this" only when there is a review to name */
  scopes(at: ClearContext): ClearScope[];
  describe(at: ClearContext, scope: ClearScope): ClearPlan;
  clear(at: ClearContext, scope: ClearScope): ClearPlan;
  /** What clearing it would interrupt now, said beside it */
  warning?(at: ClearContext): string | null;
}

/** What the viewer's dialog gets for a kind: each scope it offers, with what it would remove. */
export interface ClearKindInfo {
  id: string;
  label: string;
  unit: [string, string];
  plans: Partial<Record<ClearScope, ClearPlan>>;
  warning: string | null;
}

const SUMMARY_DIR = join('.lens', 'summary');

/** A folder name readdir gave, or a key lens made: never a path that leaves .lens/summary */
function isFolderName(name: string): boolean {
  return name !== '' && name !== '.' && name !== '..' && basename(name) === name && !name.includes('\\');
}

function summaryFolders(at: ClearContext, scope: ClearScope): string[] {
  const dir = join(at.root, SUMMARY_DIR);
  if (!existsSync(dir)) return [];
  const folders = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && isFolderName(entry.name))
    .map((entry) => entry.name)
    .sort();
  return scope === 'all' ? folders : folders.filter((name) => name === at.key);
}

function planOf(folders: string[]): ClearPlan {
  return { count: folders.length, paths: folders.map((name) => '.lens/summary/' + name + '/') };
}

/** Each review's summary, its previews and the agent's task bundle: all of .lens/summary/<key>/. */
const summaries: ClearKind = {
  id: 'summaries',
  label: 'Summaries',
  unit: ['review', 'reviews'],
  scopes: (at) => (at.key ? ['this', 'all'] : ['all']),
  describe: (at, scope) => planOf(summaryFolders(at, scope)),
  clear(at, scope) {
    const folders = summaryFolders(at, scope);
    // a preview being served can hold its file open for a moment on Windows
    for (const name of folders)
      rmSync(join(at.root, SUMMARY_DIR, name), { recursive: true, force: true, maxRetries: 3 });
    return planOf(folders);
  },
  // an agent that left its run unfinished still shows as running: clearing is how to drop it, so it's said, not refused
  warning(at) {
    const progress = at.key ? buildProgressReader(at.root, at.key)() : null;
    if (!progress) return null;
    return `An agent's summary of this review is under way (${progress.done} of ${progress.total} changes): clearing removes its task bundle.`;
  },
};

/** A review's own file in `dir` (.lens/notes/, .lens/marks/), or every review's: their keys */
function reviewFiles(at: ClearContext, scope: ClearScope, dir: string): string[] {
  const folder = join(at.root, dir);
  if (!existsSync(folder)) return [];
  const reviews = readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name.slice(0, -'.json'.length))
    .filter(isFolderName)
    .sort();
  return scope === 'all' ? reviews : reviews.filter((review) => review === at.review);
}

/** A kind kept in one file per review: "this" is the open review's, "all" every review's (and `old`, where it was kept before). */
function perReview(
  base: Pick<ClearKind, 'id' | 'label' | 'unit'>,
  dir: string,
  count: (root: string, review: string) => number,
  old?: { path: string; count: (root: string) => number },
): ClearKind {
  function plan(at: ClearContext, scope: ClearScope): ClearPlan {
    const reviews = reviewFiles(at, scope, dir);
    const plan: ClearPlan = {
      count: reviews.reduce((sum, review) => sum + count(at.root, review), 0),
      paths: reviews.map((review) => dir + '/' + review + '.json'),
    };
    if (scope === 'all' && old && existsSync(join(at.root, old.path))) {
      plan.count += old.count(at.root);
      plan.paths.push(old.path);
    }
    return plan;
  }
  return {
    ...base,
    scopes: (at) => (at.review ? ['this', 'all'] : ['all']),
    describe: plan,
    clear(at, scope) {
      const cleared = plan(at, scope);
      for (const path of cleared.paths) rmSync(join(at.root, path), { force: true });
      return cleared;
    },
  };
}

/** How many notes the file every review's notes were once kept in holds */
function oldNotesCount(root: string): number {
  try {
    const raw = JSON.parse(readFileSync(join(root, OLD_NOTES_PATH), 'utf8'));
    return Array.isArray(raw?.notes) ? raw.notes.length : 0;
  } catch {
    return 0;
  }
}

/** The reader's notes on the code, one file per review. */
const notes = perReview(
  { id: 'notes', label: 'Notes', unit: ['note', 'notes'] },
  NOTES_DIR,
  (root, review) => readStoredNotes(root, review).length,
  { path: OLD_NOTES_PATH, count: oldNotesCount },
);

/** The reader's viewed marks and verdicts on the agent's findings, one file per review. */
const marks = perReview(
  { id: 'marks', label: 'Viewed and concern marks', unit: ['mark', 'marks'] },
  MARKS_DIR,
  (root, review) => countMarks(readStoredMarks(root, review)),
);

/** How long lens's steps took, while timings were on: one file for the machine, every repository's. */
const timings: ClearKind = {
  id: 'timings',
  label: 'Timings',
  unit: ['timing', 'timings'],
  scopes: () => ['all'],
  describe() {
    const count = readTimings().timings.length;
    return { count, paths: count > 0 ? [toPosix(timingsPath())] : [] };
  },
  clear(at) {
    const plan = timings.describe(at, 'all');
    rmSync(timingsPath(), { force: true });
    return plan;
  },
};

export const CLEAR_KINDS: ClearKind[] = [summaries, notes, marks, timings];

export function clearKind(id: string): ClearKind | undefined {
  return CLEAR_KINDS.find((kind) => kind.id === id);
}

export function describeKinds(at: ClearContext): ClearKindInfo[] {
  return CLEAR_KINDS.map((kind) => ({
    id: kind.id,
    label: kind.label,
    unit: kind.unit,
    plans: Object.fromEntries(kind.scopes(at).map((scope) => [scope, kind.describe(at, scope)])),
    warning: kind.warning?.(at) ?? null,
  }));
}

/**
 * Clears the picked kinds, each in its scope. A kind or a scope it doesn't offer is an error
 * before anything is removed.
 */
export function clearKinds(at: ClearContext, picks: Record<string, ClearScope>): Record<string, ClearPlan> {
  const chosen = Object.entries(picks).map(([id, scope]) => {
    const kind = clearKind(id);
    if (!kind) throw new Error(`nothing called "${id}" to clear`);
    if (!kind.scopes(at).includes(scope))
      throw new Error(`${kind.label.toLowerCase()} can't be cleared for "${scope}" here`);
    return { kind, scope };
  });
  return Object.fromEntries(chosen.map(({ kind, scope }) => [kind.id, kind.clear(at, scope)]));
}

/**
 * `lens clear`: with no kind, what each holds; `lens clear <kind> --all` clears all of it,
 * `lens clear <kind> <key>` one review's (the keys `lens clear` lists).
 */
export function runClear(rest: string[], root: string): void {
  const all = rest.includes('--all');
  const [id, key, ...extra] = rest.filter((arg) => arg !== '--all');
  if (!id) {
    for (const kind of CLEAR_KINDS) {
      const plan = kind.describe({ root, key: null, review: null }, 'all');
      console.log(`${kind.id}  ${countText(kind.unit, plan.count)}`);
      for (const path of plan.paths) console.log(`  ${path}`);
    }
    console.log('\nlens clear <kind> --all       clear all of it');
    console.log("lens clear <kind> <key>       clear one review's (the name of its folder or file)");
    return;
  }
  const kind = clearKind(id);
  if (!kind) throw new Error(`nothing called "${id}" to clear — run \`lens clear\` to see what there is`);
  if (extra.length > 0 || (all && key) || (!all && !key)) {
    throw new Error(`lens clear ${id} takes --all, or one review's key`);
  }
  if (key && !isFolderName(key)) throw new Error(`"${key}" is not a review's key`);
  const at: ClearContext = { root, key: key ?? null, review: key ?? null };
  if (key && kind.describe(at, 'this').paths.length === 0)
    throw new Error(`no ${kind.label.toLowerCase()} saved for "${key}"`);
  const plan = clearKinds(at, { [kind.id]: all ? 'all' : 'this' })[kind.id];
  console.log(`lens: cleared ${countText(kind.unit, plan.count)}`);
  for (const path of plan.paths) console.log(`  - ${path}`);
}
