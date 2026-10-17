import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, statSync } from "node:fs";
import { join } from "node:path";
import { currentBranch } from "../git.ts";
import { parsePrRef } from "../pr.ts";
import type { LineRange, UnitKind, UnitStatus } from "./units.ts";

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
  /** true when the unit has a concern or a break. Older summaries: the agent's own unexplained flag */
  needsLook: boolean;
  changes: ChangeRow[];
  breaks: Break[];
  /** absent in summaries written before concerns existed */
  concerns?: Concern[];
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

export interface Overview {
  /** What the whole diff does, sized to it; paragraphs split by blank lines */
  what: string;
  /** unitSetHash of the diff it was written for; another one makes it stale */
  hash: string;
}

export interface StoredSummary {
  version: 1;
  updatedAt: string;
  /** Each summary remembers the unit hash it was written for */
  units: Record<string, UnitSummary & { hash: string }>;
  flows: Flow[];
  /** createdAt of the whole-diff bundle whose submit last replaced the flows; its later submits merge */
  flowsPass?: string;
  overview?: Overview;
}

/** One hash for the whole diff: any unit added, dropped or changed moves it. */
export function unitSetHash(units: { id: string; hash: string }[]): string {
  return createHash("sha256")
    .update(units.map((u) => u.id + ":" + u.hash).sort().join("\n"))
    .digest("hex").slice(0, 16);
}

export interface BundleUnit {
  id: string;
  file: string;
  name: string;
  kind: UnitKind;
  status: UnitStatus;
  hash: string;
  /** Lines a summary may cite: N<line> changed, O<line> removed */
  labels: string[];
  /** New-side lines shown for the unit; a concern may cite any of them. Absent in older bundles */
  ranges?: LineRange[];
  formattingOnly?: boolean;
  /** Already summarized for this exact hash by an earlier submit */
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
export function summaryKey(command: "diff" | "pr", args: string[], branch: string | null = null): string {
  const ref = command === "pr" ? parsePrRef(args[0] ?? "") : null;
  const on = command === "diff" && branch ? "@" + branch : "";
  const raw = ([command, ...(ref ? [String(ref.number)] : args)].join(" ") + on).toLowerCase();
  let slug = raw.replace(/[^a-z0-9._@]+/g, "-").replace(/^-+|-+$/g, "");
  if (slug.length > 60) {
    slug = slug.slice(0, 48).replace(/-+$/, "") + "-" + createHash("sha256").update(raw).digest("hex").slice(0, 8);
  }
  return slug;
}

/** The key of a review in the repository at `root`, on the branch it's on now. */
export function reviewKey(root: string, command: "diff" | "pr", args: string[]): string {
  return summaryKey(command, args, command === "diff" ? currentBranch(root) : null);
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
    return {
      ...parsed,
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
