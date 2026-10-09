// What every part of the viewer shares: the payload, reader preferences, the view state.

import type { ViewerPayload } from "../server.ts";

export type ViewFile = ViewerPayload["files"][number];

/** The server's payload, injected into the page as JSON (see server.ts). Refresh and theme switches update it in place. */
export const DATA: ViewerPayload = JSON.parse(document.getElementById("lens-data")!.textContent!);

/** An element of viewer.html by id. */
export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

// Quotes too: the result also goes into attributes (data-id="…", title="…").
export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Tokens come pre-computed from the backend (Shiki): per line, [text, color] pairs.
export function linesFromTokens(file: ViewFile): string[] {
  if (Array.isArray(file.tokens) && file.tokens.length > 0) {
    return file.tokens.map((line) =>
      line.map(([text, color]) =>
        color
          ? '<span style="color:' + color + '">' + escapeHtml(text) + "</span>"
          : escapeHtml(text),
      ).join(""),
    );
  }
  return file.source.split("\n").map(escapeHtml);
}

const CAT_COLORS: Record<string, string> = {
  "import": "#6ea8fe",
  "comment": "#9099ab",
  "guard": "#e9b04d",
  "logging": "#b585f0",
  "telemetry": "#4dd4c6",
  "error-boilerplate": "#f0716e",
  "accessor": "#7bd88f",
  "barrel": "#f28fd0",
  "data": "#e0995a",
};
export function catColor(cat: string): string { return CAT_COLORS[cat] || "#e9b04d"; }

// Reader preferences persist per browser via localStorage.
export function readPref(key: string): string | null { try { return localStorage.getItem(key); } catch { return null; } }
export function writePref(key: string, value: string | number): void { try { localStorage.setItem(key, String(value)); } catch {} }

export interface Tab { index: number; pinned: boolean }

export const state = {
  active: -1, // set at start-up by openFirstTreeFile
  // Open editor tabs, vscode-style: at most one is unpinned — the "preview"
  // tab, reused by the next single-click open. Double-click pins.
  tabs: [] as Tab[],
  hiddenCategories: new Set<string>(), // categories toggled to "show" (i.e. not folded)
  showRemoved: true,
  view: "code" as "code" | "summary", // Code is always the default
  // reader preferences (the persisted ones are restored from localStorage)
  navCollapsed: readPref("lens.navCollapsed") === "1",
  hideTests: readPref("lens.hideTests") !== "0", // on by default
  hunksOnly: readPref("lens.hunksOnly") !== "0", // on by default
  navFilter: "", // sidebar filter query (transient, not persisted)
  summaryActive: null as string | null, // the Summary view's open unit id
  summaryOverview: true, // the Summary view shows the overview instead (it opens there)
  overviewTab: (readPref("lens.overviewTab") === "map" ? "map" : "flows") as "flows" | "map", // its lower half
};

export const expandedGaps = new Set<string>(); // "path:gapStart" — gaps the reviewer opened

// ---- viewed marks ----
// What the reader ticked as viewed, per browser. Keyed by content, so a file
// or unit that changes after it was ticked comes back unticked.
export const VIEWED_CAP = 2000;
type ViewedKind = "files" | "units";
const VIEWED_PREF: Record<ViewedKind, string> = { files: "lens.viewedFiles", units: "lens.viewedUnits" };
function loadViewed(kind: ViewedKind): Set<string> {
  try { return new Set(JSON.parse(readPref(VIEWED_PREF[kind]) || "[]")); } catch { return new Set(); }
}
export const viewed: Record<ViewedKind, Set<string>> = { files: loadViewed("files"), units: loadViewed("units") };
export function toggleViewed(kind: ViewedKind, key: string): void {
  const set = viewed[kind];
  if (!set.delete(key)) set.add(key);
  // Sets keep insertion order: the oldest marks drop first
  writePref(VIEWED_PREF[kind], JSON.stringify([...set].slice(-VIEWED_CAP)));
}

// The tick box in tree and summary list rows: a span, since the rows are buttons.
export function viewedBoxHtml(on: boolean, title: string): string {
  return '<span class="viewed-box" role="checkbox" aria-checked="' + on + '" title="' + title + '"></span>';
}

// Glob-ish test-file matcher: "*" = within a path segment, "**" = across
// segments; patterns match anywhere in the path ("*.spec.*", "__tests__/**").
const testRegexes = (DATA.testFilePatterns || []).map((pattern) => {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  const body = escaped.split("**").map((part) => part.replaceAll("*", "[^/]*")).join(".*");
  return new RegExp("(^|/)" + body + "$");
});
export function isTestFile(path: string): boolean {
  return testRegexes.some((r) => r.test(path));
}

export function visibleFile(path: string): boolean {
  return !(state.hideTests && isTestFile(path));
}

/** Lines of context around each change in hunks-only mode (code view and summary) */
export const HUNK_CONTEXT = 3;
