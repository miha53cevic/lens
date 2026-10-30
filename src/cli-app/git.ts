import { execFile, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { isAbsolute, join, resolve } from 'node:path';
import { closeSync, existsSync, lstatSync, openSync, readFileSync, readSync, statSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { promisify } from 'node:util';
import type { DiffStatus, RemovedBlock } from './model.ts';
import { toPosix } from './paths.ts';

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

/** A changed file git calls binary: listed in the review, with nothing to show. */
export interface BinaryFile {
  /** Absolute path: the new side's, or the old one's for a deletion */
  file: string;
  status: DiffStatus | 'deleted';
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
  /** Changed binary files: their diffs carry no hunks, so they are in none of the lists above */
  binary: BinaryFile[];
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
  const strip = (p: string) => (p.startsWith('a/') || p.startsWith('b/') ? p.slice(2) : p);

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
  const isMinusHeader = (l: string) => l.startsWith('--- a/') || l.startsWith('--- /dev/null');
  const isPlusHeader = (l: string) => l.startsWith('+++ b/') || l.startsWith('+++ /dev/null');

  for (const line of output.split('\n')) {
    if (line.startsWith('diff --git ')) {
      flushRename();
      current = null; // a header this parser can't read must not inherit the previous file's hunks
    } else if (line.startsWith('rename from ')) {
      (pendingRename ??= {}).from = line.slice('rename from '.length);
    } else if (line.startsWith('rename to ')) {
      (pendingRename ??= {}).to = line.slice('rename to '.length);
    } else if (isMinusHeader(line)) {
      minus = line.slice(4).trim();
      hunkRemoval = null;
    } else if (isPlusHeader(line)) {
      pendingRename = null; // rename with edits — shows as a modified file
      const plus = line.slice(4).trim();
      if (plus === '/dev/null') {
        if (minus && minus !== '/dev/null') deleted.push(strip(minus));
        current = null;
      } else {
        current = {
          path: strip(plus),
          status: minus === '/dev/null' ? 'added' : 'modified',
          changedLines: [],
          removals: [],
        };
        files.push(current);
      }
      minus = null;
      hunkRemoval = null;
    } else if (current && line.startsWith('@@')) {
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
    } else if (current && hunkRemoval && line.startsWith('-')) {
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
  const tokens = output.split('\0');
  const blob = (sha: string, mode: string) => (/^0+$/.test(sha) || mode === '160000' ? null : sha);
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    // "::" entries are merge diffs; other non-":" tokens are pass-through
    // noise from user flags (e.g. --stat text) and never look like records.
    if (!token.startsWith(':') || token.startsWith('::')) continue;
    const fields = token.slice(1).split(' ');
    if (fields.length < 5) continue;
    const [srcMode, dstMode, srcSha, dstSha, status] = fields;
    const pathCount = status.startsWith('R') || status.startsWith('C') ? 2 : 1;
    const path = tokens[i + pathCount]; // renames/copies: the NEW path is the second one
    i += pathCount;
    if (path) entries.push({ path, oldSha: blob(srcSha, srcMode), newSha: blob(dstSha, dstMode), status });
  }
  return entries;
}

/**
 * The paths `git diff --numstat -z` counts no lines for ("-\t-\t<path>"): the files git calls
 * binary. New-side paths, as parseRawEntries gives them.
 */
export function parseBinaryPaths(output: string): string[] {
  const paths: string[] = [];
  const tokens = output.split('\0');
  for (let i = 0; i < tokens.length; i++) {
    const match = /^(-|\d+)\t(-|\d+)\t([\s\S]*)$/.exec(tokens[i]);
    if (!match) continue;
    let path = match[3];
    // a rename or copy has no path of its own: the old and the new one follow
    if (path === '') {
      path = tokens[i + 2] ?? '';
      i += 2;
    }
    if (match[1] === '-' && match[2] === '-' && path) paths.push(path);
  }
  return paths;
}

export function runGit(args: string[], cwd: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
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
  const batch = (mode: '--batch-check' | '--batch', names: string[], maxBuffer: number): Buffer =>
    execFileSync('git', ['cat-file', mode], { cwd, input: names.join('\n') + '\n', maxBuffer });

  // the sizes first, so each chunk's output is bounded and known
  const sizes = new Map<string, number>();
  const checked = batch('--batch-check', wanted, 64 * 1024 * 1024)
    .toString('utf8')
    .split('\n');
  wanted.forEach((sha, index) => {
    const [name, type, size] = (checked[index] ?? '').split(' ');
    if (name !== sha || type !== 'blob' || !/^\d+$/.test(size ?? '')) {
      throw new Error(`git has no blob ${sha} (cat-file answered "${checked[index] ?? ''}")`);
    }
    sizes.set(sha, Number(size));
  });

  const readChunk = (chunk: string[], bytes: number) => {
    // each blob comes as "<sha> blob <size>\n", its content, "\n"
    const output = batch('--batch', chunk, bytes + chunk.length * 128 + 1024);
    let offset = 0;
    for (const sha of chunk) {
      const size = sizes.get(sha)!;
      const headerEnd = output.indexOf(10, offset);
      const header = headerEnd === -1 ? '' : output.toString('utf8', offset, headerEnd);
      const end = headerEnd + 1 + size;
      if (header !== `${sha} blob ${size}` || end >= output.length || output[end] !== 10) {
        throw new Error(`git cat-file returned blob ${sha} incomplete`);
      }
      contents.set(sha, output.toString('utf8', headerEnd + 1, end));
      offset = end + 1;
    }
    if (offset !== output.length) throw new Error('git cat-file returned more than the blobs asked for');
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

/** The branch HEAD is on; null when it's detached. */
export function currentBranch(cwd: string): string | null {
  try {
    // quiet: outside a repository (paths mode can be) "no branch" is the answer, not an error
    const branch = execFileSync('git', ['symbolic-ref', '--short', '-q', 'HEAD'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return branch.trim() || null;
  } catch {
    return null;
  }
}

export function gitRoot(cwd: string): string {
  return runGit(['rev-parse', '--show-toplevel'], cwd).trim();
}

/**
 * Whether `git diff <gitArgs>` has the working tree as its new side: nothing asks for the index,
 * and fewer than two revisions are named. If so, the pathspecs it is limited to (none: the whole
 * repository). Null when it hasn't, or when the arguments can't be read for sure.
 */
export function worktreePathspecs(gitArgs: string[], cwd: string): string[] | null {
  const split = gitArgs.indexOf('--');
  const before = split === -1 ? gitArgs : gitArgs.slice(0, split);
  const pathspecs = split === -1 ? [] : gitArgs.slice(split + 1);
  const isCommit = (name: string) => {
    try {
      execFileSync('git', ['rev-parse', '--verify', '--quiet', `${name}^{commit}`], { cwd, stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  };
  let revisions = 0;
  for (const arg of before) {
    if (arg === '--staged' || arg === '--cached' || arg === '--no-index') return null;
    if (arg.startsWith('-')) continue;
    // A..B and A...B name two revisions (a path may hold ".." too: "../src")
    if (arg.includes('..') && !existsSync(resolve(cwd, arg))) return null;
    // git's own rule without "--": what isn't a revision is a path
    if (isCommit(arg)) revisions++;
    else pathspecs.push(arg);
  }
  return revisions < 2 ? pathspecs : null;
}

/**
 * The revision `git diff <gitArgs>` ends at, as typed (B of `A B`, `A..B`, `A...B`), when it isn't
 * what's checked out: then the files on disk are other code than the diff's. Null when the diff ends
 * at the working tree, the index or HEAD, or when the arguments can't be read for sure.
 */
export function uncheckedOutRevision(gitArgs: string[], cwd: string): string | null {
  const split = gitArgs.indexOf('--');
  const before = split === -1 ? gitArgs : gitArgs.slice(0, split);
  const commit = (name: string) => {
    try {
      return (
        execFileSync('git', ['rev-parse', '--verify', '--quiet', `${name}^{commit}`], {
          cwd,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }).trim() || null
      );
    } catch {
      return null;
    }
  };
  const revisions: string[] = [];
  for (const arg of before) {
    // -R swaps the sides
    if (['--staged', '--cached', '--no-index', '-R'].includes(arg)) return null;
    if (arg.startsWith('-')) continue;
    const range = /^(.*?)\.\.\.?(.*)$/.exec(arg);
    // a path may hold ".." too: "../src"
    if (range && !existsSync(resolve(cwd, arg))) revisions.push(range[1] || 'HEAD', range[2] || 'HEAD');
    else if (commit(arg) !== null) revisions.push(arg);
  }
  if (revisions.length !== 2) return null;
  // counted from HEAD (HEAD~1, @^, @{-1}): any checkout moves it too, so none makes it the code on disk
  if (/^(HEAD|@)([~^@{]|$)/.test(revisions[1])) return null;
  try {
    // both in one call: a git process is ~15 ms on Windows, and the viewer asks on every analysis
    const [end, head] = execFileSync('git', ['rev-parse', `${revisions[1]}^{commit}`, 'HEAD'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .trim()
      .split('\n');
    return end && head && end !== head ? revisions[1] : null;
  } catch {
    return null;
  }
}

/**
 * The files git doesn't track and isn't told to ignore, as paths from the root: what `git status`
 * lists as untracked. `pathspecs` are relative to `cwd`, as git diff's are.
 */
export function untrackedFiles(root: string, cwd: string, pathspecs: string[] = []): string[] {
  const { args, dir } = untrackedCommand(root, cwd, pathspecs);
  return runGit(args, dir).split('\0').filter(Boolean);
}

/** The `git ls-files` that lists the untracked files, and the folder to run it in. */
function untrackedCommand(root: string, cwd: string, pathspecs: string[]): { args: string[]; dir: string } {
  const limited = pathspecs.length > 0;
  return {
    args: ['ls-files', '--others', '--exclude-standard', '--full-name', '-z', ...(limited ? ['--', ...pathspecs] : [])],
    // without a pathspec git lists only what is under the folder it runs in: run it at the root
    dir: limited ? cwd : root,
  };
}

/** git's own test for a binary file: a NUL byte in its first 8000 bytes. */
function isBinaryFile(file: string): boolean {
  const start = Buffer.alloc(8000);
  const fd = openSync(file, 'r');
  try {
    return start.subarray(0, readSync(fd, start, 0, start.length, 0)).includes(0);
  } finally {
    closeSync(fd);
  }
}

/**
 * The untracked files of a diff against the working tree, as added files with every line changed:
 * `git diff` lists tracked files only, so a file that was created and not yet `git add`ed would be
 * in no review. Nothing is written: no `git add -N`, the index stays as it is.
 */
function untrackedTargets(
  gitArgs: string[],
  cwd: string,
  root: string,
): { targets: DiffTarget[]; binary: BinaryFile[] } {
  const pathspecs = worktreePathspecs(gitArgs, cwd);
  const targets: DiffTarget[] = [];
  const binary: BinaryFile[] = [];
  if (pathspecs === null) return { targets, binary };
  for (const path of untrackedFiles(root, cwd, pathspecs)) {
    const file = toPosix(join(root, path));
    // a link, or a folder that is its own repository, has no text of its own
    if (!lstatSync(file, { throwIfNoEntry: false })?.isFile()) continue;
    // a binary has none to show: it is listed, not read
    if (isBinaryFile(file)) {
      binary.push({ file, status: 'added' });
      continue;
    }
    const text = readFileSync(file, 'utf8');
    const lineCount = text === '' ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
    // an empty file has no line to show, as git's diff of one has no hunk
    if (lineCount === 0) continue;
    targets.push({
      file,
      changedLines: Array.from({ length: lineCount }, (_, index) => index + 1),
      status: 'added',
      removals: [],
    });
  }
  return { targets, binary };
}

/**
 * Runs `git diff --unified=0` with the given passthrough args and returns the
 * supported changed files (with status and line numbers) plus deleted files.
 * Against the working tree, the untracked files come along as added ones.
 */
export function gitDiffTargets(gitArgs: string[], cwd: string): DiffResult {
  const root = gitRoot(cwd);
  // Fixed a/ b/ prefixes whatever diff.noprefix / diff.mnemonicPrefix say, and
  // non-ASCII paths as they are, not C-quoted: the headers parse the same everywhere.
  // Paths from the root whatever diff.relative says: in a subdirectory it would cut them short.
  const output = runGit(
    [
      '-c',
      'core.quotePath=false',
      'diff',
      '--unified=0',
      '--no-color',
      '--no-relative',
      '--src-prefix=a/',
      '--dst-prefix=b/',
      ...gitArgs,
    ],
    cwd,
  );
  // Second pass for new-side blob SHAs, so ref-to-ref diffs (qa...feature)
  // read content from git instead of the working tree — which may hold the
  // OLD side, or not hold added files at all.
  const raw = runGit(['diff', '--raw', '-z', '--no-abbrev', '--no-color', '--no-relative', ...gitArgs], cwd);
  // Third pass for the binary files: their diffs carry no hunks, so the first pass has none of them.
  const numstat = runGit(
    ['-c', 'core.quotePath=false', 'diff', '--numstat', '-z', '--no-color', '--no-relative', ...gitArgs],
    cwd,
  );
  const parsed = parseDiff(output);
  const rawEntries = parseRawEntries(raw);
  const newBlobs = new Map<string, string>();
  const oldBlobs = new Map<string, string>();
  // Against the working tree the new side is read from disk, whatever git prints for it: for a
  // file it has hashed there that can be a blob git never stored.
  const toWorktree = worktreePathspecs(gitArgs, cwd) !== null;
  for (const e of rawEntries) {
    if (e.newSha && !toWorktree) newBlobs.set(e.path, e.newSha);
    if (e.oldSha) oldBlobs.set(e.path, e.oldSha);
  }
  const abs = (p: string) => toPosix(isAbsolute(p) ? p : join(root, p));
  const untracked = untrackedTargets(gitArgs, cwd, root);
  const rawStatus = new Map(rawEntries.map((entry) => [entry.path, entry.status]));
  const binaryStatus = (path: string): BinaryFile['status'] => {
    const status = rawStatus.get(path) ?? 'M';
    return status.startsWith('A') ? 'added' : status.startsWith('D') ? 'deleted' : 'modified';
  };
  // Unsupported file types are kept — the viewer shows their changes without
  // folding. Binary files are listed apart: there is no text of theirs to show.
  return {
    targets: [
      ...parsed.files
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
      ...untracked.targets,
    ],
    binary: [
      ...parseBinaryPaths(numstat).map((path) => ({ file: abs(path), status: binaryStatus(path) })),
      ...untracked.binary,
    ],
    deleted: parsed.deleted.map(abs),
    renamed: parsed.renamed.map((r) => ({ from: abs(r.from), to: abs(r.to) })),
    deletedBlobs: new Map(parsed.deleted.filter((p) => oldBlobs.has(p)).map((p) => [abs(p), oldBlobs.get(p)!])),
  };
}

const execFileAsync = promisify(execFile);

/**
 * A fingerprint of what `git diff <gitArgs>` shows right now: it changes when a file of the diff
 * is edited, staged, committed or removed, and when an untracked file appears. The viewer asks for
 * it every few seconds to say "the code changed on disk", so it is cheap and never blocks: git
 * runs beside the server, and a working-tree file is read again only when its size or time moved.
 * Returns the function that takes it; the files' digests are kept between its calls.
 */
export function changeFingerprint(gitArgs: string[], cwd: string): () => Promise<string> {
  const git = async (args: string[], dir: string) =>
    (await execFileAsync('git', args, { cwd: dir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })).stdout;
  const digests = new Map<string, { key: string; digest: string }>();
  // what a working-tree file holds: its content, not its time (saving a file unchanged is no change)
  const fileDigest = async (file: string): Promise<string> => {
    let key: string;
    try {
      const stats = await stat(file);
      if (!stats.isFile()) return 'not a file';
      key = `${stats.size}:${stats.mtimeMs}`;
    } catch {
      return 'gone';
    }
    const known = digests.get(file);
    if (known?.key === key) return known.digest;
    const digest = createHash('sha256')
      .update(await readFile(file).catch(() => ''))
      .digest('hex');
    digests.set(file, { key, digest });
    return digest;
  };
  return async () => {
    const root = (await git(['rev-parse', '--show-toplevel'], cwd)).trim();
    const raw = await git(['diff', '--raw', '-z', '--no-abbrev', '--no-color', '--no-relative', ...gitArgs], cwd);
    const pathspecs = worktreePathspecs(gitArgs, cwd);
    // Against the working tree, git prints a file's blob only while the index's record of its
    // stat is fresh, and 0s once it isn't (a touch, a save as it was), until something such as
    // `git status` refreshes the index. That is no change, so the new side's blob is left out,
    // and every file the working tree holds is read instead.
    const hash = createHash('sha256').update(pathspecs === null ? raw : withoutNewBlobs(raw));
    const fromDisk = parseRawEntries(raw).filter(
      (entry) => (pathspecs !== null || entry.newSha === null) && !entry.status.startsWith('D'),
    );
    const untracked =
      pathspecs === null
        ? []
        : await (async () => {
            const { args, dir } = untrackedCommand(root, cwd, pathspecs);
            return (await git(args, dir)).split('\0').filter(Boolean);
          })();
    for (const path of [...fromDisk.map((entry) => entry.path), ...untracked]) {
      hash.update(`\0${path}\0${await fileDigest(join(root, path))}`);
    }
    return hash.digest('hex');
  };
}

/** `git diff --raw -z` output with each record's new-side blob blanked, its modes and status kept. */
function withoutNewBlobs(raw: string): string {
  return raw
    .split('\0')
    .map((token) => {
      if (!token.startsWith(':') || token.startsWith('::')) return token;
      const fields = token.split(' ');
      if (fields.length >= 5) fields[3] = '';
      return fields.join(' ');
    })
    .join('\0');
}
