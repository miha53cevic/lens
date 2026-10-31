import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { lensDir } from '../summary/store.ts';
import { relPath } from '../paths.ts';
import type { NotesPlace } from '../notes/store.ts';

// The reader's marks in the viewer: the files and changes ticked viewed, and their verdict on each
// of the agent's findings. Kept per review, as the notes are: .lens/marks/<review>.json, so a branch
// reviewed again later has them back, and another branch's review starts without them. A mark's
// key is the viewer's (fileViewKey, unitViewKey, a finding's key): it carries a hash of the code,
// so what changes after it was marked comes back unmarked.

export const CONCERN_MARKS = ['real', 'dismissed'] as const;
/** The reader's verdict on a finding: "real", or "dismissed" */
export type ConcernMark = (typeof CONCERN_MARKS)[number];

/** A review's marks as the viewer holds them, oldest first */
export interface ReviewMarks {
  /** `path@hash`, the path as the viewer shows it (relative to where lens runs) */
  files: string[];
  /** `unitId@hash`: a unit's id starts with its path from the root, the same from any folder */
  units: string[];
  /** A finding's key (it starts with its unit's) → the reader's verdict */
  concerns: Record<string, ConcernMark>;
}

/** One mark the reader changed, as POST /api/marks takes it */
export type MarkChange =
  { list: 'files' | 'units'; key: string; on: boolean } | { list: 'concerns'; key: string; mark: ConcernMark | null };

/** How many of each list are kept: the oldest go first */
export const MARKS_CAP = 2000;
/** Each review's marks are a file in here, named by its key */
export const MARKS_DIR = '.lens/marks';

interface StoredMarks extends ReviewMarks {
  version: 1;
}

function marksFile(root: string, review: string): string {
  return join(root, MARKS_DIR, review + '.json');
}

const isKeys = (raw: unknown): raw is string[] => Array.isArray(raw) && raw.every((key) => typeof key === 'string');

function isConcerns(raw: unknown): raw is Record<string, ConcernMark> {
  return (
    !!raw &&
    typeof raw === 'object' &&
    !Array.isArray(raw) &&
    Object.values(raw).every((mark) => (CONCERN_MARKS as readonly unknown[]).includes(mark))
  );
}

const NO_MARKS: ReviewMarks = { files: [], units: [], concerns: {} };

/** A review's marks as kept, files' paths from the root. Another version, or a broken file, is none. */
export function readStoredMarks(root: string, review: string): ReviewMarks {
  const path = marksFile(root, review);
  if (!existsSync(path)) return NO_MARKS;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as StoredMarks;
    if (raw?.version !== 1 || !isKeys(raw.files) || !isKeys(raw.units) || !isConcerns(raw.concerns)) return NO_MARKS;
    return { files: raw.files, units: raw.units, concerns: raw.concerns };
  } catch {
    return NO_MARKS;
  }
}

function writeStoredMarks(root: string, review: string, marks: ReviewMarks): void {
  mkdirSync(join(lensDir(root), 'marks'), { recursive: true });
  const stored: StoredMarks = { version: 1, ...marks };
  writeFileSync(marksFile(root, review), JSON.stringify(stored, null, 2) + '\n');
}

export function countMarks(marks: ReviewMarks): number {
  return marks.files.length + marks.units.length + Object.keys(marks.concerns).length;
}

/** What a viewed mark is of: `src/a.ts@1x9` → `src/a.ts`. A path may hold an @, the hash never does. */
function markSubject(key: string): string {
  return key.slice(0, key.lastIndexOf('@'));
}

// A file's mark carries its path as the viewer shows it: kept from the root, so lens run from
// another folder finds it. A unit's id is already from the root.
function rebase(key: string, move: (path: string) => string): string {
  const at = key.lastIndexOf('@');
  return move(key.slice(0, at)) + key.slice(at);
}

/** The review's marks, files' paths as the viewer shows them. */
export function marksFor(place: NotesPlace): ReviewMarks {
  const marks = readStoredMarks(place.root, place.review);
  const fromRoot = (path: string) => relPath(place.cwd, resolve(place.root, path));
  return { ...marks, files: marks.files.map((key) => rebase(key, fromRoot)) };
}

/** `viewed` with `key` ticked or unticked. A tick drops the older marks of the same file or change, as the viewer does. */
function toggledKeys(viewed: string[], key: string, on: boolean): string[] {
  const subject = markSubject(key);
  const rest = viewed.filter((other) => other !== key && (!on || markSubject(other) !== subject));
  return (on ? [...rest, key] : rest).slice(-MARKS_CAP);
}

/** One mark changed, in the review's file. */
export function changeMark(place: NotesPlace, change: MarkChange): void {
  const marks = readStoredMarks(place.root, place.review);
  if (change.list === 'concerns') {
    // taken out and put back: the oldest verdicts drop first
    const { [change.key]: _old, ...rest } = marks.concerns;
    const entries = Object.entries(rest);
    if (change.mark) entries.push([change.key, change.mark]);
    writeStoredMarks(place.root, place.review, { ...marks, concerns: Object.fromEntries(entries.slice(-MARKS_CAP)) });
  } else if (change.list === 'files') {
    const key = rebase(change.key, (path) => relPath(place.root, resolve(place.cwd, path)));
    writeStoredMarks(place.root, place.review, { ...marks, files: toggledKeys(marks.files, key, change.on) });
  } else {
    writeStoredMarks(place.root, place.review, { ...marks, units: toggledKeys(marks.units, change.key, change.on) });
  }
}
