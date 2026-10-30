import type { ReaderNote } from './store.ts';

// Where a note sits on the code as it is now. The code moves under a note: the agent fixes what
// it says, or an edit above shifts it. So it looks for its lines by their text, nearest first,
// and only then falls back to where it was. Pure: the viewer draws with it, the node tests check it.

export interface PlacedNote {
  /** The row it's drawn under: its last line ("N12", or "O5" a removed one) */
  label: string;
  start: number;
  end: number;
  /** Its lines aren't there as they were written: likely what it said was dealt with */
  changed: boolean;
}

/**
 * `textAt(n)` is line n of the note's side as it is now, undefined where there is no such line
 * (on the old side: a line the diff doesn't remove). `lastLine` is the highest line it can be on.
 * null: neither its lines nor its place are there anymore (it's outdated).
 */
export function placeNote(
  note: Pick<ReaderNote, 'side' | 'start' | 'end' | 'lines'>,
  textAt: (line: number) => string | undefined,
  lastLine: number,
): PlacedNote | null {
  const span = note.end - note.start;
  const prefix = note.side === 'new' ? 'N' : 'O';
  const placed = (start: number, changed: boolean): PlacedNote => ({
    label: prefix + (start + span),
    start,
    end: start + span,
    changed,
  });
  const matchesAt = (start: number) => note.lines.every((text, offset) => textAt(start + offset) === text);
  for (let distance = 0; distance <= lastLine; distance++) {
    const starts = distance === 0 ? [note.start] : [note.start - distance, note.start + distance];
    for (const start of starts) {
      if (start >= 1 && start + span <= lastLine && matchesAt(start)) return placed(start, false);
    }
  }
  // no copy of its lines anywhere: where it was, while that line is still there
  return textAt(note.end) !== undefined ? placed(note.start, true) : null;
}
