// The reader's notes, placed on the code as it is now (placeNote in cli-app/notes/place.ts).

import type { ViewerPayload } from '../../cli-app/render/web/server.ts';
import type { NoteKind, ReaderNote } from '../../cli-app/notes/store.ts';
import { placeNote, type PlacedNote } from '../../cli-app/notes/place.ts';

type ViewerFile = ViewerPayload['files'][number];

/** The kinds a note can have, in the composer's order; all but "note" go along to the agent */
export const NOTE_KINDS: { kind: NoteKind; label: string; color: string }[] = [
  { kind: 'note', label: 'note', color: 'var(--line-strong)' },
  { kind: 'bug', label: 'bug', color: 'var(--bug)' },
  { kind: 'risk', label: 'risk', color: 'var(--risk)' },
  { kind: 'question', label: 'question', color: 'var(--question)' },
];

/** A plain note stays the reader's: only one with a kind goes along when they copy the review. */
export const forAgent = (note: ReaderNote): boolean => note.kind !== 'note';

export interface FileNotes {
  /** The notes drawn under each row, by its label */
  byLabel: ReadonlyMap<string, { note: ReaderNote; placed: PlacedNote }[]>;
  /** The notes whose lines and place are both gone: listed above the file's code */
  outdated: ReaderNote[];
  /** Each row a note for the agent is on, with its kind: the overview ruler's ticks */
  flagged: ReadonlyMap<string, string>;
}

const linesCache = new WeakMap<ViewerFile, { lines: string[]; removed: Map<number, string>; lastOld: number }>();

/** The file's lines on each side: the new code's, and those the diff removed by their old numbers. */
export function fileText(file: ViewerFile) {
  let text = linesCache.get(file);
  if (!text) {
    const removed = new Map<number, string>();
    for (const block of file.removals ?? [])
      block.lines.forEach((line, offset) => removed.set(block.oldStart + offset, line));
    text = { lines: file.source.split(/\r?\n/), removed, lastOld: Math.max(0, ...removed.keys()) };
    linesCache.set(file, text);
  }
  return text;
}

/** Where the note is on the file as it is now; null: outdated. */
export function placeOn(
  file: ViewerFile,
  note: Pick<ReaderNote, 'side' | 'start' | 'end' | 'lines'>,
): PlacedNote | null {
  const { lines, removed, lastOld } = fileText(file);
  return note.side === 'new'
    ? placeNote(note, (line) => (line <= file.lineCount ? lines[line - 1] : undefined), file.lineCount)
    : placeNote(note, (line) => removed.get(line), lastOld);
}

const fileNotesCache = new WeakMap<ViewerFile, { notes: readonly ReaderNote[]; result: FileNotes }>();

export function fileNotes(notes: readonly ReaderNote[], file: ViewerFile): FileNotes {
  const cached = fileNotesCache.get(file);
  if (cached && cached.notes === notes) return cached.result;
  const byLabel = new Map<string, { note: ReaderNote; placed: PlacedNote }[]>();
  const outdated: ReaderNote[] = [];
  const flagged = new Map<string, string>();
  for (const note of notes) {
    if (note.file !== file.file) continue;
    const placed = placeOn(file, note);
    if (!placed) {
      outdated.push(note);
      continue;
    }
    byLabel.set(placed.label, [...(byLabel.get(placed.label) ?? []), { note, placed }]);
    if (forAgent(note)) flagged.set(placed.label, note.kind);
  }
  const result = { byLabel, outdated, flagged };
  fileNotesCache.set(file, { notes, result });
  return result;
}

export function fileByPath(data: ViewerPayload, path: string): ViewerFile | null {
  return data.files.find((file) => file.file === path) ?? null;
}

const countsCache = new WeakMap<readonly ReaderNote[], ReadonlyMap<string, number>>();

/** How many of the reader's notes each file holds, by its path: the tree's note marks. */
export function noteCounts(notes: readonly ReaderNote[]): ReadonlyMap<string, number> {
  let counts = countsCache.get(notes);
  if (!counts) {
    const byPath = new Map<string, number>();
    for (const note of notes) byPath.set(note.file, (byPath.get(note.file) ?? 0) + 1);
    counts = byPath;
    countsCache.set(notes, counts);
  }
  return counts;
}

/**
 * How many of the reader's notes are on lines a unit shows, as its file is now: the summary list's
 * note marks. An outdated note has no line, so it counts for its file but no unit.
 */
export function unitNoteCount(
  notes: readonly ReaderNote[],
  file: ViewerFile | null,
  unit: { ranges: { start: number; end: number }[]; removals: { oldStart: number; lines: string[] }[] },
): number {
  if (!file || !noteCounts(notes).has(file.file)) return 0;
  let count = 0;
  for (const [label, placed] of fileNotes(notes, file).byLabel) {
    const line = Number(label.slice(1));
    const shown = label.startsWith('N')
      ? unit.ranges.some((range) => line >= range.start && line <= range.end)
      : unit.removals.some((block) => line >= block.oldStart && line < block.oldStart + block.lines.length);
    if (shown) count += placed.length;
  }
  return count;
}
