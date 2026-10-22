// The viewer's state: one immutable object in a Zustand store, replaced on every change.
// Components subscribe to the slice they show with useLens(selector). Actions (actions/)
// change it with update(), or commit() when the DOM must show the new state right away
// (to scroll to a row, say). State only one component uses stays in that component (useState).

import { flushSync } from 'react-dom';
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { createStore } from 'zustand/vanilla';
import type { ClearInfoResponse, ViewerPayload } from '../cli-app/render/web/server.ts';
import type { AskSelection, AskState } from '../cli-app/ask/session.ts';
import type { BuildProgress } from '../cli-app/summary/progress.ts';
import type { ConcernKind } from '../cli-app/summary/store.ts';
import type { ReaderNote } from '../cli-app/notes/store.ts';
import { INITIAL_DATA, readPref } from './shared.ts';
import { CODE_SIZE_DEFAULT, savedCodeSize } from './codeSize.ts';

export type View = 'code' | 'summary';
export type ConcernMark = 'real' | 'dismissed';
export type SignalId = ConcernKind | 'breaks';
/** What the list's chips filter by: a signal, any of them, or the concerns the reader dismissed */
export type SignalFilter = SignalId | 'any' | 'dismissed' | null;

/** An open editor tab. At most one is unpinned: the "preview" tab, reused by the next single-click open. */
export interface Tab {
  index: number;
  pinned: boolean;
}

/**
 * The reader's kept code selection, tied to the change it was made in. Side by side, `half` is the
 * column it was made in, so only that column shows it (the viewer's own: the question doesn't carry it).
 */
export type KeptSelection = AskSelection & { key: string; half?: 'left' | 'right' };

/** A note being written under its lines (actions/notes.ts): where it goes, and the note it edits, if any. */
export type NoteDraft = Pick<ReaderNote, 'file' | 'side' | 'start' | 'end' | 'lines'> & {
  /** The row it's written under ("N12", "O5") */
  label: string;
  editing: ReaderNote | null;
};

/** A slow action under way (actions/status.ts). */
export interface Activity {
  /** What it is: 'theme', 'refresh' … */
  id: string;
  /** What the status bar says while it runs */
  label: string;
  /** It has run long enough for the bar to say so */
  shown: boolean;
}

/** What the last action left for the status bar: a failure stays, a done note goes by itself. */
export interface StatusNotice {
  kind: 'failed' | 'done';
  label: string;
  detail?: string;
}

export interface LensState {
  data: ViewerPayload;
  /** The fold level: regions scored at or below it fold. The reader's choice survives a refresh and a reopen. */
  threshold: number;
  /** The slow actions under way, newest last: the status bar's "working", and what their controls wait for (isBusy) */
  activities: readonly Activity[];
  notice: StatusNotice | null;
  /** A request didn't reach the server: it has stopped */
  serverGone: boolean;
  /** ⏻ end: the server stopped */
  ended: boolean;
  view: View;
  /** The open file's index, -1 for none */
  active: number;
  tabs: Tab[];
  /** Categories toggled to "show" (their regions open) */
  openCats: ReadonlySet<string>;
  /** Regions the reader opened or closed one by one (regionKey in model/plans.ts); overrides openCats */
  foldOverrides: ReadonlyMap<string, boolean>;
  /** Hidden stretches the reader expanded: "path:start" (code view), "unit:<id>:start" (summary) */
  expandedGaps: ReadonlySet<string>;
  showRemoved: boolean;
  hideTests: boolean;
  hunksOnly: boolean;
  /** The Summary tab shows each unit inside its whole file */
  fullUnits: boolean;
  /** Mark the words a replaced line changed (wordDiff.ts) */
  wordDiff: boolean;
  /** Diffs show old and new side by side (isSplit in model/plans.ts: a diff only) */
  sideBySide: boolean;
  /** The code's size in px, one of CODE_SIZES (codeSize.ts) */
  codeSize: number;
  navCollapsed: boolean;
  navWidth: number;
  /** The tree filter's text (transient) */
  navQuery: string;
  closedDirs: ReadonlySet<string>;
  viewedFiles: ReadonlySet<string>;
  viewedUnits: ReadonlySet<string>;
  /** The search palette (⌘P). The <dialog> itself knows whether it's open. */
  search: { query: string; word: boolean; matchCase: boolean; pinOrigin: boolean; selected: number };
  // Summary tab
  /** The open unit's id; null: the overview (the tab opens there) */
  summaryUnit: string | null;
  /** A newer summary waits on the server */
  summaryDot: boolean;
  /** The change on disk isn't the one this page shows anymore, as the last stamp poll found it (a refresh takes it) */
  changedOnDisk: boolean;
  /** The agent's summary run, as the last stamp poll found it; null: none is going */
  summaryBuild: BuildProgress | null;
  /** Asking the server for a newer summary: the overview holds off on "not written yet" until it knows */
  summaryChecking: boolean;
  /** The list filter's text (transient) */
  sumQuery: string;
  sumSignal: SignalFilter;
  /** Flow title -> open, once the reader toggled it */
  flowOpen: ReadonlyMap<string, boolean>;
  concernMarks: ReadonlyMap<string, ConcernMark>;
  /** The reader's notes on the review's files, as the server keeps them (.lens/notes.json) */
  notes: readonly ReaderNote[];
  noteDraft: NoteDraft | null;
  /** Where the last jump landed: that row stays marked until the next jump */
  landed: { path: string; label: string } | null;
  /** What the Clear saved data dialog offers, read when it opened; `opened` tells one opening from the next */
  clearInfo: (ClearInfoResponse & { opened: number }) | null;
  // Ask rail
  ask: {
    open: boolean;
    width: number;
    data: AskState;
    selection: KeptSelection | null;
    /** The last send failed (or the server is gone): shown until the reader types again */
    error: string | null;
    /** Bumped by every poll, so "waiting for agent · 6s" ticks */
    tick: number;
  };
}

