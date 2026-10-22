import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { lensDir } from "../summary/store.ts";
import { relPath } from "../paths.ts";

// The reader's own notes on lines of code, written in the viewer: .lens/notes.json, in lens's
// ignored folder. They are the reader's, not the agent's: lens shows them and copies the ones
// with a kind for the agent, and never sends them anywhere itself.

export const NOTE_KINDS = ["note", "bug", "risk", "question"] as const;
/** "note" is the reader's own; a bug, risk or question goes along when they copy the review for the agent */
export type NoteKind = (typeof NOTE_KINDS)[number];

export interface ReaderNote {
  id: string;
  /** "/"-separated, as the viewer shows it (relative to where lens runs) */
  file: string;
  /** The new code's lines, or lines the diff removed (by their old numbers) */
  side: "new" | "old";
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

export const NOTES_PATH = ".lens/notes.json";

function notesFile(root: string): string {
  return join(root, ".lens", "notes.json");
}

function isNote(raw: unknown): raw is ReaderNote {
  const note = raw as ReaderNote;
  return (
    !!note && typeof note === "object" && typeof note.id === "string" && typeof note.file === "string" &&
    (note.side === "new" || note.side === "old") && Number.isInteger(note.start) && Number.isInteger(note.end) &&
    Array.isArray(note.lines) && note.lines.every((line) => typeof line === "string") &&
    (NOTE_KINDS as readonly string[]).includes(note.kind) && typeof note.text === "string" && typeof note.at === "string"
  );
}

/** Every note kept in the repository, its files relative to the root. Another version, or a broken file, is none. */
export function readStoredNotes(root: string): ReaderNote[] {
  const path = notesFile(root);
  if (!existsSync(path)) return [];
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as StoredNotes;
    return raw?.version === 1 && Array.isArray(raw.notes) ? raw.notes.filter(isNote) : [];
  } catch {
    return [];
  }
}

export function writeStoredNotes(root: string, notes: ReaderNote[]): void {
  lensDir(root);
  const stored: StoredNotes = { version: 1, notes };
  writeFileSync(notesFile(root), JSON.stringify(stored, null, 2) + "\n");
}

/** Where the notes of a review are: the repository's root, and the folder its paths are relative to. */
export interface NotesPlace {
  root: string;
  cwd: string;
}

const fromRoot = (place: NotesPlace, file: string) => relPath(place.cwd, resolve(place.root, file));
const toRoot = (place: NotesPlace, file: string) => relPath(place.root, resolve(place.cwd, file));

/** The notes on the review's files, with their paths as the viewer shows them. */
export function notesFor(place: NotesPlace, files: readonly string[]): ReaderNote[] {
  const shown = new Set(files);
  return readStoredNotes(place.root)
    .map((note) => ({ ...note, file: fromRoot(place, note.file) }))
    .filter((note) => shown.has(note.file));
}

/** Changes the stored notes: `change` gets them with the viewer's paths, and gives back the new list. */
export function changeNotes(place: NotesPlace, change: (notes: ReaderNote[]) => ReaderNote[]): void {
  const notes = readStoredNotes(place.root).map((note) => ({ ...note, file: fromRoot(place, note.file) }));
  writeStoredNotes(place.root, change(notes).map((note) => ({ ...note, file: toRoot(place, note.file) })));
}
