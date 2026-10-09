// What the reader can do: each action changes the state (store.ts) and, where it must,
// touches the DOM afterwards (scrolling to a line, flashing it).

import type { FoldRegion } from "../../../model.ts";
import type { Concern } from "../../../summary/store.ts";
import type { SummaryView } from "../../../summary/view.ts";
import type { ViewerPayload } from "../server.ts";
import {
  CONCERN_PREF, VIEWED_CAP, VIEWED_PREF, commit, getState, toggled, update,
  type ConcernMark, type LensState, type SignalFilter, type Tab, type View,
} from "./store.ts";
import { fileViewKey, flashRow, isTestFile, writePref, type ViewFile } from "./shared.ts";
import { fileSpans } from "./rows.ts";
import {
  activeFile, concernKey, currentUnit, firstTreeFile, isRegionOpen, listModel, planRegions, regionKey, treeModel, unitPlan,
  unitViewKey, visibleFile, type Unit,
} from "./model.ts";

// ---- files and tabs ----

// The file gets a tab. A new file takes over the preview tab when one exists; otherwise it
// opens next to the active tab.
function withTab(tabs: Tab[], active: number, index: number, pin?: boolean): Tab[] {
  const existing = tabs.find((t) => t.index === index);
  if (existing) return pin && !existing.pinned ? tabs.map((t) => t === existing ? { ...t, pinned: true } : t) : tabs;
  const preview = tabs.find((t) => !t.pinned);
  if (!pin && preview) return tabs.map((t) => t === preview ? { ...t, index } : t);
  const at = tabs.findIndex((t) => t.index === active);
  return [...tabs.slice(0, at + 1), { index, pinned: !!pin }, ...tabs.slice(at + 1)];
}

// A test file opened by name (a tab, a cite, a search hit) shows: "hide tests" goes off for
// this page instead of another file taking its place. The saved preference stays.
function revealIfTest(s: LensState, index: number): Partial<LensState> {
  const file = s.data.files[index];
  return s.hideTests && file && isTestFile(file.file) ? { hideTests: false } : {};
}

/** With hide tests on, an open test file gives way to the first file the tree shows. */
function visibleActive(s: LensState): Partial<LensState> {
  const active = activeFile(s);
  if (!s.hideTests || !active || !isTestFile(active.file)) return {};
  const first = firstTreeFile(s);
  return first >= 0 ? { active: first, tabs: withTab(s.tabs, s.active, first) } : {};
}

export function openFile(index: number, pin?: boolean): void {
  update((s) => ({ ...revealIfTest(s, index), tabs: withTab(s.tabs, s.active, index, pin), active: index }));
}

export function closeTab(index: number): void {
  update((s) => {
    const at = s.tabs.findIndex((t) => t.index === index);
    if (at === -1) return {};
    const tabs = s.tabs.filter((t) => t.index !== index);
    const next = tabs[Math.min(at, tabs.length - 1)];
    return { tabs, active: s.active === index ? (next ? next.index : -1) : s.active };
  });
}

export function pinTab(index: number): void {
  update((s) => ({ tabs: s.tabs.map((t) => t.index === index ? { ...t, pinned: true } : t) }));
}

/** Start-up: one preview tab on the first file of the tree. */
export function openFirstTreeFile(): void {
  update((s) => {
    const first = firstTreeFile(s);
    return first < 0 ? {} : { tabs: [{ index: first, pinned: false }], active: first };
  });
}

export function stepFile(direction: number): void {
  const s = getState();
  // Walk the tree exactly as displayed (dirs-first, sorted, collapsed dirs
  // skipped); when the tree shows none, fall back to plain file order.
  const tree = treeModel(s);
  const order = tree.order.length > 0
    ? tree.order
    : s.data.files
        .map((f, index) => ({ index, path: f.file }))
        .filter((e) => visibleFile(s, e.path) && (tree.filter === "" || e.path.toLowerCase().includes(tree.filter)))
        .map((e) => e.index);
  if (order.length === 0) return;
  const pos = order.indexOf(s.active);
  openFile(pos === -1
    ? (direction > 0 ? order[0] : order[order.length - 1])
    : order[(pos + direction + order.length) % order.length]);
}

// ---- viewed marks: keyed by content, so what changes after it was ticked comes back unticked ----