export const VIEWED_CAP = 2000;
export const VIEWED_PREF = { files: 'lens.viewedFiles', units: 'lens.viewedUnits' } as const;
export const CONCERN_PREF = 'lens.concernMarks';
/** The fold level the reader picked, with the one it was picked over: `{ level, base }` */
export const THRESHOLD_PREF = 'lens.threshold';

function loadSet(key: string): Set<string> {
  try {
    return new Set(JSON.parse(readPref(key) || '[]'));
  } catch {
    return new Set();
  }
}

function loadMarks(): Map<string, ConcernMark> {
  try {
    return new Map(Object.entries(JSON.parse(readPref(CONCERN_PREF) || '{}')));
  } catch {
    return new Map();
  }
}

/** The reader's fold level, while the config's (or --threshold's) is still the one they picked it over. */
function loadThreshold(): number {
  const base = INITIAL_DATA.threshold;
  try {
    const saved = JSON.parse(readPref(THRESHOLD_PREF) || 'null');
    return saved?.base === base && Number.isInteger(saved.level) && saved.level >= -1 && saved.level <= 3
      ? saved.level
      : base;
  } catch {
    return base;
  }
}

function loadCodeSize(): number {
  try {
    return savedCodeSize(document.cookie);
  } catch {
    return CODE_SIZE_DEFAULT;
  }
}

function savedWidth(key: string, min: number, max: number, fallback: number) {
  const width = Number(readPref(key));
  return width >= min && width <= max ? width : fallback;
}

const initialState: LensState = {
  data: INITIAL_DATA,
  threshold: loadThreshold(),
  activities: [],
  notice: null,
  serverGone: false,
  ended: false,
  view: 'code', // Code is always the default
  active: -1, // set at start-up (main.tsx)
  tabs: [],
  openCats: new Set(),
  foldOverrides: new Map(),
  expandedGaps: new Set(),
  showRemoved: true,
  hideTests: readPref('lens.hideTests') !== '0', // on by default
  hunksOnly: readPref('lens.hunksOnly') !== '0', // on by default
  fullUnits: readPref('lens.fullUnits') === '1', // off by default
  wordDiff: readPref('lens.wordDiff') === '1', // off by default
  sideBySide: readPref('lens.sideBySide') === '1', // off by default
  codeSize: loadCodeSize(),
  navCollapsed: readPref('lens.navCollapsed') === '1',
  navWidth: savedWidth('lens.navWidth', 160, 600, 0),
  navQuery: '',
  closedDirs: new Set(),
  viewedFiles: loadSet(VIEWED_PREF.files),
  viewedUnits: loadSet(VIEWED_PREF.units),
  search: { query: '', word: false, matchCase: false, pinOrigin: false, selected: 0 },
  summaryUnit: null,
  summaryDot: false,
  changedOnDisk: false,
  summaryBuild: null,
  summaryChecking: false,
  sumQuery: '',
  sumSignal: null,
  flowOpen: new Map(),
  concernMarks: loadMarks(),
  notes: INITIAL_DATA.notes,
  noteDraft: null,
  landed: null,
  clearInfo: null,
  ask: {
    open: readPref('lens.askOpen') === '1',
    width: savedWidth('lens.askWidth', 280, 720, 360),
    data: { listening: false, questions: [] },
    selection: null,
    error: null,
    tick: 0,
  },
};

const useStore = create<LensState>()(() => initialState);

export function getState(): LensState {
  return useStore.getState();
}

/** Calls the listener on every change, with the state before it (main.tsx syncs the document this way). */
export const subscribe = useStore.subscribe;

export type Patch = Partial<LensState> | ((state: LensState) => Partial<LensState>);

export function update(patch: Patch): void {
  useStore.setState(patch);
}

/** update(), with the DOM updated before it returns. */
export function commit(patch: Patch): void {
  flushSync(() => update(patch));
}

/**
 * The slice of the state a component shows: it re-renders when that changes, compared
 * shallowly, so a selector can return an object or array of state values. A selector must
 * not build new values itself (`new Set(...)`, `.map(...)`) — use a memoized model/ function.
 */
export function useLens<T>(select: (state: LensState) => T): T {
  return useStore(useShallow(select));
}

/**
 * Scroll positions: they change on every scroll, so they live apart from LensState and
 * re-render nothing. Read and written with getState / setState, never subscribed to.
 */
export const scrollStore = createStore<{
  /** Each file's reading position, by path: it survives a tab switch and a refresh */
  files: Readonly<Record<string, { top: number; left: number }>>;
  /** The sidebar's scroll per view: the tree and the summary list share one scroller */
  nav: Readonly<Record<View, number>>;
}>()(() => ({ files: {}, nav: { code: 0, summary: 0 } }));

/** A copy of the set with `key` added or removed. */
export function toggled<T>(set: ReadonlySet<T>, key: T, on?: boolean): Set<T> {
  const next = new Set(set);
  if (on ?? !next.has(key)) next.add(key);
  else next.delete(key);
  return next;
}
