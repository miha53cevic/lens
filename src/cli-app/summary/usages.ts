import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { truncate } from '../text.ts';
import { callerName } from './fit.ts';
import type { Unit } from './units.ts';

// The lines outside the diff that name each unit, so the agent reads the likely callers
// instead of searching for them one grep at a time. A plain text match over the working tree's
// files (tracked and untracked, not ignored), the same tree `submit` checks a break's callers
// against: no types, no imports followed, so a unit reached through an alias or a string key
// isn't found. Read and matched in-process: `git grep -w -F` with hundreds of names takes
// tens of seconds where this takes milliseconds.

/** Lines listed per unit; past that, the agent is told how many more there are */
export const MAX_USAGES = 8;

/** Shorter names match too much to be worth listing */
const MIN_NAME = 3;

/** Prose, not code: a doc that names a function doesn't call it */
const DOC_FILE = /\.(md|mdx|markdown|txt|rst|adoc)$/i;

/** Bigger files are generated or minified: a caller in one isn't someone's to fix */
const MAX_FILE_BYTES = 1024 * 1024;

export interface Usages {
  /** The name searched for */
  name: string;
  /** "path:line  code", repo-relative, at most MAX_USAGES */
  lines: string[];
  /** How many more lines matched */
  more: number;
}

/**
 * For each unit with a name a caller would use, the lines outside the diff that name it. A unit
 * left out (a statement, a module, a short name) wasn't searched; an empty list means nothing matched.
 */
export function usagesOutside(root: string, units: Unit[]): Map<string, Usages> {
  const unitsByName = new Map<string, Unit[]>();
  for (const unit of units) {
    const name = callerName(unit);
    if (!name || name.length < MIN_NAME) continue;
    unitsByName.set(name, [...(unitsByName.get(name) ?? []), unit]);
  }
  const out = new Map<string, Usages>();
  if (unitsByName.size === 0) return out;
  for (const [name, named] of unitsByName) for (const unit of named) out.set(unit.id, { name, lines: [], more: 0 });

  // the lines the tasks already show: a mention there is in the diff, not outside it
  const shown = new Map<string, { start: number; end: number }[]>();
  for (const unit of units) shown.set(unit.file, [...(shown.get(unit.file) ?? []), ...unit.ranges]);
  const inDiff = (file: string, line: number) =>
    shown.get(file)?.some((r) => line >= r.start && line <= r.end) ?? false;

  let files: string[];
  try {
    files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    }).split('\0');
  } catch {
    return new Map(); // unsearched rather than wrongly empty
  }
  for (const file of files) {
    if (!file || DOC_FILE.test(file)) continue;
    const text = readText(join(root, file));
    if (text === null) continue;
    text.split('\n').forEach((lineText, i) => {
      const line = i + 1;
      const names = new Set(lineText.match(/[\w$]+/g) ?? []);
      const named = [...names].flatMap((name) => unitsByName.get(name) ?? []);
      if (named.length === 0 || inDiff(file, line)) return;
      for (const unit of named) {
        const usages = out.get(unit.id)!;
        if (usages.lines.length < MAX_USAGES) usages.lines.push(`${file}:${line}  ${truncate(lineText, 100)}`);
        else usages.more++;
      }
    });
  }
  return out;
}

/** A text file's contents; null for one that's gone (deleted, not staged), too big, or binary. */
function readText(path: string): string | null {
  try {
    if (statSync(path).size > MAX_FILE_BYTES) return null;
    const buffer = readFileSync(path);
    return buffer.includes(0) ? null : buffer.toString('utf8');
  } catch {
    return null;
  }
}
