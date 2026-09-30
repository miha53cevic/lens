import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, statSync } from "node:fs";
import { join } from "node:path";
import { parsePrRef } from "../pr.ts";
import type { UnitKind, UnitStatus } from "./units.ts";

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

export interface UnitSummary {
  headline: string;
  gist: string;
  needsLook: boolean;
  changes: ChangeRow[];
  breaks: Break[];
  /** id of a deleted unit this one replaces (rename / move) */
  renamedFrom?: string;
}

export interface Flow {
  title: string;
  /** e.g. "repo → route → client" */
  path: string;
  /** unit id → layer label ("repo", "route", …) */
  units: Record<string, string>;
}

export interface StoredSummary {
  version: 1;
  updatedAt: string;
  /** Each summary remembers the unit hash it was written for */
  units: Record<string, UnitSummary & { hash: string }>;
  flows: Flow[];
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
}

export function lensDir(root: string): string {
  const dir = join(root, ".lens");
  mkdirSync(dir, { recursive: true });
  const ignore = join(dir, ".gitignore");
  if (!existsSync(ignore)) writeFileSync(ignore, "# lens working files: never commit\n*\n");
  return dir;
}

/**
 * Readable, filesystem-safe key for a diff: "diff-staged", "pr-87", "diff"
 * (worktree). PR keys use the number, so a URL and a bare number share one.
 */
export function summaryKey(command: "diff" | "pr", args: string[]): string {
  const ref = command === "pr" ? parsePrRef(args[0] ?? "") : null;
  const raw = [command, ...(ref ? [String(ref.number)] : args)].join(" ").toLowerCase();
  let slug = raw.replace(/[^a-z0-9._]+/g, "-").replace(/^-+|-+$/g, "");
  if (slug.length > 60) {
    slug = slug.slice(0, 48).replace(/-+$/, "") + "-" + createHash("sha256").update(raw).digest("hex").slice(0, 8);
  }
  return slug;
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
    return { ...parsed, flows: Array.isArray(parsed.flows) ? parsed.flows : [] } as StoredSummary;
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
