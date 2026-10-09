// What the views derive from the state: the file tree, the code plans, the summary list.
// Pure functions of LensState, memoized where the work is big enough to matter.

import type { FoldRegion } from "../../../model.ts";
import type { Concern, Flow } from "../../../summary/store.ts";
import type { SummaryView, ViewUnit } from "../../../summary/view.ts";
import type { ConcernMark, LensState, SignalFilter, SignalId } from "./store.ts";
import { baseName, isTestFile, type ViewFile } from "./util.ts";
import { fileSpans, hiddenCount, planCode, unitSpans, type CodeItem, type RemovedLine } from "./rows.ts";

/** Remember the last result while the inputs stay the same (by identity). */
function memo<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  let last: { args: A; result: R } | null = null;
  return (...args: A) => {
    if (last && last.args.length === args.length && last.args.every((a, i) => a === args[i])) return last.result;
    const result = fn(...args);
    last = { args, result };
    return result;
  };
}

export function visibleFile(s: LensState, path: string): boolean {
  return !(s.hideTests && isTestFile(path));
}

// ---- file tree ----

export type TreeStatus = "added" | "modified" | "deleted" | "excluded" | "renamed";
export interface TreeFile { path: string; name: string; index: number | null; status: TreeStatus | null; renamedFrom?: string }
export interface TreeDir { name: string; dirs: Map<string, TreeDir>; files: TreeFile[] }
export interface TreeModel {
  /** The tree has files to show (with hide tests applied) */
  hasTree: boolean;
  /** Some changed path is a test file: the hide tests toggle shows */
  testsPresent: boolean;
  root: TreeDir;
  /** File indices in visual tree order (dirs first, sorted, closed dirs skipped) */
  order: number[];
  filter: string;
}

const buildTree = memo((data: LensState["data"], hideTests: boolean, query: string, closedDirs: ReadonlySet<string>): TreeModel => {
  const filter = query.trim().toLowerCase();
  const visible = (path: string) => !(hideTests && isTestFile(path));
  const shown = (path: string) => visible(path) && (filter === "" || path.toLowerCase().includes(filter));
  const paths = [...data.files.map((f) => f.file), ...(data.deleted || []), ...(data.excluded || []), ...(data.renamed || []).map((r) => r.to)];

  const entries: Omit<TreeFile, "name">[] = data.files
    .map((f, index) => ({ path: f.file, index, status: f.status || null }))
    .filter((e) => shown(e.path));
  for (const path of (data.deleted || []).filter(shown)) entries.push({ path, index: null, status: "deleted" });
  for (const path of (data.excluded || []).filter(shown)) entries.push({ path, index: null, status: "excluded" });
  for (const r of (data.renamed || []).filter((x) => shown(x.to))) {
    entries.push({ path: r.to, index: null, status: "renamed", renamedFrom: r.from });
  }

  const root: TreeDir = { name: "", dirs: new Map(), files: [] };
  for (const entry of entries) {
    const parts = entry.path.split("/");
    const name = parts.pop()!;
    let node = root;
    for (const part of parts) {
      if (!node.dirs.has(part)) node.dirs.set(part, { name: part, dirs: new Map(), files: [] });
      node = node.dirs.get(part)!;
    }
    node.files.push({ ...entry, name });
  }
  compressChains(root);
  sortTree(root);

  const order: number[] = [];
  const walk = (node: TreeDir, path: string) => {
    for (const dir of node.dirs.values()) {
      const dirPath = path + dir.name + "/";
      if (!(filter === "" && closedDirs.has(dirPath))) walk(dir, dirPath);
    }
    for (const f of node.files) if (f.index !== null) order.push(f.index);
  };
  walk(root, "");
  return { hasTree: paths.some(visible), testsPresent: paths.some(isTestFile), root, order, filter };
});

export function treeModel(s: LensState): TreeModel {
  return buildTree(s.data, s.hideTests, s.navQuery, s.closedDirs);
}

// Merge single-child directory chains ("src" > "render" > "web" → "src/render/web").
function compressChains(node: TreeDir) {
  for (const [key, childStart] of [...node.dirs]) {
    let child = childStart;
    while (child.dirs.size === 1 && child.files.length === 0) {
      const grandchild = [...child.dirs.values()][0];
      child = { name: child.name + "/" + grandchild.name, dirs: grandchild.dirs, files: grandchild.files };
    }
    if (child !== childStart) { node.dirs.delete(key); node.dirs.set(child.name, child); }
    compressChains(child);
  }
}

