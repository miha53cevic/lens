import { execFileSync } from "node:child_process";
import { isAbsolute, join } from "node:path";
import { existsSync } from "node:fs";
import type { RemovedBlock } from "./model.ts";

export type DiffStatus = "added" | "modified";

export interface DiffTarget {
  /** Absolute path to the new-side file */
  file: string;
  /** New-side line numbers touched by the diff */
  changedLines: number[];
  status: DiffStatus;
  removals: RemovedBlock[];
}

export interface RenamedFile {
  from: string;
  to: string;
}

export interface DiffResult {
  targets: DiffTarget[];
  /** Repo-relative paths of supported files removed by the diff */
  deleted: string[];
  /** Pure renames (100% similarity) — no content to analyze, but worth listing */
  renamed: RenamedFile[];
}

export interface ParsedDiffFile {
  path: string;
  status: DiffStatus;
  changedLines: number[];
  removals: RemovedBlock[];
}

export interface ParsedDiff {
  files: ParsedDiffFile[];
  deleted: string[];
  renamed: RenamedFile[];
}

/** Parses `git diff --unified=0` output into per-file statuses and new-side line numbers. */
export function parseDiff(output: string): ParsedDiff {
  const files: ParsedDiffFile[] = [];
  const deleted: string[] = [];
  const renamed: RenamedFile[] = [];
  let minus: string | null = null;
  let current: ParsedDiffFile | null = null;
  let hunkRemoval: RemovedBlock | null = null;
  const strip = (p: string) => (p.startsWith("a/") || p.startsWith("b/") ? p.slice(2) : p);

  // A pure rename block has "rename from/to" lines and NO +++ header; a rename
  // with edits reaches +++ and is captured as a modified file instead.
  let pendingRename: { from?: string; to?: string } | null = null;
  const flushRename = () => {
    if (pendingRename?.from && pendingRename.to) {
      renamed.push({ from: pendingRename.from, to: pendingRename.to });
    }
    pendingRename = null;
  };

  // Header checks require the a/-b/ prefix (or /dev/null) so removed source
  // lines that happen to start with "--" are never mistaken for headers.
  const isMinusHeader = (l: string) => l.startsWith("--- a/") || l.startsWith("--- /dev/null");
  const isPlusHeader = (l: string) => l.startsWith("+++ b/") || l.startsWith("+++ /dev/null");

  for (const line of output.split("\n")) {
    if (line.startsWith("diff --git ")) {
      flushRename();
    } else if (line.startsWith("rename from ")) {
      (pendingRename ??= {}).from = line.slice("rename from ".length);
    } else if (line.startsWith("rename to ")) {
      (pendingRename ??= {}).to = line.slice("rename to ".length);
    } else if (isMinusHeader(line)) {
      minus = line.slice(4).trim();
      hunkRemoval = null;
    } else if (isPlusHeader(line)) {
      pendingRename = null; // rename with edits — shows as a modified file
      const plus = line.slice(4).trim();
      if (plus === "/dev/null") {
        if (minus && minus !== "/dev/null") deleted.push(strip(minus));
        current = null;
      } else {
        current = {
          path: strip(plus),
          status: minus === "/dev/null" ? "added" : "modified",
          changedLines: [],
          removals: [],
        };
        files.push(current);
      }
      minus = null;
      hunkRemoval = null;
    } else if (current && line.startsWith("@@")) {
      const match = /\+(\d+)(?:,(\d+))?/.exec(line);
      if (!match) continue;
      const start = Number(match[1]);
      const count = match[2] === undefined ? 1 : Number(match[2]);
      for (let l = start; l < start + count; l++) current.changedLines.push(l);
      // Where removed lines anchor on the new side: a pure deletion's `start`
      // is the line BEFORE the gap; a replacement's removed lines sit before
      // its added lines.
      hunkRemoval = { afterLine: count === 0 ? start : start - 1, lines: [] };
    } else if (current && hunkRemoval && line.startsWith("-")) {
      hunkRemoval.lines.push(line.slice(1));
      if (hunkRemoval.lines.length === 1) current.removals.push(hunkRemoval);
    }
  }
  flushRename();
  return { files, deleted, renamed };
}

/**
 * Runs `git diff --unified=0` with the given passthrough args and returns the
 * supported changed files (with status and line numbers) plus deleted files.
 */
export function gitDiffTargets(gitArgs: string[], cwd: string): DiffResult {
  const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8" }).trim();
  const output = execFileSync(
    "git",
    ["diff", "--unified=0", "--no-color", ...gitArgs],
    { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  const parsed = parseDiff(output);
  const abs = (p: string) => (isAbsolute(p) ? p : join(root, p));
  // Unsupported file types are kept — the viewer shows their changes without
  // folding. Binary files never reach here: their diffs carry no hunks.
  return {
    targets: parsed.files
      .map((f) => ({ file: abs(f.path), changedLines: f.changedLines, status: f.status, removals: f.removals }))
      .filter((t) => existsSync(t.file)),
    deleted: parsed.deleted.map(abs),
    renamed: parsed.renamed.map((r) => ({ from: abs(r.from), to: abs(r.to) })),
  };
}
