import { execFileSync } from "node:child_process";
import { isAbsolute, join } from "node:path";
import { existsSync, statSync } from "node:fs";
import type { DiffStatus, RemovedBlock } from "./model.ts";
import { toPosix } from "./paths.ts";

export interface DiffTarget {
  /** Absolute path to the new-side file */
  file: string;
  /** New-side line numbers touched by the diff */
  changedLines: number[];
  status: DiffStatus;
  removals: RemovedBlock[];
  /** New-side blob SHA; absent when the new side is the working tree (read from disk) */
  newBlob?: string;
  /** Old-side blob SHA; absent for added files */
  oldBlob?: string;
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
  /** Old-side blob SHAs of deleted files, keyed by absolute path */
  deletedBlobs: Map<string, string>;
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
      current = null; // a header this parser can't read must not inherit the previous file's hunks
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
      // "@@ -a,b +c,d @@", or "@@@ -a,b -c,d +e,f @@@" for combined (merge-conflict) diffs
      const match = /^@@+ -(\d+)(?:,\d+)?(?: -\d+(?:,\d+)?)* \+(\d+)(?:,(\d+))?/.exec(line);
      if (!match) continue;
      const oldStart = Number(match[1]);
      const start = Number(match[2]);
      const count = match[3] === undefined ? 1 : Number(match[3]);
      for (let l = start; l < start + count; l++) current.changedLines.push(l);
      // Where removed lines anchor on the new side: a pure deletion's `start`
      // is the line BEFORE the gap; a replacement's removed lines sit before
      // its added lines.
      hunkRemoval = { afterLine: count === 0 ? start : start - 1, oldStart, lines: [] };
    } else if (current && hunkRemoval && line.startsWith("-")) {
      hunkRemoval.lines.push(line.slice(1));
      if (hunkRemoval.lines.length === 1) current.removals.push(hunkRemoval);
    }
  }
  flushRename();
  return { files, deleted, renamed };
}

export interface RawEntry {
  /** New-side path (the old path for deletions) */
  path: string;
  /** Old-side blob SHA, null for added files and submodules */
  oldSha: string | null;
  /** New-side blob SHA, null for the working tree, deletions and submodules */
  newSha: string | null;
  status: string;
}

/** Parses `git diff --raw -z --no-abbrev` output into one entry per changed path. */
export function parseRawEntries(output: string): RawEntry[] {
  const entries: RawEntry[] = [];
  const tokens = output.split("\0");
  const blob = (sha: string, mode: string) => (/^0+$/.test(sha) || mode === "160000" ? null : sha);
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    // "::" entries are merge diffs; other non-":" tokens are pass-through
    // noise from user flags (e.g. --stat text) and never look like records.
    if (!token.startsWith(":") || token.startsWith("::")) continue;
    const fields = token.slice(1).split(" ");
    if (fields.length < 5) continue;
    const [srcMode, dstMode, srcSha, dstSha, status] = fields;
    const pathCount = status.startsWith("R") || status.startsWith("C") ? 2 : 1;
    const path = tokens[i + pathCount]; // renames/copies: the NEW path is the second one
    i += pathCount;
    if (path) entries.push({ path, oldSha: blob(srcSha, srcMode), newSha: blob(dstSha, dstMode), status });
  }
  return entries;
}

export function runGit(args: string[], cwd: string): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

/** How many bytes of blob content one `git cat-file --batch` is asked for; a bigger blob goes alone. */
const BLOB_CHUNK_BYTES = 32 * 1024 * 1024;

/**
 * Reads blobs' contents from git's object store, by SHA. One git process per chunk of
 * blobs instead of one per blob: a spawn costs ~15 ms on Windows, which is seconds on a
 * big diff. Nothing is cached, and a blob that doesn't come back whole is an error,
 * never an empty file.
 */