function sortTree(node: TreeDir) {
  node.dirs = new Map([...node.dirs].sort(([a], [b]) => a.localeCompare(b)));
  node.files.sort((a, b) => a.name.localeCompare(b.name));
  for (const d of node.dirs.values()) sortTree(d);
}

/**
 * The top file of the tree as displayed. When the tree hides every file (all tests, "hide
 * tests" on) it's still the first file, so the code pane can say why nothing shows; -1 only
 * when there are no files.
 */
export function firstTreeFile(s: LensState): number {
  const { order } = treeModel(s);
  if (order.length > 0) return order[0];
  const visible = s.data.files.findIndex((f) => visibleFile(s, f.file));
  return visible >= 0 ? visible : s.data.files.length > 0 ? 0 : -1;
}

// ---- folds ----

/** "category|path:startLine" — a fold chip resets its category's one-by-one folds by the prefix. */
export function regionKey(path: string, region: FoldRegion): string { return region.category + "|" + path + ":" + region.startLine; }

export function isRegionOpen(s: LensState, path: string, region: FoldRegion): boolean {
  return s.foldOverrides.get(regionKey(path, region)) ?? s.openCats.has(region.category);
}

/** The regions a plan shows as folds. */
export function planRegions(items: CodeItem[]): FoldRegion[] {
  return items.flatMap((it) => it.kind === "region" ? [it.region] : []);
}

// ---- the code view's plan ----

export interface FilePlan { items: CodeItem[]; hidden: number }

const buildFilePlan = memo((file: ViewFile, hunksOnly: boolean, expanded: ReadonlySet<string>, showRemoved: boolean): FilePlan => {
  // Old-side lines the diff removed, keyed by the new-side line they follow.
  const removedAfter = new Map<number, RemovedLine[]>();
  if (showRemoved) {
    for (const block of file.removals || []) {
      const existing = removedAfter.get(block.afterLine) || [];
      removedAfter.set(block.afterLine, existing.concat(block.lines.map((text, i) => ({ text, old: block.oldStart + i }))));
    }
  }
  const items = planCode(fileSpans(file, hunksOnly, expanded), file.regions, (after) => removedAfter.get(after) || []);
  return { items, hidden: hiddenCount(items) };
});

export function filePlan(s: LensState, file: ViewFile): FilePlan {
  return buildFilePlan(file, s.hunksOnly, s.expandedGaps, s.showRemoved);
}

/** The open file, unless "hide tests" hides it (then the pane says why). */
export function activeFile(s: LensState): ViewFile | null {
  return s.data.files[s.active] ?? null;
}

export function foldedCount(file: ViewFile, threshold: number): number {
  let n = 0;
  for (const r of file.regions) if (r.score <= threshold) n += r.endLine - r.startLine;
  return n;
}

// ---- a summary unit's plan ----

export interface UnitPlan { file: ViewFile | null; items: CodeItem[]; gutter: number }

const buildUnitPlan = memo((u: ViewUnit, file: ViewFile | null, hunksOnly: boolean, expanded: ReadonlySet<string>, showRemoved: boolean): UnitPlan => {
  const gutter = String(Math.max(file ? file.lineCount : 0, ...u.removals.map((b) => b.oldStart + b.lines.length))).length;
  // a deleted unit is nothing but removed lines: they show even with removed lines hidden
  const show = showRemoved || !file || u.ranges.length === 0;
  // each removed block carries its display anchor (computed by the server)
  const removedAt = (after: number) => !show ? [] : u.removals.filter((r) => r.anchor === after)
    .flatMap((b) => b.lines.map((text, i) => ({ text, old: b.oldStart + i })));
  const regions = file ? file.regions : [];
  const spans = file ? unitSpans(u, regions, hunksOnly, expanded) : [];
  return { file, items: planCode(spans, regions, removedAt), gutter };
});

export function unitFile(s: LensState, u: ViewUnit): ViewFile | null {
  return s.data.files.find((f) => f.file === u.displayFile) ?? null;
}

export function unitPlan(s: LensState, u: ViewUnit): UnitPlan {
  return buildUnitPlan(u, unitFile(s, u), s.hunksOnly, s.expandedGaps, s.showRemoved);
}

// ---- summary: signals, concerns ----

export type Unit = ViewUnit;

