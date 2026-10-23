import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, statSync } from "node:fs";
import { join } from "node:path";
import { currentBranch, uncheckedOutRevision } from "../git.ts";
import { parsePrRef } from "../pr.ts";
import { placedHash, type Anchor, type LineRange, type UnitKind, type UnitStatus } from "./units.ts";

// Everything summary mode writes lives in <repo root>/.lens/, which carries its
// own `*` .gitignore: nothing to add to the repo's .gitignore, nothing in .git.

export interface ChangeRow {
  when: string;
  /** null: behavior that didn't exist before */
  before: string | null;
  now: string;
  /** "N18" (new-side line) or "O16" (removed old-side line) */
  line: string;
}

export interface Break {
  summary: string;
  /** "path:line", repo-relative */
  callers: string[];
}

export type ConcernKind = "bug" | "risk" | "question";

/** Something the agent suspects is wrong — the reviewer decides whether it is. */
export interface Concern {
  kind: ConcernKind;
  text: string;
  /** "N31" (any shown new-side line, changed or not) or "O16" (removed line) */
  line: string;
}

export interface UnitSummary {
  headline: string;
  gist: string;
  /** true when the unit has a concern or a break */
  needsLook: boolean;
  changes: ChangeRow[];
  breaks: Break[];
  concerns: Concern[];
  /** id of a deleted unit this one replaces (rename / move) */
  renamedFrom?: string;
}

export interface Flow {
  title: string;
  /** e.g. "repo → route → client" */
  path: string;
  /** unit id → layer label ("repo", "route", …) */
  units: Record<string, string>;
  /** 1 = review first … 3 = mechanical; absent reads as 2 */
  priority?: FlowPriority;
  /** why the flow matters, one line */
  why?: string;
}

export type FlowPriority = 1 | 2 | 3;

/** The P3 flow for what no story needs: the agent's moves and renames, and the units lens files there itself */
export const HOUSEKEEPING = "Housekeeping";

/** Units lens files under Housekeeping without the agent: import-only and formatting-only changes. */
export function isHousekeeping(unit: { formattingOnly?: boolean; importsOnly?: boolean }): boolean {
  return !!unit.formattingOnly || !!unit.importsOnly;
}

/** What a step of a sequence did to the diagram: absent for a step the diff leaves alone */
export type StepChange = "added" | "changed" | "removed";

/** One call or message in a sequence: an arrow from one lane to another. */
export interface SequenceStep {
  from: string;
  to: string;
  /** What the arrow says now (for a removed step: what it said) */
  label: string;
  /** A changed step: what it said before */
  was?: string;
  change?: StepChange;
  /** The unit that makes the step, and its line ("N41" / "O16"); required when the step changed */
  unit?: string;
  line?: string;
}

/** A sequence diagram: what happens at run time, drawn by lens. Before is the steps but the added ones. */
export interface StoredSequence {
  title: string;
  lanes: string[];
  steps: SequenceStep[];
  /** unit id → the hash it was drawn for */
  units: Record<string, string>;
}

/** A screen the change affects, as the agent drew it: HTML files kept in the summary's assets folder. */
export interface StoredPreview {
  title: string;
  /** unit id → the hash it was drawn for */
  units: Record<string, string>;
  /** Asset file names ("<hash>.html") */
  now: string;
  before?: string;
}

export interface Overview {
  /** What the whole diff does, sized to it; paragraphs split by blank lines */
  what: string;
  /** unitSetHash of the diff it was written for; another one makes it stale */
  hash: string;
}

export type StoredUnit = UnitSummary & { hash: string; anchor: Anchor };

export interface StoredSummary {
  version: 1;
  updatedAt: string;
  /** Each summary remembers the unit hash it was written for, and where the unit was: its labels count from there */
  units: Record<string, StoredUnit>;
  flows: Flow[];
  /** createdAt of the whole-diff bundle whose submit last replaced the flows; its later submits merge */
  flowsPass?: string;
  overview?: Overview;
  previews?: StoredPreview[];
  sequences?: StoredSequence[];
  /** createdAt of the whole-diff bundle whose submit last replaced the previews and sequences */
  drawingsPass?: string;
  /** unitSetHash of the diff a whole-diff pass that asked for drawings was submitted for */
  drawn?: string;
}

/** One hash for the whole diff: any unit added, dropped, changed or moved moves it. */
export function unitSetHash(units: { id: string; hash: string; anchor: Anchor }[]): string {
  return createHash("sha256")
    .update(units.map((u) => u.id + ":" + placedHash(u)).sort().join("\n"))
    .digest("hex").slice(0, 16);
}

export interface BundleUnit {
  id: string;
  file: string;
  name: string;
  kind: UnitKind;
  status: UnitStatus;
  hash: string;
  anchor: Anchor;
  /** Lines a summary may cite: N<line> changed, O<line> removed */
  labels: string[];
  /** New-side lines shown for the unit; a concern may cite any of them */
  ranges: LineRange[];
  formattingOnly?: boolean;
  importsOnly?: boolean;
  /** Already summarized for this hash by an earlier submit, and that summary still fits (fit.ts) */
  done: boolean;
}

export interface Bundle {
  version: 1;
  key: string;
  command: "diff" | "pr";
  args: string[];
  createdAt: string;
  units: BundleUnit[];
  /** This pass sees every unit (a fresh single-part run or the final pass): its flows replace the stored ones */
  wholeDiff?: boolean;
  /** This pass asks for previews and sequences (Build previews is on) */
  drawings?: boolean;
}

