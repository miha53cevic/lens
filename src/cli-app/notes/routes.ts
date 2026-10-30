import { randomUUID } from 'node:crypto';
import type { NewNote, NoteEdit, NotesResponse } from '../api/contract.ts';
import { createRouter, HttpError, noBody, type Router } from '../api/router.ts';
import type { ViewerInput } from '../render/web/server.ts';
import { changeNotes, NOTE_KINDS, notesFor, type NoteKind } from './store.ts';

// The reader's notes on the viewer server:
//   POST   /api/notes        a new note
//   POST   /api/notes/<id>   its kind or text, edited
//   DELETE /api/notes/<id>   resolved: it goes
// Each answers the review's notes as they are now (NotesResponse).

const MAX_TEXT = 4000;
const MAX_LINES = 400;

const isKind = (kind: unknown): kind is NoteKind => (NOTE_KINDS as readonly unknown[]).includes(kind);

/** The note's text, or why it can't be kept. */
function noteText(raw: unknown): string | { error: string } {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) return { error: 'the note is empty' };
  if (text.length > MAX_TEXT) return { error: `the note is longer than ${MAX_TEXT} characters` };
  return text;
}

/** A new note from the viewer's request body, or why it isn't one. */
function parseNew(body: unknown, input: ViewerInput): NewNote | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'not a note' };
  const raw = body as Record<string, unknown>;
  const { file, side, start, end, lines, kind } = raw;
  if (typeof file !== 'string' || !input.files.some((shown) => shown.file === file)) {
    return { error: "that file isn't in the viewer anymore — refresh" };
  }
  if (side !== 'new' && side !== 'old') return { error: 'side must be "new" or "old"' };
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    (start as number) < 1 ||
    (end as number) < (start as number)
  ) {
    return { error: 'start and end must be line numbers, start first' };
  }
  const count = (end as number) - (start as number) + 1;
  if (count > MAX_LINES) return { error: `a note takes at most ${MAX_LINES} lines` };
  if (!Array.isArray(lines) || lines.length !== count || !lines.every((line) => typeof line === 'string')) {
    return { error: "lines must be the text of each line it's on" };
  }
  if (!isKind(kind)) return { error: 'kind must be one of ' + NOTE_KINDS.join(', ') };
  const text = noteText(raw.text);
  if (typeof text !== 'string') return text;
  return { file, side, start: start as number, end: end as number, lines: lines as string[], kind, text };
}

/** An edit from the viewer's request body, or why it isn't one. */
function parseEdit(body: unknown): NoteEdit | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'not a note' };
  const raw = body as Record<string, unknown>;
  const text = noteText(raw.text);
  if (typeof text !== 'string') return text;
  if (!isKind(raw.kind)) return { error: 'kind must be one of ' + NOTE_KINDS.join(', ') };
  return { kind: raw.kind, text };
}

export function createNoteRoutes(current: () => ViewerInput, changed: () => void): Router {
  const answer = (): NotesResponse => {
    changed();
    const input = current();
    return {
      notes: notesFor(
        input,
        input.files.map((file) => file.file),
      ),
    };
  };

  return createRouter()
    .json(
      'POST /api/notes',
      (raw) => parseNew(raw, current()),
      (note) => {
        changeNotes(current(), (notes) => [...notes, { ...note, id: randomUUID(), at: new Date().toISOString() }]);
        return answer();
      },
    )
    .json('POST /api/notes/:id', parseEdit, ({ kind, text }, { params }) => {
      let found = false;
      changeNotes(current(), (notes) =>
        notes.map((note) => {
          if (note.id !== params.id) return note;
          found = true;
          return { ...note, kind, text, at: new Date().toISOString() };
        }),
      );
      if (!found) throw new HttpError(404, 'that note is gone — refresh');
      return answer();
    })
    .json('DELETE /api/notes/:id', noBody, (_, { params }) => {
      // already gone is what was asked for
      changeNotes(current(), (notes) => notes.filter((note) => note.id !== params.id));
      return answer();
    });
}