/** Only for a reason on record: an open concern (by kind) or callers it may break. Older summaries can carry the agent's bare flag: "look". */
export const SIGNALS: Record<SignalId, { icon: string; one: string; many: string }> = {
  bug: { icon: "⚠", one: "possible bug", many: "possible bugs" },
  risk: { icon: "!", one: "possible risk", many: "risks" },
  question: { icon: "?", one: "question", many: "questions" },
  breaks: { icon: "↗", one: "may break callers", many: "may break callers" },
  look: { icon: "●", one: "flagged, no reason given", many: "no reason given" },
};
const CONCERN_KINDS = ["bug", "risk", "question"] as const;

export type Marks = LensState["concernMarks"];

// Keyed by the unit's hash and the concern itself, so a re-summarized unit starts fresh and a reordered list keeps its marks.
export function concernKey(u: Unit, c: Concern): string { return u.id + "@" + u.hash + "#" + c.kind + ":" + c.line + ":" + c.text; }
export function concernMark(marks: Marks, u: Unit, c: Concern): ConcernMark | null { return marks.get(concernKey(u, c)) || null; }

/** The unit's concerns the reader hasn't dismissed. */
export function openConcerns(marks: Marks, u: Unit): Concern[] {
  if (!u.summary) return [];
  return u.summary.concerns.filter((c) => concernMark(marks, u, c) !== "dismissed");
}

/** The unit's signal ids, most serious first. */
export function unitSignals(marks: Marks, u: Unit): SignalId[] {
  const s = u.summary;
  if (!s) return [];
  const kinds = new Set<string>(openConcerns(marks, u).map((c) => c.kind));
  const out: SignalId[] = CONCERN_KINDS.filter((k) => kinds.has(k));
  if (s.breaks.length > 0) out.push("breaks");
  if (s.unexplainedLook) out.push("look");
  return out;
}

export function isFlagged(marks: Marks, u: Unit): boolean { return unitSignals(marks, u).length > 0; }

/** "possible bug", or "confirmed bug" once the reader marked it real */
export function concernLabel(c: Concern, mark: ConcernMark | null): string { return mark === "real" ? "confirmed " + c.kind : SIGNALS[c.kind].one; }

export function signalTip(marks: Marks, u: Unit, id: SignalId): string {
  if (id === "breaks") return "may break callers: " + u.summary!.breaks[0].summary;
  if (id === "look") return SIGNALS.look.one;
  return SIGNALS[id].one + ": " + openConcerns(marks, u).find((c) => c.kind === id)!.text;
}

export function flowPriority(flow: Flow): number { return flow.priority || 2; }

export function unitLabel(u: Unit): string {
  if (u.name === "(module)") return "imports & module-level";
  if (u.name === "(file)") return baseName(u.displayFile);
  return u.name;
}

export function unitViewKey(u: Unit): string { return u.id + "@" + u.hash; }

export function unitById(summary: SummaryView | null, id: string | null | undefined): Unit | null {
  return (summary?.units || []).find((u) => u.id === id) || null;
}

// ---- summary: the list ----

export interface Section { flow: Flow; order: number; members: Unit[] }

// List order: flows by priority (then by how many of their units are flagged),
// then the units in no flow: flagged, routine, not yet summarized / stale.
// A unit in several flows is listed under each.
export function groupUnits(summary: SummaryView, marks: Marks, shown: (u: Unit) => boolean): { sections: Section[]; others: Unit[] } {
  const rank = (u: Unit) => !u.summary ? 3 : isFlagged(marks, u) ? 0 : 1;
  const looks = (members: Unit[]) => members.filter((u) => isFlagged(marks, u)).length;
  const inFlow = new Set<string>();
  const sections = summary.flows
    .map((flow, order) => {
      const all = Object.keys(flow.units).map((id) => unitById(summary, id)).filter((u): u is Unit => u !== null);
      for (const u of all) inFlow.add(u.id);
      return { flow, order, members: all.filter(shown) };
    })
    .filter((section) => section.members.length > 0)
    .sort((a, b) => flowPriority(a.flow) - flowPriority(b.flow) || looks(b.members) - looks(a.members) || a.order - b.order);
  const others = summary.units.filter((u) => !inFlow.has(u.id)).filter(shown).sort((a, b) => rank(a) - rank(b));
  return { sections, others };
}

