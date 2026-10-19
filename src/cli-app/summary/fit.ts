import { resolveLineRef } from "../paths.ts";
import type { StoredUnit, UnitSummary } from "./store.ts";
import type { Anchor, LineRange } from "./units.ts";

// Whether a stored unit summary still fits the unit as it is now, and with which labels. A unit's
// hash counts lines from its anchor, so one that only moved (lines added or removed above it)
// keeps its hash, and its summary: every N…/O… label moves by as much as the unit did, and the
// same text sits under it, since the hash covers each shown and removed line.

/** What fitting needs of a unit: a BundleUnit, or a Unit with its citeable labels */
export interface FitUnit {
  kind: string;
  name: string;
  hash: string;
  anchor: Anchor;
  /** Lines a summary may cite: N<line> changed, O<line> removed */
  labels: readonly string[];
  /** New-side lines shown for the unit */
  ranges: LineRange[];
}

/** A label written when the unit started at `from`, for the unit starting at `to`. */
export function moveLabel(label: string, from: Anchor, to: Anchor): string {
  const line = Number(label.slice(1));
  return label.startsWith("O") ? `O${line - from.o + to.o}` : `N${line - from.n + to.n}`;
}

/**
 * The stored summary over the unit as it is now, its labels moved with the unit; null when it was
 * written for other code, or anything in it no longer checks out (then the unit is summarized again).
 */
export function fitStored(
  stored: StoredUnit | undefined,
  unit: FitUnit,
  root: string,
  fileCache: Map<string, string[] | null>,
): UnitSummary | null {
  if (!stored || stored.hash !== unit.hash) return null;
  const { hash: _hash, anchor, ...summary } = stored;
  const move = (label: string) => moveLabel(label, anchor, unit.anchor);
  const changes = summary.changes.map((change) => ({ ...change, line: move(change.line) }));
  const concerns = summary.concerns.map((concern) => ({ ...concern, line: move(concern.line) }));
  // never fires while the hash covers what it should: if it does, summarize again rather than point elsewhere
  if (changes.some((change) => !unit.labels.includes(change.line))) return null;
  if (concerns.some((concern) => !isShownLine(unit, concern.line))) return null;
  // a caller is a line of another file, which may have changed since: it must still mention the unit
  if (summary.breaks.some((b) => b.callers.some((caller) => checkCaller(caller, unit, root, fileCache) !== null))) return null;
  return { ...summary, changes, concerns };
}

/** Any line the viewer shows for the unit — changed, removed, or unchanged context. */
export function isShownLine(unit: Pick<FitUnit, "labels" | "ranges">, label: string): boolean {
  if (unit.labels.includes(label)) return true;
  const m = /^N(\d+)$/.exec(label);
  if (!m) return false;
  const n = Number(m[1]);
  return unit.ranges.some((r) => n >= r.start && n <= r.end);
}

/** null when the caller reference is valid, else why not. */
export function checkCaller(
  c: unknown,
  unit: Pick<FitUnit, "kind" | "name">,
  root: string,
  fileCache: Map<string, string[] | null>,
): string | null {
  if (typeof c !== "string") return "must be a \"path:line\" string";
  const ref = resolveLineRef(root, c, fileCache);
  if ("error" in ref) return ref.error;
  const name = callerName(unit);
  if (name && !new RegExp(`(^|[^\\w$])${name.replace(/[$]/g, "\\$")}([^\\w$]|$)`).test(ref.text)) {
    return `— that line doesn't mention ${name}`;
  }
  return null;
}

/** The name a caller's line must mention; null for units without one (a call, a statement, a module) */
export function callerName(unit: Pick<FitUnit, "kind" | "name">): string | null {
  if (["call", "statement", "module", "file"].includes(unit.kind) || unit.name === "default") return null;
  const bare = unit.name.split(".").pop() ?? unit.name;
  return /^[\w$#]+$/.test(bare) ? bare.replace(/^#/, "") : null;
}
