import { existsSync, readdirSync, rmSync } from "node:fs";
import { basename, join } from "node:path";
import { buildProgressReader } from "./summary/progress.ts";
import { NOTES_PATH, readStoredNotes } from "./notes/store.ts";
import { countText } from "./text.ts";

// What lens keeps on disk that the reader can clear: one entry per kind in CLEAR_KINDS. The
// viewer's dialog and `lens clear` both list them, so a new kind is one more entry here and
// shows up in both. What the browser keeps (viewed and concern marks) is the viewer's own
// list (src/viewer/actions/clear.ts). Settings aren't data: nothing here touches them.

/** This review's data, or every review's in the repository */
export type ClearScope = "this" | "all";

export interface ClearContext {
  /** The repository: .lens/ is here */
  root: string;
  /** The open review's summary key, null when there is none (paths mode) */
  key: string | null;
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

const SUMMARY_DIR = join(".lens", "summary");

/** A folder name readdir gave, or a key lens made: never a path that leaves .lens/summary */
function isFolderName(name: string): boolean {
  return name !== "" && name !== "." && name !== ".." && basename(name) === name && !name.includes("\\");
}

function summaryFolders(at: ClearContext, scope: ClearScope): string[] {
  const dir = join(at.root, SUMMARY_DIR);
  if (!existsSync(dir)) return [];
  const folders = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && isFolderName(entry.name))
    .map((entry) => entry.name)
    .sort();
  return scope === "all" ? folders : folders.filter((name) => name === at.key);
}

function planOf(folders: string[]): ClearPlan {
  return { count: folders.length, paths: folders.map((name) => ".lens/summary/" + name + "/") };
}

/** Each review's summary, its previews and the agent's task bundle: all of .lens/summary/<key>/. */
const summaries: ClearKind = {
  id: "summaries",
  label: "Summaries",
  unit: ["review", "reviews"],
  scopes: (at) => (at.key ? ["this", "all"] : ["all"]),
  describe: (at, scope) => planOf(summaryFolders(at, scope)),
  clear(at, scope) {
    const folders = summaryFolders(at, scope);
    // a preview being served can hold its file open for a moment on Windows
    for (const name of folders) rmSync(join(at.root, SUMMARY_DIR, name), { recursive: true, force: true, maxRetries: 3 });
    return planOf(folders);
  },
  // an agent that left its run unfinished still shows as running: clearing is how to drop it, so it's said, not refused
  warning(at) {
    const progress = at.key ? buildProgressReader(at.root, at.key)() : null;
    if (!progress) return null;
    return `An agent's summary of this review is under way (${progress.done} of ${progress.total} changes): clearing removes its task bundle.`;
  },
};

function notesPlan(at: ClearContext): ClearPlan {
  const count = readStoredNotes(at.root).length;
  return { count, paths: existsSync(join(at.root, NOTES_PATH)) ? [NOTES_PATH] : [] };
}

/** The reader's notes on the code: one file for the repository, whatever review they were written in. */
const notes: ClearKind = {
  id: "notes",
  label: "Notes",
  unit: ["note", "notes"],
  scopes: () => ["all"],
  describe: (at) => notesPlan(at),
  clear(at) {
    const plan = notesPlan(at);
    rmSync(join(at.root, NOTES_PATH), { force: true });
    return plan;
  },
};

export const CLEAR_KINDS: ClearKind[] = [summaries, notes];

export function clearKind(id: string): ClearKind | undefined {
  return CLEAR_KINDS.find((kind) => kind.id === id);
}

/** Every kind, with what each of its scopes would remove now. */
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
    if (!kind.scopes(at).includes(scope)) throw new Error(`${kind.label.toLowerCase()} can't be cleared for "${scope}" here`);
    return { kind, scope };
  });
  return Object.fromEntries(chosen.map(({ kind, scope }) => [kind.id, kind.clear(at, scope)]));
}

/**
 * `lens clear`: with no kind, what each holds; `lens clear <kind> --all` clears all of it,
 * `lens clear summaries <key>` one review's (the keys `lens clear` lists).
 */
export function runClear(rest: string[], root: string): void {
  const all = rest.includes("--all");
  const [id, key, ...extra] = rest.filter((arg) => arg !== "--all");
  if (!id) {
    for (const kind of CLEAR_KINDS) {
      const plan = kind.describe({ root, key: null }, "all");
      console.log(`${kind.id}  ${countText(kind.unit, plan.count)}`);
      for (const path of plan.paths) console.log(`  ${path}`);
    }
    console.log("\nlens clear <kind> --all       clear all of it");
    console.log("lens clear summaries <key>    clear one review's (its folder's name)");
    return;
  }
  const kind = clearKind(id);
  if (!kind) throw new Error(`nothing called "${id}" to clear — run \`lens clear\` to see what there is`);
  if (extra.length > 0 || (all && key) || (!all && !key)) {
    throw new Error(`lens clear ${id} takes --all, or one review's key`);
  }
  if (key && !isFolderName(key)) throw new Error(`"${key}" is not a review's key`);
  const at: ClearContext = { root, key: key ?? null };
  if (key && kind.describe(at, "this").count === 0) throw new Error(`no ${kind.label.toLowerCase()} saved for "${key}"`);
  const plan = clearKinds(at, { [kind.id]: all ? "all" : "this" })[kind.id];
  console.log(`lens: cleared ${countText(kind.unit, plan.count)}`);
  for (const path of plan.paths) console.log(`  - ${path}`);
}