export function readBlobs(shas: Iterable<string>, cwd: string): Map<string, string> {
  const wanted = [...new Set(shas)];
  const contents = new Map<string, string>();
  if (wanted.length === 0) return contents;
  for (const sha of wanted) {
    // the SHAs are fed to git on stdin, a line each
    if (!/^[0-9a-f]{40,64}$/.test(sha)) throw new Error(`not a blob SHA: "${sha}"`);
  }
  const batch = (mode: "--batch-check" | "--batch", names: string[], maxBuffer: number): Buffer =>
    execFileSync("git", ["cat-file", mode], { cwd, input: names.join("\n") + "\n", maxBuffer });

  // the sizes first, so each chunk's output is bounded and known
  const sizes = new Map<string, number>();
  const checked = batch("--batch-check", wanted, 64 * 1024 * 1024).toString("utf8").split("\n");
  wanted.forEach((sha, index) => {
    const [name, type, size] = (checked[index] ?? "").split(" ");
    if (name !== sha || type !== "blob" || !/^\d+$/.test(size ?? "")) {
      throw new Error(`git has no blob ${sha} (cat-file answered "${checked[index] ?? ""}")`);
    }
    sizes.set(sha, Number(size));
  });

  const readChunk = (chunk: string[], bytes: number) => {
    // each blob comes as "<sha> blob <size>\n", its content, "\n"
    const output = batch("--batch", chunk, bytes + chunk.length * 128 + 1024);
    let offset = 0;
    for (const sha of chunk) {
      const size = sizes.get(sha)!;
      const headerEnd = output.indexOf(10, offset);
      const header = headerEnd === -1 ? "" : output.toString("utf8", offset, headerEnd);
      const end = headerEnd + 1 + size;
      if (header !== `${sha} blob ${size}` || end >= output.length || output[end] !== 10) {
        throw new Error(`git cat-file returned blob ${sha} incomplete`);
      }
      contents.set(sha, output.toString("utf8", headerEnd + 1, end));
      offset = end + 1;
    }
    if (offset !== output.length) throw new Error("git cat-file returned more than the blobs asked for");
  };
  let chunk: string[] = [];
  let chunkBytes = 0;
  for (const sha of wanted) {
    const size = sizes.get(sha)!;
    if (chunk.length > 0 && chunkBytes + size > BLOB_CHUNK_BYTES) {
      readChunk(chunk, chunkBytes);
      chunk = [];
      chunkBytes = 0;
    }
    chunk.push(sha);
    chunkBytes += size;
  }
  readChunk(chunk, chunkBytes);
  return contents;
}

export function gitRoot(cwd: string): string {
  return runGit(["rev-parse", "--show-toplevel"], cwd).trim();
}

/**
 * Runs `git diff --unified=0` with the given passthrough args and returns the
 * supported changed files (with status and line numbers) plus deleted files.
 */
export function gitDiffTargets(gitArgs: string[], cwd: string): DiffResult {
  const root = gitRoot(cwd);
  // Fixed a/ b/ prefixes whatever diff.noprefix / diff.mnemonicPrefix say, and
  // non-ASCII paths as they are, not C-quoted: the headers parse the same everywhere.
  const output = runGit(["-c", "core.quotePath=false", "diff", "--unified=0", "--no-color",
    "--src-prefix=a/", "--dst-prefix=b/", ...gitArgs], cwd);
  // Second pass for new-side blob SHAs, so ref-to-ref diffs (qa...feature)
  // read content from git instead of the working tree — which may hold the
  // OLD side, or not hold added files at all.
  const raw = runGit(["diff", "--raw", "-z", "--no-abbrev", "--no-color", ...gitArgs], cwd);
  const parsed = parseDiff(output);
  const rawEntries = parseRawEntries(raw);
  const newBlobs = new Map<string, string>();
  const oldBlobs = new Map<string, string>();
  for (const e of rawEntries) {
    if (e.newSha) newBlobs.set(e.path, e.newSha);
    if (e.oldSha) oldBlobs.set(e.path, e.oldSha);
  }
  const abs = (p: string) => toPosix(isAbsolute(p) ? p : join(root, p));
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
        oldBlob: oldBlobs.get(f.path),
      }))
      // No blob means the new side is the working tree; a file gone from disk
      // too has nothing to show (e.g. deleted since the diff was staged), and
      // a submodule is a directory there.
      .filter((t) => t.newBlob !== undefined || (existsSync(t.file) && statSync(t.file).isFile())),
    deleted: parsed.deleted.map(abs),
    renamed: parsed.renamed.map((r) => ({ from: abs(r.from), to: abs(r.to) })),
    deletedBlobs: new Map(parsed.deleted
      .filter((p) => oldBlobs.has(p))
      .map((p) => [abs(p), oldBlobs.get(p)!])),
  };
}