function saveViewed(key: string, set: ReadonlySet<string>) {
  // Sets keep insertion order: the oldest marks drop first
  writePref(key, JSON.stringify([...set].slice(-VIEWED_CAP)));
}

export function toggleFileViewed(index: number): void {
  const s = getState();
  const file: ViewFile | undefined = s.data.files[index];
  if (!file) return;
  const viewedFiles = toggled(s.viewedFiles, fileViewKey(file));
  saveViewed(VIEWED_PREF.files, viewedFiles);
  update({ viewedFiles });
}

export function toggleUnitViewed(u: Unit | null): void {
  if (!u) return;
  const viewedUnits = toggled(getState().viewedUnits, unitViewKey(u));
  saveViewed(VIEWED_PREF.units, viewedUnits);
  update({ viewedUnits });
}

// ---- the sidebar ----

export function toggleNav(): void {
  update((s) => {
    writePref("lens.navCollapsed", !s.navCollapsed ? "1" : "0");
    return { navCollapsed: !s.navCollapsed };
  });
}

export function toggleDir(path: string): void {
  update((s) => ({ closedDirs: toggled(s.closedDirs, path) }));
}

// ---- folds ----

export function toggleRegion(path: string, region: FoldRegion): void {
  update((s) => {
    const foldOverrides = new Map(s.foldOverrides);
    foldOverrides.set(regionKey(path, region), !isRegionOpen(s, path, region));
    return { foldOverrides };
  });
}

/** A fold chip: every region of the category opens (or folds) again, one-by-one choices included. */
export function setCategoryOpen(cat: string, open: boolean): void {
  update((s) => ({
    openCats: toggled(s.openCats, cat, open),
    foldOverrides: new Map([...s.foldOverrides].filter(([key]) => !key.startsWith(cat + "|"))),
  }));
}

/** The folds on screen: the code view's file, or the open summary unit's code. */
function foldScope(s: LensState): { path: string; regions: FoldRegion[] } | null {
  if (s.view === "code") {
    const file = activeFile(s);
    return file ? { path: file.file, regions: file.regions } : null;
  }
  const u = currentUnit(s);
  return u ? { path: u.displayFile, regions: planRegions(unitPlan(s, u).items) } : null;
}

// expand/collapse all keep the category chips in sync with the regions
export function expandAll(): void {
  update((s) => {
    const scope = foldScope(s);
    if (!scope) return {};
    const openCats = new Set(s.openCats);
    for (const r of scope.regions) openCats.add(r.category);
    return { openCats, foldOverrides: new Map([...s.foldOverrides].filter(([key]) => !key.includes("|" + scope.path + ":"))) };
  });
}

export function collapseAll(): void {
  update({ openCats: new Set(), foldOverrides: new Map() });
}

/** The fold around a row on screen opens (a jump or a cite lands inside it). */
function openFoldAround(row: HTMLElement, path: string) {
  const fold = row.closest<HTMLElement>(".region");
  const start = Number(fold?.querySelector<HTMLElement>(".row[data-line]")?.dataset.line);
  if (!fold || !start || fold.classList.contains("open")) return;
  commit((s) => {
    const foldOverrides = new Map(s.foldOverrides);
    foldOverrides.set(fold.dataset.cat + "|" + path + ":" + start, true);
    return { foldOverrides };
  });
}

export function expandGap(key: string): void {
  update((s) => ({ expandedGaps: toggled(s.expandedGaps, key, true) }));
}

// ---- toolbar toggles ----

export function setHunksOnly(on: boolean): void {
  writePref("lens.hunksOnly", on ? "1" : "0");
  update({ hunksOnly: on, expandedGaps: new Set() }); // toggling starts fresh — no stale expansions
}

export function setHideTests(on: boolean): void {
  writePref("lens.hideTests", on ? "1" : "0");
  update((s) => {
    const next = { ...s, hideTests: on };
    return { hideTests: on, ...(s.view === "code" ? visibleActive(next) : {}) };
  });
}

export function setShowRemoved(on: boolean): void {
  update({ showRemoved: on });
}

export function setThreshold(threshold: number): void {
  update({ threshold });
}

export function stepThreshold(delta: number): void {
  const s = getState();
  setThreshold(Math.max(-1, Math.min(3, s.threshold + delta)));
}

