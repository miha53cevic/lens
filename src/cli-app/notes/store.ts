import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { lensDir, writeAtomic } from '../summary/store.ts';
import { relPath } from '../paths.ts';

// The reader's own notes on lines of code, written in the viewer: .lens/notes/<review>.json, in
// lens's ignored folder, one file per review (reviewKey), so a note written in one branch's review
// never shows in another's. They are the reader's, not the agent's: lens shows them and copies them
// for the agent when the reader asks, and never sends them anywhere itself.

/** Each goes along when the reader copies the review for the agent. One kept with a kind no longer here ("note") isn't read. */
export const NOTE_KINDS = ['bug', 'risk', 'question'] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];

export interface ReaderNote {
  id: string;
  /** "/"-separated, as the viewer shows it (relative to where lens runs) */
  file: string;
  /** The new code's lines, or lines the diff removed (by their old numbers) */
  side: 'new' | 'old';
  /** The first and last line it's on, on its side */
  start: number;
  end: number;
  /** Those lines' text when it was written: how it finds them again after the code changes */
  lines: string[];
  kind: NoteKind;
  text: string;
  /** When it was written or last edited, ISO */
  at: string;
}

interface StoredNotes {
  version: 1;
  /** Their files are relative to the repository's root: the same notes whatever folder lens runs from */
  notes: ReaderNote[];
}

/** Each review's notes are a file in here, named by its key */
export const NOTES_DIR = '.lens/notes';
/** Where every review's notes were kept before they were kept per review: Clear lists it, nothing reads it */

function notesFile(root: string, review: string): string {
  return join(root, NOTES_DIR, review + '.json');
}

function isNote(raw: unknown): raw is ReaderNote {
  const note = raw as ReaderNote;
  return (
    !!note &&
    typeof note === 'object' &&
    typeof note.id === 'string' &&
    typeof note.file === 'string' &&
    (note.side === 'new' || note.side === 'old') &&
    Number.isInteger(note.start) &&
    Number.isInteger(note.end) &&
    Array.isArray(note.lines) &&
    note.lines.every((line) => typeof line === 'string') &&
    (NOTE_KINDS as readonly string[]).includes(note.kind) &&
    typeof note.text === 'string' &&
    typeof note.at === 'string'
  );
}

/** Every note kept for a review, its files relative to the root. Another version, or a broken file, is none. */
export function readStoredNotes(root: string, review: string): ReaderNote[] {
  const path = notesFile(root, review);
  if (!existsSync(path)) return [];
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as StoredNotes;
    return raw?.version === 1 && Array.isArray(raw.notes) ? raw.notes.filter(isNote) : [];
  } catch {
    return [];
  }
}

export function writeStoredNotes(root: string, review: string, notes: ReaderNote[]): void {
  mkdirSync(join(lensDir(root), 'notes'), { recursive: true });
  const stored: StoredNotes = { version: 1, notes };
  writeAtomic(notesFile(root, review), JSON.stringify(stored, null, 2) + '\n');
}

/** Where the notes of a review are: the repository's root, the folder its paths are relative to, and its key. */
export interface NotesPlace {
  root: string;
  cwd: string;
  review: string;
}

const fromRoot = (place: NotesPlace, file: string) => relPath(place.cwd, resolve(place.root, file));
const toRoot = (place: NotesPlace, file: string) => relPath(place.root, resolve(place.cwd, file));

/** The notes on the review's files, with their paths as the viewer shows them. */
export function notesFor(place: NotesPlace, files: readonly string[]): ReaderNote[] {
  const shown = new Set(files);
  return readStoredNotes(place.root, place.review)
    .map((note) => ({ ...note, file: fromRoot(place, note.file) }))
    .filter((note) => shown.has(note.file));
}

/** Changes the stored notes: `change` gets them with the viewer's paths, and gives back the new list. */
export function changeNotes(place: NotesPlace, change: (notes: ReaderNote[]) => ReaderNote[]): void {
  const notes = readStoredNotes(place.root, place.review).map((note) => ({
    ...note,
    file: fromRoot(place, note.file),
  }));
  writeStoredNotes(
    place.root,
    place.review,
    change(notes).map((note) => ({ ...note, file: toRoot(place, note.file) })),
  );
}
