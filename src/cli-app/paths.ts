import { existsSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, join, normalize, relative, sep } from 'node:path';

// Paths lens shows, matches config patterns against, and keys summary units by
// always use "/", whatever the OS: patterns are written with "/" ("**/*.test.*"),
// and a unit id must not depend on where lens runs.

/** `p` with the OS separator replaced by "/" — a no-op on POSIX. */
export function toPosix(p: string): string {
  return sep === '/' ? p : p.split(sep).join('/');
}

/** `to` relative to `from`, "/"-separated; `to` itself when the two are the same path. */
export function relPath(from: string, to: string): string {
  return toPosix(relative(from, to) || to);
}

/** A "path:line" reference that points at a real line under the repo root. */
export interface LineRef {
  /** Repo-relative, "/"-separated */
  file: string;
  line: number;
  text: string;
}

/**
 * Resolves "path/to/file.ts:31" against `root`, or says why it doesn't point at
 * a real line. `cache` holds each file's lines (null: not a file) across calls.
 */
export function resolveLineRef(
  root: string,
  raw: string,
  cache: Map<string, string[] | null>,
): LineRef | { error: string } {
  const m = /^(.+):(\d+)$/.exec(raw.trim());
  if (!m) return { error: 'must look like "path/to/file.ts:31"' };
  const rel = normalize(m[1]);
  if (isAbsolute(rel) || rel.startsWith('..')) return { error: 'must be a path relative to the repository root' };
  let lines = cache.get(rel);
  if (lines === undefined) {
    const abs = join(root, rel);
    // a final newline ends the last line; it doesn't start another
    lines = existsSync(abs) && statSync(abs).isFile() ? readFileSync(abs, 'utf8').replace(/\n$/, '').split('\n') : null;
    cache.set(rel, lines);
  }
  if (!lines) return { error: '— file not found' };
  const line = Number(m[2]);
  if (line < 1) return { error: '— lines count from 1' };
  if (line > lines.length) return { error: `— the file has only ${lines.length} lines` };
  return { file: toPosix(rel), line, text: lines[line - 1] };
}