// ---- theme ----

type ThemeTokens = { theme: string; fg: string; bg: string; tokens: ViewFile["tokens"][] };

export async function switchTheme(theme: string): Promise<boolean> {
  update({ themeBusy: true });
  try {
    const res = await fetch("/api/tokens?theme=" + encodeURIComponent(theme));
    if (!res.ok) throw new Error("http " + res.status);
    const entry: ThemeTokens = await res.json();
    update((s) => ({
      themeBusy: false,
      data: {
        ...s.data,
        theme: entry.theme,
        fg: entry.fg,
        bg: entry.bg,
        themes: s.data.themes.includes(entry.theme) ? s.data.themes : [...s.data.themes, entry.theme],
        files: s.data.files.map((f, i) => ({ ...f, tokens: entry.tokens[i] })),
      },
    }));
    return true;
  } catch (err) {
    console.error("theme switch failed:", err);
    update({ themeBusy: false });
    return false;
  }
}

// ---- refresh and end ----

export async function refresh(): Promise<void> {
  update({ refreshing: true });
  try {
    const s = getState();
    const res = await fetch("/api/refresh?theme=" + encodeURIComponent(s.data.theme));
    if (!res.ok) throw new Error("http " + res.status);
    const data: ViewerPayload = await res.json();
    update((s) => {
      const activePath = s.data.files[s.active]?.file;
      // tabs survive a refresh by path; files gone from the new analysis drop out
      let tabs = s.tabs
        .map((t) => ({ index: data.files.findIndex((f) => f.file === s.data.files[t.index]?.file), pinned: t.pinned }))
        .filter((t) => t.index >= 0);
      let active = data.files.findIndex((f) => f.file === activePath);
      if (active === -1) active = tabs[0]?.index ?? firstTreeFile({ ...s, data });
      if (active >= 0) tabs = withTab(tabs, active, active);
      return {
        data, tabs, active, refreshing: false,
        expandedGaps: new Set(), // keyed by line numbers, which an edit moves
        foldOverrides: new Map(),
        // the summary went away (e.g. a refresh in path mode): back to the code
        view: data.summary ? s.view : "code",
      };
    });
  } catch (err) {
    console.error("refresh failed:", err);
    update({ refreshing: false });
  }
}

export async function endSession(): Promise<void> {
  try {
    await fetch("/api/shutdown", { method: "POST" });
  } catch { /* the server may drop the connection while dying — that's success */ }
  update({ ended: true });
}

// ---- search ----

export function openSearch(query?: string, opts?: { word?: boolean; matchCase?: boolean; pinOrigin?: boolean }): void {
  update((s) => ({
    search: {
      open: true,
      query: query ?? s.search.query,
      word: opts ? !!opts.word : s.search.word,
      matchCase: opts ? !!opts.matchCase : s.search.matchCase,
      // Find-usages (alt-click) jumps pin the tab being read — that search is a
      // detour the reader returns from. Plain ⌘P search keeps the preview behavior.
      pinOrigin: !!opts?.pinOrigin,
      seq: s.search.seq + 1,
    },
  }));
}

/**
 * Show the target line in the code view: expand a hidden stretch or a fold covering it,
 * scroll it centered, and flash it.
 */
export function jumpToLine(fileIndex: number, line: number, pinOrigin?: boolean): void {
  commit((s) => {
    // Pin the preview tab being read before a find-usages jump replaces it,
    // so the target opens beside it and the reader can come back.
    const tabs = pinOrigin && fileIndex !== s.active
      ? s.tabs.map((t) => t.index === s.active ? { ...t, pinned: true } : t)
      : s.tabs;
    const file = s.data.files[fileIndex];
    const gap = fileSpans(file, s.hunksOnly, s.expandedGaps).find((g) => g.gap !== undefined && line >= g.start && line <= g.end);
    return {
      ...viewChange(s, "code"),
      ...revealIfTest(s, fileIndex),
      tabs: withTab(tabs, s.active, fileIndex),
      active: fileIndex,
      expandedGaps: gap ? toggled(s.expandedGaps, gap.gap!, true) : s.expandedGaps,
    };
  });
  const row = document.querySelector<HTMLElement>('#code .row[data-line="' + line + '"]');
  if (!row) return;
  openFoldAround(row, getState().data.files[fileIndex].file);
  flashRow(row);
}

