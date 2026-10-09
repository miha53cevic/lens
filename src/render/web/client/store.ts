// The viewer's state: one immutable object, replaced on every change. Components read it
// with useLens(); actions (actions.ts) change it with update(), or commit() when the DOM
// must show the new state right away (to scroll to a row, say).

import { useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import type { ViewerPayload } from "../server.ts";
import type { AskSelection, AskState } from "../../../ask/session.ts";
import { INITIAL_DATA, readPref } from "./util.ts";

export type View = "code" | "summary";
export type ConcernMark = "real" | "dismissed";
export type SignalId = "bug" | "risk" | "question" | "breaks" | "look";
export type SignalFilter = SignalId | "any" | null;

/** An open editor tab. At most one is unpinned: the "preview" tab, reused by the next single-click open. */
export interface Tab { index: number; pinned: boolean }

/** The reader's kept code selection, tied to the change it was made in. */
export type KeptSelection = AskSelection & { key: string };

export interface LensState {
  data: ViewerPayload;
  /** The fold level: regions scored at or below it fold. The slider's choice survives a refresh. */
  threshold: number;
  themeBusy: boolean;
  refreshing: boolean;
  /** ⏻ end: the server stopped */
  ended: boolean;
  view: View;
  active: number; // the open file's index, -1 for none
  tabs: Tab[];
  /** Categories toggled to "show" (their regions open) */
  openCats: ReadonlySet<string>;
  /** Regions the reader opened or closed one by one (regionKey in model.ts); overrides openCats */
  foldOverrides: ReadonlyMap<string, boolean>;
  /** Hidden stretches the reader expanded: "path:start" (code view), "unit:<id>:start" (summary) */
  expandedGaps: ReadonlySet<string>;
  showRemoved: boolean;
  hideTests: boolean;
  hunksOnly: boolean;
  navCollapsed: boolean;
  navWidth: number;
  navQuery: string; // the tree filter's text (transient)
  closedDirs: ReadonlySet<string>;
  viewedFiles: ReadonlySet<string>;
  viewedUnits: ReadonlySet<string>;
  settingsOpen: boolean;
  keysOpen: boolean;
  search: { open: boolean; query: string; word: boolean; matchCase: boolean; pinOrigin: boolean; seq: number };
  // Summary tab
  summaryActive: string | null;
  summaryOverview: boolean; // it opens there
  /** The reader went past the "No summary yet" page */
  summaryBrowsing: boolean;
  /** A newer summary waits on the server */
  summaryDot: boolean;
  overviewTab: "flows" | "map";
  sumQuery: string; // the list filter's text (transient)
  sumSignal: SignalFilter;
  flowOpen: ReadonlyMap<string, boolean>; // flow title -> open, once the reader toggled it
  concernMarks: ReadonlyMap<string, ConcernMark>;
  // Ask rail
  ask: {
    open: boolean;
    width: number;
    data: AskState;
    sel: KeptSelection | null;
    /** The last send failed (or the server is gone): shown until the reader types again */
    error: string | null;
    /** Bumped by every poll, so "waiting for agent · 6s" ticks */
    tick: number;
  };
}

export const VIEWED_CAP = 2000;
export const VIEWED_PREF = { files: "lens.viewedFiles", units: "lens.viewedUnits" } as const;
export const CONCERN_PREF = "lens.concernMarks";

function loadSet(key: string): Set<string> {
  try { return new Set(JSON.parse(readPref(key) || "[]")); } catch { return new Set(); }
}
function loadMarks(): Map<string, ConcernMark> {
  try { return new Map(Object.entries(JSON.parse(readPref(CONCERN_PREF) || "{}"))); } catch { return new Map(); }
}
function savedWidth(key: string, min: number, max: number, fallback: number) {
  const w = Number(readPref(key));
  return w >= min && w <= max ? w : fallback;
}

let current: LensState = {
  data: INITIAL_DATA,
  threshold: INITIAL_DATA.threshold,
  themeBusy: false,
  refreshing: false,
  ended: false,
  view: "code", // Code is always the default
  active: -1, // set at start-up (main.tsx)
  tabs: [],
  openCats: new Set(),
  foldOverrides: new Map(),
  expandedGaps: new Set(),
  showRemoved: true,
  hideTests: readPref("lens.hideTests") !== "0", // on by default
  hunksOnly: readPref("lens.hunksOnly") !== "0", // on by default
  navCollapsed: readPref("lens.navCollapsed") === "1",
  navWidth: savedWidth("lens.navWidth", 160, 600, 0),
  navQuery: "",
  closedDirs: new Set(),
  viewedFiles: loadSet(VIEWED_PREF.files),
  viewedUnits: loadSet(VIEWED_PREF.units),
  settingsOpen: false,
  keysOpen: false,
  search: { open: false, query: "", word: false, matchCase: false, pinOrigin: false, seq: 0 },
  summaryActive: null,
  summaryOverview: true,
  summaryBrowsing: false,
  summaryDot: false,
  overviewTab: readPref("lens.overviewTab") === "map" ? "map" : "flows",
  sumQuery: "",
  sumSignal: null,
  flowOpen: new Map(),
  concernMarks: loadMarks(),
  ask: {
    open: readPref("lens.askOpen") === "1",
    width: savedWidth("lens.askWidth", 280, 720, 360),
    data: { listening: false, questions: [] },
    sel: null,
    error: null,
    tick: 0,
  },
};

const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getState(): LensState { return current; }

export type Patch = Partial<LensState> | ((s: LensState) => Partial<LensState>);

export function update(patch: Patch): void {
  const changes = typeof patch === "function" ? patch(current) : patch;
  current = { ...current, ...changes };
  for (const l of listeners) l();
}

/** update(), with the DOM updated before it returns. */
export function commit(patch: Patch): void {
  flushSync(() => update(patch));
}

export function useLens(): LensState {
  return useSyncExternalStore(subscribe, getState);
}

/** A copy of the set with `key` added or removed. */
export function toggled<T>(set: ReadonlySet<T>, key: T, on?: boolean): Set<T> {
  const next = new Set(set);
  if (on ?? !next.has(key)) next.add(key); else next.delete(key);
  return next;
}