/** A diff needs flows once two of its units tell a story: lens's own Housekeeping units don't. */
export function needsFlows(units: { formattingOnly?: boolean; importsOnly?: boolean }[]): boolean {
  return units.filter((unit) => !isHousekeeping(unit)).length >= 2;
}

/** Every unit of the bundle is in, but its whole-diff work isn't: the overview, the flows, or the drawings it asked for. */
export function wholeDiffLeft(bundle: Bundle, stored: StoredSummary): boolean {
  const hash = unitSetHash(bundle.units);
  const flowsMissing = stored.flows.length === 0 && needsFlows(bundle.units);
  const undrawn = !!bundle.drawings && stored.drawn !== hash;
  return stored.overview?.hash !== hash || flowsMissing || undrawn;
}

export function lensDir(root: string): string {
  const dir = join(root, ".lens");
  mkdirSync(dir, { recursive: true });
  const ignore = join(dir, ".gitignore");
  if (!existsSync(ignore)) writeFileSync(ignore, "# lens working files: never commit\n*\n");
  return dir;
}

/**
 * Readable, filesystem-safe key for a diff: "diff-staged@main", "pr-87", "diff@feature-x"
 * (worktree). A diff's key names the branch it was made on, so another branch's summary
 * of the same arguments isn't read as this one gone stale; new commits on the branch keep
 * the key, and mark only what they changed. PR keys use the number, so a URL and a bare
 * number share one.
 */
export function summaryKey(command: "diff" | "pr" | "paths", args: string[], branch: string | null = null): string {
  const ref = command === "pr" ? parsePrRef(args[0] ?? "") : null;
  const on = command !== "pr" && branch ? "@" + branch : "";
  const raw = ([command, ...(ref ? [String(ref.number)] : args)].join(" ") + on).toLowerCase();
  let slug = raw.replace(/[^a-z0-9._@]+/g, "-").replace(/^-+|-+$/g, "");
  if (slug.length > 60) {
    slug = slug.slice(0, 48).replace(/-+$/, "") + "-" + createHash("sha256").update(raw).digest("hex").slice(0, 8);
  }
  return slug;
}

/**
 * The key of a review in the repository at `root`, on the branch it's on now. Its summary, the
 * reader's marks and notes are kept under it. Paths mode has one too, with the branch as a diff
 * has, though it has no summary.
 */
export function reviewKey(root: string, command: "diff" | "pr" | "paths", args: string[]): string {
  return summaryKey(command, args, command !== "pr" ? currentBranch(root) : null);
}

/**
 * What to check out before a summary of this review can be written; null when it can be now. A
 * summary is written from the code on disk (the agent reads it, `submit` checks callers in it), so
 * a diff that ends at a branch not checked out isn't summarized. A PR is: its callers are close
 * enough from the base branch, and checking out every PR to review it would be a chore.
 */
export function checkoutFirst(cwd: string, command: "diff" | "pr", args: string[]): string | null {
  return command === "diff" ? uncheckedOutRevision(args, cwd) : null;
}

/**
 * The diff's arguments as the user types them after `/lens-review` or
 * `lens summary prepare`: "--staged", "pr 87", quoted where a shell needs it.
 */
export function summaryArgs(command: "diff" | "pr", args: string[]): string {
  return [...(command === "pr" ? ["pr"] : []), ...args]
    .map((a) => (/^[\w@%+=:,./~^-]+$/.test(a) ? a : '"' + a.replace(/(["\\$`])/g, "\\$1") + '"'))
    .join(" ");
}

export function bundleDir(root: string, key: string): string {
  const dir = join(lensDir(root), "summary", key);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Where the agent writes its preview files for this bundle, before a submit checks them */
export const PREVIEWS_DIR = "previews";
/** Where accepted preview files are kept, by content hash */
export const ASSETS_DIR = "assets";

export function summaryPath(root: string, key: string): string {
  return join(root, ".lens", "summary", key, "summary.json");
}

export function readStored(root: string, key: string): StoredSummary | null {
  const path = summaryPath(root, key);
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    if (parsed?.version !== 1 || typeof parsed.units !== "object" || parsed.units === null) return null;
    const o = parsed.overview;
    // a unit without its anchor can't place its labels
    const units = Object.fromEntries(
      Object.entries(parsed.units as Record<string, StoredUnit>).filter(
        ([, unit]) => typeof unit?.anchor?.n === "number" && typeof unit.anchor.o === "number",
      ),
    );
    return {
      ...parsed,
      units,
      flows: Array.isArray(parsed.flows) ? parsed.flows : [],
      overview: typeof o?.what === "string" && typeof o?.hash === "string" ? o : undefined,
    } as StoredSummary;
  } catch {
    return null;
  }
}

export function writeStored(root: string, key: string, stored: StoredSummary): void {
  bundleDir(root, key);
  // write-then-rename: a viewer reading mid-submit never sees half a file
  const path = summaryPath(root, key);
  writeFileSync(path + ".tmp", JSON.stringify(stored, null, 2) + "\n");
  renameSync(path + ".tmp", path);
}

/** mtime of summary.json, so the viewer can notice a new submit. */
export function summaryStamp(root: string, key: string): number | null {
  const path = summaryPath(root, key);
  return existsSync(path) ? statSync(path).mtimeMs : null;
}