// ---- views ----

function viewChange(s: LensState, view: View): Partial<LensState> {
  if (view === s.view) return {};
  return view === "code" ? { view, ...visibleActive({ ...s, view }) } : { view };
}

export function setView(view: View): void {
  const s = getState();
  if (view === "summary" && !s.data.summary) return;
  update(viewChange(s, view));
  if (view === "summary") {
    if (s.summaryDot) loadSummary();
    else checkSummaryStamp(); // a submit while the window kept its focus
  }
}

async function loadSummary() {
  try {
    const res = await fetch("/api/summary");
    if (!res.ok) throw new Error("http " + res.status);
    const summary: SummaryView | null = await res.json();
    // only once it's loaded: a failed load is tried again
    update((s) => ({ summaryDot: false, data: summary ? { ...s.data, summary } : s.data }));
  } catch (err) {
    console.error("loading the summary failed:", err);
  }
}

// A submit from the agent lands in summary.json; notice it when the reader comes back
// to the window, or opens the Summary tab.
export async function checkSummaryStamp(): Promise<void> {
  const summary = getState().data.summary;
  if (!summary) return;
  try {
    const res = await fetch("/api/summary/stamp");
    const { stamp } = await res.json();
    if (stamp !== null && stamp !== summary.stamp) {
      if (getState().view === "summary") loadSummary();
      else update({ summaryDot: true });
    }
  } catch { /* server gone — nothing to do */ }
}

// ---- the Summary tab ----

export function openSummaryUnit(id: string): void {
  update({ summaryOverview: false, summaryActive: id, summaryBrowsing: true });
}

export function showOverview(): void {
  update({ summaryOverview: true, summaryBrowsing: true });
}

export function stepSummary(direction: number): void {
  const s = getState();
  const list = listModel(s);
  if (!list || list.order.length === 0) return;
  // from the overview, j starts at the top of the list and k at the bottom
  const pos = s.summaryOverview ? -1 : list.order.indexOf(list.activeId!);
  openSummaryUnit(pos === -1
    ? list.order[direction > 0 ? 0 : list.order.length - 1]
    : list.order[(pos + direction + list.order.length) % list.order.length]);
}

export function openUnitInCode(u: Unit | null): void {
  if (!u) return;
  const fileIndex = getState().data.files.findIndex((f) => f.file === u.displayFile);
  if (fileIndex < 0 || u.ranges.length === 0) return;
  jumpToLine(fileIndex, u.changedLines[0] ?? u.ranges[0].start);
}

export function setSignalFilter(id: SignalFilter): void {
  const s = getState();
  update({ sumSignal: listModel(s)?.signal === id ? null : id });
}

export function toggleFlow(title: string, open: boolean): void {
  update((s) => ({ flowOpen: new Map(s.flowOpen).set(title, open) }));
}

export function setOverviewTab(tab: "flows" | "map"): void {
  writePref("lens.overviewTab", tab);
  update({ overviewTab: tab });
}

// The agent's concerns are suspicions; the reader decides: "real" or "dismissed", per browser.
export function setConcernMark(u: Unit, c: Concern, mark: ConcernMark): void {
  const key = concernKey(u, c);
  const marks = new Map(getState().concernMarks);
  if (marks.get(key) === mark) marks.delete(key);
  else { marks.delete(key); marks.set(key, mark); } // re-insert: the oldest marks drop first
  writePref(CONCERN_PREF, JSON.stringify(Object.fromEntries([...marks].slice(-VIEWED_CAP))));
  update({ concernMarks: marks });
}

/** The row a label ("N31" / "O16") points at, in the open unit's code. */
export function citedRow(label: string): HTMLElement | null {
  const selector = label.startsWith("O") ? '.row[data-old="' + label.slice(1) + '"]' : '.row[data-line="' + label.slice(1) + '"]';
  return document.querySelector<HTMLElement>(".summary-pane .unit-code " + selector);
}

/** A cite: the line in the unit's code, its fold opened, scrolled to and flashed. */
export function flashCited(label: string): boolean {
  const row = citedRow(label);
  const u = currentUnit(getState());
  if (!row || !u) return false;
  openFoldAround(row, u.displayFile);
  flashRow(row, true);
  return true;
}