export interface ListModel {
  /** The units hide tests leaves */
  units: Unit[];
  counts: Record<SignalId | "any", number>;
  /** The signal filter in effect: one whose last unit went away (dismissed) lifts */
  signal: SignalFilter;
  text: string;
  sections: Section[];
  others: Unit[];
  folded: Set<string>;
  /** Unit ids as j/k walks them: what's visible, each unit once */
  order: string[];
  /** The open unit: the reader's, or the first in the list */
  activeId: string | null;
  summarized: number;
  shownCount: number;
}

const buildList = memo((
  summary: SummaryView, marks: Marks, hideTests: boolean, query: string, sumSignal: SignalFilter,
  flowOpen: ReadonlyMap<string, boolean>, summaryActive: string | null, overview: boolean,
): ListModel => {
  const isShown = (u: Unit) => !(hideTests && isTestFile(u.displayFile));
  const units = summary.units.filter(isShown); // hide tests: the counts follow the list
  const counts = { any: 0, bug: 0, risk: 0, question: 0, breaks: 0, look: 0 };
  for (const u of units) {
    const signals = unitSignals(marks, u);
    if (signals.length > 0) counts.any++;
    for (const id of signals) counts[id]++;
  }
  const signal = sumSignal !== null && counts[sumSignal] === 0 ? null : sumSignal;
  const text = query.trim().toLowerCase();
  const matches = (u: Unit) => {
    if (!isShown(u)) return false;
    if (signal === "any" ? !isFlagged(marks, u) : signal !== null && !unitSignals(marks, u).includes(signal)) return false;
    if (text === "") return true;
    const haystack = unitLabel(u) + "\n" + u.displayFile + "\n" + (u.summary ? u.summary.gist : "");
    return haystack.toLowerCase().includes(text);
  };
  const { sections, others } = groupUnits(summary, marks, matches);
  // P3 flows start folded; a click on the flow's title flips it. A filter, or the open unit sitting inside, unfolds it.
  const isFolded = (section: Section) => {
    if (text !== "" || signal !== null) return false;
    const explicit = flowOpen.get(section.flow.title);
    if (explicit !== undefined) return !explicit;
    return flowPriority(section.flow) === 3 && !(!overview && section.members.some((u) => u.id === summaryActive));
  };
  const folded = new Set(sections.filter(isFolded).map((section) => section.flow.title));
  const order = [...new Set([
    ...sections.filter((section) => !folded.has(section.flow.title)).flatMap((section) => section.members),
    ...others,
  ].map((u) => u.id))];
  // a unit the filter hides stays open in the pane
  const activeId = summaryActive && unitById(summary, summaryActive) ? summaryActive : order[0] || null;
  const shownCount = new Set([...sections.flatMap((section) => section.members), ...others].map((u) => u.id)).size;
  return { units, counts, signal, text, sections, others, folded, order, activeId, summarized: units.filter((u) => u.summary).length, shownCount };
});

export function listModel(s: LensState): ListModel | null {
  const summary = s.data.summary;
  if (!summary) return null;
  return buildList(summary, s.concernMarks, s.hideTests, s.sumQuery, s.sumSignal, s.flowOpen, s.summaryActive, s.summaryOverview);
}

/** The open unit; null on the overview, where unit keys (o, m) do nothing. */
export function currentUnit(s: LensState): Unit | null {
  if (s.summaryOverview) return null;
  const list = listModel(s);
  return list ? unitById(s.data.summary, list.activeId) : null;
}

/** What the Summary pane shows. */
export function summaryPage(s: LensState): "empty" | "overview" | "unit" {
  const list = listModel(s);
  if (!list || (list.summarized === 0 && !s.summaryBrowsing)) return "empty";
  return s.summaryOverview ? "overview" : "unit";
}

// ---- the Ask rail ----

export interface AskContext { key: string; file: string; unitId: string | null; label: string }

/** The open change: the Summary tab's unit, or the Code tab's file; null on the overview. */
export function askContext(s: LensState): AskContext | null {
  if (s.view === "summary") {
    const u = summaryPage(s) === "unit" ? currentUnit(s) : null;
    return u ? { key: "u:" + u.id, file: u.displayFile, unitId: u.id, label: unitLabel(u) } : null;
  }
  const f = activeFile(s);
  // the file's name: the selection chip next to it carries the full path
  return f ? { key: "f:" + f.file, file: f.file, unitId: null, label: baseName(f.file) } : null;
}

/** The kept selection, when it belongs to the open change. */
export function askSelection(s: LensState) {
  const ctx = askContext(s);
  return s.ask.sel && ctx && s.ask.sel.key === ctx.key ? s.ask.sel : null;
}
