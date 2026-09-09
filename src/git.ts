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
  /** New-side blob SHA; absent when the new side is the working tree (read from disk) */
  newBlob?: string;
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
 * Parses `git diff --raw -z --no-abbrev` output into new-side path → blob SHA.
 * Entries whose new side is the working tree (all-zero SHA) or a submodule
 * commit (mode 160000) are omitted — those have no blob to read.
 */
export function parseRawShas(output: string): Map<string, string> {
  const shas = new Map<string, string>();
  const tokens = output.split("\0");
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    // "::" entries are merge diffs; other non-":" tokens are pass-through
    // noise from user flags (e.g. --stat text) and never look like records.
    if (!token.startsWith(":") || token.startsWith("::")) continue;
    const fields = token.slice(1).split(" ");
    if (fields.length < 5) continue;
    const [, dstMode, , dstSha, status] = fields;
    const pathCount = status.startsWith("R") || status.startsWith("C") ? 2 : 1;
    const path = tokens[i + pathCount]; // renames/copies: the NEW path is the second one
    i += pathCount;
    if (path && !/^0+$/.test(dstSha) && dstMode !== "160000") {
      shas.set(path, dstSha);
    }
  }
  return shas;
}

function runGit(args: string[], cwd: string): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

/** Reads a blob's content from git's object store. */
export function readBlob(sha: string, cwd: string): string {
  return runGit(["cat-file", "blob", sha], cwd);
}

/**
 * Runs `git diff --unified=0` with the given passthrough args and returns the
 * supported changed files (with status and line numbers) plus deleted files.
 */
export function gitDiffTargets(gitArgs: string[], cwd: string): DiffResult {
  const root = runGit(["rev-parse", "--show-toplevel"], cwd).trim();
  const output = runGit(["diff", "--unified=0", "--no-color", ...gitArgs], cwd);
  // Second pass for new-side blob SHAs, so ref-to-ref diffs (qa...feature)
  // read content from git instead of the working tree — which may hold the
  // OLD side, or not hold added files at all.
  const raw = runGit(["diff", "--raw", "-z", "--no-abbrev", "--no-color", ...gitArgs], cwd);
  const parsed = parseDiff(output);
  const newBlobs = parseRawShas(raw);
  const abs = (p: string) => (isAbsolute(p) ? p : join(root, p));
  // Unsupported file types are kept — the viewer shows their changes without
  // folding. Binary files never reach here: their diffs carry no hunks.
  return {
    targets: parsed.files
      .map((f) => ({
        file: abs(f.path),
        changedLines: f.changedLines,
        status: f.status,
        removals: f.removals,
        newBlob: newBlobs.get(f.path),
      }))
      // No blob means the new side is the working tree; a file gone from disk
      // too has nothing to show (e.g. deleted since the diff was staged).
      .filter((t) => t.newBlob !== undefined || existsSync(t.file)),
    deleted: parsed.deleted.map(abs),
    renamed: parsed.renamed.map((r) => ({ from: abs(r.from), to: abs(r.to) })),
  };
}
